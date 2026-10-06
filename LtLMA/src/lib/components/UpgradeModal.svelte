<script lang="ts">
	import { activateLicense } from '$lib/api';
	import { closePaywall, entitlement, paywallOpen } from '$lib/stores/entitlement';

	// Permanent checkout link; Polar determines the current automatic discount,
	// tax and final payable amount. Never hard-code a promotional total here.
	const BUY_URL = 'https://buy.polar.sh/polar_cl_78OH9xU4qiWkVMEjbUpLYe7amh6I1Yw1cxpp50aBwuB';

	let activationKey = '';
	let activating = false;
	let activationError: string | null = null;
	let dialog: HTMLDivElement;
	let previousFocus: HTMLElement | null = null;
	let wasOpen = false;

	function close() {
		activationError = null;
		activationKey = '';
		closePaywall();
		previousFocus?.focus();
	}

	async function handleActivate() {
		activating = true;
		activationError = null;
		try {
				const result = await activateLicense(activationKey.trim());
				entitlement.set(result);
				close();
			// Let any open page reload its data now that the cap is gone.
			window.dispatchEvent(new CustomEvent('perpetua:pro-unlocked'));
		} catch (error) {
			activationError = error instanceof Error ? error.message : 'Could not activate that key';
		} finally {
			activating = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (!$paywallOpen) return;
		if (event.key === 'Escape') {
			close();
		} else if (event.key === 'Tab' && dialog) {
			const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)).filter((element) => !element.hasAttribute('hidden') && getComputedStyle(element).display !== 'none');
			if (!focusable.length) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!dialog.contains(document.activeElement)) {
				event.preventDefault();
				first.focus();
			} else if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}

	$: limit = $entitlement?.free_limit ?? 3;
	$: if ($paywallOpen && !wasOpen) {
		previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		wasOpen = true;
		setTimeout(() => dialog?.querySelector<HTMLElement>('a[href]')?.focus(), 0);
	} else if (!$paywallOpen) {
		wasOpen = false;
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if $paywallOpen}
	<div class="modal-backdrop">
		<button class="backdrop-button" type="button" aria-label="Close" on:click={close}></button>
			<div class="modal" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" bind:this={dialog}>
				<h3 id="upgrade-title">Unlock Perpetua Pro</h3>
			<p class="muted">
				The free plan stores up to {limit} licenses. Pro is a one-time purchase — pay once, store
				unlimited licenses forever. No subscription, all local.
			</p>

				<p class="price-line">Regular price $49.99 USD. An automatic early-bird discount may apply; Polar shows the current total and any tax before you pay.</p>

				<a class="buy-button" href={BUY_URL} target="_blank" rel="noopener noreferrer">
					Check current price at Polar
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
						<p class="error-banner" role="alert">{activationError}</p>
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

	.price-line { line-height: 1.5; }

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
