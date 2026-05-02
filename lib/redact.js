const SECRET_KEY_RE = /(token|secret|password|passphrase|api[-_]?key|authorization|credential|session|cookie)/i;
const E164_RE = /\+[1-9]\d{7,14}/g;
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{24,}\b/g;

export function redact(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  }
  if (value == null) return value;
  if (SECRET_KEY_RE.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    return value.replace(E164_RE, "[REDACTED_PHONE]").replace(LONG_TOKEN_RE, (match) => {
      if (/^[0-9]+$/.test(match)) return match;
      return "[REDACTED_TOKEN]";
    });
  }
  return value;
}
