#!/usr/bin/env node
/** Generate ui/messages.zh.mjs from compiled shared/user-messages.zh.js */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import(
  new URL('../dist/shared/user-messages.zh.js', import.meta.url).href
);

const out = join(root, 'ui', 'messages.zh.mjs');
const body = `/** Auto-generated — do not edit. Source: shared/user-messages.zh.ts */
export const UI = ${JSON.stringify(mod.UI, null, 2)};

export function reasonToChinese(reason) {
  return (${mod.reasonToChinese.toString()})(reason);
}

export function formatQuotaShort(quota) {
  return (${mod.formatQuotaShort.toString()})(quota);
}

export function formatPlanCycleLine(opts) {
  return (${mod.formatPlanCycleLine.toString()})(opts);
}

export function formatQuotaDetail(quota) {
  return (${mod.formatQuotaDetail.toString()})(quota);
}

export function formatExpiresAt(iso) {
  return (${mod.formatExpiresAt.toString()})(iso);
}

export function sessionStatusMessage(opts) {
  return (${mod.sessionStatusMessage.toString()})(opts);
}

export function unwrapIpcErrorMessage(raw) {
  return (${mod.unwrapIpcErrorMessage.toString()})(raw);
}

export function userFacingError(err) {
  return (${mod.userFacingError.toString()})(err);
}
`;
writeFileSync(out, body, 'utf8');

try {
  const uiMod = await import(new URL(`../ui/messages.zh.mjs?v=${Date.now()}`, import.meta.url).href);
  const sample = uiMod.userFacingError(
    new Error("Error invoking remote method 'hub:switch-account': Error: 会话配置失败，请关闭 Cursor 后重试"),
  );
  if (!sample.includes('会话配置失败')) {
    throw new Error(`userFacingError smoke failed: ${sample}`);
  }
  const cooldown = uiMod.userFacingError(
    new Error("Error invoking remote method 'hub:switch-account': Error: 换号过于频繁，请 107 秒后再试"),
  );
  if (!cooldown.includes('107')) {
    throw new Error(`userFacingError cooldown smoke failed: ${cooldown}`);
  }
} catch (e) {
  throw new Error(`messages.zh.mjs smoke test failed: ${e?.message ?? e}`);
}

console.log(`wrote ${out}`);
