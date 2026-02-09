<script lang="ts">
	import ProviderKeyRow from './ProviderKeyRow.svelte';
	import { LLM_PROVIDERS, TTS_PROVIDERS, testLlmProvider, testFishProvider } from './providers.js';
	import type { ProviderDefaults } from './providers.js';

	let {
		providerDefaults = $bindable(),
		fishApiKey = $bindable(''),
		onsave
	}: {
		providerDefaults: Record<string, ProviderDefaults>;
		fishApiKey: string;
		onsave: () => void;
	} = $props();

	let testing = $state<Record<string, boolean>>({});
	let results = $state<Record<string, { ok: boolean; msg: string }>>({});

	function getKey(id: string) {
		return providerDefaults[id]?.apiKey || '';
	}

	function getEndpoint(id: string) {
		return providerDefaults[id]?.endpoint || LLM_PROVIDERS.find(p => p.id === id)?.defaultEndpoint || '';
	}

	function setKey(id: string, val: string) {
		const existing = providerDefaults[id] || { model: '', apiKey: '', endpoint: '' };
		providerDefaults = { ...providerDefaults, [id]: { ...existing, apiKey: val } };
		onsave();
	}

	function setEndpoint(id: string, val: string) {
		const existing = providerDefaults[id] || { model: '', apiKey: '', endpoint: '' };
		providerDefaults = { ...providerDefaults, [id]: { ...existing, endpoint: val } };
		onsave();
	}

	async function testLlm(id: string) {
		testing = { ...testing, [id]: true };
		const d = providerDefaults[id] || { apiKey: '', endpoint: '' };
		const config = LLM_PROVIDERS.find(p => p.id === id)!;
		const ep = d.endpoint || config.defaultEndpoint || '';
		const result = await testLlmProvider(id, d.apiKey, ep);
		results = { ...results, [id]: {
			ok: result.ok,
			msg: result.ok ? `Connected (${result.models.length} models)` : (result.error || 'Failed')
		}};
		testing = { ...testing, [id]: false };
	}

	async function testFish() {
		testing = { ...testing, fish: true };
		const result = await testFishProvider(fishApiKey);
		results = { ...results, fish: {
			ok: result.ok,
			msg: result.ok ? `Connected (${result.count} voices)` : (result.error || 'Failed')
		}};
		testing = { ...testing, fish: false };
	}
</script>

<div class="section-card">
	<h2 class="section-title">API Keys</h2>

	<h3 class="sub-title">LLM Providers</h3>
	{#each LLM_PROVIDERS as config}
		<ProviderKeyRow
			{config}
			apiKey={getKey(config.id)}
			endpoint={getEndpoint(config.id)}
			testing={testing[config.id] || false}
			testResult={results[config.id] || null}
			onkeychange={(v) => setKey(config.id, v)}
			onendpointchange={(v) => setEndpoint(config.id, v)}
			ontest={() => testLlm(config.id)}
		/>
	{/each}

	<h3 class="sub-title" style="margin-top:16px">TTS Providers</h3>
	{#each TTS_PROVIDERS as config}
		<ProviderKeyRow
			{config}
			apiKey={fishApiKey}
			testing={testing[config.id] || false}
			testResult={results[config.id] || null}
			onkeychange={(v) => { fishApiKey = v; onsave(); }}
			ontest={testFish}
		/>
	{/each}

	<p class="footer-note">All keys stored locally in IndexedDB. Never sent to third-party servers.</p>
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
	.footer-note {
		margin: 16px 0 0;
		font-size: 0.7rem;
		color: var(--text-muted);
		font-style: italic;
	}
</style>
