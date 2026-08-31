<script lang="ts">
	import { onMount } from 'svelte';

	import LicenseForm from '$lib/components/LicenseForm.svelte';
	import PlanBanner from '$lib/components/PlanBanner.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import { createLicense, getLicenseStats, listLicenses, listReminderItems } from '$lib/api';
	import { auth } from '$lib/stores/auth';
	import { handleAddError, refreshEntitlement } from '$lib/stores/entitlement';
	import {
		emptyLicense,
		type License,
		type LicenseInput,
		type LicenseStats,
		type ReminderItem
	} from '$lib/types';

	let loading = true;
	let saving = false;
	let error: string | null = null;
	let licenses: License[] = [];
	let stats: LicenseStats = { total: 0, active: 0, expiring: 0, expired: 0 };
	let reminders: ReminderItem[] = [];
	let draft: LicenseInput = emptyLicense();
	let showAddLicense = false;
	let walkthroughStep = 0;

	const WALKTHROUGH_STEPS = [
		{
			title: 'Start with the basics',
			body: 'Product name and license key are the only two required fields. Everything else can wait.'
		},
		{
			title: 'Have a screenshot handy?',
			body: "Click \"Autofill from screenshot\" below and upload a receipt or confirmation email — it'll pull in the key, dates, and amount automatically. Runs fully offline on this device."
		},
		{
			title: "Set a keep-alive reminder",
			body: "Many lifetime deals get revoked after months of inactivity. Set \"Keep-alive: log in every (days)\" (or accept our suggestion, if we recognize the site) and Perpetua will remind you before that happens."
		},
		{
			title: "You're set",
			body: 'Click "Add license" at the bottom whenever you\'re ready — you can always edit any of this later.'
		}
	];

	async function loadDashboard() {
		loading = true;
		error = null;
		try {
			const [licenseList, statsResponse, reminderList] = await Promise.all([
				listLicenses(),
				getLicenseStats(),
				listReminderItems()
			]);
			licenses = licenseList;
			stats = statsResponse;
			reminders = reminderList;
			await refreshEntitlement();
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load dashboard';
		} finally {
			loading = false;
		}
	}

	function startOnboarding() {
		showAddLicense = true;
		walkthroughStep = 1;
		void auth.dismissOnboarding();
	}

	function nextWalkthroughStep() {
		if (walkthroughStep >= WALKTHROUGH_STEPS.length) {
			walkthroughStep = 0;
		} else {
			walkthroughStep += 1;
		}
	}

	async function handleCreate() {
		saving = true;
		error = null;
		try {
			await createLicense(draft);
			draft = emptyLicense();
			showAddLicense = false;
			walkthroughStep = 0;
			await loadDashboard();
		} catch (saveError) {
			// Free-tier cap (402) opens the shared upgrade paywall instead of an error.
			if (!handleAddError(saveError)) {
				error = saveError instanceof Error ? saveError.message : 'Failed to create license';
			}
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		void loadDashboard();
		window.addEventListener('perpetua:pro-unlocked', loadDashboard);
		return () => window.removeEventListener('perpetua:pro-unlocked', loadDashboard);
	});
</script>

<svelte:head>
	<title>Perpetua Dashboard</title>
</svelte:head>

<section class="page-header">
	<div>
		<p class="eyebrow">Dashboard</p>
		<h2>Track the state of your entire license vault.</h2>
		<p class="muted">
			See what is active, what needs action, and which lifetime licenses are at risk of
			being revoked for inactivity — before it happens.
		</p>
	</div>
</section>

