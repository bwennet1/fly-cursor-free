/**
 * Consumer-facing copy — single source for main process and generated ui/messages.zh.mjs.
 * HubClientError: prefer body.message when already customer-facing Chinese; else reasonToChinese(code).
 */
import type { SwitchQuotaResponse } from '../core-api/hub-types.js';

export const UI = {
  productName: 'Relay',
  taglineDefault: '账号切换助手',
  validateLicense: '验证许可证',
  validating: '验证中…',
  switchAccount: '换号',
  switching: '换号中…',
  licensePlaceholder: '粘贴您的许可证',
  quotaEmpty: '验证后显示今日配额',
  quotaPeriodLabel: '剩余次数',
  quotaDailyLabel: '今日换号',
  quotaCycleLabel: '周期换号',
  quotaTodayLabel: '今日换号',
  heroIdle: '请先验证许可证',
  heroValid: '许可证有效，可以换号了',
  heroPendingActivation: '请先验证许可证以开始计时',
  heroRestored: '已恢复，可以继续使用',
  heroOffline: '无法连接服务器（已恢复上次登录状态，连网后可换号）',
  accountReady: '当前账号已就绪',
  switchDoneManual: '换号已完成，请手动打开 Cursor',
  switchInProgressHint: '换号进行中，请稍候…',
  switchPhaseHub: '正在分配账号…',
  switchPhaseCloseCursor: '正在关闭 Cursor…',
  switchPhaseInject: '正在写入登录配置…',
  switchPhaseRestart: '正在启动 Cursor…',
  consumePendingHint: '换号已完成，计费确认失败，请点「重试确认」或联系客服',
  retryConsume: '重试确认',
  heroQuotaExhausted: '本周期换号次数已用尽，请联系客服续期或升级',
  heroLicenseInactive: '许可证已停用，请联系客服',
  consumeConfirmed: '计费已确认',
  installBroken: '程序未正确安装，请重新安装',
  nodeIncomplete: '已验证，但本机环境不完整，无法换号',
  usageSummary:
    '验证许可证后，可为本机 Cursor 切换登录账号。关闭窗口可最小化到系统托盘（任务栏右下角图标），右键可退出；再次打开程序会聚焦已有窗口。换号有每日次数与间隔限制。',
  supportLink: '需要帮助？联系客服',
  purchaseCtaHint: '还没有许可证？前往购买后粘贴到下方',
  purchaseCtaButton: '购买许可证',
  purchaseLinkSubtle: '购买许可证',
  opsOnlyError: '仅内部构建可用此功能',
  versionUnavailable: '版本信息暂不可用',
  upgradeRecommend: '建议升级到新版本',
  openDownload: '打开下载页',
  heroPendingActivationHint: '点击「验证并继续」后开始计时',
  heroPendingActivationRevalidateHint: '点击「重新验证」后开始计时',
  validateAndContinue: '验证并继续',
  changeLicense: '更换',
  revalidate: '重新验证',
  changeLicenseHint: '退出当前许可证，输入另一张',
  revalidateHint: '刷新当前许可证状态（不换证、不释池占号）',
  foldAbout: '关于',
  foldLog: '遇到问题时可展开',
  foldQuotaDetail: '换号次数说明',
  connectedServer: '已连接服务器',
  disconnectedServer: '未连接服务器',
} as const;

export function reasonToChinese(reason: string | undefined): string {
  switch (reason) {
    case 'expired':
    case 'license_expired':
      return '许可证已过期';
    case 'inactive':
    case 'license_inactive':
      return '许可证已停用';
    case 'unknown_license':
      return '许可证无效，请核对后重试';
    case 'invalid_lease':
      return '请重新验证许可证';
    case 'lease_mismatch':
      return '设备租约不一致，请重新验证许可证';
    case 'no_account_available':
      return '暂时没有可用账号，请稍后再试或联系客服';
    case 'claim_race':
      return '账号分配冲突，请稍后再试';
    case 'validate_rate_limited':
      return '验证过于频繁，请稍后再试';
    case 'license_already_claimed':
      return '该许可证已在其他设备使用，请完全退出本程序后重试';
    case 'email_jwt_mismatch':
      return '账号数据异常，请联系客服';
    case 'token_expired':
      return '账号已失效，请联系客服';
    case 'token_refresh_failed':
      return '账号状态异常，请稍后再试或联系客服';
    case 'needs_reauth':
      return '请联系客服处理账号';
    case 'client_version_too_old':
      return '当前版本过低，请升级客户端后重试';
    case 'client_version_required':
      return '程序异常，请重新安装或联系客服';
    case 'switch_rate_limited':
      return '换号过于频繁，请稍后再试';
    case 'switch_cooldown':
      return '换号过于频繁，请稍后再试';
    case 'switch_daily_limit':
      return '今日换号次数已用完，请明日再试或联系客服';
    case 'switch_quota_exhausted':
      return '许可证换号次数已用完，请联系客服续期或加次';
    case 'session_rotate_daily_limit':
      return '今日重新打开可换新的次数已用完，请明日再试';
    case 'license_not_validated':
    case 'not_validated':
      return '请先验证许可证';
    case 'switch_in_progress':
      return '正在换号，请稍候';
    case 'switch_intent_pending':
      return '上次换号尚未完成，客户端将尝试恢复注入；请稍候或重新打开';
    case 'rollback_limit_exceeded':
      return '今日回滚次数过多，请稍后再试或联系客服';
    case 'license_still_valid':
      return '许可证仍有效，无法以失效方式释池';
    case 'not_activated':
      return '请先验证许可证以开始计时';
    default:
      return '操作未成功，请稍后再试或联系客服';
  }
}

