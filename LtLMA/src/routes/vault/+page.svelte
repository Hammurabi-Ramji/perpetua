<script lang="ts">
	import { onMount } from 'svelte';

	import {
		createBackup,
		enableCloudBackup,
		exportLicensesCsv,
		exportLicensesJson,
		getCloudBackupSettings,
		getStoredToken,
		importLicenses,
		listBackups,
		syncCloudBackupNow
	} from '$lib/api';
	import { entitlement, handleAddError, refreshEntitlement } from '$lib/stores/entitlement';
	import type { BackupEntry, CloudBackupSettings, ImportLicensesResult } from '$lib/types';

	let backups: BackupEntry[] = [];
	let loading = true;
	let exportBusy: 'json' | 'csv' | null = null;
	let importBusy = false;
	let backupBusy = false;
	let importFormat: 'json' | 'csv' = 'json';
	let importFileName = '';
	let importSummary: ImportLicensesResult | null = null;
	let error: string | null = null;
	let successMessage = '';

	let cloudSettings: CloudBackupSettings | null = null;
	let webdavUrl = '';
	let webdavUsername = '';
	let webdavPassword = '';
	let remotePath = '/perpetua-backups';
	let cloudBusy = false;
	let cloudSyncBusy = false;
	let cloudError = '';
	let cloudMessage = '';
	// Shown exactly once, right after enabling — never retrievable again after this.
	let revealedRecoveryKey: string | null = null;
	let revealedRecoveryKeyEmailed = false;

	let extensionTokenRevealed = false;
	let extensionTokenMessage = '';

	function revealExtensionToken() {
		extensionTokenRevealed = true;
	}

	async function copyExtensionToken() {
		const token = getStoredToken();
		if (!token) return;
		try {
			await navigator.clipboard.writeText(token);
			extensionTokenMessage = 'Token copied. Paste it into the extension’s settings page.';
		} catch {
			// Clipboard access can be denied — the token is still visible as
			// selectable text on screen, so this is a nice-to-have, not required.
		}
	}

	async function loadBackups() {
		loading = true;
		error = null;
		try {
			backups = await listBackups();
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load backups';
		} finally {
			loading = false;
		}
	}

	function downloadFile(file: { filename: string; content: string }, mimeType: string) {
		const blob = new Blob([file.content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = file.filename;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function handleExport(format: 'json' | 'csv') {
		exportBusy = format;
		error = null;
		successMessage = '';
		try {
			const file = format === 'json' ? await exportLicensesJson() : await exportLicensesCsv();
			downloadFile(file, format === 'json' ? 'application/json' : 'text/csv;charset=utf-8');
			successMessage = `Downloaded ${file.filename}.`;
		} catch (exportError) {
			error = exportError instanceof Error ? exportError.message : 'Failed to export licenses';
		} finally {
			exportBusy = null;
		}
	}

	async function handleImport(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) {
			return;
		}

		importBusy = true;
		error = null;
		successMessage = '';
		importSummary = null;
		importFileName = file.name;
		try {
			const content = await file.text();
			importSummary = await importLicenses(importFormat, content);
			successMessage = `Imported ${importSummary.imported} of ${importSummary.total_rows} rows.`;
		} catch (importError) {
			// Free-tier cap (402) opens the shared upgrade paywall instead of an error.
			if (!handleAddError(importError)) {
				error = importError instanceof Error ? importError.message : 'Failed to import licenses';
			}
		} finally {
			importBusy = false;
			input.value = '';
			await loadBackups();
		}
	}

	async function handleCreateBackup() {
		backupBusy = true;
		error = null;
		successMessage = '';
		try {
			const backup = await createBackup();
			successMessage = `Created ${backup.file_name}.`;
			await loadBackups();
		} catch (backupError) {
			error = backupError instanceof Error ? backupError.message : 'Failed to create backup';
		} finally {
			backupBusy = false;
		}
	}

	function formatBytes(bytes: number) {
		if (bytes === 0) {
			return '0 B';
		}

		const units = ['B', 'KB', 'MB', 'GB'];
		const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
		return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
	}

	async function loadCloudSettings() {
		try {
			cloudSettings = await getCloudBackupSettings();
			if (cloudSettings.webdav_url) webdavUrl = cloudSettings.webdav_url;
			if (cloudSettings.webdav_username) webdavUsername = cloudSettings.webdav_username;
			if (cloudSettings.remote_path) remotePath = cloudSettings.remote_path;
		} catch {
			cloudSettings = null;
		}
	}

	async function handleEnableCloudBackup() {
		cloudBusy = true;
		cloudError = '';
		cloudMessage = '';
		try {
			const result = await enableCloudBackup({
				webdav_url: webdavUrl.trim(),
				webdav_username: webdavUsername.trim(),
				webdav_password: webdavPassword,
				remote_path: remotePath.trim() || '/perpetua-backups'
			});
			webdavPassword = '';
			revealedRecoveryKey = result.recovery_key;
			revealedRecoveryKeyEmailed = result.emailed;
			cloudMessage = result.emailed
				? 'Cloud backup enabled. A copy of your recovery key was also emailed to your backup address.'
				: "Cloud backup enabled, but the safety-net email couldn't be sent — make sure to save the key below.";
			await loadCloudSettings();
		} catch (enableError) {
			if (!handleAddError(enableError)) {
				cloudError = enableError instanceof Error ? enableError.message : 'Failed to enable cloud backup';
			}
		} finally {
			cloudBusy = false;
		}
	}

	async function handleSyncCloudBackup() {
		cloudSyncBusy = true;
		cloudError = '';
		cloudMessage = '';
		try {
			cloudSettings = await syncCloudBackupNow();
			cloudMessage = cloudSettings.last_sync_error
				? `Sync finished with an error: ${cloudSettings.last_sync_error}`
				: 'Backed up to the cloud just now.';
		} catch (syncError) {
			cloudError = syncError instanceof Error ? syncError.message : 'Cloud backup failed';
		} finally {
			cloudSyncBusy = false;
		}
	}

	async function copyRecoveryKey() {
		if (!revealedRecoveryKey) return;
		try {
			await navigator.clipboard.writeText(revealedRecoveryKey);
			cloudMessage = 'Recovery key copied to clipboard.';
		} catch {
			// Clipboard access can be denied by the OS/webview — the key is still
			// selectable text on screen, so this is a nice-to-have, not required.
		}
	}

	onMount(async () => {
		await Promise.all([loadBackups(), loadCloudSettings(), refreshEntitlement()]);
	});
</script>

<svelte:head>
	<title>Perpetua Vault Tools</title>
</svelte:head>

<section class="page-header">
	<div>
		<p class="eyebrow">Vault tools</p>
		<h2>Move, restore, and safeguard your local license vault.</h2>
		<p class="muted">Use JSON/CSV export for portability and create on-device SQLite backups for recovery.</p>
	</div>
</section>

{#if error}
	<p class="error-banner">{error}</p>
{/if}

{#if successMessage}
	<p class="success-banner">{successMessage}</p>
{/if}

<section class="card-grid">
	<article class="panel site-card">
		<div class="panel-heading">
			<div>
				<h3>Export</h3>
				<p class="muted">Download your current licenses in a round-trip-safe JSON snapshot or CSV.</p>
			</div>
		</div>
		<div class="stack">
			<button type="button" disabled={exportBusy !== null} on:click={() => handleExport('json')}>
				{exportBusy === 'json' ? 'Preparing JSON...' : 'Export JSON snapshot'}
			</button>
			<button type="button" class="secondary" disabled={exportBusy !== null} on:click={() => handleExport('csv')}>
				{exportBusy === 'csv' ? 'Preparing CSV...' : 'Export CSV'}
			</button>
		</div>
	</article>

	<article class="panel site-card">
		<div class="panel-heading">
			<div>
				<h3>Import</h3>
				<p class="muted">Restore licenses from a prior export. Duplicate product/key pairs are skipped.</p>
			</div>
		</div>

		<label>
			<span>Import format</span>
			<select bind:value={importFormat}>
				<option value="json">JSON snapshot</option>
				<option value="csv">CSV file</option>
			</select>
		</label>

		<label class="file-field">
			<span>Choose file</span>
			<input type="file" accept={importFormat === 'json' ? '.json' : '.csv,text/csv'} on:change={handleImport} />
		</label>

		{#if importFileName}
			<p class="muted small">{importBusy ? `Importing ${importFileName}...` : `Last selected: ${importFileName}`}</p>
		{/if}

		{#if importSummary}
			<div class="summary-grid">
				<div class="summary-card">
					<span>Total rows</span>
					<strong>{importSummary.total_rows}</strong>
				</div>
				<div class="summary-card">
					<span>Imported</span>
					<strong>{importSummary.imported}</strong>
				</div>
				<div class="summary-card">
					<span>Skipped duplicates</span>
					<strong>{importSummary.skipped_duplicates}</strong>
				</div>
			</div>
		{/if}
	</article>
</section>

<section class="panel">
	<div class="panel-heading">
		<div>
			<h3>Local backups</h3>
			<p class="muted">SQLite-safe backups are stored in the Perpetua app data directory and rotated automatically.</p>
		</div>
		<button type="button" disabled={backupBusy} on:click={handleCreateBackup}>
			{backupBusy ? 'Creating backup...' : 'Create backup'}
		</button>
	</div>

	{#if loading}
		<p class="empty-state">Loading backup inventory...</p>
	{:else if backups.length === 0}
		<p class="empty-state">No backups yet. Create one before your next major edit or import.</p>
	{:else}
		<div class="table-shell">
			<table>
				<thead>
					<tr>
						<th>File</th>
						<th>Created</th>
						<th>Size</th>
					</tr>
				</thead>
				<tbody>
					{#each backups as backup}
						<tr>
							<td><strong>{backup.file_name}</strong></td>
							<td>{new Date(backup.created_at).toLocaleString()}</td>
							<td>{formatBytes(backup.size_bytes)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section class="panel">
	<div class="panel-heading">
		<div>
			<h3>Cloud backup (WebDAV)</h3>
			<p class="muted">
				Encrypted off-device copy of your vault, sent to your own cloud storage (Koofr and other
				WebDAV-speaking providers work). Encrypted before it ever leaves this device — Perpetua
				never sees the key.
			</p>
		</div>
	</div>

	{#if !$entitlement?.pro}
		<p class="empty-state">Cloud backup is a Pro feature. Unlock unlimited to enable it.</p>
	{:else}
		<form class="license-form" on:submit|preventDefault={handleEnableCloudBackup}>
			<div class="form-grid">
				<label>
					<span>WebDAV server URL</span>
					<input bind:value={webdavUrl} placeholder="https://app.koofr.net/dav/Koofr" required />
				</label>
				<label>
					<span>Username</span>
					<input bind:value={webdavUsername} placeholder="you@example.com" required />
				</label>
				<label>
					<span>Password</span>
					<input bind:value={webdavPassword} type="password" placeholder={cloudSettings?.enabled ? 'Unchanged' : 'App password'} />
				</label>
				<label>
					<span>Remote folder</span>
					<input bind:value={remotePath} placeholder="/perpetua-backups" />
				</label>
			</div>

			<p class="muted small">
				{cloudSettings?.enabled
					? 'Re-enabling generates a new recovery key and re-emails it — do this if you change your WebDAV credentials.'
					: 'Requires a backup email and SMTP relay to already be configured above under Reminders, since that\'s where the recovery-key safety-net copy is sent.'}
			</p>

			{#if cloudError}
				<p class="error-banner">{cloudError}</p>
			{/if}
			{#if cloudMessage}
				<p class="success-banner">{cloudMessage}</p>
			{/if}

			<div class="actions">
				<button type="submit" disabled={cloudBusy}>
					{cloudBusy ? 'Enabling...' : cloudSettings?.enabled ? 'Update cloud backup' : 'Enable cloud backup'}
				</button>
				{#if cloudSettings?.enabled}
					<button type="button" class="secondary" disabled={cloudSyncBusy} on:click={handleSyncCloudBackup}>
						{cloudSyncBusy ? 'Backing up...' : 'Back up to cloud now'}
					</button>
				{/if}
			</div>
		</form>

		{#if revealedRecoveryKey}
			<div class="recovery-key-banner">
				<p><strong>Save this recovery key now — it will not be shown again.</strong></p>
				<p class="muted small">
					Without it, your encrypted cloud backup cannot be decrypted, even by you.
					{revealedRecoveryKeyEmailed ? ' A copy was also emailed to your backup address as a safety net.' : ''}
				</p>
				<code>{revealedRecoveryKey}</code>
				<div class="actions">
					<button type="button" class="secondary" on:click={copyRecoveryKey}>Copy key</button>
					<button type="button" class="secondary" on:click={() => (revealedRecoveryKey = null)}>I've saved it</button>
				</div>
			</div>
		{/if}

		{#if cloudSettings?.enabled}
			<p class="muted small" style="margin-top: 1rem;">
				{#if cloudSettings.last_synced_at}
					Last backed up {new Date(cloudSettings.last_synced_at).toLocaleString()}.
				{:else}
					Not backed up to the cloud yet.
				{/if}
				{#if cloudSettings.last_sync_error}
					<span class="error-banner">Last attempt failed: {cloudSettings.last_sync_error}</span>
				{/if}
			</p>
		{/if}
	{/if}
</section>

<section class="panel">
	<div class="panel-heading">
		<div>
			<h3>Browser extension</h3>
			<p class="muted">
				Pair the Perpetua companion browser extension so it can add licenses it captures
				from AppSumo, Product Hunt, StackSocial, and Humble Bundle straight into this vault.
			</p>
		</div>
	</div>

	{#if !extensionTokenRevealed}
		<div class="actions">
			<button type="button" class="secondary" on:click={revealExtensionToken}>Reveal token for extension</button>
		</div>
	{:else}
		<p class="muted small">
			Paste this into the extension's settings page (Options &gt; Perpetua token). Treat it like a
			password — it's a real 30-day credential. If syncing stops working, sign back into Perpetua
			and copy a fresh one.
		</p>
		<code class="token-display">{getStoredToken() ?? '(no token — sign in first)'}</code>
		{#if extensionTokenMessage}
			<p class="success-banner">{extensionTokenMessage}</p>
		{/if}
		<div class="actions">
			<button type="button" class="secondary" on:click={copyExtensionToken}>Copy token</button>
			<button type="button" class="secondary" on:click={() => (extensionTokenRevealed = false)}>Hide</button>
		</div>
	{/if}
</section>

<style>
	.token-display {
		display: block;
		margin: 0.5rem 0;
		padding: 0.5rem;
		border-radius: 0.35rem;
		background: rgba(0, 0, 0, 0.25);
		word-break: break-all;
		font-size: 0.85rem;
	}

	.recovery-key-banner {
		margin-top: 1rem;
		padding: 1rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(220, 170, 60, 0.4);
		background: rgba(220, 170, 60, 0.1);
	}

	.recovery-key-banner code {
		display: block;
		margin: 0.5rem 0;
		padding: 0.5rem;
		border-radius: 0.35rem;
		background: rgba(0, 0, 0, 0.25);
		word-break: break-all;
		font-size: 0.9rem;
	}
</style>
