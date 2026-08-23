/** Hub API shapes — must match mvp-python/app/schemas.py */

export interface LicenseValidateRequest {
  licenseKey: string;
}

export interface LicenseValidateResponse {
  valid: boolean;
  plan?: string;
  planId?: string;
  planDisplayName?: string;
  switchesRemaining?: number;
  switchesMax?: number;
  expiresAt?: string;
  deviceLeaseId?: string;
  reason?: string;
  /** Hub: license still valid and may claim when lease is present. */
  canSwitch?: boolean;
  switchBlockReason?: string | null;
  nodeOk?: boolean;
  nodeDetail?: string;
}

export interface LicenseStatusRequest {
  licenseKey: string;
}

export interface LicenseStatusResponse {
  valid: boolean;
  plan?: string;
  planId?: string;
  planDisplayName?: string;
  switchesRemaining?: number;
  switchesMax?: number;
  expiresAt?: string;
  reason?: string;
  active?: boolean;
  canSwitch?: boolean;
  /** Hub: license valid but switch blocked (e.g. empty pool). */
  switchBlockReason?: string | null;
  claimedAccountId?: string | null;
  claimedDeviceLeaseId?: string | null;
  claimedAt?: string | null;
  switchQuota?: SwitchQuotaResponse | null;
  pendingSwitchIntentExpiresAt?: string | null;
}

/** Desktop IPC status extras (not Hub API). */
export interface DesktopStatusExtras {
  switchInProgress?: boolean;
  consumePending?: boolean;
  consumePendingAccountId?: string;
}

export interface AccountSwitchRequest {
  licenseKey: string;
  deviceLeaseId: string;
  priorAccountId?: string | null;
  releaseReason?: 'switch' | 'session_rotate';
}

export interface AccountSwitchResponse extends AccountClaimResponse {
  releasedAccountId?: string | null;
}

export interface AccountClaimRequest {
  licenseKey: string;
  deviceLeaseId: string;
  consumePeriodSwitch?: boolean;
}

export interface AccountClaimResponse {
  accountId: string;
  accessToken: string;
  email?: string;
  machineProfile: { profileId: string };
}

export type ReleaseReason =
  | 'switch'
  | 'rollback'
  | 'license_invalid'
  | 'session_rotate'
  | 'voluntary';

export interface SwitchQuotaResponse {
  switchesUsedToday: number;
  switchesMaxPerDay?: number | null;
  switchesRemainingToday?: number | null;
  sessionRotatesUsedToday: number;
  sessionRotatesMaxPerDay: number;
  sessionRotatesRemainingToday: number;
  cooldownSeconds: number;
  nextSwitchAllowedAt?: string | null;
}

export interface AccountReleaseRequest {
  accountId: string;
  licenseKey: string;
  releaseReason?: ReleaseReason;
}

export interface AccountReleaseResponse {
  ok: boolean;
  reason?: string;
}

export type DeviceBinding = 'account' | 'captured' | 'token_only';

export type ClientVersionStatus = 'ok' | 'upgrade_recommended' | 'upgrade_required';

export interface ClientVersionResponse {
  clientVersion: string;
  minVersion: string;
  recommendVersion: string;
  latestVersion: string;
  downloadUrl?: string | null;
  releaseNotes?: string | null;
  status: ClientVersionStatus;
  message: string;
}

export interface HubErrorBody {
  detail?: string;
  minVersion?: string;
  latestVersion?: string;
  downloadUrl?: string | null;
  message?: string;
}

export interface ProfileEnvResponse {
  profileId: string;
  machineId: string;
  storage: Record<string, string>;
  storageLayout: string;
  /** account = Hub-paired fingerprint; captured = live capture; token_only = skip env apply */
  deviceBinding?: DeviceBinding;
  createdAt: string;
  updatedAt: string;
}
