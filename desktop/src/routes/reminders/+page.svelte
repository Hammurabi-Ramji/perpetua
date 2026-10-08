<script lang="ts">
	import { onMount } from 'svelte';

	import {
		getAccountRecovery,
		dismissReminder,
		getActivityInference,
		getReminderSettings,
		inviteMember,
		listReminderItems,
		listVaultMembers,
		snoozeReminder,
		redeemInvite,
		sendTestRecoveryEmail,
		setActivityInference,
		updateAccountRecovery,
		updateReminderSettings
	} from '$lib/api';
	import { SUPPORT_EMAIL } from '$lib/commerce';
	import { entitlement, refreshEntitlement } from '$lib/stores/entitlement';
	import type { AccountRecoverySettings, ReminderItem, ReminderSettings, VaultMember } from '$lib/types';

	let activityInference = false;
	let activityBusy = false;
	let snoozeHours = '24';
	let muteBusy = '';
	let loading = true;

	async function saveActivityInference(event: Event) {
		const enabled = (event.currentTarget as HTMLInputElement).checked;
		activityBusy = true;
		error = null;
		try {
			activityInference = (await setActivityInference(enabled)).enabled;
			successMessage = enabled
				? 'Activity inference is on. A visit to a matching hostname can reset that license the same way Mark as used does. Only the date is stored.'
				: 'Activity inference is off. Keep-alive clocks change only when you use Mark as used.';
		} catch (activityError) {
			activityInference = !enabled;
			error = activityError instanceof Error ? activityError.message : 'Could not update activity inference';
		} finally {
			activityBusy = false;
		}
	}

	async function snoozeItem(item: ReminderItem) {
		muteBusy = `${item.license_id}:${item.kind}:snooze`;
		error = null;
		try {
			await snoozeReminder(item, Number(snoozeHours));
			items = await listReminderItems();
			successMessage = `Snoozed ${item.product_name} for ${snoozeHours} hour(s). It will come back for this due date after that. Mark as used is unchanged.`;
		} catch (muteError) {
			error = muteError instanceof Error ? muteError.message : 'Could not snooze this reminder';
		} finally {
			muteBusy = '';
		}
	}

	async function dismissItem(item: ReminderItem) {
		muteBusy = `${item.license_id}:${item.kind}:dismiss`;
		error = null;
		try {
			await dismissReminder(item);
			items = await listReminderItems();
			successMessage = `Dismissed ${item.product_name} for this due date. A later occurrence will still remind you. Mark as used is unchanged.`;
		} catch (muteError) {
			error = muteError instanceof Error ? muteError.message : 'Could not dismiss this reminder';
		} finally {
			muteBusy = '';
		}
	}

	let saving = false;
	let error: string | null = null;
	let successMessage = '';
	let items: ReminderItem[] = [];
	let settings: ReminderSettings = {
		notification_email: '',
		email_notifications: false,
		browser_notifications: true
	};

	// Launch-at-login is a desktop-shell setting (Tauri autostart plugin), not
	// something the local API knows about. Only offered inside the Tauri
	// webview; in a plain browser (dev server, tests) the toggle is hidden.
	let launchAtLogin: boolean | null = null;
	let launchBusy = false;
	let launchError = '';
	const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

	async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
		const { invoke } = await import('@tauri-apps/api/core');
		return invoke<T>(command, args);
	}

	async function loadLaunchAtLogin() {
		if (!inTauri) return;
		try {
			launchAtLogin = await tauriInvoke<boolean>('get_launch_at_login');
		} catch {
			launchAtLogin = null;
		}
	}

	async function toggleLaunchAtLogin(event: Event) {
		const enabled = (event.currentTarget as HTMLInputElement).checked;
		launchBusy = true;
		launchError = '';
		try {
			launchAtLogin = await tauriInvoke<boolean>('set_launch_at_login', { enabled });
		} catch (toggleError) {
			launchError = toggleError instanceof Error ? toggleError.message : String(toggleError);
			await loadLaunchAtLogin();
		} finally {
			launchBusy = false;
		}
	}

	let recovery: AccountRecoverySettings = {
		backup_email: '',
		smtp_host: '',
		smtp_port: null,
		smtp_username: '',
		smtp_password: '',
		smtp_from: '',
		smtp_password_set: false
	};
	let recoveryBusy = false;
	let recoveryMessage = '';
	let recoveryError = '';
	let testEmailBusy = false;

	function toRecoveryForm(loaded: AccountRecoverySettings): AccountRecoverySettings {
		return {
			backup_email: loaded.backup_email ?? '',
			smtp_host: loaded.smtp_host ?? '',
			smtp_port: loaded.smtp_port,
			smtp_username: loaded.smtp_username ?? '',
			// Never echoed back by the API; blank on save means "keep it".
			smtp_password: '',
			smtp_from: loaded.smtp_from ?? '',
			smtp_password_set: loaded.smtp_password_set ?? false
		};
	}

	async function sendTestEmail() {
		testEmailBusy = true;
		recoveryError = '';
		recoveryMessage = '';
		try {
			const result = await sendTestRecoveryEmail();
			recoveryMessage = `Test email sent to ${result.to}. If it doesn't arrive within a few minutes, check the spam folder and the relay settings.`;
		} catch (testError) {
			recoveryError = testError instanceof Error ? testError.message : 'Test email failed';
		} finally {
			testEmailBusy = false;
		}
	}

	let members: VaultMember[] = [];
	let inviteEmail = '';
	let inviteBusy = false;
	let inviteMessage = '';
	let inviteError = '';

	let redeemCode = '';
	let redeemBusy = false;
	let redeemMessage = '';
	let redeemError = '';

	async function loadSettings() {
		loading = true;
		error = null;
		try {
			const [loaded, reminderItems, recoveryLoaded] = await Promise.all([
				getReminderSettings(),
				listReminderItems(),
				getAccountRecovery()
			]);
			settings = {
				...loaded,
				notification_email: loaded.notification_email ?? ''
			};
			items = reminderItems;
			recovery = toRecoveryForm(recoveryLoaded);
			activityInference = (await getActivityInference()).enabled;
			await Promise.all([refreshEntitlement(), loadLaunchAtLogin()]);
			if ($entitlement?.pro) {
				members = await listVaultMembers();
			}
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load reminder settings';
		} finally {
			loading = false;
		}
	}

	async function saveSettings() {
		saving = true;
		error = null;
		successMessage = '';
		try {
			const saved = await updateReminderSettings(settings);
			settings = {
				...saved,
				notification_email: saved.notification_email ?? ''
			};
			successMessage = saved.email_notifications
				? 'Reminder settings saved. Due reminders will be emailed through your SMTP relay when they are due. Nothing is sent just by saving this.'
				: 'Reminder settings saved.';
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : 'Failed to update reminder settings';
		} finally {
			saving = false;
		}
	}

	async function saveRecovery() {
		recoveryBusy = true;
		recoveryError = '';
		recoveryMessage = '';
		try {
			recovery = toRecoveryForm(await updateAccountRecovery(recovery));
			recoveryMessage = 'Recovery settings saved locally. Use "Send test email" to confirm the relay works.';
		} catch (saveError) {
			recoveryError = saveError instanceof Error ? saveError.message : 'Failed to save recovery settings';
		} finally {
			recoveryBusy = false;
		}
	}

	async function sendInvite() {
		inviteBusy = true;
		inviteError = '';
		inviteMessage = '';
		try {
			await inviteMember(inviteEmail.trim());
			inviteMessage = `Invite sent to ${inviteEmail.trim()}.`;
			inviteEmail = '';
			members = await listVaultMembers();
		} catch (inviteErr) {
			inviteError = inviteErr instanceof Error ? inviteErr.message : 'Failed to send invite';
		} finally {
			inviteBusy = false;
		}
	}

	async function submitRedeem() {
		redeemBusy = true;
		redeemError = '';
		redeemMessage = '';
		try {
			await redeemInvite(redeemCode.trim());
			redeemMessage = "You're in — this account now shares that vault's license storage.";
			redeemCode = '';
		} catch (redeemErr) {
			redeemError = redeemErr instanceof Error ? redeemErr.message : 'Invalid or expired invite code';
		} finally {
			redeemBusy = false;
		}
	}

	onMount(loadSettings);
