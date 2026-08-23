#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  reasonToChinese,
  formatQuotaShort,
  formatQuotaDetail,
  formatPlanCycleLine,
  UI,
} from '../ui/messages.zh.mjs';

assert.equal(reasonToChinese('validate_rate_limited'), '验证过于频繁，请稍后再试');
assert.equal(reasonToChinese('switch_rate_limited'), '换号过于频繁，请稍后再试');
assert.equal(
  reasonToChinese('switch_quota_exhausted'),
  '许可证换号次数已用完，请联系客服续期或加次',
);
assert.equal(
  reasonToChinese('not_activated'),
  '请先验证许可证以开始计时',
);
assert.equal(formatQuotaShort(null), '');
assert.equal(formatQuotaShort({ switchesRemainingToday: 2, switchesMaxPerDay: 10 }), '今日还可换 2 次');
assert.equal(
  formatPlanCycleLine({ planDisplayName: '30天套餐', switchesRemaining: 3, switchesMax: 20 }),
  '剩余 3/20 次（30天套餐）',
);
assert.equal(formatPlanCycleLine({ planDisplayName: '仅时间', switchesMax: null }), '');
assert.equal(
  formatPlanCycleLine({ planDisplayName: '30天', switchesRemaining: null, switchesMax: 20, pendingActivation: true }),
  '待激活',
);
assert.ok(
  formatQuotaDetail({
    switchesRemainingToday: 10,
    switchesMaxPerDay: 10,
    sessionRotatesRemainingToday: 10,
    sessionRotatesMaxPerDay: 1,
    sessionRotatesUsedToday: 0,
    cooldownSeconds: 0,
  }).includes('含重新打开客户端换新号'),
);
const periodCapDaily = formatQuotaDetail({
  switchesRemainingToday: 9,
  switchesMaxPerDay: 10,
  sessionRotatesRemainingToday: 1,
  sessionRotatesMaxPerDay: 1,
  sessionRotatesUsedToday: 0,
  cooldownSeconds: 0,
});
assert.ok(periodCapDaily.includes('今日重新打开可换新账号'));
assert.ok(!periodCapDaily.includes('含重新打开客户端换新号'));
console.log('gen-user-messages.test: OK');
