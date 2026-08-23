import {
  UI,
  reasonToChinese,
  formatQuotaShort,
  formatQuotaDetail,
  formatPlanCycleLine,
  formatExpiresAt,
  userFacingError,
} from './messages.zh.mjs';
import { redactForUi, redactLogLine } from './redact.js';
import {
  baseStatusText as baseStatusTextPure,
  extractSwitchReason,
  heroClassFor,
  isTransientStatusRegression,
  mergeStatusPayload,
} from './status-ui.mjs';

const logEl = document.getElementById('log');
const logDetailsEl = document.getElementById('logDetails');
const statusHeroEl = document.getElementById('statusHero');
const statusSubEl = document.getElementById('statusSub');
const quotaCardEl = document.getElementById('quotaCard');
const quotaCycleEl = document.getElementById('quotaCycle');
const quotaTodayEl = document.getElementById('quotaToday');
const quotaExpiryEl = document.getElementById('quotaExpiry');
const quotaDetailEl = document.getElementById('quotaDetail');
const licenseFieldEl = document.getElementById('licenseField');
const licenseBoundEl = document.getElementById('licenseBound');
const licenseMaskedEl = document.getElementById('licenseMasked');
const licenseInput = document.getElementById('license');
const linkChangeLicense = document.getElementById('linkChangeLicense');
const linkRevalidate = document.getElementById('linkRevalidate');
const btnValidate = document.getElementById('btnValidate');
const btnSwitch = document.getElementById('btnSwitch');
const btnRetryConsume = document.getElementById('btnRetryConsume');
const appTagline = document.getElementById('appTagline');
const usageBody = document.getElementById('usageBody');
const supportLink = document.getElementById('supportLink');
const purchaseCta = document.getElementById('purchaseCta');
const purchaseCtaHint = document.getElementById('purchaseCtaHint');
const btnPurchase = document.getElementById('btnPurchase');
const purchaseLink = document.getElementById('purchaseLink');
const opsPanel = document.getElementById('ops-tools-panel');
const foldAboutSummary = document.getElementById('foldAboutSummary');
const foldLogSummary = document.getElementById('foldLogSummary');
const foldQuotaSummary = document.getElementById('foldQuotaSummary');

let switchAllowed = false;
let stickyStartupNotice = null;
let stickyNoticeTimer = null;
let uiErrorUntil = 0;
let transientHero = null;
let transientHeroTimer = null;
/** Full key in memory for validate/switch; UI shows mask only. */
let boundLicenseKey = '';
/** Build-time purchase page (HTTPS); empty hides purchase UI. */
let buildPurchaseUrl = '';

const TRANSIENT_ERROR_TTL_MS = 30_000;
const TRANSIENT_SUCCESS_TTL_MS = 60_000;
const STATUS_POLL_MS = 60_000;
const POOL_RETRY_POLL_MS = 15_000;

let statusPollInterval = null;
let cooldownTicker = null;

function clearCooldownTicker() {
  if (cooldownTicker) {
    clearInterval(cooldownTicker);
    cooldownTicker = null;
  }
}

function maybeStartCooldownTicker() {
  clearCooldownTicker();
  const block = lastStatusPayload.switchBlockReason;
  if (block !== 'switch_cooldown' && block !== 'switch_rate_limited') return;
  const nextAt = lastStatusPayload.switchQuota?.nextSwitchAllowedAt;
  if (!nextAt) return;

  const tick = () => {
    const remain = Math.ceil((Date.parse(nextAt) - Date.now()) / 1000);
    if (remain <= 0) {
      clearCooldownTicker();
      void pollLicenseStatus();
      return;
    }
    if (lastStatusPayload.valid && statusSubEl) {
      statusSubEl.textContent = `请 ${remain} 秒后再换号`;
      statusSubEl.classList.remove('hidden');
    }
    if (btnSwitch && lastStatusPayload.valid) {
      btnSwitch.disabled = true;
      btnSwitch.title = `请 ${remain} 秒后再换号`;
    }
  };
  tick();
  cooldownTicker = setInterval(tick, 1000);
}

