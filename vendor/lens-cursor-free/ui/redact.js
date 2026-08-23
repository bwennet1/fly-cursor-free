const SENSITIVE_KEYS = new Set([
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'licenseKey',
  'license_key',
  'license',
  'token',
  'accountId',
  'account_id',
  'profileId',
  'profile_id',
  'deviceLeaseId',
  'device_lease_id',
  'hubUrl',
  'hub_url',
  'adminToken',
]);

const ID_PATTERNS = [
  /\bacc-[a-zA-Z0-9-]+\b/g,
  /\bprofile-[a-zA-Z0-9-]+\b/gi,
  /\bRELAY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g,
  /https?:\/\/[^\s]+/g,
];

/**
 * Shallow redact for UI logs — strips token-like fields from plain objects.
 * @param {unknown} obj
 * @returns {unknown}
 */
export function redactForUi(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactForUi(v));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k)) continue;
    out[k] = typeof v === 'object' && v !== null ? redactForUi(v) : v;
  }
  return out;
}

/** Redact free-form log lines (errors, URLs, ids). */
export function redactLogLine(line) {
  let s = String(line);
  for (const re of ID_PATTERNS) {
    s = s.replace(re, '[已隐藏]');
  }
  return s;
}