{#if error}
	<p class="error-banner">{error}</p>
{/if}

{#if $auth.user && !$auth.user.onboarding_completed}
	<section class="panel" style="margin-bottom: 1.5rem;">
		<h3>Welcome to Perpetua</h3>
		<p class="muted">
			Perpetua keeps every lifetime deal you own in one local vault — the key, the dates, where
			it came from, and a reminder before any keep-alive window lapses. Add your first license
			to get started; after that it's rinse and repeat.
		</p>
		<div class="actions" style="justify-content: flex-start; gap: 0.75rem;">
			<button type="button" on:click={startOnboarding}>Get started</button>
			<button type="button" class="secondary" on:click={() => auth.dismissOnboarding()}>Skip</button>
		</div>
	</section>
{/if}

<PlanBanner />

<section class="stats-grid">
	<StatCard label="Total licenses" value={stats.total} />
	<StatCard label="Active" value={stats.active} tone="success" />
	<StatCard label="Expiring soon" value={stats.expiring} tone="warning" />
	<StatCard label="Expired" value={stats.expired} tone="danger" />
</section>

<section class="dashboard-grid">
	<article class="panel">
		<div class="panel-heading">
			<div>
				<h3>Recent licenses</h3>
				<p class="muted">Your newest entries and the items that need attention first.</p>
			</div>
			<a href="/licenses" class="text-link">View all</a>
		</div>

		{#if loading}
			<p class="empty-state">Loading licenses...</p>
		{:else if licenses.length === 0}
			<p class="empty-state">No licenses yet. Add your first one from the form on this page.</p>
		{:else}
			<div class="stack">
				{#each licenses.slice(0, 5) as license}
					<a class="license-card" href={`/licenses/${license.id}`}>
						<div>
							<h4>{license.product_name}</h4>
							<p>{license.source_site ?? 'Manual entry'}</p>
						</div>
						<div class="license-meta">
							<span class={`badge badge-${license.status}`}>{license.status}</span>
							{#if license.expiry_date}
								<small>Expires {license.expiry_date}</small>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</article>

	<article class="panel">
		<div class="panel-heading">
			<div>
				<h3>Add a license</h3>
				<p class="muted">Capture a purchase, key, site, action, and reminder details in one place.</p>
			</div>
			<button type="button" on:click={() => (showAddLicense = !showAddLicense)}>
				{showAddLicense ? 'Cancel' : 'Add a license'}
			</button>
		</div>
		{#if showAddLicense}
			{#if walkthroughStep > 0}
				<div class="walkthrough">
					<div class="walkthrough-heading">
						<span class="walkthrough-step">Step {walkthroughStep} of {WALKTHROUGH_STEPS.length}</span>
						<button type="button" class="linkish" on:click={() => (walkthroughStep = 0)}>
							Skip walkthrough
						</button>
					</div>
					<h4>{WALKTHROUGH_STEPS[walkthroughStep - 1].title}</h4>
					<p class="muted">{WALKTHROUGH_STEPS[walkthroughStep - 1].body}</p>
					<button type="button" class="secondary" on:click={nextWalkthroughStep}>
						{walkthroughStep === WALKTHROUGH_STEPS.length ? 'Got it' : 'Next tip'}
					</button>
				</div>
			{/if}
			<LicenseForm bind:model={draft} submitLabel="Add license" busy={saving} on:submit={handleCreate} />
		{/if}
	</article>
</section>

<style>
	.walkthrough {
		margin-bottom: 1.25rem;
		padding: 0.85rem 1rem;
		border: 1px solid rgba(56, 189, 248, 0.35);
		border-radius: 0.9rem;
		background: rgba(56, 189, 248, 0.08);
	}
	.walkthrough-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.35rem;
	}
	.walkthrough-step {
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #7dd3fc;
	}
	.walkthrough h4 {
		margin: 0 0 0.35rem;
	}
	.walkthrough .linkish {
		display: inline;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
		font-size: 0.85rem;
	}
</style>

<section class="panel">
	<div class="panel-heading">
		<div>
			<h3>Upcoming reminders</h3>
			<p class="muted">Deadlines and expirations due soon, using the same 30-day window as dashboard stats.</p>
		</div>
		<a href="/reminders" class="text-link">Open reminders</a>
	</div>

	{#if loading}
		<p class="empty-state">Loading reminder queue...</p>
	{:else if reminders.length === 0}
		<p class="empty-state">No upcoming reminder items right now.</p>
	{:else}
		<div class="stack">
			{#each reminders.slice(0, 5) as item}
				<a class="license-card" href={`/licenses/${item.license_id}`}>
					<div>
						<h4>{item.product_name}</h4>
						<p>{item.kind === 'expiry' ? 'License expiry' : (item.action_description ?? 'Keep license active')}</p>
					</div>
					<div class="license-meta">
						<span class={`badge ${item.status === 'overdue' ? 'badge-danger' : item.status === 'due-today' ? 'badge-warning' : 'badge-active'}`}>
							{item.status === 'due-today' ? 'Due today' : item.status}
						</span>
						<small>{item.due_date}</small>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</section>
