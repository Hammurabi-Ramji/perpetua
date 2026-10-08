import type {
  AccountRecoverySettings,
  AuthResponse,
  BackupEntry,
  CloudBackupSettings,
  EnableCloudBackupInput,
  EnableCloudBackupResult,
  Entitlement,
  ImportLicensesResult,
  License,
  LicenseInput,
  LicenseStats,
  ReminderItem,
  ReminderSettings,
  RestoreCloudBackupInput,
  RestoreResult,
  SiteConnection,
  User,
  VaultExportFile,
  VaultMember,
  VaultStatus,
} from "$lib/types";

// Keep in sync with src-tauri DEFAULT_API_PORT (PERPETUA_API_PORT / VITE_PERPETUA_API_PORT).
// 18765 avoids Windows Hyper-V exclusions on 3000/3001.
const API_PORT = import.meta.env.VITE_PERPETUA_API_PORT || "18765";
const API_BASE_URL = `http://127.0.0.1:${API_PORT}/api`;
const TOKEN_KEY = "perpetua.auth.token";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getStoredToken() {
  return typeof localStorage === "undefined"
    ? null
    : localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function normalizeEmpty(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : null;
}

export function normalizeLicenseInput(input: LicenseInput) {
  return {
    ...input,
    source_site: normalizeEmpty(input.source_site),
    product_url: normalizeEmpty(input.product_url),
    redemption_url: normalizeEmpty(input.redemption_url),
    download_url: normalizeEmpty(input.download_url),
    notes: normalizeEmpty(input.notes),
    action_description: normalizeEmpty(input.action_description),
    action_deadline: normalizeEmpty(input.action_deadline),
    purchase_date: normalizeEmpty(input.purchase_date),
    expiry_date: normalizeEmpty(input.expiry_date),
    last_active: normalizeEmpty(input.last_active),
    keepalive_days: input.keepalive_days ? Number(input.keepalive_days) : null,
  };
}

async function request<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getStoredToken();

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
  } catch {
    // fetch() itself threw — the backend is unreachable (not running, or a
    // network-level failure), not just an error response. Give a clear,
    // actionable message instead of leaking a raw "Failed to fetch".
    throw new ApiError(
      "Can't reach Perpetua's local service. Try restarting the app.",
      0,
    );
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.message ?? `Request failed with status ${response.status}`,
      response.status,
    );
  }

  return (payload?.data ?? payload) as T;
}

export function login(email: string, password: string) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string) {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getCurrentUser() {
  return request<User>("/auth/me");
}

/** Invalidates the browser-extension pairing token and returns a fresh desktop session. */
export function revokeExtensionToken() {
  return request<AuthResponse>("/auth/revoke-extension", { method: "POST" });
}

export function completeOnboarding() {
  return request<{ onboarding_completed: boolean }>("/auth/onboarding/complete", {
    method: "POST",
  });
}

export function forgotPassword(email: string) {
  return request<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(email: string, code: string, newPassword: string) {
  return request<{ reset: boolean }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, code, new_password: newPassword }),
  });
}

export function getAccountRecovery() {
  return request<AccountRecoverySettings>("/account/recovery");
}

