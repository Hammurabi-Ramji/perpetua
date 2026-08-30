<script lang="ts">
	import { onMount } from 'svelte';

	import {
		getAccountRecovery,
		getReminderSettings,
		inviteMember,
		listReminderItems,
		listVaultMembers,
		redeemInvite,
		updateAccountRecovery,
		updateReminderSettings
	} from '$lib/api';
	import { entitlement, refreshEntitlement } from '$lib/stores/entitlement';
	import type { AccountRecoverySettings, ReminderItem, ReminderSettings, VaultMember } from '$lib/types';

	let loading = true;
	let saving = false;
	let error: string | null = null;
	let successMessage = '';
	let items: ReminderItem[] = [];
	let interested = false;
	let settings: ReminderSettings = {
		notification_email: '',
		email_notifications: true,
		browser_notifications: false
	};

	let recovery: AccountRecoverySettings = {
		backup_email: '',
		smtp_host: '',
		smtp_port: null,
		smtp_username: '',
		smtp_password: '',
		smtp_from: ''
	};
	let recoveryBusy = false;
	let recoveryMessage = '';
	let recoveryError = '';

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
			recovery = {
				backup_email: recoveryLoaded.backup_email ?? '',
				smtp_host: recoveryLoaded.smtp_host ?? '',
				smtp_port: recoveryLoaded.smtp_port,
				smtp_username: recoveryLoaded.smtp_username ?? '',
				smtp_password: recoveryLoaded.smtp_password ?? '',
				smtp_from: recoveryLoaded.smtp_from ?? ''
			};
			await refreshEntitlement();
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
			successMessage = 'Reminder settings saved locally.';
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
			recovery = await updateAccountRecovery(recovery);
			recoveryMessage = 'Recovery settings saved locally.';
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
					{#each items as item}
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
							<td class="table-action"><a href={`/licenses/${item.license_id}`}>Open</a></td>
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
			<label>
				<span>Notification email</span>
				<input bind:value={settings.notification_email} type="email" placeholder="alerts@example.com" />
			</label>

			<label class="checkbox">
				<input bind:checked={settings.email_notifications} type="checkbox" />
				<span>Enable email reminders</span>
			</label>

			<label class="checkbox">
				<input bind:checked={settings.browser_notifications} type="checkbox" />
				<span>Enable desktop reminders</span>
			</label>

			<p class="muted small">
				Perpetua runs a background check and sends native desktop notifications for due
				redemption deadlines — even when the window is closed (it keeps watch from the system
				tray and starts at login).
			</p>

			<div class="actions">
				<button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save reminder settings'}</button>
			</div>
		</form>
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
					<input bind:value={recovery.smtp_password} type="password" placeholder="App password" />
				</label>
			</div>
			<label>
				<span>Send from address</span>
				<input bind:value={recovery.smtp_from} type="email" placeholder="you@example.com" />
			</label>

			{#if recoveryError}
				<p class="error-banner">{recoveryError}</p>
			{/if}
			{#if recoveryMessage}
				<p class="success-banner">{recoveryMessage}</p>
			{/if}

			<div class="actions">
				<button type="submit" disabled={recoveryBusy}>{recoveryBusy ? 'Saving...' : 'Save recovery settings'}</button>
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
				{#each members as member}
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
			<input bind:value={redeemCode} placeholder="123456" required />
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
	{#if interested}
		<p class="success-banner">You're on the list — we'll let you know when Auto-Maintain ships.</p>
	{:else}
		<div class="actions">
			<button type="button" class="secondary" on:click={() => (interested = true)}>
				Notify me when it's ready
			</button>
		</div>
	{/if}
</section>

<style>
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
