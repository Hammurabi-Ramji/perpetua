<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';

	import LicenseForm from '$lib/components/LicenseForm.svelte';
	import PlanBanner from '$lib/components/PlanBanner.svelte';
	import { createLicense, listLicenses } from '$lib/api';
	import { handleAddError, refreshEntitlement } from '$lib/stores/entitlement';
	import { emptyLicense, type License, type LicenseInput } from '$lib/types';

	let licenses: License[] = [];
	let loading = true;
	let error: string | null = null;
	let search = '';
	let showCreate = false;
	let saving = false;
	let draft: LicenseInput = emptyLicense();

	$: filteredLicenses = licenses.filter((license) => {
		const term = search.trim().toLowerCase();
		if (!term) {
			return true;
		}

		return [license.product_name, license.source_site ?? '', license.license_key]
			.join(' ')
			.toLowerCase()
			.includes(term);
	});

	async function loadLicenses() {
		loading = true;
		error = null;
		try {
			licenses = await listLicenses();
			await refreshEntitlement();
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load licenses';
		} finally {
			loading = false;
		}
	}

	async function handleCreate() {
		saving = true;
		error = null;
		try {
			await createLicense(draft);
			draft = emptyLicense();
			showCreate = false;
			await loadLicenses();
		} catch (saveError) {
			// Free-tier cap (402) opens the shared upgrade paywall instead of an error.
			if (!handleAddError(saveError)) {
				error = saveError instanceof Error ? saveError.message : 'Failed to add license';
			}
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		void loadLicenses();
		window.addEventListener('perpetua:pro-unlocked', loadLicenses);
		// "File > Add License" (menu bar) deep-links here to open the form directly.
		if ($page.url.searchParams.get('new') === '1') {
			showCreate = true;
		}
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('perpetua:pro-unlocked', loadLicenses);
		}
	});
</script>

<svelte:head>
	<title>Perpetua Licenses</title>
</svelte:head>

<section class="page-header">
	<div>
		<p class="eyebrow">Licenses</p>
		<h2>Search, review, and maintain every license record.</h2>
		<p class="muted">Keep keys, URLs, dates, site source, and required actions together.</p>
	</div>
	<button type="button" on:click={() => (showCreate = !showCreate)}>
		{showCreate ? 'Close form' : 'Add license'}
	</button>
</section>

{#if error}
	<p class="error-banner">{error}</p>
{/if}

<PlanBanner />

{#if showCreate}
	<section class="panel">
		<div class="panel-heading">
			<div>
				<h3>Create a license</h3>
				<p class="muted">Add the key details now and fill in more metadata later if needed.</p>
			</div>
		</div>
		<LicenseForm bind:model={draft} submitLabel="Create license" busy={saving} on:submit={handleCreate} />
	</section>
{/if}

<section class="panel">
	<div class="panel-heading">
		<div>
			<h3>Vault entries</h3>
			<p class="muted">{licenses.length} total licenses stored locally.</p>
		</div>
		<input bind:value={search} class="search-input" placeholder="Search product, source, or key..." />
	</div>

	{#if loading}
		<p class="empty-state">Loading licenses...</p>
	{:else if filteredLicenses.length === 0}
		<p class="empty-state">No licenses matched your current search.</p>
	{:else}
		<div class="table-shell">
			<table>
				<thead>
					<tr>
						<th>Product</th>
						<th>Status</th>
						<th>Source</th>
						<th>Expiry</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each filteredLicenses as license}
						<tr>
							<td>
								<strong>{license.product_name}</strong>
								<div class="muted small">{license.license_key}</div>
							</td>
							<td><span class={`badge badge-${license.status}`}>{license.status}</span></td>
							<td>{license.source_site ?? 'Manual'}</td>
							<td>{license.expiry_date ?? 'No expiry'}</td>
							<td class="table-action">
								<a href={`/licenses/${license.id}`}>Open</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
