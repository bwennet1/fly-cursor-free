/**
 * Pure status UI helpers (imported by app.js; tested in scripts/status-ui.test.mjs).
 */
import { reasonToChinese, sessionStatusMessage } from './messages.zh.mjs';

export function heroClassFor(r) {
  if (r.consumePending) return 'status-hero--warn';
  if (r.hubOffline) return 'status-hero--warn';
  if (r.valid && r.switchAllowed === false) {
    const block = r.switchBlockReason ?? r.reason;
    if (
      block === 'no_account_available' ||
      block === 'switch_rate_limited' ||
      block === 'switch_daily_limit' ||
      block === 'switch_cooldown'
    ) {
      return 'status-hero--warn';
    }
    if (block) return 'status-hero--warn';
  }
  if (
    r.valid &&
    (r.switchBlockReason === 'no_account_available' || r.reason === 'no_account_available')
  ) {
    return 'status-hero--warn';
  }
  if (r.valid && r.switchAllowed) return 'status-hero--ok';
  if (r.valid) return 'status-hero--ok';
  if (r.reason === 'switch_rate_limited' || r.reason === 'validate_rate_limited') {
    return 'status-hero--warn';
  }
  if (r.reason === 'error') return 'status-hero--danger';
  if (!r.valid && r.reason) return 'status-hero--danger';
  return 'status-hero--idle';
}

export function baseStatusText(r, { heroIdle }) {
  if (r.valid && r.switchAllowed === false) {
    const block = r.switchBlockReason ?? r.reason;
    if (block) return reasonToChinese(block);
  }
  if (
    r.valid &&
    (r.switchBlockReason === 'no_account_available' || r.reason === 'no_account_available')
  ) {
    return reasonToChinese('no_account_available');
  }
  if (r.message && !r.message.includes('编号')) {
    return r.message.replace(/^状态：/, '');
  }
  if (r.valid) {
    const hasAccount = !!(r.accountId ?? r.claimedAccountId);
    return sessionStatusMessage({
      valid: true,
      hasAccount,
      hubOffline: false,
      expiresAt: r.expiresAt,
    });
  }
  if (r.hubOffline) {
    return sessionStatusMessage({ valid: false, hasAccount: false, hubOffline: true });
  }
  return reasonToChinese(r.reason) || heroIdle;
}

const TRANSIENT_BLOCK_REASONS = new Set([
  'no_account_available',
  'switch_rate_limited',
  'switch_daily_limit',
  'switch_cooldown',
  'session_rotate_daily_limit',
]);

/** Hub/IPC blip should not drop a known-good license from the UI. */
export function isTransientStatusRegression(prev, incoming) {
  if (prev?.valid !== true || incoming?.valid !== false || incoming?.leaseMismatch) {
    return false;
  }
  if (incoming.switchBlockReason && TRANSIENT_BLOCK_REASONS.has(incoming.switchBlockReason)) {
    return true;
  }
  const reason = incoming.reason;
  if (!reason) return false;
  if (reason === 'error') return true;
  if (TRANSIENT_BLOCK_REASONS.has(reason)) return true;
  if (reason === 'switch_rate_limited' || reason === 'validate_rate_limited') return true;
  return false;
}

/** Merge IPC status; clear stale switchBlockReason when pool recovers. */
export function mergeStatusPayload(prev, incoming) {
  const next = { ...prev, ...incoming };
  if (isTransientStatusRegression(prev, incoming)) {
    next.valid = true;
    if (incoming.reason === 'error') delete next.reason;
  }
  if (incoming.switchBlockReason !== undefined) {
    next.switchBlockReason = incoming.switchBlockReason;
  } else if (incoming.switchAllowed === true || incoming.canSwitch === true) {
    next.switchBlockReason = null;
  }
  return next;
}

export function extractSwitchReason(e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('no_account_available') || msg.includes('暂时没有可用账号')) {
    return 'no_account_available';
  }
  if (msg.includes('换号过于频繁')) {
    return 'switch_cooldown';
  }
  if (msg.includes('switch_rate_limited')) {
    return 'switch_rate_limited';
  }
  if (msg.includes('switch_daily_limit') || msg.includes('今日换号次数')) {
    return 'switch_daily_limit';
  }
  if (msg.includes('switch_intent_pending')) {
    return 'switch_intent_pending';
  }
  if (msg.includes('switch_quota_exhausted')) {
    return 'switch_quota_exhausted';
  }
  if (msg.includes('session_rotate_daily_limit')) {
    return 'session_rotate_daily_limit';
  }
  return null;
}
