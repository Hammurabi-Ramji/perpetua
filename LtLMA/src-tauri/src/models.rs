use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct User {
    pub id: i64,
    pub email: String,
    pub created_at: String,
    pub last_login: Option<String>,
    pub notification_email: Option<String>,
    pub email_notifications: bool,
    pub browser_notifications: bool,
    pub onboarding_completed: bool,
    pub backup_email: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct License {
    pub id: i64,
    pub user_id: i64,
    pub product_name: String,
    pub license_key: String,
    pub purchase_date: Option<String>,
    pub expiry_date: Option<String>,
    pub status: String,
    pub source_site: Option<String>,
    pub product_url: Option<String>,
    pub redemption_url: Option<String>,
    pub download_url: Option<String>,
    pub notes: Option<String>,
    pub action_required: bool,
    pub action_description: Option<String>,
    pub action_deadline: Option<String>,
    /// Log in to the product at least this often (days) or the vendor may revoke
    /// the lifetime license for inactivity. None = no keep-alive tracking.
    pub keepalive_days: Option<i64>,
    /// Date the user last confirmed activity on the product (YYYY-MM-DD).
    pub last_active: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LicenseStats {
    pub total: usize,
    pub active: usize,
    pub expiring: usize,
    pub expired: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SiteConnection {
    pub id: String,
    pub name: String,
    pub url: String,
    pub description: String,
    pub connected: bool,
    pub last_synced: Option<String>,
    pub custom: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CreateSiteRequest {
    pub name: String,
    pub url: String,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReminderSettings {
    pub notification_email: Option<String>,
    pub email_notifications: bool,
    pub browser_notifications: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReminderItem {
    pub license_id: i64,
    pub product_name: String,
    pub source_site: Option<String>,
    pub kind: String,
    pub due_date: String,
    pub status: String,
    pub days_remaining: i64,
    pub action_description: Option<String>,
}

/// A due reminder ready to be delivered as a background OS notification.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReminderNotice {
    pub license_id: i64,
    pub kind: String,
    pub title: String,
    pub body: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VaultExportFile {
    pub filename: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LicenseExportSnapshot {
    pub exported_at: String,
    pub licenses: Vec<LicensePayload>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImportLicensesRequest {
    pub format: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImportLicensesResult {
    pub total_rows: usize,
    pub imported: usize,
    pub skipped_duplicates: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BackupEntry {
    pub file_name: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LicensePayload {
    pub product_name: String,
    pub license_key: String,
    pub purchase_date: Option<String>,
    pub expiry_date: Option<String>,
    pub status: Option<String>,
    pub source_site: Option<String>,
    pub product_url: Option<String>,
    pub redemption_url: Option<String>,
    pub download_url: Option<String>,
    pub notes: Option<String>,
    pub action_required: Option<bool>,
    pub action_description: Option<String>,
    pub action_deadline: Option<String>,
    pub keepalive_days: Option<i64>,
    pub last_active: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LicenseUpdate {
    pub product_name: Option<String>,
    pub license_key: Option<String>,
    pub purchase_date: Option<String>,
    pub expiry_date: Option<String>,
    pub status: Option<String>,
    pub source_site: Option<String>,
    pub product_url: Option<String>,
    pub redemption_url: Option<String>,
    pub download_url: Option<String>,
    pub notes: Option<String>,
    pub action_required: Option<bool>,
    pub action_description: Option<String>,
    pub action_deadline: Option<String>,
    pub keepalive_days: Option<i64>,
    pub last_active: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ReminderSettingsUpdate {
    pub notification_email: Option<String>,
    pub email_notifications: bool,
    pub browser_notifications: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

/// App-wide entitlement (per install, single-user desktop app).
/// `pro = true` removes the free-tier license cap.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Entitlement {
    pub pro: bool,
    pub free_limit: usize,
    pub used: usize,
    /// Remaining free slots, or None when Pro (unlimited).
    pub remaining: Option<usize>,
    pub activated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ActivateRequest {
    pub key: String,
}

/// Backup email + the user's own SMTP relay, used only to deliver a
/// password-reset code and (Pro) vault-sharing invite codes.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AccountRecoverySettings {
    pub backup_email: Option<String>,
    pub smtp_host: Option<String>,
    pub smtp_port: Option<i64>,
    pub smtp_username: Option<String>,
    pub smtp_password: Option<String>,
    pub smtp_from: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ResetPasswordRequest {
    pub email: String,
    pub code: String,
    pub new_password: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct InviteMemberRequest {
    pub email: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RedeemInviteRequest {
    pub code: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VaultMember {
    pub email: String,
    pub invited_at: String,
    pub accepted_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
}
