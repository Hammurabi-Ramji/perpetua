<script lang="ts">
	import { onMount } from 'svelte';

	import {
		createBackup,
		exportLicensesCsv,
		exportLicensesJson,
		importLicenses,
		listBackups
	} from '$lib/api';
	import { handleAddError } from '$lib/stores/entitlement';
	import type { BackupEntry, ImportLicensesResult } from '$lib/types';

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

	onMount(loadBackups);
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
