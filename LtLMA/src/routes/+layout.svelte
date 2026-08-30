<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	import AppShell from '$lib/components/AppShell.svelte';
	import UpgradeModal from '$lib/components/UpgradeModal.svelte';
	import { auth } from '$lib/stores/auth';
	import { refreshEntitlement } from '$lib/stores/entitlement';

	let mounted = false;

	onMount(async () => {
		await auth.init();
		mounted = true;
	});

	// Keep the shared entitlement state fresh whenever a user is signed in.
	$: if (browser && $auth.user) {
		void refreshEntitlement();
	}

	$: if (browser && mounted && $auth.initialized) {
		const onLoginPage = $page.url.pathname === '/login';
		if (!onLoginPage && !$auth.user) {
			goto('/login');
		}
		if (onLoginPage && $auth.user) {
			goto('/');
		}
	}
</script>

{#if !$auth.initialized}
	<div class="fullscreen-state">
		<p>Loading Perpetua...</p>
	</div>
{:else if $page.url.pathname === '/login'}
	<slot />
{:else if $auth.user}
	<div class="app-layout">
		<AppShell />
		<main class="page-shell">
			<slot />
		</main>
	</div>
	<UpgradeModal />
{:else}
	<div class="fullscreen-state">
		<p>Redirecting to sign in...</p>
	</div>
{/if}
