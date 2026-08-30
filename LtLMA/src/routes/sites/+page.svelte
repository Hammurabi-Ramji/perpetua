<script lang="ts">
	import { onMount } from 'svelte';

	import { connectSite, createSite, deleteSite, disconnectSite, listSiteConnections } from '$lib/api';
	import type { SiteConnection } from '$lib/types';

	let sites: SiteConnection[] = [];
	let loading = true;
	let error: string | null = null;
	let pendingSiteId: string | null = null;
	let expandedSiteId: string | null = null;
	let confirmingDeleteId: string | null = null;

	let showAddForm = false;
	let addBusy = false;
	let addError = '';
	let newName = '';
	let newUrl = '';
	let newDescription = '';

	async function loadSites() {
		loading = true;
		error = null;
		try {
			sites = await listSiteConnections();
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load site connections';
		} finally {
			loading = false;
		}
	}

	function resetAddForm() {
		newName = '';
		newUrl = '';
		newDescription = '';
		addError = '';
	}

	async function handleAddSite() {
		addBusy = true;
		addError = '';
		try {
			await createSite(newName.trim(), newUrl.trim(), newDescription.trim());
			resetAddForm();
			showAddForm = false;
			await loadSites();
		} catch (addSiteError) {
			addError = addSiteError instanceof Error ? addSiteError.message : 'Failed to add site';
		} finally {
			addBusy = false;
		}
	}

	function toggleExpanded(siteId: string) {
		expandedSiteId = expandedSiteId === siteId ? null : siteId;
		confirmingDeleteId = null;
	}

	async function toggleSite(site: SiteConnection) {
		pendingSiteId = site.id;
		error = null;
		try {
			if (site.connected) {
				await disconnectSite(site.id);
			} else {
				await connectSite(site.id);
			}
			await loadSites();
		} catch (toggleError) {
			error = toggleError instanceof Error ? toggleError.message : 'Failed to update site connection';
		} finally {
			pendingSiteId = null;
		}
	}

	async function handleDeleteSite(site: SiteConnection) {
		if (confirmingDeleteId !== site.id) {
			confirmingDeleteId = site.id;
			return;
		}

		pendingSiteId = site.id;
		error = null;
		try {
			await deleteSite(site.id);
			confirmingDeleteId = null;
			expandedSiteId = null;
			await loadSites();
		} catch (deleteError) {
			error = deleteError instanceof Error ? deleteError.message : 'Failed to remove site';
		} finally {
			pendingSiteId = null;
		}
	}

	onMount(loadSites);
</script>

<svelte:head>
	<title>Perpetua Sites</title>
</svelte:head>

<section class="page-header">
	<div>
		<p class="eyebrow">Sites</p>
		<h2>Manage the marketplace sources tied to your local vault.</h2>
		<p class="muted">Use site connections to track where licenses came from and what needs review.</p>
	</div>
	<button type="button" on:click={() => (showAddForm = !showAddForm)}>
		{showAddForm ? 'Cancel' : 'Add a site'}
	</button>
</section>

{#if error}
	<p class="error-banner">{error}</p>
{/if}

{#if showAddForm}
	<section class="panel" style="margin-bottom: 1.5rem;">
		<h3>Add a site</h3>
		<p class="muted">Track a marketplace source Perpetua doesn't ship with yet.</p>

		<form class="form-grid" on:submit|preventDefault={handleAddSite}>
			<label>
				<span>Site name</span>
				<input bind:value={newName} placeholder="Big Deal Marketplace" required />
			</label>
			<label>
				<span>Site URL</span>
				<input bind:value={newUrl} type="url" placeholder="https://example.com" required />
			</label>
			<label>
				<span>Description (optional)</span>
				<input bind:value={newDescription} placeholder="Track deals and redemption status." />
			</label>
			<div class="actions">
				<button type="submit" disabled={addBusy}>{addBusy ? 'Adding...' : 'Add site'}</button>
			</div>
		</form>

		{#if addError}
			<p class="error-banner">{addError}</p>
		{/if}
	</section>
{/if}

<section class="panel site-list">
	{#if loading}
		<p class="empty-state">Loading site connections...</p>
	{:else}
		{#each sites as site (site.id)}
			<div class="site-row" class:expanded={expandedSiteId === site.id}>
				<button
					type="button"
					class="site-row-header"
					on:click={() => toggleExpanded(site.id)}
					aria-expanded={expandedSiteId === site.id}
				>
					<span class="chevron">{expandedSiteId === site.id ? '▾' : '▸'}</span>
					<span class="site-row-name">{site.name}</span>
					<span class={`badge ${site.connected ? 'badge-active' : 'badge-idle'}`}>
						{site.connected ? 'Connected' : 'Disconnected'}
					</span>
				</button>

				{#if expandedSiteId === site.id}
					<div class="site-row-body">
						<p class="muted">{site.description}</p>
						<a href={site.url} target="_blank" rel="noreferrer" class="text-link">{site.url}</a>
						<p class="small muted">
							{site.last_synced ? `Last synced ${site.last_synced}` : 'No sync recorded yet'}
						</p>

						<div class="row-actions">
							<button
								type="button"
								disabled={pendingSiteId === site.id}
								on:click={() => toggleSite(site)}
							>
								{pendingSiteId === site.id
									? 'Updating...'
									: site.connected
										? 'Disconnect site'
										: 'Connect site'}
							</button>

							{#if site.custom}
								<button
									type="button"
									class={confirmingDeleteId === site.id ? 'danger' : 'secondary'}
									disabled={pendingSiteId === site.id}
									on:click={() => handleDeleteSite(site)}
								>
									{pendingSiteId === site.id
										? 'Removing...'
										: confirmingDeleteId === site.id
											? 'Confirm remove?'
											: 'Remove site'}
								</button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</section>

<style>
	.site-list {
		display: grid;
		gap: 0.5rem;
	}

	.site-row {
		border: 1px solid rgba(148, 163, 184, 0.14);
		border-radius: 0.9rem;
		background: rgba(30, 41, 59, 0.4);
	}

	.site-row.expanded {
		background: rgba(30, 41, 59, 0.7);
	}

	.site-row-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.85rem 1rem;
		background: transparent;
		border: none;
		border-radius: inherit;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.site-row-header:hover {
		transform: none;
		background: rgba(148, 163, 184, 0.08);
	}

	.chevron {
		width: 1rem;
		flex-shrink: 0;
		color: #7dd3fc;
	}

	.site-row-name {
		flex: 1;
		font-weight: 600;
	}

	.site-row-body {
		display: grid;
		gap: 0.5rem;
		padding: 0 1rem 1rem 2.65rem;
	}

	.row-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.25rem;
	}
</style>
