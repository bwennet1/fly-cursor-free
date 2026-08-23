import assert from 'node:assert/strict';
import test from 'node:test';

/** Mirrors handleLicenseInvalid guard: no Hub release while switchInFlight. */
function handleLicenseInvalidOutcome(switchInFlight, releaseFn) {
  if (switchInFlight) {
    return { released: false, switchInProgress: true };
  }
  releaseFn();
  return { released: true, switchInProgress: false };
}

test('switchInFlight skips release on invalid license', () => {
  let releaseCalls = 0;
  const out = handleLicenseInvalidOutcome(true, () => {
    releaseCalls += 1;
  });
  assert.equal(releaseCalls, 0);
  assert.equal(out.switchInProgress, true);
  assert.equal(out.released, false);
});

test('idle session may release on invalid license', () => {
  let releaseCalls = 0;
  const out = handleLicenseInvalidOutcome(false, () => {
    releaseCalls += 1;
  });
  assert.equal(releaseCalls, 1);
  assert.equal(out.released, true);
});
