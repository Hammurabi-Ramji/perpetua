<script lang="ts">
	import { activateLicense } from '$lib/api';
	import { closePaywall, entitlement, paywallOpen } from '$lib/stores/entitlement';

	// Polar.sh checkout link and list price are injected at build time
	// (see docs/RELEASE.md). No hard-coded fallback URL: if unset, the buy
	// button is disabled rather than linking somewhere dead.
	const rawBuyUrl = import.meta.env.VITE_PERPETUA_BUY_URL as string | undefined;
	const BUY_URL = rawBuyUrl && rawBuyUrl.trim() ? rawBuyUrl.trim() : '';
	const PRO_PRICE =
		((import.meta.env.VITE_PERPETUA_PRO_PRICE as string | undefined) ?? '').trim() || '$49.99';

	let activationKey = '';
	let activating = false;
	let activationError: string | null = null;

	function close() {
		activationError = null;
		activationKey = '';
		closePaywall();
	}

	async function handleActivate() {
		activating = true;
		activationError = null;
		try {
			const result = await activateLicense(activationKey.trim());
			entitlement.set(result);
			activationKey = '';
			closePaywall();
			// Let any open page reload its data now that the cap is gone.
			window.dispatchEvent(new CustomEvent('perpetua:pro-unlocked'));
		} catch (error) {
			activationError = error instanceof Error ? error.message : 'Could not activate that key';
		} finally {
			activating = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
		}
	}

	$: limit = $entitlement?.free_limit ?? 3;
</script>

<svelte:window on:keydown={onKeydown} />

{#if $paywallOpen}
	<div class="modal-backdrop">
		<button class="backdrop-button" type="button" aria-label="Close" on:click={close}></button>
		<div class="modal" role="dialog" aria-modal="true" aria-label="Unlock Perpetua Pro">
			<h3>Unlock Perpetua Pro</h3>
			<p class="muted">
				The free plan stores up to {limit} licenses. Pro is a one-time purchase — pay once, store
				unlimited licenses forever. No subscription, all local.
			</p>

			<p class="price-line">
				<span class="price-now">{PRO_PRICE}</span>
			</p>

			{#if BUY_URL}
				<a class="buy-button" href={BUY_URL} target="_blank" rel="noopener noreferrer">
					Buy Pro — lifetime unlock
				</a>
			{:else}
				<button class="buy-button" type="button" disabled aria-disabled="true">
					Buy Pro — lifetime unlock
				</button>
				<p class="muted buy-unavailable">Purchase link unavailable - see website</p>
			{/if}

			<div class="activate-block">
				<label for="activation-key">Already have a key? Paste it to activate:</label>
				<input
					id="activation-key"
					bind:value={activationKey}
					placeholder="Paste your Pro license key"
					autocomplete="off"
				/>
				{#if activationError}
					<p class="error-banner">{activationError}</p>
				{/if}
				<div class="modal-actions">
					<button type="button" class="link-button" on:click={close}>Maybe later</button>
					<button
						type="button"
						on:click={handleActivate}
						disabled={activating || !activationKey.trim()}
					>
						{activating ? 'Activating…' : 'Activate'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 15, 30, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		z-index: 50;
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: none;
		padding: 0;
		margin: 0;
		background: transparent;
		cursor: pointer;
	}

	.modal {
		position: relative;
		background: var(--surface, #fff);
		color: inherit;
		border-radius: 1rem;
		padding: 1.75rem;
		max-width: 28rem;
		width: 100%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}

	.price-line {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin: 1rem 0 0.25rem;
	}

	.price-now {
		font-size: 2rem;
		font-weight: 700;
	}

	.buy-button {
		display: block;
		text-align: center;
		margin: 1.25rem 0;
		padding: 0.85rem 1rem;
		border-radius: 0.75rem;
		background: #5b5bd6;
		color: #fff;
		font-weight: 600;
		text-decoration: none;
		border: none;
		font: inherit;
		font-weight: 600;
	}

	button.buy-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.buy-unavailable {
		text-align: center;
		margin: -0.75rem 0 1rem;
	}

	.activate-block {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		border-top: 1px solid rgba(120, 120, 160, 0.25);
		padding-top: 1rem;
	}

	.activate-block input {
		padding: 0.6rem 0.75rem;
		border-radius: 0.6rem;
		border: 1px solid rgba(120, 120, 160, 0.45);
		font: inherit;
	}

	.link-button {
		background: none;
		border: none;
		color: #5b5bd6;
		font: inherit;
		cursor: pointer;
		padding: 0;
	}

	.modal-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 1rem;
		margin-top: 0.25rem;
	}
</style>