function maskLicenseKey(key) {
  const k = (key || '').trim();
  if (!k) return '';
  const parts = k.split('-');
  if (parts.length >= 4) {
    return `${parts[0]}-****-****-${parts[parts.length - 1]}`;
  }
  if (k.length <= 10) return `${k.slice(0, 2)}…${k.slice(-2)}`;
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function isUserFacingNotice(notice) {
  if (!notice || !String(notice).trim()) return false;
  const s = String(notice).trim();
  if (/^[a-z][a-z0-9_]*$/i.test(s) && s.includes('_')) return false;
  return true;
}

function safeUserFacingError(e) {
  try {
    return userFacingError(e);
  } catch (err) {
    console.error('userFacingError failed', err);
    return '操作未成功，请稍后再试或联系客服。';
  }
}

function safeReasonToChinese(reason) {
  try {
    return reasonToChinese(reason);
  } catch (err) {
    console.error('reasonToChinese failed', err);
    return '';
  }
}

function hadValidLicense() {
  return lastStatusPayload.valid === true || !!boundLicenseKey.trim();
}

/** Keep bound license visible when a switch/validate IPC call fails transiently. */
function transientErrorPatch(extra = {}) {
  return {
    valid: hadValidLicense(),
    switchAllowed: false,
    ...extra,
  };
}

function switchBlockTitle(reason) {
  if (!reason) return '';
  return safeReasonToChinese(reason);
}

/** Reasons where we keep the bound key visible and offer「重新验证」. */
const REVALIDATE_REASONS = new Set([
  'expired',
  'license_expired',
  'invalid_lease',
  'not_activated',
  'validate_rate_limited',
]);

function invalidHeroText(r) {
  if (r?.consumePending) return UI.consumePendingHint;
  if (r?.switchInProgress) return UI.switchInProgressHint;
  const reason = r?.reason;
  if (reason === 'switch_quota_exhausted') return UI.heroQuotaExhausted;
  if (reason === 'inactive' || reason === 'license_inactive') return UI.heroLicenseInactive;
  return baseStatusTextPure(r, { heroIdle: UI.heroIdle });
}

function deriveUiPhase(r) {
  if (r?.switchInProgress) return 'switching';
  if (r?.consumePending) return 'consume_pending';
  if (!r?.valid) {
    if (boundLicenseKey && r?.reason === 'switch_quota_exhausted') return 'quota_exhausted';
    if (
      boundLicenseKey &&
      (r?.reason === 'inactive' || r?.reason === 'license_inactive')
    ) {
      return 'license_inactive';
    }
    if (boundLicenseKey && REVALIDATE_REASONS.has(r?.reason)) {
      return 'invalid_license';
    }
    return 'idle';
  }
  const pending = r.expiresAt == null || r.expiresAt === '';
  if (pending) return 'pending_activation';
  if (r.switchAllowed) return 'ready';
  return 'blocked';
}

function openPurchasePage() {
  if (!buildPurchaseUrl) return;
  window.cursorFree?.openExternal?.(buildPurchaseUrl);
}

function updatePurchaseUi(phase) {
  const idle = phase === 'idle';
  const bound = !idle;
  const show = !!buildPurchaseUrl;
  purchaseCta?.classList.toggle('hidden', !show || !idle);
  purchaseLink?.classList.toggle('hidden', !show || !bound);
}

function renderUiPhase(phase, r) {
  try {
    renderUiPhaseInner(phase, r);
  } catch (e) {
    console.error('renderUiPhase failed', e);
    logTech(`UI: ${e}`);
  }
}

function renderUiPhaseInner(phase, r) {
  const idle = phase === 'idle';
  const bound = !idle;
  updatePurchaseUi(phase);
  licenseFieldEl?.classList.toggle('hidden', !idle);
  licenseBoundEl?.classList.toggle('hidden', !bound);
  const showRevalidate =
    bound &&
    phase !== 'quota_exhausted' &&
    phase !== 'license_inactive' &&
    phase !== 'consume_pending' &&
    phase !== 'switching';
  linkRevalidate?.classList.toggle('hidden', !showRevalidate);
  btnValidate?.classList.toggle('hidden', !idle);
  btnValidate?.classList.toggle('btn-primary', idle);
  btnValidate?.classList.toggle('btn-secondary', !idle);
  btnSwitch?.classList.toggle('btn-primary', bound && phase !== 'invalid_license');
  btnSwitch?.classList.toggle('btn-secondary', idle || phase === 'invalid_license');
  const hideSwitch =
    phase === 'invalid_license' ||
    phase === 'consume_pending' ||
    phase === 'quota_exhausted' ||
    phase === 'license_inactive' ||
    phase === 'switching';
  if (btnSwitch) {
    btnSwitch.classList.toggle('hidden', hideSwitch);
    btnSwitch.disabled = hideSwitch || !r?.switchAllowed;
  }
  if (btnRetryConsume) {
    btnRetryConsume.classList.toggle('hidden', phase !== 'consume_pending');
    btnRetryConsume.textContent = UI.retryConsume ?? '重试确认';
  }

  if (bound && boundLicenseKey && licenseMaskedEl) {
    licenseMaskedEl.textContent = maskLicenseKey(boundLicenseKey);
  }

  if (statusSubEl) {
    const showHint = phase === 'pending_activation';
    statusSubEl.textContent = showHint
      ? (bound ? UI.heroPendingActivationRevalidateHint : UI.heroPendingActivationHint)
      : '';
    statusSubEl.classList.toggle('hidden', !showHint);
  }

  if (quotaCardEl) {
    quotaCardEl.classList.toggle(
      'hidden',
      !bound || phase === 'invalid_license' || phase === 'idle',
    );
  }

  if (linkChangeLicense) {
    linkChangeLicense.textContent = UI.changeLicense;
    linkChangeLicense.title = UI.changeLicenseHint;
  }
  if (linkRevalidate) {
    linkRevalidate.textContent = UI.revalidate;
    linkRevalidate.title = UI.revalidateHint;
  }
  if (btnValidate && idle) btnValidate.textContent = UI.validateAndContinue;
  if (btnSwitch && bound && phase !== 'invalid_license' && phase !== 'switching') {
    btnSwitch.textContent = UI.switchAccount;
  }
  if (btnSwitch && phase === 'switching') {
    btnSwitch.textContent = UI.switching;
    btnSwitch.disabled = true;
    btnSwitch.classList.add('is-loading');
  }

  const blockReason = r?.switchBlockReason ?? r?.reason;
  if (btnSwitch && bound && !hideSwitch) {
    btnSwitch.title =
      !r?.switchAllowed && !r?.switchInProgress ? switchBlockTitle(blockReason) : '';
  }
}

function log(msg) {
  if (!logEl) return;
  logEl.textContent += `${new Date().toISOString()} ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
  logDetailsEl?.classList.remove('hidden');
}

function logTech(msg) {
  log(redactLogLine(String(msg)));
}

function clearStickyStartupNotice() {
  stickyStartupNotice = null;
  if (stickyNoticeTimer) {
    clearTimeout(stickyNoticeTimer);
    stickyNoticeTimer = null;
  }
}

function armStickyStartupNotice(notice) {
  if (!notice || !isUserFacingNotice(notice)) return;
  stickyStartupNotice = notice;
  logTech(`startup: ${notice}`);
  if (stickyNoticeTimer) clearTimeout(stickyNoticeTimer);
  stickyNoticeTimer = setTimeout(() => {
    stickyStartupNotice = null;
    stickyNoticeTimer = null;
    applyHeroFromLast();
  }, 90_000);
}

let lastStatusPayload = { valid: false, reason: 'not_validated' };

function heroLocked() {
  return Date.now() < uiErrorUntil && !!transientHero;
}

function clearTransientHero() {
  uiErrorUntil = 0;
  transientHero = null;
  if (transientHeroTimer) {
    clearTimeout(transientHeroTimer);
    transientHeroTimer = null;
  }
}

function showTransientHero(text, r, ttlMs) {
  transientHero = text;
  uiErrorUntil = Date.now() + ttlMs;
  const patch = { ...r };
  if (isTransientStatusRegression(lastStatusPayload, patch)) {
    patch.valid = true;
    if (patch.reason === 'error') delete patch.reason;
  }
  lastStatusPayload = mergeStatusPayload(lastStatusPayload, patch);
  try {
    setHeroText(text, lastStatusPayload);
    switchAllowed = lastStatusPayload.switchAllowed === true;
    if (btnSwitch) btnSwitch.disabled = !switchAllowed;
    renderUiPhase(deriveUiPhase(lastStatusPayload), lastStatusPayload);
    maybeStartCooldownTicker();
  } catch (e) {
    console.error('showTransientHero failed', e);
    logTech(`UI: ${e}`);
  }
  if (transientHeroTimer) clearTimeout(transientHeroTimer);
  transientHeroTimer = setTimeout(() => {
    void (async () => {
      if (Date.now() < uiErrorUntil) return;
      clearTransientHero();
      await pollLicenseStatus();
      applyHeroFromLast();
    })();
  }, ttlMs);
}

function rescheduleStatusPoll() {
  if (statusPollInterval) clearInterval(statusPollInterval);
  const fast =
    lastStatusPayload.valid &&
    lastStatusPayload.switchBlockReason === 'no_account_available';
  const ms = fast ? POOL_RETRY_POLL_MS : STATUS_POLL_MS;
  statusPollInterval = setInterval(() => void pollLicenseStatus(), ms);
}

function baseStatusText(r) {
  return baseStatusTextPure(r, { heroIdle: UI.heroIdle });
}

function setHeroText(text, r) {
  if (!statusHeroEl) return;
  let line = text;
  if (stickyStartupNotice && isUserFacingNotice(stickyStartupNotice)) {
    line = `${line} · ${stickyStartupNotice}`;
  }
  statusHeroEl.textContent = line;
  try {
    statusHeroEl.className = `status-hero ${heroClassFor(r ?? lastStatusPayload)}`;
  } catch {
    statusHeroEl.className = 'status-hero status-hero--warn';
  }
}

function heroTextForPayload(r) {
  if (r?.valid) return baseStatusText(r);
  return invalidHeroText(r);
}

function applyHeroFromLast() {
  if (heroLocked()) {
    setHeroText(transientHero, lastStatusPayload);
    return;
  }
  setHeroText(heroTextForPayload(lastStatusPayload), lastStatusPayload);
  renderUiPhase(deriveUiPhase(lastStatusPayload), lastStatusPayload);
}

function updateQuotaDisplay(r) {
  try {
    updateQuotaDisplayInner(r);
  } catch (e) {
    console.error('updateQuotaDisplay failed', e);
  }
}

function updateQuotaDisplayInner(r) {
  const periodCap = r?.switchesMax != null;
  const q = r?.switchQuota;
  const showDaily = !periodCap && q?.switchesMaxPerDay != null;
  const pending =
    r?.valid && (r.expiresAt == null || r.expiresAt === '');
  const cycle = periodCap
    ? formatPlanCycleLine({
        planDisplayName: r?.planDisplayName,
        switchesRemaining: r?.switchesRemaining,
        switchesMax: r?.switchesMax,
        pendingActivation: pending,
      })
    : '';
  const cycleLabel = document.getElementById('quotaCycleLabel');
  const todayLabel = document.getElementById('quotaTodayLabel');
  const periodCell = quotaCycleEl?.closest('.quota-card__cell');
  const dailyCell = quotaTodayEl?.closest('.quota-card__cell');
  if (cycleLabel) cycleLabel.textContent = UI.quotaPeriodLabel;
  if (todayLabel) todayLabel.textContent = UI.quotaDailyLabel;
  if (periodCell) periodCell.classList.toggle('hidden', !periodCap);
  if (dailyCell) dailyCell.classList.toggle('hidden', !showDaily);
  if (quotaCycleEl) quotaCycleEl.textContent = cycle || '—';
  if (quotaTodayEl) {
    if (showDaily && r?.valid) {
      quotaTodayEl.textContent = formatQuotaShort(q) || UI.quotaEmpty;
    } else if (!periodCap && r?.valid) {
      quotaTodayEl.textContent = UI.quotaEmpty;
    } else {
      quotaTodayEl.textContent = '';
    }
  }
  if (quotaExpiryEl) {
    const exp = formatExpiresAt(r?.expiresAt);
    quotaExpiryEl.textContent = exp;
    quotaExpiryEl.classList.toggle('hidden', !exp);
  }
  if (quotaDetailEl) {
    const parts = [];
    if (cycle) parts.push(cycle);
    if (showDaily && q) parts.push(formatQuotaDetail(q));
    quotaDetailEl.textContent = parts.length ? parts.join('；') : '—';
  }
}

function applyStatusFromCheck(r) {
  if (!r || typeof r !== 'object') return;
  try {
    applyStatusFromCheckInner(r);
  } catch (e) {
    console.error('applyStatusFromCheck failed', e);
    logTech(`status: ${e}`);
  }
}

function applyStatusFromCheckInner(r) {
  lastStatusPayload = mergeStatusPayload(lastStatusPayload, r);
  if (r.valid && (r.licenseKey || boundLicenseKey)) {
    if (r.licenseKey) boundLicenseKey = r.licenseKey;
  }
  if (!r.valid && !boundLicenseKey && r.licenseKey) {
    boundLicenseKey = r.licenseKey;
  }
  if (r.consumePending) clearTransientHero();
  if (!heroLocked() || r.consumePending) {
    setHeroText(heroTextForPayload(lastStatusPayload), lastStatusPayload);
  }
  const phase = deriveUiPhase(lastStatusPayload);
  renderUiPhase(phase, lastStatusPayload);
  if (r.switchInProgress) {
    switchAllowed = false;
    btnSwitch.disabled = true;
  } else if (r.valid) {
    switchAllowed = r.switchAllowed === true;
    btnSwitch.disabled = !switchAllowed;
    updateQuotaDisplay(r);
  } else {
    switchAllowed = false;
    btnSwitch.disabled = true;
    if (!r.hubOffline) {
      updateQuotaDisplay({ valid: false });
    }
  }
  rescheduleStatusPoll();
  maybeStartCooldownTicker();
}

async function enterChangeLicense() {
  clearStickyStartupNotice();
  clearTransientHero();
  boundLicenseKey = '';
  if (window.cursorFree?.clearSession) {
    try {
      await window.cursorFree.clearSession();
    } catch (e) {
      logTech(`clearSession: ${e}`);
    }
  }
  lastStatusPayload = { valid: false, reason: 'not_validated' };
  if (licenseInput) {
    licenseInput.value = '';
    licenseInput.focus();
  }
  setHeroText(UI.heroIdle, lastStatusPayload);
  renderUiPhase('idle', lastStatusPayload);
  switchAllowed = false;
  if (btnSwitch) btnSwitch.disabled = true;
}

async function revalidateCurrentLicense() {
  const key = boundLicenseKey.trim();
  if (!key || !window.cursorFree?.validateLicense) return;
  clearStickyStartupNotice();
  clearTransientHero();
  const prevLabel = linkRevalidate?.textContent;
  if (linkRevalidate) {
    linkRevalidate.disabled = true;
    linkRevalidate.textContent = UI.validating;
  }
  try {
    const r = await window.cursorFree.validateLicense(key);
    logTech(JSON.stringify(redactForUi(r)));
    applyStatusFromCheck(r);
    if (!r.valid) {
      showTransientHero(
        r.message ?? reasonToChinese(r.reason),
        { ...r, valid: false, switchAllowed: false },
        TRANSIENT_ERROR_TTL_MS,
      );
    }
  } catch (e) {
    showTransientHero(
      safeUserFacingError(e),
      transientErrorPatch({ reason: 'error' }),
      TRANSIENT_ERROR_TTL_MS,
    );
    logTech(String(e));
  } finally {
    if (linkRevalidate) {
      linkRevalidate.disabled = false;
      linkRevalidate.textContent = prevLabel || UI.revalidate;
    }
  }
}

if (linkChangeLicense) {
  linkChangeLicense.onclick = () => void enterChangeLicense();
}
if (linkRevalidate) {
  linkRevalidate.onclick = () => void revalidateCurrentLicense();
}

if (licenseInput) {
  licenseInput.addEventListener('blur', () => {
    licenseInput.value = licenseInput.value.replace(/\s+/g, '').trim();
  });
}

if (btnValidate) {
  btnValidate.onclick = async () => {
    const licenseKey = licenseInput?.value.trim() ?? '';
    if (!licenseKey) return logTech('请输入许可证');
    clearStickyStartupNotice();
    clearTransientHero();
    const prevLabel = btnValidate.textContent;
    btnValidate.disabled = true;
    btnValidate.classList.add('is-loading');
    btnValidate.textContent = UI.validating;
    try {
      if (!window.cursorFree?.validateLicense) {
        setHeroText(UI.installBroken, { valid: false });
        return logTech('preload missing');
      }
      const r = await window.cursorFree.validateLicense(licenseKey);
      boundLicenseKey = licenseKey;
      logTech(JSON.stringify(redactForUi(r)));
      applyStatusFromCheck(r);
      if (r.valid && r.nodeOk === false) {
        setHeroText(UI.nodeIncomplete, { valid: true, switchAllowed: false });
        switchAllowed = false;
        if (btnSwitch) btnSwitch.disabled = true;
        logTech(r.nodeDetail ?? 'node check failed');
      }
    } catch (e) {
      showTransientHero(
        safeUserFacingError(e),
        transientErrorPatch({ reason: 'error' }),
        TRANSIENT_ERROR_TTL_MS,
      );
      logTech(String(e));
    } finally {
      btnValidate.textContent = prevLabel || UI.validateAndContinue;
      btnValidate.disabled = false;
      btnValidate.classList.remove('is-loading');
    }
  };
}

async function pollLicenseStatus() {
  if (!window.cursorFree?.checkLicenseStatus) return;
  try {
    const r = await window.cursorFree.checkLicenseStatus();
    applyStatusFromCheck(r);
  } catch (e) {
    logTech(`status: ${e}`);
  }
}

rescheduleStatusPoll();

const versionBanner = document.getElementById('versionBanner');
const versionBannerText = document.getElementById('versionBannerText');
const btnVersionDownload = document.getElementById('btnVersionDownload');
const aboutVersion = document.getElementById('aboutVersion');

function showUpgradeBanner(info) {
  if (!info || info.status !== 'upgrade_recommended') {
    versionBanner?.classList.add('hidden');
    return;
  }
  versionBanner?.classList.remove('hidden');
  if (versionBannerText) {
    versionBannerText.textContent = info.message ?? UI.upgradeRecommend;
  }
  const url = info.downloadUrl;
  if (btnVersionDownload) {
    if (url) {
      btnVersionDownload.classList.remove('hidden');
      btnVersionDownload.onclick = () => window.cursorFree?.openExternal?.(url);
    } else {
      btnVersionDownload.classList.add('hidden');
    }
  }
}

async function loadVersionInfo() {
  if (!window.cursorFree?.getVersionInfo) {
    if (aboutVersion) aboutVersion.textContent = UI.versionUnavailable;
    return;
  }
  const v = await window.cursorFree.getVersionInfo();
  const hub = v.hub;
  const lines = [`应用版本：${v.appVersion ?? '—'}`];
  if (hub?.status === 'upgrade_required') {
    lines.push('状态：需要升级客户端');
  } else if (hub) {
    lines.push(UI.connectedServer);
  } else {
    lines.push(UI.disconnectedServer);
  }
  if (aboutVersion) aboutVersion.textContent = lines.join('\n');
  showUpgradeBanner(hub);
}

async function initBuildFlags() {
  if (!window.cursorFree?.getBuildFlags) return;
  const flags = await window.cursorFree.getBuildFlags();
  if (appTagline && flags.productTagline) {
    appTagline.textContent = flags.productTagline;
  }
  if (usageBody) usageBody.textContent = UI.usageSummary;
  if (foldAboutSummary) foldAboutSummary.textContent = UI.foldAbout;
  if (foldLogSummary) foldLogSummary.textContent = UI.foldLog;
  if (foldQuotaSummary) foldQuotaSummary.textContent = UI.foldQuotaDetail;
  const quotaCycleLabel = document.getElementById('quotaCycleLabel');
  const quotaTodayLabel = document.getElementById('quotaTodayLabel');
  if (quotaCycleLabel && UI.quotaCycleLabel) quotaCycleLabel.textContent = UI.quotaCycleLabel;
  if (quotaTodayLabel && UI.quotaTodayLabel) quotaTodayLabel.textContent = UI.quotaTodayLabel;
  if (flags.enableOpsTools && opsPanel) {
    opsPanel.removeAttribute('hidden');
  }
  if (supportLink && flags.supportUrl) {
    supportLink.href = flags.supportUrl;
    supportLink.textContent = UI.supportLink;
    supportLink.classList.remove('hidden');
    supportLink.onclick = (e) => {
      e.preventDefault();
      window.cursorFree?.openExternal?.(flags.supportUrl);
    };
  }
  buildPurchaseUrl = (flags.purchaseUrl || '').trim();
  if (purchaseCtaHint) purchaseCtaHint.textContent = UI.purchaseCtaHint;
  if (btnPurchase) {
    btnPurchase.textContent = UI.purchaseCtaButton;
    btnPurchase.onclick = () => openPurchasePage();
  }
  if (purchaseLink) {
    purchaseLink.textContent = UI.purchaseLinkSubtle;
    purchaseLink.onclick = () => openPurchasePage();
  }
  updatePurchaseUi(deriveUiPhase(lastStatusPayload));
}

async function restoreUiFromSession() {
  if (!window.cursorFree?.getSession) return;
  const s = await window.cursorFree.getSession();
  if (s.licenseKey) {
    boundLicenseKey = s.licenseKey;
    if (licenseInput && !s.validated) {
      licenseInput.value = s.licenseKey;
    } else if (licenseInput) {
      licenseInput.value = '';
    }
  }
  if (s.startupNotice) armStickyStartupNotice(s.startupNotice);
  if (!s.validated) {
    if (s.startupNotice) applyHeroFromLast();
    else {
      setHeroText(UI.heroIdle, { valid: false, reason: 'not_validated' });
      renderUiPhase('idle', { valid: false });
    }
    return;
  }
  applyStatusFromCheck(s);
  if (s.hubOffline) logTech('server offline, session restored locally');
  else if (s.restoredFromDisk) logTech('session restored from disk');
  renderUiPhase(deriveUiPhase(lastStatusPayload), lastStatusPayload);
}

function installRendererGuards() {
  window.addEventListener('unhandledrejection', (ev) => {
    logTech(`unhandled: ${ev.reason}`);
    ev.preventDefault();
  });
  window.addEventListener('error', (ev) => {
    logTech(`error: ${ev.message}`);
  });
}

async function bootstrapUi() {
  installRendererGuards();
  try {
    await initBuildFlags();
    await loadVersionInfo();
    await restoreUiFromSession();
    await pollLicenseStatus();
  } catch (e) {
    logTech(`bootstrap: ${e}`);
    setHeroText(UI.heroIdle, { valid: false, reason: 'error' });
  }
  if (logDetailsEl && logEl && !logEl.textContent.trim()) {
    logDetailsEl.classList.add('hidden');
  }
}

void bootstrapUi();

const importHubUrl = document.getElementById('importHubUrl');
const importAdminToken = document.getElementById('importAdminToken');
const importAccountId = document.getElementById('importAccountId');
const importProfileId = document.getElementById('importProfileId');
const importEmail = document.getElementById('importEmail');
const importSource = document.getElementById('importSource');
const btnImportCapture = document.getElementById('btnImportCapture');
const btnImportLoad = document.getElementById('btnImportLoad');
const btnImportSave = document.getElementById('btnImportSave');
const btnImportUpload = document.getElementById('btnImportUpload');
const importReady = document.getElementById('importReady');
const importPreview = document.getElementById('importPreview');

function importOptsFromForm() {
  return {
    accountId: importAccountId?.value.trim() || undefined,
    profileId: importProfileId?.value.trim() || undefined,
    email: importEmail?.value.trim() || undefined,
    source: importSource?.value.trim() || undefined,
  };
}

function setImportReady(text, canUpload) {
  if (!importReady) return;
  importReady.textContent = text;
  if (btnImportUpload) btnImportUpload.disabled = !canUpload;
  if (btnImportSave) btnImportSave.disabled = !canUpload;
}

function showImportPreview(preview) {
  if (importPreview) {
    importPreview.textContent = JSON.stringify(redactForUi(preview), null, 2);
  }
}

async function initImportDefaults() {
  if (!window.cursorFree?.importDefaults) return;
  try {
    const d = await window.cursorFree.importDefaults();
    if (d.hubUrl && importHubUrl && !importHubUrl.value.trim()) {
      importHubUrl.value = d.hubUrl;
    }
  } catch {
    /* ignore */
  }
}

if (opsPanel && !opsPanel.hasAttribute('hidden')) {
  void initImportDefaults();
}

if (btnImportCapture) {
  btnImportCapture.onclick = async () => {
    btnImportCapture.disabled = true;
    try {
      const r = await window.cursorFree.importCaptureLive(importOptsFromForm());
      showImportPreview(r.preview);
      setImportReady('已采集（预览）', true);
      logTech('capture ok');
    } catch (e) {
      logTech(`capture: ${e}`);
      setImportReady('采集失败', false);
    } finally {
      btnImportCapture.disabled = false;
    }
  };
}

if (btnImportLoad) {
  btnImportLoad.onclick = async () => {
    try {
      const r = await window.cursorFree.importLoadBundle();
      if (!r.ok) return logTech('load: cancelled');
      showImportPreview(r.preview);
      setImportReady('已从文件加载', true);
      logTech(`load: ${r.path}`);
    } catch (e) {
      logTech(`load: ${e}`);
    }
  };
}

if (btnImportSave) {
  btnImportSave.onclick = async () => {
    try {
      const r = await window.cursorFree.importSaveBundle();
      if (!r.ok) return logTech('save: cancelled');
      logTech(`save: ${r.path}`);
    } catch (e) {
      logTech(`save: ${e}`);
    }
  };
}

if (btnImportUpload) {
  btnImportUpload.onclick = async () => {
    btnImportUpload.disabled = true;
    btnImportUpload.textContent = '上传中…';
    try {
      const r = await window.cursorFree.importUpload({
        hubUrl: importHubUrl?.value.trim(),
        adminToken: importAdminToken?.value,
      });
      logTech(`upload: ${JSON.stringify(redactForUi(r))}`);
      setImportReady('已上传到服务器', false);
      if (importPreview) importPreview.textContent = '（上传成功）';
    } catch (e) {
      logTech(`upload: ${e}`);
    } finally {
      btnImportUpload.textContent = '② 上传到服务器';
      btnImportUpload.disabled = false;
    }
  };
}

if (btnSwitch) {
  btnSwitch.onclick = async () => {
  try {
  btnSwitch.disabled = true;
  btnSwitch.classList.add('is-loading');
  btnSwitch.textContent = UI.switching;
  lastStatusPayload = mergeStatusPayload(lastStatusPayload, {
    switchInProgress: true,
    switchAllowed: false,
  });
  renderUiPhase('switching', lastStatusPayload);
  clearStickyStartupNotice();
  clearTransientHero();
  let offSwitchPhase = null;
  if (window.cursorFree?.onSwitchPhase) {
    offSwitchPhase = window.cursorFree.onSwitchPhase((msg) => {
      if (statusSubEl && msg) {
        statusSubEl.textContent = msg;
        statusSubEl.classList.remove('hidden');
      }
    });
  }
  if (statusSubEl) {
    statusSubEl.textContent = UI.switchInProgressHint;
    statusSubEl.classList.remove('hidden');
  }
  try {
    const r = await window.cursorFree.switchAccount();
    logTech(JSON.stringify(redactForUi(r)));
    if (r.switchesMax != null || r.switchQuota) {
      applyStatusFromCheck({
        ...lastStatusPayload,
        valid: true,
        switchesRemaining: r.switchesRemaining ?? lastStatusPayload.switchesRemaining,
        switchesMax: r.switchesMax ?? lastStatusPayload.switchesMax,
        switchQuota: r.switchQuota ?? lastStatusPayload.switchQuota,
        switchBlockReason: null,
        switchAllowed: r.switchAllowed ?? lastStatusPayload.switchAllowed ?? true,
      });
    }
    if (r.injected && r.restarted === false) {
      showTransientHero(
        UI.switchDoneManual,
        { valid: true, switchAllowed: lastStatusPayload.switchAllowed === true },
        TRANSIENT_SUCCESS_TTL_MS,
      );
      await pollLicenseStatus();
    } else {
      await pollLicenseStatus();
    }
  } catch (e) {
    const reason = extractSwitchReason(e);
    const errMsg = safeUserFacingError(e);
    const poolEmpty = reason === 'no_account_available';
    logTech(`${errMsg} | ${String(e)}`);
    await pollLicenseStatus();
    if (lastStatusPayload.consumePending) {
      clearTransientHero();
      setHeroText(heroTextForPayload(lastStatusPayload), lastStatusPayload);
      renderUiPhase(deriveUiPhase(lastStatusPayload), lastStatusPayload);
    } else {
      const patch = {
        valid: true,
        switchAllowed: false,
        reason: reason ?? 'error',
        switchBlockReason:
          reason ?? (poolEmpty ? 'no_account_available' : undefined),
        accountId: lastStatusPayload.accountId,
        claimedAccountId: lastStatusPayload.claimedAccountId,
        expiresAt: lastStatusPayload.expiresAt,
        switchQuota: lastStatusPayload.switchQuota,
      };
      if (reason === 'switch_cooldown' && !patch.switchQuota?.nextSwitchAllowedAt) {
        const m = errMsg.match(/(\d+)\s*秒/);
        if (m) {
          patch.switchQuota = {
            ...(patch.switchQuota ?? {}),
            nextSwitchAllowedAt: new Date(Date.now() + Number(m[1]) * 1000).toISOString(),
          };
        }
      }
      showTransientHero(errMsg, patch, TRANSIENT_ERROR_TTL_MS);
    }
  } finally {
    offSwitchPhase?.();
    if (statusSubEl && !cooldownTicker) {
      const phase = deriveUiPhase(lastStatusPayload);
      if (phase !== 'pending_activation' && phase !== 'switching') {
        statusSubEl.textContent = '';
        statusSubEl.classList.add('hidden');
      }
    }
    btnSwitch.classList.remove('is-loading');
    if (lastStatusPayload.switchInProgress) {
      lastStatusPayload = mergeStatusPayload(lastStatusPayload, { switchInProgress: false });
    }
    const phase = deriveUiPhase(lastStatusPayload);
    switchAllowed = lastStatusPayload.switchAllowed === true;
    btnSwitch.textContent = phase === 'switching' ? UI.switching : UI.switchAccount;
    btnSwitch.disabled = phase === 'switching' || !switchAllowed;
  }
  } catch (uiErr) {
    logTech(`switch handler: ${uiErr}`);
    showTransientHero(
      safeUserFacingError(uiErr),
      transientErrorPatch({ reason: 'error' }),
      TRANSIENT_ERROR_TTL_MS,
    );
  }
  };
}

if (btnRetryConsume) {
  btnRetryConsume.onclick = async () => {
    btnRetryConsume.disabled = true;
    try {
      if (window.cursorFree?.retryConsumePeriodSwitch) {
        await window.cursorFree.retryConsumePeriodSwitch();
      }
      showTransientHero(
        UI.consumeConfirmed,
        { valid: true, switchAllowed: lastStatusPayload.switchAllowed === true },
        TRANSIENT_SUCCESS_TTL_MS,
      );
      await pollLicenseStatus();
    } catch (e) {
      showTransientHero(safeUserFacingError(e), { valid: true, consumePending: true }, TRANSIENT_ERROR_TTL_MS);
      logTech(String(e));
    } finally {
      btnRetryConsume.disabled = false;
    }
  };
}
