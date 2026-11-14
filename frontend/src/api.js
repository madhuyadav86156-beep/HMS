let csrf = null;
export function setCsrf(value) {
  csrf = value;
}
export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body
        ? { "Content-Type": "application/json", "X-HMS-Request": "1" }
        : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Server returned an unreadable response." }));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}
export const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((value || 0) / 100);
export const day = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(
    new Date(
      value.length === 10
        ? value + "T00:00:00+05:30"
        : value.replace(/Z{2}$/, "Z"),
    ),
  );
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const nextDay = (value) =>
  new Date(Date.parse(value) + 86400000).toISOString().slice(0, 10);
export const rupees = (value) => Math.round(Number(value) * 100);
export const label = (value) => String(value).replaceAll("_", " ");
export function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
