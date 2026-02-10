<script lang="ts">
	import { getMemoryManager } from '../../memory/manager.js';
	import { getStorageManager } from '../../storage/index.js';

	let {
		enabled = $bindable(false),
		mode = $bindable('hybrid'),
		maxContext = $bindable(20),
		windowSize = $bindable(30),
		topK = $bindable(3),
		similarityThreshold = $bindable(0.5),
		summarizationProvider = $bindable(''),
		summarizationModel = $bindable(''),
		summarizationApiKey = $bindable(''),
		summarizationEndpoint = $bindable('')
	}: {
		enabled: boolean;
		mode: string;
		maxContext: number;
		windowSize: number;
		topK: number;
		similarityThreshold: number;
		summarizationProvider: string;
		summarizationModel: string;
		summarizationApiKey: string;
		summarizationEndpoint: string;
	} = $props();

	const memoryManager = getMemoryManager();
	const storage = getStorageManager();

	let modelLoading = $state(false);
	let modelReady = $state(false);
	let embeddingsCount = $state(0);
	let summariesCount = $state(0);
	let statusMsg = $state('');
	let confirmClearEmbeddings = $state(false);
	let confirmClearSummaries = $state(false);

	const modeDescriptions: Record<string, string> = {
		'auto-prune': 'Keeps the last N messages in context. Older messages are still embedded and searchable, but pruned from the direct context window.',
		'auto-summarize': 'Sliding window of recent messages + LLM-generated summaries of older messages. Requires a summarization LLM to be configured.',
		'hybrid': 'Uses auto-summarize when a summarization LLM is configured, falls back to auto-prune otherwise.'
	};

	let showSummarizationConfig = $derived(mode === 'auto-summarize' || mode === 'hybrid');

	async function loadStats() {
		try {
			const embeddings = await storage.getAllEmbeddings();
			embeddingsCount = embeddings.length;
			const summaries = await storage.getAllSummaries();
			summariesCount = summaries.length;
		} catch { /* storage may not be ready */ }
	}

	async function loadModel() {
		modelLoading = true;
		statusMsg = 'Loading embedding model (~23MB)...';
		try {
			await memoryManager.initEmbeddingModel();
			modelReady = true;
			statusMsg = 'Model loaded!';
		} catch (e: any) {
			statusMsg = 'Failed: ' + e.message;
		} finally {
			modelLoading = false;
		}
	}

	async function unloadModel() {
		try {
			await memoryManager.unloadModel();
			modelReady = false;
			statusMsg = 'Model unloaded';
		} catch (e: any) {
			statusMsg = 'Unload failed: ' + e.message;
		}
	}

	async function clearEmbeddings() {
		await storage.clearEmbeddings();
		embeddingsCount = 0;
		confirmClearEmbeddings = false;
		statusMsg = 'Embeddings cleared';
	}

	async function clearSummaries() {
		await storage.clearSummaries();
		summariesCount = 0;
		confirmClearSummaries = false;
		statusMsg = 'Summaries cleared';
	}

	// Load stats when component mounts
	$effect(() => {
		if (storage.db) loadStats();
	});

	// Sync manager properties when settings change
	$effect(() => {
		memoryManager.enabled = enabled;
		memoryManager.mode = mode as any;
		memoryManager.maxContextMessages = maxContext;
		memoryManager.windowSize = windowSize;
		memoryManager.topK = topK;
		memoryManager.similarityThreshold = similarityThreshold;
		memoryManager.summarizationProvider = summarizationProvider as any;
		memoryManager.summarizationModel = summarizationModel;
		memoryManager.summarizationApiKey = summarizationApiKey;
		memoryManager.summarizationEndpoint = summarizationEndpoint;
	});
</script>

