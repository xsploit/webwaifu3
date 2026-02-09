<script lang="ts">
	import { onMount } from 'svelte';
	import { getStorageManager } from '$lib/storage/index.js';
	import type { ProviderDefaults } from '$lib/components/manager/providers.js';
	import ApiKeysSection from '$lib/components/manager/ApiKeysSection.svelte';
	import LlmModelsSection from '$lib/components/manager/LlmModelsSection.svelte';
	import FishVoicesSection from '$lib/components/manager/FishVoicesSection.svelte';
	import MemorySection from '$lib/components/manager/MemorySection.svelte';
	import ConversationsSection from '$lib/components/manager/ConversationsSection.svelte';
	import DataManagementSection from '$lib/components/manager/DataManagementSection.svelte';

	const storage = getStorageManager();

	// Local state — independent from app.svelte.ts stores
	let loaded = $state(false);
	let providerDefaults = $state<Record<string, ProviderDefaults>>({});
	let fishApiKey = $state('');
	let fishSavedVoices = $state<{ id: string; name: string }[]>([]);
	let fishModel = $state('s1');
	let fishVoiceId = $state('');
	let fishLatency = $state('balanced');

	// Memory state
	let memoryEnabled = $state(false);
	let memoryMode = $state('hybrid');
	let memoryMaxContext = $state(20);
	let memoryWindowSize = $state(30);
	let memoryTopK = $state(3);
	let memorySimilarityThreshold = $state(0.5);
	let memorySummarizationProvider = $state('');
	let memorySummarizationModel = $state('');
	let memorySummarizationApiKey = $state('');
	let memorySummarizationEndpoint = $state('');

	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		storage.initialize().then(async () => {
			try {
				const state = await storage.loadAppState();
				// Load provider defaults
				providerDefaults = await storage.getSetting('manager.providerDefaults', {});

				// Populate from existing app state
				if (state.tts) {
					fishApiKey = state.tts.fishApiKey || '';
					fishSavedVoices = state.tts.fishSavedVoices || [];
					fishModel = state.tts.fishModel || 's1';
					fishVoiceId = state.tts.fishVoiceId || '';
					fishLatency = state.tts.fishLatency || 'balanced';
				}
				if (state.memory) {
					memoryEnabled = state.memory.enabled;
					memoryMode = state.memory.mode;
					memoryMaxContext = state.memory.maxContext;
					memoryWindowSize = state.memory.windowSize;
					memoryTopK = state.memory.topK;
					memorySimilarityThreshold = state.memory.similarityThreshold;
					memorySummarizationProvider = state.memory.summarizationProvider;
					memorySummarizationModel = state.memory.summarizationModel;
					memorySummarizationApiKey = state.memory.summarizationApiKey;
					memorySummarizationEndpoint = state.memory.summarizationEndpoint;
				}

				// Backfill provider defaults from existing llm settings
				if (state.llm) {
					// Migrate legacy -responses variants to base provider name
					const provider = (state.llm.provider?.replace('-responses', '') || 'ollama') as string;
					if (!providerDefaults[provider]) {
						providerDefaults[provider] = { model: '', apiKey: '', endpoint: '' };
					}
					if (state.llm.apiKey && !providerDefaults[provider].apiKey) {
						providerDefaults[provider].apiKey = state.llm.apiKey;
					}
					if (state.llm.endpoint && !providerDefaults[provider].endpoint) {
						providerDefaults[provider].endpoint = state.llm.endpoint;
					}
					if (state.llm.model && !providerDefaults[provider].model) {
						providerDefaults[provider].model = state.llm.model;
					}
				}

				loaded = true;
			} catch (e) {
				console.error('[Manager] Failed to load:', e);
				loaded = true;
			}
		});
	});

	function debouncedSave() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveToStorage(), 500);
	}

	async function saveToStorage() {
		try {
			// Strip Svelte 5 reactivity proxies before writing to IndexedDB
			await storage.setSetting('manager.providerDefaults', $state.snapshot(providerDefaults));

			// Sync active provider's key/endpoint/model to llm.* so Main page picks it up
			const activeProvider = await storage.getSetting('llm.provider', 'ollama');
			const activeDefaults = providerDefaults[activeProvider];
			if (activeDefaults) {
				if (activeDefaults.apiKey) await storage.setSetting('llm.apiKey', activeDefaults.apiKey);
				if (activeDefaults.endpoint) await storage.setSetting('llm.endpoint', activeDefaults.endpoint);
				if (activeDefaults.model) await storage.setSetting('llm.model', activeDefaults.model);
			}

			await storage.setSetting('tts.fishApiKey', fishApiKey);
			await storage.setSetting('tts.fishSavedVoices', $state.snapshot(fishSavedVoices));
			await storage.setSetting('tts.fishModel', fishModel);
			await storage.setSetting('tts.fishVoiceId', fishVoiceId);
			await storage.setSetting('tts.fishLatency', fishLatency);
			// Memory settings
			await storage.setSetting('memory.enabled', memoryEnabled);
			await storage.setSetting('memory.mode', memoryMode);
			await storage.setSetting('memory.maxContext', memoryMaxContext);
			await storage.setSetting('memory.windowSize', memoryWindowSize);
			await storage.setSetting('memory.topK', memoryTopK);
			await storage.setSetting('memory.similarityThreshold', memorySimilarityThreshold);
			await storage.setSetting('memory.summarizationProvider', memorySummarizationProvider);
			await storage.setSetting('memory.summarizationModel', memorySummarizationModel);
			await storage.setSetting('memory.summarizationApiKey', memorySummarizationApiKey);
			await storage.setSetting('memory.summarizationEndpoint', memorySummarizationEndpoint);
		} catch (e) {
			console.error('[Manager] Save error:', e);
		}
	}

	// Auto-save fish voice changes
	$effect(() => {
		if (!loaded) return;
		// Read reactive deps
		const _voices = fishSavedVoices;
		const _model = fishModel;
		const _voice = fishVoiceId;
		const _latency = fishLatency;
		const _key = fishApiKey;
		const _memEnabled = memoryEnabled;
		const _memMode = memoryMode;
		const _memMax = memoryMaxContext;
		const _memWin = memoryWindowSize;
		const _memTopK = memoryTopK;
		const _memThresh = memorySimilarityThreshold;
		const _memSumProv = memorySummarizationProvider;
		const _memSumModel = memorySummarizationModel;
		const _memSumKey = memorySummarizationApiKey;
		const _memSumEndpoint = memorySummarizationEndpoint;

		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveToStorage(), 500);
	});
