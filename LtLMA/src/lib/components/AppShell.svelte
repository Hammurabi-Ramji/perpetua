<script lang="ts">
	import { page } from '$app/stores';

	import { auth } from '$lib/stores/auth';

	const navigation = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/licenses', label: 'Licenses' },
		{ href: '/sites', label: 'Sites' },
		{ href: '/reminders', label: 'Reminders' },
		{ href: '/vault', label: 'Vault tools' }
	];
</script>

<aside class="sidebar">
	<div class="brand">
		<p class="eyebrow">Lifetime License Manager</p>
		<h1>Perpetua Desktop</h1>
		<p class="muted">Local-first tracking for licenses, deals, sites, and reminders.</p>
	</div>

	<nav class="nav">
		{#each navigation as item}
			<a
				href={item.href}
				class:selected={$page.url.pathname === item.href}
			>
				{item.label}
			</a>
		{/each}
	</nav>

	<div class="account">
		<p class="account-label">Signed in as</p>
		<p class="account-value">{$auth.user?.email}</p>
		<button type="button" class="secondary" on:click={() => auth.logout()}>Sign out</button>
	</div>
</aside>
