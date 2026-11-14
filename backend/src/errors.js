export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function requireValue(condition, message, status = 400) {
  if (!condition) throw new AppError(status, message);
}
export function text(value, label, max = 120) {
  requireValue(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= max,
    `${label} is required (maximum ${max} characters).`,
  );
  return value.trim();
}
export function integer(value, label, min = 0, max = 1000000000) {
  requireValue(
    Number.isSafeInteger(value) && value >= min && value <= max,
    `${label} must be a whole number from ${min} to ${max}.`,
  );
  return value;
}
export function oneOf(value, allowed, label) {
  requireValue(allowed.includes(value), `Invalid ${label}.`);
  return value;
}
export function date(value, label) {
  requireValue(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    `${label} must be a valid date.`,
  );
  return value;
}
export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(day, count) {
  return new Date(Date.parse(day) + count * 86400000)
    .toISOString()
    .slice(0, 10);
}