export function updateAccountRecovery(settings: AccountRecoverySettings) {
  return request<AccountRecoverySettings>("/account/recovery", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

/** Sends a test message to the saved backup email through the saved relay. */
export function sendTestRecoveryEmail() {
  return request<{ sent: boolean; to: string }>("/account/recovery/test", {
    method: "POST",
  });
}

export function inviteMember(email: string) {
  return request<{ invited: boolean }>("/sharing/invite", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function redeemInvite(code: string) {
  return request<{ redeemed: boolean }>("/sharing/redeem", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function listVaultMembers() {
  return request<VaultMember[]>("/sharing/members");
}

export function listLicenses() {
  return request<License[]>("/licenses");
}

export function getLicenseStats() {
  return request<LicenseStats>("/licenses/stats");
}

export function getEntitlement() {
  return request<Entitlement>("/entitlement");
}

export function activateLicense(key: string) {
  return request<Entitlement>("/activate", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}

export function createLicense(input: LicenseInput) {
  return request<License>("/licenses", {
    method: "POST",
    body: JSON.stringify(normalizeLicenseInput(input)),
  });
}

export function getLicense(id: string) {
  return request<License>(`/licenses/${id}`);
}

export function updateLicense(id: string, input: LicenseInput) {
  return request<License>(`/licenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(normalizeLicenseInput(input)),
  });
}

export function deleteLicense(id: string) {
  return request<{ deleted: boolean }>(`/licenses/${id}`, { method: "DELETE" });
}

export function markLicenseActive(id: string) {
  return request<License>(`/licenses/${id}/active`, { method: "POST" });
}

export function listSiteConnections() {
  return request<SiteConnection[]>("/sites/connections");
}

export function createSite(name: string, url: string, description?: string) {
  return request<SiteConnection>("/sites", {
    method: "POST",
    body: JSON.stringify({ name, url, description: normalizeEmpty(description) }),
  });
}

export function connectSite(id: string) {
  return request<{ connected: boolean }>(`/sites/${id}/connect`, {
    method: "POST",
  });
}

export function disconnectSite(id: string) {
  return request<{ connected: boolean }>(`/sites/${id}`, { method: "DELETE" });
}

export function deleteSite(id: string) {
  return request<{ deleted: boolean }>(`/sites/${id}/delete`, { method: "POST" });
}

export function getReminderSettings() {
  return request<ReminderSettings>("/reminders/settings");
}

export function updateReminderSettings(input: ReminderSettings) {
  return request<ReminderSettings>("/reminders/settings", {
    method: "PATCH",
    body: JSON.stringify({
      ...input,
      notification_email: normalizeEmpty(input.notification_email),
    }),
  });
}

export function getActivityInference() {
  return request<{ enabled: boolean }>("/activity/settings");
}

export function setActivityInference(enabled: boolean) {
  return request<{ enabled: boolean }>("/activity/settings", {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function listReminderItems() {
  return request<ReminderItem[]>("/reminders/items");
}

export function snoozeReminder(item: ReminderItem, hours: number) {
  return request<{ snoozed: boolean }>("/reminders/snooze", {
    method: "POST",
    body: JSON.stringify({
      license_id: item.license_id,
      kind: item.kind,
      due_date: item.due_date,
      hours,
    }),
  });
}

export function dismissReminder(item: ReminderItem) {
  return request<{ dismissed: boolean }>("/reminders/dismiss", {
    method: "POST",
    body: JSON.stringify({
      license_id: item.license_id,
      kind: item.kind,
      due_date: item.due_date,
    }),
  });
}

export function exportLicensesJson() {
  return request<VaultExportFile>("/vault/export/json");
}

export function exportLicensesCsv() {
  return request<VaultExportFile>("/vault/export/csv");
}

export function importLicenses(format: "json" | "csv", content: string) {
  return request<ImportLicensesResult>("/vault/import", {
    method: "POST",
    body: JSON.stringify({ format, content }),
  });
}

export function listBackups() {
  return request<BackupEntry[]>("/vault/backups");
}

export function createBackup() {
  return request<BackupEntry>("/vault/backups", { method: "POST" });
}

export function getCloudBackupSettings() {
  return request<CloudBackupSettings>("/cloud-backup/settings");
}

export function enableCloudBackup(input: EnableCloudBackupInput) {
  return request<EnableCloudBackupResult>("/cloud-backup/enable", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function syncCloudBackupNow() {
  return request<CloudBackupSettings>("/cloud-backup/sync", { method: "POST" });
}

/** Unauthenticated: tells the login page whether this install already holds a vault. */
export function getVaultStatus() {
  return request<VaultStatus>("/vault/status");
}

// Reachable without a session only while the install has no accounts (a
// fresh install has nothing to log in with). Once an account exists the
// backend requires a bearer token *and* `confirm: true`. request() attaches
// the token automatically when one is stored.
export function restoreCloudBackup(input: RestoreCloudBackupInput) {
  return request<RestoreResult>("/cloud-backup/restore", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type VendorPolicySuggestion = {
  matched: boolean;
  keepalive_days: number | null;
  vendor: string | null;
  confidence: string | null;
  source: string | null;
  source_url: string | null;
  last_verified: string | null;
  policy_id: string | null;
  dataset_version: number;
  message: string;
};

export function suggestVendorPolicy(
  sourceSite?: string | null,
  productName?: string | null,
) {
  const params = new URLSearchParams();
  if (sourceSite?.trim()) params.set("source_site", sourceSite.trim());
  if (productName?.trim()) params.set("product_name", productName.trim());
  const query = params.toString();
  return request<VendorPolicySuggestion>(
    `/vendor-policies/suggest${query ? `?${query}` : ""}`,
  );
}
