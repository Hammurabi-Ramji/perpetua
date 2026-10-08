export interface User {
  id: number;
  email: string;
  created_at: string;
  last_login: string | null;
  notification_email: string | null;
  email_notifications: boolean;
  browser_notifications: boolean;
  onboarding_completed: boolean;
  backup_email: string | null;
}

export interface AccountRecoverySettings {
  backup_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  /** Write-only: the API never echoes the stored password back. Send "" to keep it. */
  smtp_password: string | null;
  smtp_from: string | null;
  /** Read-only hint from the API: a password is stored in the OS keyring. */
  smtp_password_set?: boolean;
}

export interface VaultStatus {
  has_users: boolean;
}

export interface VaultMember {
  email: string;
  invited_at: string;
  accepted_at: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface License {
  id: number;
  user_id: number;
  product_name: string;
  license_key: string;
  purchase_date: string | null;
  expiry_date: string | null;
  status: string;
  source_site: string | null;
  product_url: string | null;
  redemption_url: string | null;
  download_url: string | null;
  notes: string | null;
  action_required: boolean;
  action_description: string | null;
  action_deadline: string | null;
  keepalive_days: number | null;
  last_active: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenseInput {
  product_name: string;
  license_key: string;
  purchase_date: string;
  expiry_date: string;
  status: string;
  source_site: string;
  product_url: string;
  redemption_url: string;
  download_url: string;
  notes: string;
  action_required: boolean;
  action_description: string;
  action_deadline: string;
  keepalive_days: string;
  last_active: string;
}

export interface LicenseStats {
  total: number;
  active: number;
  expiring: number;
  expired: number;
}

export interface Entitlement {
  pro: boolean;
  free_limit: number;
  used: number;
  remaining: number | null;
  activated_at: string | null;
}

export interface SiteConnection {
  id: string;
  name: string;
  url: string;
  description: string;
  connected: boolean;
  last_synced: string | null;
  custom: boolean;
}

export interface ReminderSettings {
  notification_email: string | null;
  email_notifications: boolean;
  browser_notifications: boolean;
}

export interface AutoMaintainLicense {
  license_id: number;
  product_name: string;
  enabled: boolean;
  credential_set: boolean;
}

export interface ReminderItem {
  license_id: number;
  product_name: string;
  source_site: string | null;
  kind: string;
  due_date: string;
  status: string;
  days_remaining: number;
  action_description: string | null;
}

export interface VaultExportFile {
  filename: string;
  content: string;
}

export interface ImportLicensesResult {
  total_rows: number;
  imported: number;
  skipped_duplicates: number;
}

export interface BackupEntry {
  file_name: string;
  created_at: string;
  size_bytes: number;
}

export interface CloudBackupSettings {
  enabled: boolean;
  webdav_url: string | null;
  webdav_username: string | null;
  remote_path: string | null;
  recovery_key_generated_at: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  schedule_enabled?: boolean;
  schedule_interval_hours?: number;
}

export interface EnableCloudBackupInput {
  webdav_url: string;
  webdav_username: string;
  /** "" keeps the password already stored in the keyring. */
  webdav_password: string;
  remote_path: string;
  /** Mint a new recovery key (orphans existing uploads). Default false. */
  rotate_key?: boolean;
}

export interface EnableCloudBackupResult {
  /** Present only when a key was (re)generated; null for settings-only saves. */
  recovery_key: string | null;
  emailed: boolean;
  email_error: string | null;
}

export interface RestoreCloudBackupInput {
  webdav_url: string;
  webdav_username: string;
  webdav_password: string;
  remote_path: string;
  recovery_key: string;
  /** Required once the install already has an account (destructive replace). */
  confirm?: boolean;
}

export interface DeviceSyncResult {
  action: "upload" | "download" | "up_to_date" | string;
  local_revision: string;
  remote_revision: string;
}

export interface RestoreResult {
  restored: boolean;
  /** File name of the automatic pre-restore snapshot, if one was taken. */
  snapshot: string | null;
}

export const emptyLicense = (): LicenseInput => ({
  product_name: "",
  license_key: "",
  purchase_date: "",
  expiry_date: "",
  status: "active",
  source_site: "",
  product_url: "",
  redemption_url: "",
  download_url: "",
  notes: "",
  action_required: false,
  action_description: "",
  action_deadline: "",
  keepalive_days: "",
  last_active: "",
});