</script>

<svelte:head>
	<title>Perpetua Reminders</title>
</svelte:head>

<section class="page-header">
	<div>
		<p class="eyebrow">Reminders</p>
		<h2>Control how Perpetua notifies you about renewals and required actions.</h2>
		<p class="muted">Keep reminders local-first while still capturing the notification target you want to use.</p>
	</div>
</section>

{#if error}
	<p class="error-banner">{error}</p>
{/if}

{#if successMessage}
	<p class="success-banner">{successMessage}</p>
{/if}

<section class="panel">
	<div class="panel-heading">
		<div>
			<h3>Upcoming reminder queue</h3>
			<p class="muted">Items due in the next 30 days, including expirations and action deadlines.</p>
		</div>
	</div>

	{#if loading}
		<p class="empty-state">Loading reminder queue...</p>
	{:else if items.length === 0}
		<p class="empty-state">Nothing is due soon.</p>
	{:else}
		<p class="muted small">
			Snooze hides a reminder until the duration you pick. Dismiss hides this due date only;
			a later occurrence still shows. Mark as used, on the license itself, still resets a
			keep-alive clock and is the default way to record real activity.
		</p>
		<label>
			<span>Snooze duration</span>
			<select bind:value={snoozeHours}>
				<option value="1">1 hour</option>
				<option value="4">4 hours</option>
				<option value="24">1 day</option>
				<option value="72">3 days</option>
				<option value="168">1 week</option>
			</select>
		</label>
		<div class="table-shell">
			<table>
				<thead>
					<tr>
						<th>License</th>
						<th>Type</th>
						<th>Due</th>
						<th>Status</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each items as item (`${item.license_id}:${item.kind}`)}
						<tr>
							<td>
								<strong>{item.product_name}</strong>
								<div class="muted small">{item.action_description ?? item.source_site ?? 'Manual entry'}</div>
							</td>
							<td>{item.kind === 'action' ? 'Action' : item.kind === 'keepalive' ? 'Keep-alive' : 'Expiry'}</td>
							<td>{item.due_date}</td>
							<td>
								<span class={`badge ${item.status === 'overdue' ? 'badge-danger' : item.status === 'due-today' ? 'badge-warning' : 'badge-active'}`}>
									{item.status === 'due-today' ? 'Due today' : item.status}
								</span>
							</td>
							<td class="table-action">
								<a href={`/licenses/${item.license_id}`}>Open</a>
								<button
									type="button"
									class="secondary"
									disabled={muteBusy === `${item.license_id}:${item.kind}:snooze`}
									on:click={() => snoozeItem(item)}
								>
									Snooze
								</button>
								<button
									type="button"
									class="secondary"
									disabled={muteBusy === `${item.license_id}:${item.kind}:dismiss`}
									on:click={() => dismissItem(item)}
								>
									Dismiss
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section class="panel">
	<div class="panel-heading">
		<div>
			<h3>Reminder delivery settings</h3>
			<p class="muted">Choose where Perpetua should surface notifications when items enter the queue.</p>
		</div>
	</div>

	{#if loading}
		<p class="empty-state">Loading reminder settings...</p>
	{:else}
		<form class="license-form" on:submit|preventDefault={saveSettings}>
			<label class="checkbox">
				<input bind:checked={settings.browser_notifications} type="checkbox" />
				<span>Desktop reminders</span>
			</label>

			<label class="checkbox">
				<input
					type="checkbox"
					checked={activityInference}
					disabled={activityBusy}
					on:change={saveActivityInference}
				/>
				<span>Reset keep-alive when I visit a matching site</span>
			</label>
			<p class="muted small">
				Off by default. When this is on, the browser extension can tell Perpetua that you opened a
				hostname matching one of your licenses. Perpetua stores only the same date Mark as used
				stores — not the page address, title, or anything from an inbox. Mark as used stays on the
				license and remains the default.
			</p>

			<p class="muted small">
				Every few hours Perpetua checks for expiries, action deadlines and keep-alive windows and
				shows a native desktop notification for anything due in the next 7 days. It keeps watch
				from the system tray while the window is closed. Turning this off silences notifications;
				the queue above still updates.
			</p>

			<label class="checkbox">
				<input
					bind:checked={settings.email_notifications}
					type="checkbox"
					disabled={!recovery.smtp_host}
				/>
				<span>Email due reminders through my SMTP relay</span>
			</label>
			<p class="muted small">
				{#if recovery.smtp_host}
					When a reminder is due, Perpetua sends it with the SMTP relay saved below, to your
					backup email (or your account email if you have not set one). Saving this does not
					send a message. If the relay rejects the message, Perpetua logs the failure and does
					not treat it as delivered. Perpetua does not run a mail server.
				{:else}
					Set the SMTP relay under Backup email &amp; account recovery before turning this on.
					Until then Perpetua will not pretend an email was sent.
				{/if}
			</p>

			<div class="actions">
				<button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save reminder settings'}</button>
			</div>
		</form>

		{#if inTauri}
			<div class="launch-row">
				<label class="checkbox">
					<input
						type="checkbox"
						checked={launchAtLogin === true}
						disabled={launchBusy || launchAtLogin === null}
						on:change={toggleLaunchAtLogin}
					/>
					<span>Start Perpetua at login (minimised to the tray)</span>
				</label>
				<p class="muted small">
					Off by default. Turn it on if you want reminders to fire even on days you don't open
					Perpetua yourself. Perpetua never changes this setting on its own.
				</p>
				{#if launchError}
					<p class="error-banner">{launchError}</p>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<section class="panel">
	<div class="panel-heading">
		<div>
			<h3>Backup email & account recovery</h3>
			<p class="muted">
				Used only to send you a one-time password-reset code if you're ever locked out. Sent
				through your own SMTP relay — Perpetua has no mail service of its own — and stored
				locally, same as everything else in your vault.
			</p>
		</div>
	</div>

	{#if loading}
		<p class="empty-state">Loading recovery settings...</p>
	{:else}
		<form class="license-form" on:submit|preventDefault={saveRecovery}>
			<label>
				<span>Backup email</span>
				<input bind:value={recovery.backup_email} type="email" placeholder="backup@example.com" />
			</label>
			<div class="form-grid">
				<label>
					<span>SMTP host</span>
					<input bind:value={recovery.smtp_host} placeholder="smtp.gmail.com" />
				</label>
				<label>
					<span>SMTP port</span>
					<input bind:value={recovery.smtp_port} type="number" placeholder="587" />
				</label>
				<label>
					<span>SMTP username</span>
					<input bind:value={recovery.smtp_username} placeholder="you@example.com" />
				</label>
				<label>
					<span>SMTP password</span>
					<input
						bind:value={recovery.smtp_password}
						type="password"
						autocomplete="new-password"
						placeholder={recovery.smtp_password_set ? 'Saved — leave blank to keep' : 'App password'}
					/>
				</label>
			</div>
			<label>
				<span>Send from address</span>
				<input bind:value={recovery.smtp_from} type="email" placeholder="you@example.com" />
			</label>

			<p class="muted small">
				Port 465 uses implicit TLS; 587 (and anything else) uses STARTTLS. Gmail and most providers
				need an app-specific password rather than your account password. The password is kept in
				your OS credential store and is never shown again here.
			</p>

			{#if recoveryError}
				<p class="error-banner">{recoveryError}</p>
			{/if}
			{#if recoveryMessage}
				<p class="success-banner">{recoveryMessage}</p>
			{/if}

			<div class="actions">
				<button type="submit" disabled={recoveryBusy}>{recoveryBusy ? 'Saving...' : 'Save recovery settings'}</button>
				<button
					type="button"
					class="secondary"
					disabled={testEmailBusy || recoveryBusy || !recovery.backup_email || !recovery.smtp_host}
					on:click={sendTestEmail}
				>
					{testEmailBusy ? 'Sending…' : 'Send test email'}
				</button>
			</div>
		</form>
	{/if}
</section>

<section class="panel">
	<div class="panel-heading">
		<div>
			<h3>Sharing</h3>
			<p class="muted">
				Share this vault's license storage with one other account on this same computer.
			</p>
		</div>
	</div>

	{#if $entitlement?.pro}
		<form class="license-form" on:submit|preventDefault={sendInvite}>
			<label>
				<span>Invite by email</span>
				<input bind:value={inviteEmail} type="email" placeholder="family@example.com" required />
			</label>
			{#if inviteError}
				<p class="error-banner">{inviteError}</p>
			{/if}
			{#if inviteMessage}
				<p class="success-banner">{inviteMessage}</p>
			{/if}
			<div class="actions">
				<button type="submit" disabled={inviteBusy}>{inviteBusy ? 'Sending...' : 'Send invite'}</button>
			</div>
		</form>

		{#if members.length > 0}
			<div class="stack" style="margin-top: 1rem;">
				{#each members as member (member.email)}
					<div class="license-card">
						<div>
							<h4>{member.email}</h4>
							<p>Invited {member.invited_at}</p>
						</div>
						<span class={`badge ${member.accepted_at ? 'badge-active' : 'badge-idle'}`}>
							{member.accepted_at ? 'Accepted' : 'Pending'}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<p class="empty-state">Vault sharing is a Pro feature. Unlock unlimited to invite someone.</p>
	{/if}

	<div class="panel-heading" style="margin-top: 1.5rem;">
		<div>
			<h3>Have an invite code?</h3>
			<p class="muted">Redeem it here to access the vault it was shared from.</p>
		</div>
	</div>
	<form class="license-form" on:submit|preventDefault={submitRedeem}>
		<label>
			<span>Invite code</span>
			<input bind:value={redeemCode} placeholder="8-character code from the email" autocomplete="one-time-code" required />
		</label>
		{#if redeemError}
			<p class="error-banner">{redeemError}</p>
		{/if}
		{#if redeemMessage}
			<p class="success-banner">{redeemMessage}</p>
		{/if}
		<div class="actions">
			<button type="submit" disabled={redeemBusy}>{redeemBusy ? 'Redeeming...' : 'Redeem code'}</button>
		</div>
	</form>
</section>

<section class="panel">
	<div class="panel-heading">
		<div>
			<h3>Auto-Maintain <span class="soon-badge">Coming soon · Pro</span></h3>
			<p class="muted">
				Let Perpetua keep deal accounts alive for you — automatically completing periodic
				logins and redemption steps for vendors that require them, so a lifetime deal never
				lapses for inactivity.
			</p>
		</div>
	</div>
	<!--
		No "Notify me" button: Perpetua has no telemetry or mailing list, so a
		button that only flipped a local flag would have been a false promise.
		Interest goes to a real mailbox instead.
	-->
	<p class="muted small">
		Want this? Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Auto-Maintain%20interest`}>{SUPPORT_EMAIL}</a>
		with the vendors you'd use it for — that's what decides the build order.
	</p>
</section>

<style>
	.launch-row {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(148, 163, 184, 0.2);
	}

	.soon-badge {
		font-size: 0.7rem;
		font-weight: 600;
		vertical-align: middle;
		margin-left: 0.5rem;
		padding: 0.15rem 0.5rem;
		border-radius: 0.5rem;
		background: rgba(120, 120, 200, 0.18);
		color: #8a8ad6;
	}
</style>
