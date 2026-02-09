<script lang="ts">
	import { LLM_PROVIDERS, testLlmProvider } from './providers.js';
	import type { ProviderDefaults } from './providers.js';
	import { getStorageManager } from '../../storage/index.js';

	let {
		providerDefaults = $bindable(),
		onsave
	}: {
		providerDefaults: Record<string, ProviderDefaults>;
		onsave: () => void;
	} = $props();

	const storage = getStorageManager();

	let selectedProvider = $state('ollama');
	let modelList = $state<{ id: string; name: string }[]>([]);
	let fetching = $state(false);
	let fetchMsg = $state('');

	// Base providers only — responses variants share the same models/keys
	const providerOptions = LLM_PROVIDERS.map(p => ({ value: p.id, label: p.label }));


	async function onProviderChange(e: Event) {
		selectedProvider = (e.target as HTMLSelectElement).value;
		modelList = [];
		fetchMsg = '';

		// Try loading from cache first
		try {
			const cached = await storage.getCachedModels(selectedProvider);
			if (cached && cached.length > 0) {
				modelList = cached;
				fetchMsg = `${cached.length} models (cached)`;
				return;
			}
		} catch { /* no cache */ }
	}

	async function fetchModels() {
		const d = providerDefaults[selectedProvider] || { model: '', apiKey: '', endpoint: '' };
		const config = LLM_PROVIDERS.find(p => p.id === selectedProvider);
		const endpoint = d.endpoint || config?.defaultEndpoint || '';

		fetching = true;
		fetchMsg = '';
		const result = await testLlmProvider(selectedProvider, d.apiKey, endpoint);
		fetching = false;

		if (result.ok) {
			modelList = result.models;
			fetchMsg = `${result.models.length} models loaded`;
			// Cache the results
			try { await storage.setCachedModels(selectedProvider, result.models); } catch {}
		} else {
			modelList = [];
			fetchMsg = result.error || 'Failed to fetch models';
		}
	}

	function setDefault(modelId: string) {
		const existing = providerDefaults[selectedProvider] || { model: '', apiKey: '', endpoint: '' };
		providerDefaults = { ...providerDefaults, [selectedProvider]: { ...existing, model: modelId } };
		onsave();
	}

	// Get all providers that have a saved default model
	let savedDefaults = $derived(
		Object.entries(providerDefaults)
			.filter(([_, d]) => d.model)
			.map(([id, d]) => {
				const config = LLM_PROVIDERS.find(p => p.id === id);
				return { id, label: config?.label || id, model: d.model };
			})
	);

	let currentDefault = $derived(providerDefaults[selectedProvider]?.model || '');
</script>

<div class="section-card">
	<h2 class="section-title">LLM Models</h2>

	<div class="row">
		<select class="select-tech" onchange={onProviderChange}>
			{#each providerOptions as p}
				<option value={p.value} selected={selectedProvider === p.value}>{p.label}</option>
			{/each}
		</select>
		<button class="btn-init" onclick={fetchModels} disabled={fetching}>
			{fetching ? 'Fetching...' : 'Fetch Models'}
		</button>
	</div>

	{#if fetchMsg}
		<div class="fetch-msg">{fetchMsg}</div>
	{/if}

	{#if modelList.length > 0}
		<div class="model-list">
			{#each modelList as model}
				<div class="model-row" class:active={currentDefault === model.id}>
					<span class="model-name">{model.name}</span>
					{#if currentDefault === model.id}
						<span class="default-badge">DEFAULT</span>
					{:else}
						<button class="btn-small" onclick={() => setDefault(model.id)}>Set Default</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if savedDefaults.length > 0}
		<h3 class="sub-title" style="margin-top:16px">Saved Defaults</h3>
		<div class="defaults-summary">
			{#each savedDefaults as d}
				<div class="default-row">
					<span class="default-provider">{d.label}:</span>
					<span class="default-model">{d.model}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.section-card {
		background: var(--c-panel, rgba(13,17,23,0.95));
		border: 1px solid var(--c-border);
		padding: 20px;
		overflow: hidden;
	}
	@media (max-width: 500px) {
		.section-card { padding: 14px; }
	}
	.section-title {
		font-family: var(--font-tech);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: var(--c-text-accent);
		margin: 0 0 16px;
	}
	.sub-title {
		font-family: var(--font-tech);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-muted);
		margin: 0 0 8px;
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.select-tech {
		flex: 1;
		min-width: 0;
		background: rgba(0,0,0,0.4);
		border: 1px solid var(--c-border);
		color: var(--text-main);
		padding: 8px 10px;
		font-size: 0.8rem;
		font-family: var(--font-ui);
		cursor: pointer;
	}
	.select-tech:focus { outline: none; border-color: var(--c-text-accent); }
	.select-tech option { background: #0d1117; }
	.btn-init {
		padding: 8px 14px;
		background: var(--c-text-accent);
		border: none;
		color: #000;
		font-family: var(--font-tech);
		font-size: 0.7rem;
		text-transform: uppercase;
		cursor: pointer;
		white-space: nowrap;
		transition: opacity 0.2s;
	}
	.btn-init:hover { opacity: 0.8; }
	.btn-init:disabled { opacity: 0.4; cursor: not-allowed; }
	.fetch-msg {
		font-size: 0.7rem;
		font-family: var(--font-tech);
		color: var(--text-muted);
		padding: 6px 0;
	}
	.model-list {
		max-height: 300px;
		overflow-y: auto;
		border: 1px solid var(--c-border);
		margin-top: 8px;
	}
	.model-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid rgba(255,255,255,0.03);
		transition: background 0.15s;
	}
	.model-row:hover { background: rgba(56,189,248,0.03); }
	.model-row.active { background: rgba(56,189,248,0.08); border-left: 2px solid var(--c-text-accent); }
	.model-name {
		font-size: 0.8rem;
		color: var(--text-main);
		font-family: var(--font-ui);
	}
	.default-badge {
		font-size: 0.65rem;
		font-family: var(--font-tech);
		color: var(--c-text-accent);
		letter-spacing: 0.1em;
		padding: 2px 8px;
		border: 1px solid var(--c-text-accent);
	}
	.btn-small {
		padding: 3px 10px;
		background: transparent;
		border: 1px solid var(--c-border);
		color: var(--text-muted);
		font-family: var(--font-tech);
		font-size: 0.65rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-small:hover { border-color: var(--c-text-accent); color: var(--c-text-accent); }
	.defaults-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.default-row {
		display: flex;
		gap: 4px;
		align-items: center;
		padding: 4px 10px;
		background: rgba(0,0,0,0.3);
		border: 1px solid var(--c-border);
		font-size: 0.7rem;
	}
	.default-provider {
		color: var(--c-text-accent);
		font-family: var(--font-tech);
		text-transform: uppercase;
	}
	.default-model {
		color: var(--text-main);
		font-family: var(--font-ui);
		word-break: break-all;
	}
	@media (max-width: 500px) {
		.model-row { flex-direction: column; align-items: flex-start; gap: 4px; }
		.model-name { word-break: break-all; }
		.defaults-summary { flex-direction: column; }
		.default-row { width: 100%; }
	}
</style>