export function formatPlanCycleLine(opts: {
  planDisplayName?: string | null;
  switchesRemaining?: number | null;
  switchesMax?: number | null;
  pendingActivation?: boolean;
}): string {
  const max = opts.switchesMax;
  if (max == null) {
    return '';
  }
  if (opts.pendingActivation || opts.switchesRemaining == null) {
    return '待激活';
  }
  const rem = opts.switchesRemaining;
  const name = (opts.planDisplayName || '').trim();
  const suffix = name ? `（${name}）` : '';
  return `剩余 ${rem}/${max} 次${suffix}`;
}

export function formatQuotaShort(quota?: SwitchQuotaResponse | null): string {
  if (!quota || quota.switchesMaxPerDay == null || quota.switchesRemainingToday == null) {
    return '';
  }
  const n = quota.switchesRemainingToday;
  return `今日还可换 ${n} 次`;
}

export function formatQuotaDetail(quota?: SwitchQuotaResponse | null): string {
  if (!quota || quota.switchesMaxPerDay == null || quota.switchesRemainingToday == null) {
    return '';
  }
  /** 纯时间证日限已合并：Hub 对齐 max，或旧 Hub 仍返回 remaining>rotateMax（如 10/1） */
  const unifiedDaily =
    quota.sessionRotatesMaxPerDay > 0 &&
    (quota.sessionRotatesMaxPerDay === quota.switchesMaxPerDay ||
      quota.sessionRotatesRemainingToday > quota.sessionRotatesMaxPerDay);
  const parts: string[] = unifiedDaily
    ? [
        `今日还可换 ${quota.switchesRemainingToday} / ${quota.switchesMaxPerDay} 次（含重新打开客户端换新号）`,
      ]
    : [`今日还可换 ${quota.switchesRemainingToday} / ${quota.switchesMaxPerDay} 次`];
  if (quota.sessionRotatesMaxPerDay > 0 && !unifiedDaily) {
    parts.push(
      `今日重新打开可换新账号：剩 ${quota.sessionRotatesRemainingToday}/${quota.sessionRotatesMaxPerDay} 次`,
    );
  }
  if (quota.nextSwitchAllowedAt) {
    const remain = Math.max(
      0,
      Math.ceil((Date.parse(quota.nextSwitchAllowedAt) - Date.now()) / 1000),
    );
    if (remain > 0) parts.push(`请 ${remain} 秒后再换号`);
  }
  return parts.join('；');
}

export function formatExpiresAt(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `到期：${y}-${m}-${day}`;
}

/** IPC/UI session status — no internal account ids. */
export function sessionStatusMessage(opts: {
  valid: boolean;
  hasAccount: boolean;
  hubOffline?: boolean;
  expiresAt?: string | null;
  switchBlockReason?: string | null;
}): string {
  if (opts.hubOffline) return UI.heroOffline;
  if (!opts.valid) return UI.heroIdle;
  if (opts.switchBlockReason) {
    return reasonToChinese(opts.switchBlockReason);
  }
  if (opts.valid && (opts.expiresAt == null || opts.expiresAt === '')) {
    return UI.heroPendingActivation;
  }
  if (opts.hasAccount) return UI.heroRestored;
  return UI.heroValid;
}

/** Electron IPC wraps errors: `Error invoking remote method '…': Error: <message>` */
export function unwrapIpcErrorMessage(raw: string): string {
  const idx = raw.lastIndexOf('Error: ');
  if (idx >= 0) return raw.slice(idx + 'Error: '.length).trim();
  return raw.trim();
}

export function userFacingError(err: unknown): string {
  const relayPipelinePhrases = [
    '会话配置失败',
    '会话配置失败（',
    '环境配置失败',
    'Cursor 数据库',
    '换号组件',
    '换号组件缺失（',
    '换号已完成',
    '自动关闭 Cursor',
    '未检测到 Cursor',
    '当前账号环境配置',
    '当前分配的账号未配置机器环境',
    '账号数据异常',
    '账号配置异常',
  ] as const;

  function withSentencePeriod(text: string): string {
    return text.endsWith('。') ? text : `${text}。`;
  }

  function passThroughPipelineMessage(msg: string): string | null {
    for (const phrase of relayPipelinePhrases) {
      if (msg.includes(phrase)) return withSentencePeriod(msg);
    }
    return null;
  }

  const raw = err instanceof Error ? err.message : String(err);
  const msg = unwrapIpcErrorMessage(raw);
  const pipeline = passThroughPipelineMessage(msg);
  if (pipeline) return pipeline;
  if (msg.includes('暂时没有可用账号') || msg.includes('没有可用账号')) {
    return '暂时没有可用账号，请稍后再试或联系客服。';
  }
  if (msg.includes('今日换号') || msg.includes('次数已用完') || msg.includes('还可换')) {
    return withSentencePeriod(msg);
  }
  if (msg.includes('验证过于频繁') || msg.includes('换号过于频繁') || msg.includes('稍后再试')) {
    return withSentencePeriod(msg);
  }
  if (msg.includes('无法连接') || msg.includes('服务器')) {
    return '无法连接服务器，请检查网络后重试。';
  }
  if (msg.includes('许可证') || msg.includes('请先验证')) return withSentencePeriod(msg);
  if (msg.includes('本机环境不完整') || msg.includes('需要 Node')) {
    return '本机环境不完整，请重新安装或联系客服。';
  }
  if (msg.includes('程序未正确安装') || msg.includes('仅内部构建')) {
    return withSentencePeriod(msg);
  }
  return '操作未成功，请稍后再试或联系客服。';
}

export function dialogTitle(scene: string): string {
  return `${UI.productName} — ${scene}`;
}
