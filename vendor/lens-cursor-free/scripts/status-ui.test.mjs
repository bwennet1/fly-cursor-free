import assert from 'node:assert/strict';
import test from 'node:test';
import {
  baseStatusText,
  extractSwitchReason,
  heroClassFor,
  isTransientStatusRegression,
  mergeStatusPayload,
} from '../ui/status-ui.mjs';

test('baseStatusText pool empty shows no-account copy', () => {
  const text = baseStatusText(
    {
      valid: true,
      switchAllowed: false,
      switchBlockReason: 'no_account_available',
    },
    { heroIdle: '请先验证许可证' },
  );
  assert.ok(text.includes('暂时没有可用账号'));
});

test('baseStatusText prefers no-account over optimistic IPC message', () => {
  const text = baseStatusText(
    {
      valid: true,
      switchAllowed: false,
      switchBlockReason: 'no_account_available',
      message: '许可证有效，可以换号了',
    },
    { heroIdle: 'x' },
  );
  assert.ok(text.includes('暂时没有可用账号'));
  assert.ok(!text.includes('可以换号了'));
});

test('baseStatusText valid without expiresAt shows pending activation', () => {
  const text = baseStatusText(
    { valid: true, switchAllowed: true, expiresAt: null },
    { heroIdle: 'x' },
  );
  assert.ok(text.includes('请先验证许可证以开始计时'));
});

test('baseStatusText pending activation wins over hasAccount', () => {
  const text = baseStatusText(
    { valid: true, switchAllowed: true, expiresAt: null, accountId: 'acc-1' },
    { heroIdle: 'x' },
  );
  assert.ok(text.includes('请先验证许可证以开始计时'));
  assert.ok(!text.includes('已恢复'));
});

test('baseStatusText valid with account and expiresAt shows restored', () => {
  const text = baseStatusText(
    {
      valid: true,
      switchAllowed: true,
      accountId: 'acc-1',
      expiresAt: '2030-01-01T00:00:00+00:00',
    },
    { heroIdle: 'x' },
  );
  assert.ok(text.includes('已恢复'));
});

test('heroClassFor pool block uses warn', () => {
  assert.equal(
    heroClassFor({ valid: true, switchBlockReason: 'no_account_available' }),
    'status-hero--warn',
  );
});

test('heroClassFor daily limit block uses warn', () => {
  assert.equal(
    heroClassFor({ valid: true, switchAllowed: false, switchBlockReason: 'switch_daily_limit' }),
    'status-hero--warn',
  );
});

test('baseStatusText daily limit shows blocked copy not optimistic valid', () => {
  const text = baseStatusText(
    {
      valid: true,
      switchAllowed: false,
      switchBlockReason: 'switch_daily_limit',
      message: '许可证有效，可以换号了',
    },
    { heroIdle: 'x' },
  );
  assert.ok(text.includes('今日') || text.includes('次数'));
  assert.ok(!text.includes('可以换号了'));
});

test('mergeStatusPayload clears block reason when switch allowed', () => {
  const prev = { switchBlockReason: 'no_account_available' };
  const next = mergeStatusPayload(prev, { switchAllowed: true });
  assert.equal(next.switchBlockReason, null);
});

test('extractSwitchReason unknown returns null', () => {
  assert.equal(extractSwitchReason(new Error('ECONNRESET')), null);
});

test('heroClassFor generic switch error uses danger', () => {
  assert.equal(heroClassFor({ valid: false, reason: 'error' }), 'status-hero--danger');
});

test('heroClassFor consume pending uses warn not ok', () => {
  assert.equal(
    heroClassFor({ valid: true, switchAllowed: true, consumePending: true }),
    'status-hero--warn',
  );
});

test('extractSwitchReason maps no_account', () => {
  assert.equal(
    extractSwitchReason(new Error('no_account_available')),
    'no_account_available',
  );
});

test('extractSwitchReason maps client cooldown message', () => {
  assert.equal(
    extractSwitchReason(new Error('换号过于频繁，请 107 秒后再试')),
    'switch_cooldown',
  );
});

test('isTransientStatusRegression for no_account without block reason field', () => {
  const prev = { valid: true, accountId: 'a1' };
  assert.equal(
    isTransientStatusRegression(prev, {
      valid: false,
      reason: 'no_account_available',
    }),
    true,
  );
});

test('isTransientStatusRegression ignores real license invalidation', () => {
  const prev = { valid: true };
  assert.equal(
    isTransientStatusRegression(prev, { valid: false, reason: 'license_expired' }),
    false,
  );
});

test('mergeStatusPayload keeps valid license on switch_cooldown', () => {
  const prev = { valid: true, switchAllowed: true, accountId: 'a1' };
  const next = mergeStatusPayload(prev, {
    valid: false,
    reason: 'switch_cooldown',
    switchBlockReason: 'switch_cooldown',
    switchAllowed: false,
  });
  assert.equal(next.valid, true);
  assert.equal(next.switchBlockReason, 'switch_cooldown');
});

test('heroClassFor switch_cooldown uses warn not danger', () => {
  assert.equal(
    heroClassFor({
      valid: true,
      switchAllowed: false,
      switchBlockReason: 'switch_cooldown',
    }),
    'status-hero--warn',
  );
});

function deriveUiPhase(r) {
  if (r?.switchInProgress) return 'switching';
  if (r?.consumePending) return 'consume_pending';
  return 'idle';
}

test('deriveUiPhase switching when switchInProgress', () => {
  assert.equal(deriveUiPhase({ switchInProgress: true }), 'switching');
});

test('deriveUiPhase consume_pending when consumePending set', () => {
  assert.equal(deriveUiPhase({ consumePending: true }), 'consume_pending');
});
