<script lang="ts">
	import { entitlement, openPaywall } from '$lib/stores/entitlement';

	$: remaining = $entitlement?.remaining ?? 0;
</script>

{#if $entitlement}
	{#if $entitlement.pro}
		<div class="plan-banner pro">
			<span><strong>Perpetua Pro</strong> — unlimited licenses unlocked. Thank you!</span>
		</div>
	{:else}
		<div class="plan-banner">
			<span>
				Free plan — <strong>{$entitlement.used}/{$entitlement.free_limit}</strong> licenses used
				{#if remaining > 0}
					({remaining} slot{remaining === 1 ? '' : 's'} left)
				{:else}
					(limit reached)
				{/if}
			</span>
			<button type="button" class="link-button" on:click={openPaywall}>Unlock unlimited →</button>
		</div>
	{/if}
{/if}

<style>
	.plan-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		margin-bottom: 1rem;
		border: 1px solid rgba(120, 120, 160, 0.35);
		border-radius: 0.75rem;
		background: rgba(120, 120, 200, 0.08);
		font-size: 0.95rem;
	}

	.plan-banner.pro {
		border-color: rgba(40, 170, 110, 0.4);
		background: rgba(40, 170, 110, 0.1);
	}

	.link-button {
		background: none;
		border: none;
		color: #5b5bd6;
		font: inherit;
		cursor: pointer;
		padding: 0;
	}
</style>
