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

	// Native "File/View/Help" menu bar (main.rs) — items that need frontend
	// action emit a `perpetua://menu` event instead of acting directly, since
	// the Rust side has no session/route context. `__TAURI_INTERNALS__` is
	// only present inside the real desktop app, never in the plain browser
	// dev server or Playwright, so this is a no-op there.
	function handleMenuAction(action: string) {
		switch (action) {
			case 'menu-nav-dashboard':
				void goto('/');
				break;
			case 'menu-nav-licenses':
				void goto('/licenses');
				break;
			case 'menu-nav-sites':
				void goto('/sites');
				break;
			case 'menu-nav-reminders':
				void goto('/reminders');
				break;
			case 'menu-nav-vault':
				void goto('/vault');
				break;
			case 'menu-add-license':
				void goto('/licenses?new=1');
				break;
			case 'menu-export-vault':
			case 'menu-create-backup':
				void goto('/vault');
				break;
			case 'menu-sign-out':
				void auth.logout();
				break;
		}
	}

	onMount(async () => {
		await auth.init();
		mounted = true;

		if (browser && '__TAURI_INTERNALS__' in window) {
			const { listen } = await import('@tauri-apps/api/event');
			await listen<string>('perpetua://menu', (event) => handleMenuAction(event.payload));
		}
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
