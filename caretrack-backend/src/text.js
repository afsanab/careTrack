/**
 * Display-oriented title case for patient form text (names, facility, room).
 * Case-insensitive: "ADA", "ada", and "Ada" all become "Ada".
 */
function titleCaseText(value) {
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

module.exports = { titleCaseText };