</script>

<svelte:head>
	<title>Waifu Manager | NetHoe</title>
</svelte:head>

<div class="manager-page">
	<header class="manager-header">
		<div class="header-left">
			<h1 class="title">NETHOE</h1>
			<span class="subtitle">// WAIFU MANAGER</span>
		</div>
		<a href="/" class="back-link">&larr; Back to App</a>
	</header>

	{#if !loaded}
		<div class="loading">Loading settings...</div>
	{:else}
		<div class="sections">
			<ApiKeysSection
				bind:providerDefaults
				bind:fishApiKey
				onsave={debouncedSave}
			/>

			<LlmModelsSection
				bind:providerDefaults
				onsave={debouncedSave}
			/>

			<FishVoicesSection
				{fishApiKey}
				bind:fishSavedVoices
				bind:fishModel
				bind:fishVoiceId
				bind:fishLatency
			/>

			<MemorySection
				bind:enabled={memoryEnabled}
				bind:mode={memoryMode}
				bind:maxContext={memoryMaxContext}
				bind:windowSize={memoryWindowSize}
				bind:topK={memoryTopK}
				bind:similarityThreshold={memorySimilarityThreshold}
				bind:summarizationProvider={memorySummarizationProvider}
				bind:summarizationModel={memorySummarizationModel}
				bind:summarizationApiKey={memorySummarizationApiKey}
				bind:summarizationEndpoint={memorySummarizationEndpoint}
			/>

			<ConversationsSection />

			<DataManagementSection />
		</div>
	{/if}
</div>

<style>
	.manager-page {
		min-height: 100vh;
		background: #02040a;
		color: var(--text-main, #e6edf3);
		overflow-y: auto;
	}
	.manager-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24px 32px;
		border-bottom: 1px solid var(--c-border, rgba(56,189,248,0.15));
	}
	.header-left {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	.title {
		font-family: var(--font-tech, 'JetBrains Mono', monospace);
		font-size: 1.3rem;
		font-weight: 600;
		letter-spacing: 0.3em;
		color: var(--c-text-accent, #38bdf8);
		margin: 0;
	}
	.subtitle {
		font-family: var(--font-tech, monospace);
		font-size: 0.7rem;
		color: var(--text-muted, rgba(255,255,255,0.4));
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}
	.back-link {
		font-family: var(--font-tech, monospace);
		font-size: 0.75rem;
		color: var(--c-text-accent, #38bdf8);
		text-decoration: none;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		transition: opacity 0.2s;
	}
	.back-link:hover { opacity: 0.7; }
	.loading {
		padding: 60px;
		text-align: center;
		font-family: var(--font-tech, monospace);
		color: var(--text-muted, rgba(255,255,255,0.4));
	}
	.sections {
		max-width: 700px;
		width: 100%;
		margin: 0 auto;
		padding: 24px 32px 60px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		box-sizing: border-box;
	}
	@media (max-width: 600px) {
		.manager-header { padding: 12px 16px; }
		.sections { padding: 12px 12px 40px; gap: 16px; }
		.header-left { flex-direction: column; gap: 4px; }
		.title { font-size: 1rem; letter-spacing: 0.2em; }
		.subtitle { font-size: 0.6rem; }
	}
</style>
