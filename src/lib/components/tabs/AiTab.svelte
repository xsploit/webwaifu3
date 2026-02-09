<script lang="ts">
	import Slider from '../ui/Slider.svelte';
	import Toggle from '../ui/Toggle.svelte';
	import { getLlmSettings, getModelList, getCharacterState, toast } from '../../stores/app.svelte.js';
	import { LlmClient, type LlmProvider } from '../../llm/client.js';

	const llm = getLlmSettings();
	const models = getModelList();
	const chars = getCharacterState();

	const providers: { value: LlmProvider; label: string }[] = [
		{ value: 'ollama', label: 'Ollama (Local - FREE!)' },
		{ value: 'lmstudio', label: 'LM Studio (Local - FREE!)' },
		{ value: 'openai', label: 'OpenAI' },
		{ value: 'openrouter', label: 'OpenRouter' }
	];

	let needsApiKey = $derived(llm.provider === 'openai' || llm.provider === 'openrouter');
	let isOllama = $derived(llm.provider === 'ollama');
	let isLocal = $derived(llm.provider === 'ollama' || llm.provider === 'lmstudio');

	async function fetchModels() {
		try {
			toast('Fetching models...');
			const client = new LlmClient();
			client.provider = llm.provider;
			client.model = llm.model;
			client.apiKey = llm.apiKey;
			client.endpoint = llm.endpoint;
			const fetched = await client.fetchModels();
			models.models = fetched;
			if (fetched.length > 0 && !llm.model) {
				llm.model = fetched[0].id;
			}
			toast(`${fetched.length} models loaded`);
		} catch (e: any) {
			toast('Failed to fetch models: ' + e.message);
		}
	}

	function onProviderChange(e: Event) {
		llm.provider = (e.target as HTMLSelectElement).value as LlmProvider;
		models.models = [];
		llm.model = '';
	}
</script>

<div class="control-group">
	<label class="control-label">Provider</label>
	<select class="select-tech" onchange={onProviderChange}>
		{#each providers as p}
			<option value={p.value} selected={llm.provider === p.value}>{p.label}</option>
		{/each}
	</select>
</div>

<div class="control-group">
	<label class="control-label">Model Selection</label>
	<select class="select-tech" onchange={(e) => llm.model = (e.target as HTMLSelectElement).value}>
		{#each models.models as m}
			<option value={m.id} selected={llm.model === m.id}>{m.name}</option>
		{/each}
		{#if models.models.length === 0}
			<option value="">Click Refresh Models</option>
		{/if}
	</select>
	<button class="btn-tech secondary" onclick={fetchModels}>Refresh Models</button>
</div>

{#if needsApiKey}
	<div class="control-group">
		<label class="control-label">API Key</label>
		<input type="password" class="input-tech" bind:value={llm.apiKey} placeholder="Enter API key..." />
	</div>
{/if}

{#if isLocal}
	<div class="control-group">
		<label class="control-label">Endpoint</label>
		<input type="text" class="input-tech" bind:value={llm.endpoint} placeholder={isOllama ? 'http://localhost:11434' : 'http://localhost:1234'} />
	</div>
{/if}

<div class="control-group">
	<label class="control-label">System Prompt (from Character)</label>
	<textarea class="textarea-tech readonly" rows="3" readonly value={chars.current?.systemPrompt ?? ''} placeholder="Select a character in the Char tab..."></textarea>
	<small class="hint">Edit in Char tab</small>
</div>

<div class="control-group">
	<label class="control-label">Generation Params</label>
	<Slider label="Temperature" bind:value={llm.temperature} min={0} max={2} step={0.1} />
	<Slider label="Max Tokens" bind:value={llm.maxTokens} min={100} max={4000} step={100} />
</div>

{#if isOllama}
	<div class="control-group">
		<label class="control-label">Ollama Options</label>
		<Slider label="Context Window (num_ctx)" bind:value={llm.numCtx} min={512} max={131072} step={512} />
		<div class="toggle-row">
			<span>Flash Attention</span>
			<Toggle bind:checked={llm.flashAttn} />
		</div>
		<div class="toggle-row">
			<span>KV Cache Type</span>
			<select class="select-tech small" onchange={(e) => llm.kvCacheType = (e.target as HTMLSelectElement).value}>
				{#each ['f16', 'q8_0', 'q4_0'] as t}
					<option value={t} selected={llm.kvCacheType === t}>{t}</option>
				{/each}
			</select>
		</div>
	</div>
{/if}

<div class="control-group">
	<label class="control-label">Quick Tips</label>
	<div class="info-box">
		<strong class="accent">Ollama (FREE):</strong> Run <code>ollama serve</code>. Set CORS origins to <code>*</code><br>
		<strong class="accent">LM Studio (FREE):</strong> Start local server on port 1234. Enable CORS.<br>
		<strong class="accent">OpenAI:</strong> API key starts with <code>sk-</code><br>
		<strong class="accent">OpenRouter:</strong> API key starts with <code>sk-or-</code> (100+ models!)
	</div>
</div>

<style>
	.control-group { display: flex; flex-direction: column; gap: 8px; }
	.control-label { font-size: 0.7rem; color: var(--c-text-accent); font-family: var(--font-tech); text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }
	.input-tech, .textarea-tech, .select-tech {
		width: 100%;
		background: rgba(0,0,0,0.4);
		border: 1px solid var(--c-border);
		color: var(--text-main);
		padding: 10px;
		font-size: 0.85rem;
		font-family: var(--font-ui);
		transition: border-color 0.2s;
	}
	.input-tech:focus, .select-tech:focus { outline: none; border-color: var(--c-text-accent); }
	.textarea-tech.readonly { background: rgba(0,0,0,0.2); color: var(--text-muted); cursor: not-allowed; resize: none; }
	.select-tech { cursor: pointer; }
	.select-tech option { background: #0d1117; }
	.select-tech.small { width: auto; padding: 4px 8px; font-size: 0.75rem; }
	.toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--c-border); }
	.toggle-row span { font-size: 0.9rem; }
	.hint { color: var(--text-dim); font-size: 0.7rem; }
	.btn-tech { width: 100%; padding: 10px; background: transparent; border: 1px solid var(--c-text-accent); color: var(--c-text-accent); font-family: var(--font-tech); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; transition: all 0.2s; }
	.btn-tech:hover { background: var(--c-text-accent); color: #000; }
	.btn-tech.secondary { border-color: var(--c-border); color: var(--text-muted); }
	.btn-tech.secondary:hover { border-color: var(--text-main); color: var(--text-main); background: transparent; }
	.info-box {
		background: rgba(56,189,248,0.05);
		border-left: 2px solid var(--c-text-accent);
		padding: 8px;
		font-size: 0.75rem;
		color: var(--text-muted);
		line-height: 1.6;
	}
	.info-box .accent { color: var(--c-text-accent); }
	.info-box code { background: rgba(0,0,0,0.3); padding: 2px 4px; font-family: var(--font-tech); font-size: 0.7rem; }
</style>
