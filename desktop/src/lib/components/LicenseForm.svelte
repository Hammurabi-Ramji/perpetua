<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';

	import { suggestVendorPolicy, type VendorPolicySuggestion } from '$lib/api';
	import { extractLicenseFieldsFromImage } from '$lib/ocr';
	import type { LicenseInput } from '$lib/types';

	export let model: LicenseInput;
	export let submitLabel = 'Save license';
	export let busy = false;

	const dispatch = createEventDispatcher<{ submit: LicenseInput }>();

	let suggestion: VendorPolicySuggestion | null = null;
	let suggestBusy = false;
	let suggestError = '';
	/** When true, autofill will not overwrite a user-edited keepalive value. */
	let keepaliveTouched = false;
	let suggestTimer: ReturnType<typeof setTimeout> | null = null;

	let ocrBusy = false;
	let ocrError = '';
	let ocrRawText = '';
	let ocrPreviewUrl: string | null = null;
	let ocrFoundAny = false;

	onDestroy(() => {
		if (ocrPreviewUrl) URL.revokeObjectURL(ocrPreviewUrl);
	});

	async function handleImagePicked(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (ocrPreviewUrl) URL.revokeObjectURL(ocrPreviewUrl);
		ocrPreviewUrl = URL.createObjectURL(file);
		ocrError = '';
		ocrRawText = '';
		ocrBusy = true;

		try {
			const extracted = await extractLicenseFieldsFromImage(file);
			ocrRawText = extracted.rawText;
			ocrFoundAny = Boolean(
				extracted.licenseKey || extracted.purchaseDate || extracted.expiryDate || extracted.amount
			);

			if (extracted.licenseKey && !model.license_key.trim()) {
				model.license_key = extracted.licenseKey;
			}
			if (extracted.purchaseDate && !model.purchase_date.trim()) {
				model.purchase_date = extracted.purchaseDate;
			}
			if (extracted.expiryDate && !model.expiry_date.trim()) {
				model.expiry_date = extracted.expiryDate;
			}
			if (extracted.amount) {
				const note = `Purchase amount (auto-extracted): ${extracted.amount}`;
				model.notes = model.notes.trim() ? `${model.notes}\n${note}` : note;
			}

			if (!ocrFoundAny) {
				ocrError = 'Could not find a license key, date, or amount in this image — check the raw text below.';
			}
		} catch (error) {
			ocrError = error instanceof Error ? error.message : 'Could not read this image';
		} finally {
			ocrBusy = false;
			input.value = '';
		}
	}

	function submit() {
		dispatch('submit', model);
	}

	function onKeepaliveInput() {
		keepaliveTouched = true;
	}

	function scheduleSuggest() {
		if (suggestTimer) clearTimeout(suggestTimer);
		suggestTimer = setTimeout(() => {
			void runSuggest();
		}, 280);
	}

	async function runSuggest() {
		suggestError = '';
		suggestBusy = true;
		try {
			suggestion = await suggestVendorPolicy(model.source_site, model.product_name);
			if (
				suggestion.matched &&
				suggestion.keepalive_days != null &&
				!keepaliveTouched &&
				(!model.keepalive_days || model.keepalive_days.trim() === '')
			) {
				model.keepalive_days = String(suggestion.keepalive_days);
			}
		} catch (error) {
			suggestion = null;
			suggestError = error instanceof Error ? error.message : 'Could not load vendor policy';
		} finally {
			suggestBusy = false;
		}
	}

	function applySuggestion() {
		if (suggestion?.keepalive_days != null) {
			model.keepalive_days = String(suggestion.keepalive_days);
			keepaliveTouched = false;
		}
	}
</script>

