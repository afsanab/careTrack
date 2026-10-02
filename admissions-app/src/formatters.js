export function fmtAge(dob) {
  if (!dob) return "";
  const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000));
  return `DOB: ${dob}  ·  Age ${age}`;
}

export function fmtArrival(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

/** Case-insensitive title case: "ADA", "ada", and "Ada" all become "Ada". */
export function titleCaseText(value) {
  if (value == null) return value;
  const trimmed = String(value).trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return trimmed.split(" ").map(titleCaseWord).join(" ");
}

function titleCaseWord(word) {
  if (!word) return word;
  if (/^dr\.?$/i.test(word)) return "Dr.";
  return word
    .split("-")
    .map((seg) =>
      seg
        .split("'")
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
        .join("'")
    )
    .join("-");
}

export function formatPhysicianDisplay(raw) {
  if (!raw) return "";
  if (/^[a-z0-9._-]+$/i.test(raw)) {
    return titleCaseText(raw.replace(/\./g, " "));
  }
  return titleCaseText(raw);
}

export function uniqueCi(values) {
  const seen = new Map();
  for (const v of values) {
    if (!v) continue;
    const key = String(v).toLowerCase();
    if (!seen.has(key)) seen.set(key, v);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function sameCi(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
