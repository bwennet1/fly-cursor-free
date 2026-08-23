import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeStatusReadOnly,
  mayPersistSessionIdentityFields,
  sessionWriteFrozen,
} from '../dist/shared/switch-session.js';

test('sessionWriteFrozen when switch in flight', () => {
  assert.equal(sessionWriteFrozen(true), true);
  assert.equal(sessionWriteFrozen(false), false);
});

test('mergeStatusReadOnly keeps local accountId when frozen', () => {
  const out = mergeStatusReadOnly(
    { claimedAccountId: 'acc-new' },
    { accountId: 'acc-old' },
    true,
  );
  assert.equal(out.accountId, 'acc-old');
  assert.equal(out.switchInProgress, true);
});

test('mergeStatusReadOnly adopts hub when not frozen', () => {
  const out = mergeStatusReadOnly(
    { claimedAccountId: 'acc-hub' },
    { accountId: undefined },
    false,
  );
  assert.equal(out.accountId, 'acc-hub');
  assert.equal(out.switchInProgress, false);
});

test('mayPersistSessionIdentityFields false when frozen', () => {
  assert.equal(mayPersistSessionIdentityFields(true), false);
  assert.equal(mayPersistSessionIdentityFields(false), true);
});
