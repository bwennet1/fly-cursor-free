/** Shared placeholder detection for *.example.json and release gates. */

export const PLACEHOLDER_VALUES = new Set([
  '',
  'https://your-support-page.example.com',
  'https://shop.example.com/licenses',
  'https://your-shop.example.com/licenses',
  'https://your-hub.example.com',
  'http://127.0.0.1:8765',
  'https://hub.your-domain.com',
]);

const PLACEHOLDER_HOST_SNIPPETS = [
  'your-domain.com',
  'your-support-page.example.com',
  'your-shop.example.com',
  'your-hub.example.com',
  'hub.example.com',
  'shop.example.com',
  'support.example.com',
  'pay.example.com',
];

export function isPlaceholderValue(value) {
  if (value == null) return true;
  return PLACEHOLDER_VALUES.has(String(value).trim());
}

export function isPlaceholderUrl(url) {
  if (isPlaceholderValue(url)) return true;
  const u = String(url).trim().toLowerCase();
  if (!u) return true;
  if (u.includes('127.0.0.1') || u.includes('localhost')) return true;
  return PLACEHOLDER_HOST_SNIPPETS.some((s) => u.includes(s));
}

/**
 * @param {Record<string, unknown>} cfg
 * @param {{ requirePurchaseUrl?: boolean }} [opts]
 */
export function validateProdBuildConfig(cfg, opts = {}) {
  const errors = [];
  const hub = cfg.defaultHubUrl;
  if (isPlaceholderUrl(hub)) {
    errors.push(
      `defaultHubUrl must be a real production URL (got ${JSON.stringify(hub)})`,
    );
  }
  if (cfg.enableOpsTools === true) {
    errors.push('enableOpsTools must be false for production builds');
  }
  const support = cfg.supportUrl;
  if (support != null && String(support).trim() && isPlaceholderUrl(support)) {
    errors.push(`supportUrl must not be a placeholder (got ${JSON.stringify(support)})`);
  }
  if (opts.requirePurchaseUrl) {
    const purchase = cfg.purchaseUrl;
    if (isPlaceholderUrl(purchase)) {
      errors.push(
        `purchaseUrl must be a real production URL (got ${JSON.stringify(purchase)})`,
      );
    }
  }
  return errors;
}
