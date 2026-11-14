import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { AppError, requireValue, text, oneOf } from "./errors.js";
import { audit, transaction } from "./db.js";
export const roles = ["admin", "frontdesk", "housekeeping", "accountant", "hr"];
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password, stored) {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(key, "hex"),
  );
}
const digest = (value) => createHash("sha256").update(value).digest("hex");
function cookie(req) {
  return (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("hms_session="))
    ?.slice(12);
}
export async function createUser(db, body, actor = null) {
  const name = text(body.name, "Name", 80),
    email = text(body.email, "Email", 160).toLowerCase();
  requireValue(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    "Enter a valid email.",
  );
  const password = text(body.password, "Password", 128);
  requireValue(
    password.length >= 12,
    "Use a password of at least 12 characters.",
  );
  const role = oneOf(body.role, roles, "role");
  const password_hash = hashPassword(password);
  return transaction(db, async () => {
    requireValue(
      !(await db.one("users", { email })),
      "This email already has an account.",
      409,
    );
    const user = await db.insert("users", { name, email, password_hash, role });
    await audit(db, actor, "user.created", "user", user.id, { name, role });
    return { id: user.id, name, email, role };
  });
}
export function authRoutes(app, db, config) {
  const failures = new Map();
  app.get("/api/session", async (req, res) =>
    res.json({
      user: req.user || null,
      csrf: req.session?.csrf || null,
      needs_setup: !(await db.count("users")),
    }),
  );
  function throttle(req, res, next) {
    const now = Date.now(),
      key = req.ip;
    for (const [ip, r] of failures)
      if (now - r.since > 900000) failures.delete(ip);
    const r = failures.get(key) || { count: 0, since: now };
    r.count++;
    failures.set(key, r);
    if (r.count > 12)
      return next(
        new AppError(429, "Too many attempts. Try again in 15 minutes."),
      );
    next();
  }
  async function session(res, user) {
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    await db.insert("sessions", {
      token_hash: digest(token),
      user_id: user.id,
      csrf,
      expires_at: new Date(Date.now() + 43200000),
    });
    res.setHeader(
      "Set-Cookie",
      `hms_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${config.secureCookies ? "; Secure" : ""}`,
    );
    res.json({ user, csrf });
  }
  app.post("/api/setup", throttle, async (req, res) => {
    const user = await transaction(db, async () => {
      requireValue(!(await db.count("users")), "Setup already completed.", 409);
      return createUser(db, { ...req.body, role: "admin" });
    });
    await session(res, user);
  });
  app.post("/api/login", throttle, async (req, res) => {
    const email = text(req.body.email, "Email", 160).toLowerCase(),
      password = text(req.body.password, "Password", 128),
      user = await db.one("users", { email });
    const valid = user
      ? verifyPassword(password, user.password_hash)
      : (scryptSync(password, "unknown-user-salt", 64), false);
    requireValue(valid, "Email or password is incorrect.", 401);
    const { password_hash, ...safe } = user;
    failures.delete(req.ip);
    await audit(db, user.id, "user.login", "user", user.id);
    await session(res, safe);
  });
  app.post("/api/logout", authenticated, async (req, res) => {
    await db.remove("sessions", { token_hash: req.session.token_hash });
    res.setHeader(
      "Set-Cookie",
      "hms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    res.json({ ok: true });
  });
}
export function identify(db) {
  return async (req, res, next) => {
    const token = cookie(req);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const session = await db.one("sessions", {
        token_hash: digest(token),
        expires_at: { $gt: new Date() },
      });
      if (session) {
        req.session = session;
        const user = await db.one("users", { id: session.user_id });
        if (user) {
          const { password_hash, ...safe } = user;
          req.user = safe;
        }
      }
    }
    next();
  };
}
export function requestProtection(req, res, next) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (req.headers["content-type"]?.split(";")[0] !== "application/json")
      return next(new AppError(415, "Send application/json."));
    if (req.headers["x-hms-request"] !== "1")
      return next(new AppError(403, "Request header missing."));
    if (req.session && req.headers["x-csrf-token"] !== req.session.csrf)
      return next(
        new AppError(
          403,
          "Session verification failed. Refresh and try again.",
        ),
      );
  }
  next();
}
export function authenticated(req, res, next) {
  if (!req.user) return next(new AppError(401, "Please sign in."));
  next();
}
export function allow(...allowed) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError(401, "Please sign in."));
    if (req.user.role !== "admin" && !allowed.includes(req.user.role))
      return next(new AppError(403, "Your role cannot perform this action."));
    next();
  };
}
