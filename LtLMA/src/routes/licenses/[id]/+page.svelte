<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	import LicenseForm from '$lib/components/LicenseForm.svelte';
	import { deleteLicense, getLicense, markLicenseActive, updateLicense } from '$lib/api';
	import { buildDossier } from '$lib/dossier';
	import { emptyLicense, type License, type LicenseInput } from '$lib/types';

	let loading = true;
	let saving = false;
	let deleting = false;
	let marking = false;
	let error: string | null = null;
	let license: License | null = null;
	let form: LicenseInput = emptyLicense();

	function licenseId() {
		return $page.params.id ?? '';
	}

	function toFormModel(record: License): LicenseInput {
		return {
			product_name: record.product_name,
			license_key: record.license_key,
			purchase_date: record.purchase_date ?? '',
			expiry_date: record.expiry_date ?? '',
			status: record.status,
			source_site: record.source_site ?? '',
			product_url: record.product_url ?? '',
			redemption_url: record.redemption_url ?? '',
			download_url: record.download_url ?? '',
			notes: record.notes ?? '',
			action_required: record.action_required,
			action_description: record.action_description ?? '',
			action_deadline: record.action_deadline ?? '',
			keepalive_days: record.keepalive_days != null ? String(record.keepalive_days) : '',
			last_active: record.last_active ?? ''
		};
	}

	async function loadLicense() {
		loading = true;
		error = null;
		try {
			license = await getLicense(licenseId());
			form = toFormModel(license);
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load license';
		} finally {
			loading = false;
		}
	}

	async function saveLicense() {
		saving = true;
		error = null;
		try {
			license = await updateLicense(licenseId(), form);
			form = toFormModel(license);
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : 'Failed to save license';
		} finally {
			saving = false;
		}
	}

	function downloadDossier() {
		if (!license) {
			return;
		}
		const { filename, content } = buildDossier(license);
		const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function markUsed() {
		marking = true;
		error = null;
		try {
			license = await markLicenseActive(licenseId());
			form = toFormModel(license);
		} catch (markError) {
			error = markError instanceof Error ? markError.message : 'Failed to update activity';
		} finally {
			marking = false;
		}
	}

	async function removeLicense() {
		deleting = true;
		error = null;
		try {
			await deleteLicense(licenseId());
			await goto('/licenses');
		} catch (deleteError) {
			error = deleteError instanceof Error ? deleteError.message : 'Failed to delete license';
			deleting = false;
		}
	}

	onMount(loadLicense);
</script>

<svelte:head>
	<title>Perpetua License Details</title>
</svelte:head>

<section class="page-header">
	<div>
		<p class="eyebrow">License detail</p>
		<h2>{license?.product_name ?? 'Loading license...'}</h2>
		<p class="muted">Edit the local record, action requirements, and renewal metadata.</p>
	</div>
	<a href="/licenses" class="secondary-link">Back to licenses</a>
</section>

{#if error}
	<p class="error-banner">{error}</p>
{/if}

{#if loading}
	<section class="panel">
		<p class="empty-state">Loading license details...</p>
	</section>
{:else if license}
	<section class="panel">
		<div class="panel-heading">
			<div>
				<h3>Edit license</h3>
				<p class="muted">Created {license.created_at}</p>
					{#if license.keepalive_days}
						<p class="muted small">
							Keep-alive: log in every {license.keepalive_days} days · last used {license.last_active ??
								'never'}
						</p>
					{/if}
			</div>
			<div class="row-actions">
					<button type="button" class="secondary" on:click={downloadDossier}>
						Download dossier
					</button>
					{#if license.keepalive_days}
						<button type="button" disabled={marking} on:click={markUsed}>
							{marking ? 'Updating…' : 'Mark as used today'}
						</button>
					{/if}
				<button type="button" class="danger" disabled={deleting} on:click={removeLicense}>
					{deleting ? 'Deleting...' : 'Delete'}
				</button>
			</div>
		</div>
		<LicenseForm bind:model={form} submitLabel="Save changes" busy={saving} on:submit={saveLicense} />
	</section>
{/if}
