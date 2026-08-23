import assert from 'node:assert/strict';
import test from 'node:test';

test('resolveEnableOpsTools ignores ENABLE_OPS_TOOLS=1 when packaged', async () => {
  const prev = process.env.ENABLE_OPS_TOOLS;
  process.env.ENABLE_OPS_TOOLS = '1';
  const mod = await import('../dist/shared/build-flags.js');
  mod.setPackagedApp(false);
  assert.equal(mod.resolveEnableOpsTools(), true);
  mod.setPackagedApp(true);
  assert.equal(mod.resolveEnableOpsTools(), false);
  mod.setPackagedApp(false);
  if (prev === undefined) delete process.env.ENABLE_OPS_TOOLS;
  else process.env.ENABLE_OPS_TOOLS = prev;
});
