<script lang="ts">
	import { activateLicense } from '$lib/api';
	import { BUY_URL, CHECKOUT_CONFIGURED, PRO_PRICE } from '$lib/commerce';
	import { closePaywall, entitlement, paywallOpen } from '$lib/stores/entitlement';

	// Polar.sh is the Merchant of Record for the one-time Pro license (they
	// handle tax/VAT/fraud and email the license key on purchase). The checkout
	// link and price come from build-time config — see src/lib/commerce.ts.
	// There is deliberately no struck-through "regular" price: a reference
	// price that was never actually charged is a deceptive-pricing claim.

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
				unlimited licenses. No subscription. This is a software license, not a support plan.
			</p>

			<p class="price-line">
				<span class="price-now">{PRO_PRICE}</span>
				<span class="price-tag">One-time payment</span>
			</p>
			<p class="muted small">
				Taxes may apply at checkout. Your key arrives by email from Polar, our payment partner.
			</p>

			<a class="buy-button" href={BUY_URL} target="_blank" rel="noopener noreferrer">
				{CHECKOUT_CONFIGURED ? 'Buy Pro — one-time license' : 'Get Pro on the Perpetua website'}
			</a>

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

	.small {
		font-size: 0.8rem;
		margin: 0;
	}

	.price-now {
		font-size: 2rem;
		font-weight: 700;
	}

	.price-tag {
		font-size: 0.8rem;
		font-weight: 600;
		color: #1c7a52;
		background: rgba(40, 170, 110, 0.15);
		padding: 0.15rem 0.5rem;
		border-radius: 0.5rem;
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