<div class="section-card">
	<h2 class="section-title">Memory System</h2>

	<!-- Enable Toggle -->
	<div class="toggle-row">
		<span>Enable Memory</span>
		<label class="switch">
			<input type="checkbox" bind:checked={enabled} />
			<span class="slider"></span>
		</label>
	</div>

	{#if enabled}
		<!-- Mode Selector -->
		<div class="sub-section">
			<h3 class="sub-title">Memory Mode</h3>
			<select class="select-tech" bind:value={mode}>
				<option value="auto-prune">Auto-Prune</option>
				<option value="auto-summarize">Auto-Summarize</option>
				<option value="hybrid">Hybrid (Recommended)</option>
			</select>
			<p class="mode-desc">{modeDescriptions[mode]}</p>
		</div>

		<!-- Embedding Model -->
		<div class="sub-section">
			<h3 class="sub-title">Embedding Model</h3>
			<div class="model-info">
				<span class="model-name">all-MiniLM-L6-v2</span>
				<span class="model-meta">23MB &middot; 384 dimensions</span>
			</div>
			<div class="model-status">
				{#if modelReady}
					<span class="status-badge ready">Ready</span>
					<button class="btn-small" onclick={unloadModel}>Unload</button>
				{:else if modelLoading}
					<span class="status-badge loading">Loading...</span>
				{:else}
					<span class="status-badge idle">Not Loaded</span>
					<button class="btn-init" onclick={loadModel}>Load Model</button>
				{/if}
			</div>
		</div>

		<!-- Context Settings -->
		<div class="sub-section">
			<h3 class="sub-title">Context Settings</h3>

			<div class="slider-row">
				<div>Max Context Messages: <strong>{maxContext}</strong></div>
				<input type="range" min="5" max="50" step="1" bind:value={maxContext} />
			</div>

			<div class="slider-row">
				<div>Semantic Search Top-K: <strong>{topK}</strong></div>
				<input type="range" min="1" max="10" step="1" bind:value={topK} />
			</div>

			<div class="slider-row">
				<div>Similarity Threshold: <strong>{similarityThreshold.toFixed(2)}</strong></div>
				<input type="range" min="0.1" max="0.9" step="0.05" bind:value={similarityThreshold} />
			</div>
		</div>

		<!-- Auto-Summarize Settings -->
		{#if showSummarizationConfig}
			<div class="sub-section">
				<h3 class="sub-title">Auto-Summarize Config</h3>

				<div class="slider-row">
					<div>Window Size (raw messages): <strong>{windowSize}</strong></div>
					<input type="range" min="10" max="100" step="5" bind:value={windowSize} />
				</div>

				<div class="field-group">
					<div class="field-label">Summarization LLM Provider</div>
					<select class="select-tech" bind:value={summarizationProvider}>
						<option value="">None (disable summarization)</option>
						<option value="ollama">Ollama</option>
						<option value="lmstudio">LM Studio</option>
						<option value="openai">OpenAI</option>
						<option value="openrouter">OpenRouter</option>
					</select>
				</div>

				{#if summarizationProvider}
					<div class="field-group">
						<div class="field-label">Model</div>
						<input type="text" class="input-tech" bind:value={summarizationModel} placeholder="e.g. llama3.2:3b, gpt-4o-mini" />
					</div>

					{#if summarizationProvider === 'openai' || summarizationProvider === 'openrouter'}
						<div class="field-group">
							<div class="field-label">API Key</div>
							<input type="password" class="input-tech" bind:value={summarizationApiKey} placeholder="API key for summarization LLM..." />
						</div>
					{/if}

					{#if summarizationProvider === 'ollama' || summarizationProvider === 'lmstudio'}
						<div class="field-group">
							<div class="field-label">Endpoint</div>
							<input type="text" class="input-tech" bind:value={summarizationEndpoint} placeholder={summarizationProvider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234'} />
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Memory Stats -->
		<div class="sub-section">
			<h3 class="sub-title">Memory Stats</h3>
			<div class="stats-grid">
				<div class="stat">
					<span class="stat-value">{embeddingsCount}</span>
					<span class="stat-label">Embeddings</span>
				</div>
				<div class="stat">
					<span class="stat-value">{summariesCount}</span>
					<span class="stat-label">Summaries</span>
				</div>
			</div>
			<div class="stats-actions">
				{#if !confirmClearEmbeddings}
					<button class="btn-small danger" onclick={() => confirmClearEmbeddings = true} disabled={embeddingsCount === 0}>Clear Embeddings</button>
				{:else}
					<button class="btn-small danger confirm" onclick={clearEmbeddings}>Confirm Clear</button>
					<button class="btn-small" onclick={() => confirmClearEmbeddings = false}>Cancel</button>
				{/if}

				{#if !confirmClearSummaries}
					<button class="btn-small danger" onclick={() => confirmClearSummaries = true} disabled={summariesCount === 0}>Clear Summaries</button>
				{:else}
					<button class="btn-small danger confirm" onclick={clearSummaries}>Confirm Clear</button>
					<button class="btn-small" onclick={() => confirmClearSummaries = false}>Cancel</button>
				{/if}
			</div>
		</div>
	{/if}

	{#if statusMsg}
		<div class="status-msg">{statusMsg}</div>
	{/if}
</div>

<style>
	.section-card {
		background: var(--c-panel, rgba(13,17,23,0.95));
		border: 1px solid var(--c-border);
		padding: 20px;
		overflow: hidden;
	}
	@media (max-width: 500px) { .section-card { padding: 14px; } }
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
	.sub-section {
		margin-bottom: 16px;
		padding-bottom: 16px;
		border-bottom: 1px dashed var(--c-border);
	}
	.sub-section:last-of-type { border-bottom: none; }
	.toggle-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
		margin-bottom: 12px;
		border-bottom: 1px dashed var(--c-border);
		font-size: 0.85rem;
	}
	.switch {
		position: relative;
		width: 40px;
		height: 20px;
		display: inline-block;
	}
	.switch input { opacity: 0; width: 0; height: 0; }
	.slider {
		position: absolute;
		inset: 0;
		background: rgba(255,255,255,0.1);
		border-radius: 10px;
		cursor: pointer;
		transition: background 0.2s;
	}
	.slider::before {
		content: '';
		position: absolute;
		width: 16px;
		height: 16px;
		left: 2px;
		bottom: 2px;
		background: var(--text-main);
		border-radius: 50%;
		transition: transform 0.2s;
	}
	.switch input:checked + .slider { background: var(--c-text-accent); }
	.switch input:checked + .slider::before { transform: translateX(20px); }

	.mode-desc {
		font-size: 0.7rem;
		color: var(--text-muted);
		margin: 6px 0 0;
		line-height: 1.4;
	}
	.model-info {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 8px;
	}
	.model-name {
		font-family: var(--font-tech);
		font-size: 0.8rem;
		color: var(--text-main);
	}
	.model-meta {
		font-size: 0.65rem;
		color: var(--text-muted);
		font-family: var(--font-tech);
	}
	.model-status {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.status-badge {
		font-family: var(--font-tech);
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		padding: 3px 8px;
		border-radius: 2px;
	}
	.status-badge.ready { background: rgba(16,185,129,0.15); color: var(--success); }
	.status-badge.loading { background: rgba(56,189,248,0.15); color: var(--c-text-accent); }
	.status-badge.idle { background: rgba(255,255,255,0.05); color: var(--text-muted); }

	.slider-row {
		margin-bottom: 10px;
	}
	.slider-row > div {
		display: block;
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-bottom: 4px;
	}
	.slider-row strong { color: var(--c-text-accent); }
	.slider-row input[type="range"] {
		width: 100%;
		height: 4px;
		appearance: none;
		background: var(--c-border);
		border-radius: 2px;
		outline: none;
	}
	.slider-row input[type="range"]::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		background: var(--c-text-accent);
		border-radius: 50%;
		cursor: pointer;
	}

	.field-group {
		margin-bottom: 8px;
	}
	.field-label {
		display: block;
		font-size: 0.65rem;
		color: var(--text-muted);
		font-family: var(--font-tech);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 4px;
	}
	.input-tech {
		width: 100%;
		min-width: 0;
		background: rgba(0,0,0,0.4);
		border: 1px solid var(--c-border);
		color: var(--text-main);
		padding: 8px 10px;
		font-size: 0.8rem;
		font-family: var(--font-ui);
		transition: border-color 0.2s;
	}
	.input-tech:focus { outline: none; border-color: var(--c-text-accent); }
	.select-tech {
		width: 100%;
		background: rgba(0,0,0,0.4);
		border: 1px solid var(--c-border);
		color: var(--text-main);
		padding: 8px 10px;
		font-size: 0.8rem;
		font-family: var(--font-ui);
		cursor: pointer;
	}
	.select-tech option { background: #0d1117; }

	.stats-grid {
		display: flex;
		gap: 16px;
		margin-bottom: 12px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px 16px;
		background: rgba(0,0,0,0.3);
		border: 1px solid var(--c-border);
		min-width: 80px;
	}
	.stat-value {
		font-family: var(--font-tech);
		font-size: 1.2rem;
		color: var(--c-text-accent);
	}
	.stat-label {
		font-size: 0.6rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.stats-actions {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

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
	.btn-small {
		padding: 4px 10px;
		background: transparent;
		border: 1px solid var(--c-border);
		color: var(--text-muted);
		font-family: var(--font-tech);
		font-size: 0.6rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-small:hover { border-color: var(--c-text-accent); color: var(--c-text-accent); }
	.btn-small.danger:hover { border-color: rgba(255,80,80,0.8); color: rgba(255,80,80,1); }
	.btn-small.danger.confirm { border-color: rgba(255,80,80,0.8); color: rgba(255,80,80,1); background: rgba(255,80,80,0.1); }
	.btn-small:disabled { opacity: 0.3; cursor: not-allowed; }

	.status-msg {
		margin-top: 12px;
		font-size: 0.7rem;
		font-family: var(--font-tech);
		color: var(--text-muted);
		padding: 6px 10px;
		background: rgba(0,0,0,0.3);
		border-left: 2px solid var(--c-text-accent);
	}
</style>
