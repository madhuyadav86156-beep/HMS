import React, { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  Utensils,
  CreditCard,
  Landmark,
  Users,
  Package,
  ShieldCheck,
  MessageSquare,
  BarChart3,
  Settings,
  ChevronDown,
  Bell,
  LogOut,
  Plus,
  Menu,
  ArrowRight,
  Building2,
  RefreshCw,
  Leaf,
  Shield,
  Database,
  Check,
} from "lucide-react";
import { api, setCsrf, day, today } from "./api";
import { Button, IconButton, Avatar, Spinner, Notice, Field } from "./ui";
import { WorkspacePage } from "./pages";
import { ActionModal } from "./forms";
const modules = [
  {
    id: "overview",
    name: "Overview",
    icon: LayoutDashboard,
    roles: ["admin", "frontdesk", "accountant"],
  },
  {
    id: "reservations",
    name: "Reservations",
    icon: CalendarDays,
    roles: ["admin", "frontdesk", "accountant"],
  },
  {
    id: "rooms",
    name: "Rooms & housekeeping",
    icon: BedDouble,
    roles: ["admin", "frontdesk", "housekeeping", "accountant"],
  },
  {
    id: "pos",
    name: "Point of sale",
    icon: Utensils,
    roles: ["admin", "frontdesk", "accountant"],
  },
  {
    id: "payments",
    name: "Payments",
    icon: CreditCard,
    roles: ["admin", "frontdesk", "accountant"],
  },
  {
    id: "finance",
    name: "Finance & GST",
    icon: Landmark,
    roles: ["admin", "accountant"],
  },
  {
    id: "people",
    name: "People & payroll",
    icon: Users,
    roles: ["admin", "hr"],
  },
  {
    id: "inventory",
    name: "Inventory",
    icon: Package,
    roles: ["admin", "frontdesk", "accountant"],
  },
  {
    id: "compliance",
    name: "Compliance & audit",
    icon: ShieldCheck,
    roles: ["admin", "accountant"],
  },
  {
    id: "messages",
    name: "Communications",
    icon: MessageSquare,
    roles: ["admin", "frontdesk"],
  },
  {
    id: "reports",
    name: "Reports",
    icon: BarChart3,
    roles: ["admin", "frontdesk", "accountant"],
  },
  {
    id: "settings",
    name: "Settings & access",
    icon: Settings,
    roles: ["admin"],
  },
];
const resources = [
  ["dashboard", ["admin", "frontdesk", "accountant"]],
  ["rooms", ["admin", "frontdesk", "housekeeping", "accountant"]],
  ["reservations", ["admin", "frontdesk", "accountant"]],
  ["payments", ["admin", "frontdesk", "accountant"]],
  ["finance", ["admin", "accountant"]],
  ["inventory", ["admin", "frontdesk", "accountant"]],
  ["stock-movements", ["admin", "frontdesk", "accountant"]],
  ["employees", ["admin", "hr"]],
  ["payroll", ["admin", "hr", "accountant"]],
  ["audit", ["admin", "accountant"]],
  ["messages", ["admin", "frontdesk"]],
  ["users", ["admin"]],
];
export default function App() {
  const [session, setSession] = useState(null),
    [booting, setBooting] = useState(true),
    [authError, setAuthError] = useState(""),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(location.hash.slice(1) || "overview"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false);
  useEffect(() => {
    api("/session")
      .then((s) => {
        setCsrf(s.csrf);
        setSession(s);
      })
      .catch((e) => setAuthError(e.message))
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    const changed = () => {
      setPage(location.hash.slice(1) || "overview");
      setMobile(false);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const load = useCallback(async () => {
    if (!session?.user) return;
    setBusy(true);
    setError("");
    try {
      const selected = resources.filter(([, roles]) =>
        roles.includes(session.user.role),
      );
      const results = await Promise.all([
        api("/property"),
        ...selected.map(([key]) => api("/" + key)),
      ]);
      const next = { property: results[0] };
      selected.forEach(([key], i) => (next[key] = results[i + 1]));
      setData(next);
    } catch (e) {
      if (e.status === 401) {
        setData(null);
        setSession({ user: null, needs_setup: false });
        setCsrf(null);
      }
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [session]);
  useEffect(() => {
    load();
  }, [load]);
  const go = (id) => {
    location.hash = id;
    setPage(id);
    setMobile(false);
  };
  const action = (type, record) => setModal({ type, record });
  async function changed(message) {
    await load();
    setToast(message);
  }
  async function logout() {
    try {
      await api("/logout", { method: "POST", body: {} });
      setCsrf(null);
      setSession({ user: null, needs_setup: false });
      setData(null);
      setModal(null);
    } catch (e) {
      setToast(e.message);
    }
  }
  if (booting) return <Spinner />;
  if (!session?.user)
    return (
      <Auth
        setup={session?.needs_setup}
        initialError={authError}
        onSuccess={(s) => {
          setCsrf(s.csrf);
          setSession(s);
          setError("");
        }}
      />
    );
  const allowed = modules.filter((m) => m.roles.includes(session.user.role)),
    active = allowed.find((m) => m.id === page) || allowed[0];
  const canBook = ["admin", "frontdesk"].includes(session.user.role),
    canWriteRoom = ["admin", "frontdesk", "housekeeping"].includes(
      session.user.role,
    );
  return (
    <>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a href="#overview" className="brand">
          <span className="brandmark">a</span>
          <span>
            atithi<small>HOSPITALITY, CONNECTED</small>
          </span>
        </a>
        <div className="property-switch">
          <span className="property-icon">
            <Building2 size={21} />
          </span>
          <span>
            <b>{data?.property.name || "Your property"}</b>
            <small>
              {data?.property.city || "India"}, {data?.property.state || ""}
            </small>
          </span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {allowed.map((m) => (
            <button
              key={m.id}
              className={active.id === m.id ? "active" : ""}
              onClick={() => go(m.id)}
              title={m.name}
              aria-label={m.name}
            >
              <m.icon size={18} />
              <span>{m.name}</span>
              {m.id === "inventory" && data?.dashboard?.low_stock > 0 && (
                <em>{data.dashboard.low_stock}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card">
            <Leaf size={25} />
            <h4>A little help. Better hospitality.</h4>
            <p>Your team, your property, connected.</p>
            <button onClick={() => action("help")}>
              Workspace guide <ArrowRight size={13} />
            </button>
          </div>
          <div className="profile">
            <Avatar name={session.user.name} />
            <span>
              <b>{session.user.name}</b>
              <small>{session.user.role} workspace</small>
            </span>
            <IconButton title="Sign out" onClick={logout}>
              <LogOut size={16} />
            </IconButton>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="app-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <IconButton
              title="Toggle navigation"
              className="mobile-menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </IconButton>
            <span>Workspace</span>
            <span>/</span>
            <b>{active.name}</b>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <i />
              MongoDB connected
            </span>
            <IconButton title="Refresh data" onClick={load} disabled={busy}>
              <RefreshCw size={17} className={busy ? "spin" : ""} />
            </IconButton>
            <IconButton
              title="View workspace alerts"
              onClick={() => action("alerts")}
            >
              <Bell size={18} />
            </IconButton>
            <Avatar name={session.user.name} />
          </div>
        </header>
        <main>
          <div className="page-header">
            <div>
              <div className="eyebrow">
                {active.id === "overview"
                  ? "YOUR PROPERTY, AT A GLANCE"
                  : "THE GRAND EXPERIENCE, EVERY DAY"}
              </div>
              <h1>
                {active.id === "overview" ? (
                  <>
                    Welcome back, {session.user.name.split(" ")[0]}{" "}
                    <span className="sun">☀</span>
                  </>
                ) : (
                  active.name
                )}
              </h1>
              <p>
                {active.id === "overview"
                  ? `Here's what's happening at ${data?.property.name || "your property"} today.`
                  : descriptions[active.id]}
              </p>
            </div>
            <div className="page-actions">
              <span className="date-chip">
                <CalendarDays size={15} />
                {day(today())}, {today().slice(0, 4)}
              </span>
              {canBook && (
                <Button onClick={() => action("reservation")}>
                  <Plus size={16} />
                  New reservation
                </Button>
              )}
            </div>
          </div>
          {error && (
            <Notice danger>
              {error}{" "}
              <button className="text-link" onClick={load}>
                Try again
              </button>
            </Notice>
          )}
          {!data ? (
            <Spinner />
          ) : (
            <WorkspacePage
              page={active.id}
              data={data}
              user={session.user}
              go={go}
              action={action}
              changed={changed}
              canBook={canBook}
              canWriteRoom={canWriteRoom}
            />
          )}
          <footer>
            <span>
              <i />
              Server-backed workspace · INR · Asia/Kolkata
            </span>
            <span>
              Thoughtfully built for Indian hospitality <Leaf size={11} />
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <ActionModal
          key={`${modal.type}-${modal.record?.id || ""}`}
          modal={modal}
          data={data}
          user={session.user}
          onClose={() => setModal(null)}
          action={action}
          changed={changed}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </>
  );
}
const descriptions = {
  reservations: "Every stay starts with a warm welcome.",
  rooms: "Know every room. Keep every stay comfortable.",
  pos: "Post restaurant, spa and laundry charges directly to guest folios.",
  payments: "Record collections and keep guest balances in view.",
  finance: "Trace every transaction from guest folio to your books.",
  people: "Take care of the people who take care of your guests.",
  inventory: "The right supplies, in the right place, at the right time.",
  compliance: "Clear controls, traceable actions and an honest readiness view.",
  messages: "Prepare thoughtful messages for every stage of a stay.",
  reports: "Your operational records, ready to take with you.",
  settings: "Make Atithi work for your property and your team.",
};
function Auth({ setup, initialError, onSuccess }) {
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const result = await api(setup ? "/setup" : "/login", {
        method: "POST",
        body,
      });
      onSuccess(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand inverse">
          <span className="brandmark">a</span>
          <span>
            atithi<small>HOSPITALITY, CONNECTED</small>
          </span>
        </div>
        <div className="auth-story-content">
          <div className="eyebrow">LESS ADMIN. MORE HOSPITALITY.</div>
          <h1>
            Great stays begin
            <br />
            behind the scenes.
          </h1>
          <p>
            One thoughtful workspace for your rooms, guests, finances and
            people.
          </p>
          <div className="architectural">
            <div className="arch arch-one" />
            <div className="arch arch-two" />
            <div className="arch arch-three" />
            <span className="arch-sun" />
            <div className="arch-floor" />
          </div>
          <div className="auth-benefits">
            <span>
              <Shield size={16} />
              Role-based access
            </span>
            <span>
              <Database size={16} />
              Persistent records
            </span>
          </div>
        </div>
        <small className="auth-story-footer">
          Built for the rhythm of Indian hospitality.
        </small>
      </section>
      <section className="auth-form-side">
        <div className="auth-form">
          <span className="eyebrow">YOUR PROPERTY, CONNECTED</span>
          <h2>{setup ? "Welcome to your new workspace." : "Welcome back."}</h2>
          <p>
            {setup
              ? "Create the first administrator account to get started."
              : "Sign in to manage your property."}
          </p>
          {error && <Notice danger>{error}</Notice>}
          <form onSubmit={submit}>
            {setup && (
              <Field
                label="Your name"
                name="name"
                autoComplete="name"
                required
                maxLength={80}
                placeholder="e.g. Arjun Kapoor"
              />
            )}
            <Field
              label="Email address"
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={160}
              placeholder="you@yourhotel.com"
            />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete={setup ? "new-password" : "current-password"}
              required
              minLength={setup ? 12 : 1}
              maxLength={128}
              placeholder={
                setup ? "At least 12 characters" : "Enter your password"
              }
            />
            <Button type="submit" disabled={busy} className="full">
              {busy
                ? "Please wait…"
                : setup
                  ? "Create administrator account"
                  : "Sign in to your workspace"}
              <ArrowRight size={16} />
            </Button>
          </form>
          <div className="auth-note">
            <Shield size={16} />
            {setup
              ? "The first account controls property settings and team access. Sample hotel records are included for evaluation."
              : "Your session is protected with an HTTP-only cookie. Contact your property administrator for access."}
          </div>
        </div>
        <span className="auth-copyright">Atithi HMS · Local workspace</span>
      </section>
    </div>
  );
}