<form class="license-form" on:submit|preventDefault={submit}>
	<div class="ocr-upload">
		<label class="ocr-upload-label">
			<span>Autofill from screenshot</span>
			<input type="file" accept="image/*" on:change={handleImagePicked} disabled={ocrBusy} />
		</label>
		<p class="muted small">
			Runs fully offline on this device — the image and its text never leave your computer.
		</p>

		{#if ocrPreviewUrl}
			<div class="ocr-preview">
				<img src={ocrPreviewUrl} alt="Uploaded license screenshot" />
				<div class="ocr-status">
					{#if ocrBusy}
						<p class="muted">Reading image…</p>
					{:else if ocrError}
						<p class="ocr-error">{ocrError}</p>
					{:else if ocrFoundAny}
						<p class="ocr-success">Filled in what was found. Review before saving.</p>
					{/if}
					{#if ocrRawText}
						<details>
							<summary class="muted small">Show detected text</summary>
							<pre class="ocr-raw">{ocrRawText}</pre>
						</details>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<div class="form-grid">
		<label>
			<span>Product name</span>
			<input
				bind:value={model.product_name}
				placeholder="Figma Pro"
				required
				on:input={scheduleSuggest}
			/>
		</label>
		<label>
			<span>License key</span>
			<input bind:value={model.license_key} placeholder="AAAA-BBBB-CCCC" required />
		</label>
		<label>
			<span>Status</span>
			<select bind:value={model.status}>
				<option value="active">Active</option>
				<option value="expiring">Expiring</option>
				<option value="expired">Expired</option>
			</select>
		</label>
		<label>
			<span>Source site</span>
			<input
				bind:value={model.source_site}
				placeholder="AppSumo"
				on:input={scheduleSuggest}
			/>
		</label>
		<label>
			<span>Purchase date</span>
			<input bind:value={model.purchase_date} type="date" />
		</label>
		<label>
			<span>Expiry date</span>
			<input bind:value={model.expiry_date} type="date" />
		</label>
		<label>
			<span>Product URL</span>
			<input bind:value={model.product_url} placeholder="https://example.com" />
		</label>
		<label>
			<span>Download URL</span>
			<input bind:value={model.download_url} placeholder="https://downloads.example.com" />
		</label>
		<label>
			<span>Redemption URL</span>
			<input bind:value={model.redemption_url} placeholder="https://redeem.example.com" />
		</label>
		<label>
			<span>Action deadline</span>
			<input bind:value={model.action_deadline} type="date" />
		</label>
		<label>
			<span>Keep-alive: log in every (days)</span>
			<input
				bind:value={model.keepalive_days}
				type="number"
				min="1"
				placeholder="e.g. 90"
				on:input={onKeepaliveInput}
			/>
		</label>
		<label>
			<span>Last used</span>
			<input bind:value={model.last_active} type="date" />
		</label>
	</div>

	{#if suggestBusy}
		<p class="policy-hint muted">Looking up vendor keep-alive policy…</p>
	{:else if suggestError}
		<p class="policy-hint muted">{suggestError}</p>
	{:else if suggestion}
		<p class="policy-hint">
			{suggestion.message}
			{#if suggestion.matched && suggestion.source}
				<span class="muted small"> Source: {suggestion.source}.</span>
			{/if}
			{#if suggestion.matched}
				<button type="button" class="linkish" on:click={applySuggestion}>Apply suggestion</button>
			{/if}
		</p>
	{/if}

	<label>
		<span>Notes</span>
		<textarea
			bind:value={model.notes}
			rows="4"
			placeholder="Store purchase notes, redemption instructions, or follow-ups."
		></textarea>
	</label>

	<label class="checkbox">
		<input bind:checked={model.action_required} type="checkbox" />
		<span>Action required</span>
	</label>

	<label>
		<span>Action description</span>
		<input bind:value={model.action_description} placeholder="Redeem within 30 days" />
	</label>

	<div class="actions">
		<button type="submit" disabled={busy}>{busy ? 'Saving...' : submitLabel}</button>
	</div>
</form>

<style>
	.policy-hint {
		margin: 0.5rem 0 1rem;
		font-size: 0.9rem;
		line-height: 1.4;
	}
	.muted {
		opacity: 0.75;
	}
	.small {
		font-size: 0.85em;
	}
	.linkish {
		display: inline;
		margin-left: 0.5rem;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
		font: inherit;
	}
	.ocr-upload {
		margin-bottom: 1.25rem;
		padding: 0.85rem 1rem;
		border: 1px dashed rgba(127, 127, 127, 0.4);
		border-radius: 8px;
	}
	.ocr-upload-label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-weight: 600;
	}
	.ocr-preview {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.75rem;
		align-items: flex-start;
	}
	.ocr-preview img {
		max-width: 140px;
		max-height: 140px;
		border-radius: 6px;
		object-fit: contain;
		border: 1px solid rgba(127, 127, 127, 0.3);
	}
	.ocr-status {
		flex: 1;
		min-width: 0;
	}
	.ocr-error {
		color: #d14343;
		margin: 0 0 0.35rem;
	}
	.ocr-success {
		margin: 0 0 0.35rem;
	}
	.ocr-raw {
		max-height: 160px;
		overflow: auto;
		white-space: pre-wrap;
		font-size: 0.8rem;
		padding: 0.5rem;
		background: rgba(127, 127, 127, 0.1);
		border-radius: 6px;
	}
</style>
