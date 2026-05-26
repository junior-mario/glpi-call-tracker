const { RISK_ORDER } = require("./defaults");

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoNow() {
  return new Date().toISOString();
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function businessDaysBetween(start, end) {
  if (!start || !end) return null;
  let cursor = new Date(start.getTime());
  cursor.setHours(0, 0, 0, 0);
  const finish = new Date(end.getTime());
  finish.setHours(0, 0, 0, 0);

  if (cursor > finish) return 0;

  let businessDays = 0;
  while (cursor < finish) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      businessDays += 1;
    }
  }
  return Math.max(0, businessDays);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toBooleanInt(value) {
  return value ? 1 : 0;
}

function riskMax(a, b) {
  const rankA = RISK_ORDER[a] ?? 0;
  const rankB = RISK_ORDER[b] ?? 0;
  return rankA >= rankB ? a : b;
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeArrayOfNumbers(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
}

function normalizeString(value) {
  return String(value || "").trim();
}

function includesIgnoreCase(source, fragment) {
  return String(source || "").toLowerCase().includes(String(fragment || "").toLowerCase());
}

module.exports = {
  parseDate,
  toIsoNow,
  minutesBetween,
  daysBetween,
  businessDaysBetween,
  stripHtml,
  toBooleanInt,
  riskMax,
  safeJsonParse,
  normalizeArrayOfNumbers,
  normalizeString,
  includesIgnoreCase,
};

