<script lang="ts">
	import { auth } from '$lib/stores/auth';
	import { forgotPassword, resetPassword } from '$lib/api';

	let mode: 'login' | 'register' | 'forgot' = 'login';
	let email = '';
	let password = '';

	let forgotEmail = '';
	let forgotStep: 'request' | 'reset' = 'request';
	let forgotBusy = false;
	let forgotMessage = '';
	let forgotError = '';
	let resetCode = '';
	let newPassword = '';

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
				<button type="button" class="linkish" on:click={openForgotPassword}>Forgot password?</button>
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
