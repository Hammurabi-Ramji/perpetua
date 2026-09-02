<script lang="ts">
	import { auth } from '$lib/stores/auth';
	import { clearStoredToken, forgotPassword, resetPassword, restoreCloudBackup } from '$lib/api';

	let mode: 'login' | 'register' | 'forgot' | 'restore' = 'login';
	let email = '';
	let password = '';

	let forgotEmail = '';
	let forgotStep: 'request' | 'reset' = 'request';
	let forgotBusy = false;
	let forgotMessage = '';
	let forgotError = '';
	let resetCode = '';
	let newPassword = '';

	let restoreWebdavUrl = '';
	let restoreWebdavUsername = '';
	let restoreWebdavPassword = '';
	let restoreRemotePath = '/perpetua-backups';
	let restoreRecoveryKey = '';
	let restoreBusy = false;
	let restoreError = '';
	let restoreDone = false;

	function submit() {
		if (mode === 'login') {
			auth.login(email, password);
			return;
		}

		auth.register(email, password);
	}

	function openForgotPassword() {
		mode = 'forgot';
		forgotStep = 'request';
		forgotEmail = email;
		forgotMessage = '';
		forgotError = '';
	}

	async function requestCode() {
		forgotBusy = true;
		forgotError = '';
		try {
			const { message } = await forgotPassword(forgotEmail.trim());
			forgotMessage = message;
			forgotStep = 'reset';
		} catch (error) {
			forgotError = error instanceof Error ? error.message : 'Could not request a reset code';
		} finally {
			forgotBusy = false;
		}
	}

	async function submitReset() {
		forgotBusy = true;
		forgotError = '';
		try {
			await resetPassword(forgotEmail.trim(), resetCode.trim(), newPassword);
			mode = 'login';
			email = forgotEmail;
			password = '';
			forgotMessage = '';
		} catch (error) {
			forgotError = error instanceof Error ? error.message : 'Could not reset password';
		} finally {
			forgotBusy = false;
		}
	}

	function openRestore() {
		mode = 'restore';
		restoreError = '';
		restoreDone = false;
	}

	async function submitRestore() {
		restoreBusy = true;
		restoreError = '';
		try {
			// No session can exist yet on a fresh install — clear anything stale
			// before restoring, so the post-restore login is unambiguous.
			clearStoredToken();
			await restoreCloudBackup({
				webdav_url: restoreWebdavUrl.trim(),
				webdav_username: restoreWebdavUsername.trim(),
				webdav_password: restoreWebdavPassword,
				remote_path: restoreRemotePath.trim() || '/perpetua-backups',
				recovery_key: restoreRecoveryKey.trim()
			});
			restoreDone = true;
		} catch (error) {
			restoreError = error instanceof Error ? error.message : 'Could not restore from cloud backup';
		} finally {
			restoreBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Perpetua Sign In</title>
</svelte:head>

<div class="auth-shell">
	<section class="auth-card">
		<div>
			<p class="eyebrow">Perpetua Desktop</p>
			<h1>Sign in to your local license vault.</h1>
			<p class="muted">
				Create a local account to manage dashboard metrics, licenses, sites, and reminders from one place.
			</p>
		</div>

		{#if mode === 'forgot'}
			<div>
				<p class="eyebrow">Account recovery</p>
				<h1>Reset your password.</h1>
				<p class="muted">
					We'll send a one-time code to the backup email you configured — not your account
					email. If you never set one up, there's no way to recover this account.
				</p>
			</div>

			{#if forgotStep === 'request'}
				<form class="auth-form" on:submit|preventDefault={requestCode}>
					<label>
						<span>Account email</span>
						<input bind:value={forgotEmail} type="email" placeholder="you@example.com" required />
					</label>
					{#if forgotError}
						<p class="error-banner">{forgotError}</p>
					{/if}
					<button type="submit" disabled={forgotBusy}>{forgotBusy ? 'Sending...' : 'Send reset code'}</button>
				</form>
			{:else}
				<form class="auth-form" on:submit|preventDefault={submitReset}>
					{#if forgotMessage}
						<p class="success-banner">{forgotMessage}</p>
					{/if}
					<label>
						<span>Reset code</span>
						<input bind:value={resetCode} placeholder="123456" required />
					</label>
					<label>
						<span>New password</span>
						<input bind:value={newPassword} type="password" placeholder="Minimum 8 characters" required minlength="8" />
					</label>
					{#if forgotError}
						<p class="error-banner">{forgotError}</p>
					{/if}
					<button type="submit" disabled={forgotBusy}>{forgotBusy ? 'Resetting...' : 'Reset password'}</button>
				</form>
			{/if}

			<button type="button" class="linkish" on:click={() => (mode = 'login')}>Back to sign in</button>
		{:else if mode === 'restore'}
			<div>
				<p class="eyebrow">Cloud backup restore</p>
				<h1>Get your vault back.</h1>
				<p class="muted">
					Restores your full vault — accounts, licenses, everything — from an encrypted cloud
					backup made by a previous install. You'll need the same WebDAV credentials and the
					recovery key you saved (or received by email) when you first enabled cloud backup.
				</p>
			</div>

			{#if restoreDone}
				<p class="success-banner">Vault restored. Sign in below with your restored account.</p>
				<button type="button" class="linkish" on:click={() => (mode = 'login')}>Back to sign in</button>
			{:else}
				<form class="auth-form" on:submit|preventDefault={submitRestore}>
					<label>
						<span>WebDAV server URL</span>
						<input bind:value={restoreWebdavUrl} placeholder="https://app.koofr.net/dav/Koofr" required />
					</label>
					<label>
						<span>Username</span>
						<input bind:value={restoreWebdavUsername} placeholder="you@example.com" required />
					</label>
					<label>
						<span>Password</span>
						<input bind:value={restoreWebdavPassword} type="password" required />
					</label>
					<label>
						<span>Remote folder</span>
						<input bind:value={restoreRemotePath} placeholder="/perpetua-backups" />
					</label>
					<label>
						<span>Recovery key</span>
						<input bind:value={restoreRecoveryKey} placeholder="Paste the key you saved" required />
					</label>

					{#if restoreError}
						<p class="error-banner">{restoreError}</p>
					{/if}

					<button type="submit" disabled={restoreBusy}>{restoreBusy ? 'Restoring...' : 'Restore vault'}</button>
				</form>

				<button type="button" class="linkish" on:click={() => (mode = 'login')}>Back to sign in</button>
			{/if}
		{:else}
			<div class="auth-toggle">
				<button type="button" class:active={mode === 'login'} on:click={() => (mode = 'login')}>Sign in</button>
				<button type="button" class:active={mode === 'register'} on:click={() => (mode = 'register')}>
					Create account
				</button>
			</div>

			<form class="auth-form" on:submit|preventDefault={submit}>
				<label>
					<span>Email</span>
					<input bind:value={email} type="email" placeholder="you@example.com" required />
				</label>
				<label>
					<span>Password</span>
					<input bind:value={password} type="password" placeholder="Minimum 8 characters" required minlength="8" />
				</label>

				{#if $auth.error}
					<p class="error-banner">{$auth.error}</p>
				{/if}

				<button type="submit" disabled={$auth.loading}>
					{$auth.loading
						? mode === 'login'
							? 'Signing in...'
							: 'Creating account...'
						: mode === 'login'
							? 'Sign in'
							: 'Create account'}
				</button>
			</form>

			{#if mode === 'login'}
				<div class="stack">
					<button type="button" class="linkish" on:click={openForgotPassword}>Forgot password?</button>
					<button type="button" class="linkish" on:click={openRestore}>Restore from cloud backup</button>
				</div>
			{/if}
		{/if}
	</section>
</div>

<style>
	.linkish {
		display: inline;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
	}
</style>
