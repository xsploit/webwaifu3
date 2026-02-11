<script lang="ts">
	import Toggle from '../ui/Toggle.svelte';
	import { getTtsSettings, toast } from '../../stores/app.svelte.js';
	import { getTtsManager } from '../../tts/manager.js';
	import { KOKORO_VOICES, type KokoroVoice } from '../../tts/kokoro.js';

	const tts = getTtsSettings();
	const ttsManager = getTtsManager();

	let testInput = $state('Hello! I\'m your anime companion.');
	let kokoroInitStatus = $state('');
	type KokoroDtypeSetting = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
	type KokoroDeviceSetting = 'webgpu' | 'wasm' | 'cpu' | 'auto';

	interface VoiceGroup {
		label: string;
		voices: { value: string; name: string }[];
	}

	const kokoroVoices: VoiceGroup[] = [
		{
			label: 'American - Female',
			voices: [
				{ value: 'af_heart', name: 'Heart' },
				{ value: 'af_bella', name: 'Bella' },
				{ value: 'af_nicole', name: 'Nicole' },
				{ value: 'af_jessica', name: 'Jessica' },
				{ value: 'af_sarah', name: 'Sarah' },
				{ value: 'af_nova', name: 'Nova' },
				{ value: 'af_sky', name: 'Sky' },
				{ value: 'af_river', name: 'River' },
				{ value: 'af_alloy', name: 'Alloy' },
				{ value: 'af_aoede', name: 'Aoede' },
				{ value: 'af_kore', name: 'Kore' }
			]
		},
		{
			label: 'American - Male',
			voices: [
				{ value: 'am_adam', name: 'Adam' },
				{ value: 'am_michael', name: 'Michael' },
				{ value: 'am_eric', name: 'Eric' },
				{ value: 'am_liam', name: 'Liam' },
				{ value: 'am_echo', name: 'Echo' },
				{ value: 'am_onyx', name: 'Onyx' },
				{ value: 'am_puck', name: 'Puck' },
				{ value: 'am_fenrir', name: 'Fenrir' },
				{ value: 'am_santa', name: 'Santa' }
			]
		},
		{
			label: 'British - Female',
			voices: [
				{ value: 'bf_emma', name: 'Emma' },
				{ value: 'bf_isabella', name: 'Isabella' },
				{ value: 'bf_alice', name: 'Alice' },
				{ value: 'bf_lily', name: 'Lily' }
			]
		},
		{
			label: 'British - Male',
			voices: [
				{ value: 'bm_george', name: 'George' },
				{ value: 'bm_lewis', name: 'Lewis' },
				{ value: 'bm_daniel', name: 'Daniel' },
				{ value: 'bm_fable', name: 'Fable' }
			]
		}
	];

	const kokoroDtypeOptions: { value: KokoroDtypeSetting; label: string }[] = [
		{ value: 'q4', label: 'q4 (Fastest)' },
		{ value: 'q8', label: 'q8 (Balanced)' },
		{ value: 'q4f16', label: 'q4f16' },
		{ value: 'fp16', label: 'fp16' },
		{ value: 'fp32', label: 'fp32 (Highest precision)' }
	];

	const kokoroDeviceOptions: { value: KokoroDeviceSetting; label: string }[] = [
		{ value: 'webgpu', label: 'WebGPU (Preferred)' },
		{ value: 'wasm', label: 'WASM (CPU Fallback)' },
		{ value: 'cpu', label: 'CPU' },
		{ value: 'auto', label: 'Auto Detect' }
	];

	let showFishKey = $derived(tts.provider === 'fish');
	let showKokoroOptions = $derived(tts.provider === 'kokoro');

	// Fish Audio state
	let fishModels = $state<{ id: string; name: string; author?: string }[]>([]);
	let fishLoading = $state(false);
	let fishCreating = $state(false);
	let fishVoiceInput = $state<HTMLInputElement | null>(null);
	let fishVoiceName = $state('');
	let fishSearchQuery = $state('');
	let fishSearchResults = $state<{ id: string; name: string; author?: string }[]>([]);
	let fishSearching = $state(false);

	// Restore saved Fish voices on init so they show without re-fetching
	if (tts.fishSavedVoices.length > 0) {
		fishModels = tts.fishSavedVoices.map(v => ({ id: v.id, name: v.name }));
	}

	async function loadFishModels() {
		if (!tts.fishApiKey) return toast('Enter Fish Audio API key first (Keys page)');
		fishLoading = true;
		try {
			const res = await fetch('/api/tts/fish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'list-models', apiKey: tts.fishApiKey })
			});
			const data = await res.json();
			fishModels = data.items || [];
			// Persist to store so auto-save picks them up
			tts.fishSavedVoices = fishModels.map((m: any) => ({ id: m.id, name: m.name }));
			if (fishModels.length === 0) toast('No voice models found');
			else toast(`Loaded ${fishModels.length} voice models`);
		} catch (e: any) {
			toast('Failed to load models: ' + e.message);
		} finally {
			fishLoading = false;
		}
	}

	async function searchFishModels() {
		if (!tts.fishApiKey || !fishSearchQuery.trim()) return;
		fishSearching = true;
		try {
			const res = await fetch('/api/tts/fish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'search-models', apiKey: tts.fishApiKey, query: fishSearchQuery.trim() })
			});
			const data = await res.json();
			fishSearchResults = data.items || [];
			if (fishSearchResults.length === 0) toast('No models found');
		} catch (e: any) {
			toast('Search failed: ' + e.message);
		} finally {
			fishSearching = false;
		}
	}

	async function createFishVoice() {
		if (!tts.fishApiKey) return toast('Enter Fish Audio API key first (Keys page)');
		const file = fishVoiceInput?.files?.[0];
		if (!file) return toast('Select an audio file first');
		if (!fishVoiceName.trim()) return toast('Enter a name for the voice');
		fishCreating = true;
		try {
			const formData = new FormData();
			formData.append('apiKey', tts.fishApiKey);
			formData.append('title', fishVoiceName.trim());
			formData.append('voice', file);
			const res = await fetch('/api/tts/fish', { method: 'POST', body: formData });
			const data = await res.json();
			if (!res.ok) {
				toast('Create failed: ' + (data.error || 'Unknown error'));
			} else {
				tts.fishVoiceId = data.id;
				fishVoiceName = '';
				toast('Voice model created! ID: ' + data.id);
				loadFishModels();
			}
		} catch (e: any) {
			toast('Create error: ' + e.message);
		} finally {
			fishCreating = false;
		}
	}

	function selectFishModel(id: string) {
		tts.fishVoiceId = id;
		toast('Voice selected: ' + id.slice(0, 12) + '...');
	}

	function onProviderChange(e: Event) {
		const newProvider = (e.target as HTMLSelectElement).value as 'fish' | 'kokoro';
		tts.provider = newProvider;
	}

	function onVoiceChange(e: Event) {
		tts.kokoroVoice = (e.target as HTMLSelectElement).value;
	}

	function resolveKokoroDevice(device: KokoroDeviceSetting): 'webgpu' | 'wasm' | 'cpu' | null {
		return device === 'auto' ? null : device;
	}

	function beginKokoroInit(reinitialize: boolean) {
		if (tts.kokoroLoading) return;
		if (!reinitialize && tts.kokoroReady) return;
		tts.kokoroLoading = true;
		kokoroInitStatus = 'Downloading model (~86MB)...';

		const onStatus = (e: CustomEvent<string>) => {
			kokoroInitStatus = e.detail || 'Ready!';
			if (e.detail === '') {
				tts.kokoroReady = true;
				tts.kokoroLoading = false;
				toast('Kokoro TTS initialized (worker)!');
				window.removeEventListener('kokoro-tts-status', onStatus as EventListener);
			} else if (e.detail?.startsWith('Failed') || e.detail?.startsWith('Worker error')) {
				tts.kokoroLoading = false;
				toast('Kokoro init failed');
				window.removeEventListener('kokoro-tts-status', onStatus as EventListener);
			}
		};
		window.addEventListener('kokoro-tts-status', onStatus as EventListener);

		const options = {
			dtype: tts.kokoroDtype as KokoroDtypeSetting,
			device: resolveKokoroDevice(tts.kokoroDevice as KokoroDeviceSetting)
		};

		if (reinitialize) {
			tts.kokoroReady = false;
			ttsManager.reinitKokoroInWorker(options);
		} else {
			ttsManager.initKokoroInWorker(options);
		}
	}

	function initKokoro() {
		beginKokoroInit(false);
	}

	function reinitKokoro() {
		beginKokoroInit(true);
	}

	async function testVoice() {
		if (!testInput.trim()) return toast('Enter test text');
		try {
			toast('Testing voice...');
			ttsManager.provider = tts.provider;
			if (tts.provider === 'kokoro') {
				if (!tts.kokoroReady && !ttsManager.kokoroReadyInWorker) {
					return toast('Kokoro not initialized - click "Initialize" first');
				}
				ttsManager.kokoroVoice = tts.kokoroVoice as KokoroVoice;
				ttsManager.kokoroDtype = tts.kokoroDtype as KokoroDtypeSetting;
				ttsManager.kokoroDevice = resolveKokoroDevice(tts.kokoroDevice as KokoroDeviceSetting);
			} else if (tts.provider === 'fish') {
				ttsManager.fishApiKey = tts.fishApiKey;
				ttsManager.fishVoiceId = tts.fishVoiceId;
				ttsManager.fishModel = tts.fishModel as any;
			}
			ttsManager.enableTts = true;
			if (!ttsManager.audioContext) await ttsManager.initialize();
			await ttsManager.speak(testInput.trim());
			toast('TTS test complete');
		} catch (e: any) {
			toast('TTS test failed: ' + e.message);
		}
	}

	let statusText = $derived(
		tts.provider === 'fish' ? 'Fish Audio (Cloud API)' :
		tts.provider === 'kokoro' ? (tts.kokoroReady ? 'Kokoro (Local, 28 voices)' : 'Kokoro (Not initialized)') :
		'Unknown'
	);
</script>

<div class="control-group">
	<div class="control-label">TTS Engine</div>
	<select class="select-tech" onchange={onProviderChange}>
		<option value="kokoro" selected={tts.provider === 'kokoro'}>Kokoro (Local/WebGPU)</option>
		<option value="fish" selected={tts.provider === 'fish'}>Fish Audio (Cloud)</option>
	</select>
</div>

{#if showKokoroOptions}
	<div class="control-group">
		<div class="control-label">Kokoro Status</div>
		<div class="kokoro-status">
			{#if tts.kokoroReady}
				<span class="status-ready">Ready</span>
				<button class="btn-init" onclick={reinitKokoro} disabled={tts.kokoroLoading}>Reinitialize</button>
			{:else if tts.kokoroLoading}
				<span class="status-loading">{kokoroInitStatus}</span>
			{:else}
				<button class="btn-init" onclick={initKokoro}>Initialize Kokoro</button>
				<span class="status-hint">Downloads ~86MB model</span>
			{/if}
		</div>
	</div>

	<div class="control-group">
		<div class="control-label">Kokoro Device</div>
		<select class="select-tech" bind:value={tts.kokoroDevice}>
			{#each kokoroDeviceOptions as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	</div>

	<div class="control-group">
		<div class="control-label">Kokoro Precision (DType)</div>
		<select class="select-tech" bind:value={tts.kokoroDtype}>
			{#each kokoroDtypeOptions as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
		<small class="hint">Changes apply on Initialize/Reinitialize and are persisted.</small>
	</div>

	<div class="control-group">
		<div class="control-label">Voice Selection</div>
		<select class="select-tech" onchange={onVoiceChange}>
			{#each kokoroVoices as group}
				<optgroup label={group.label}>
					{#each group.voices as v}
						<option value={v.value} selected={tts.kokoroVoice === v.value}>{v.name}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</div>
{/if}

{#if showFishKey}
	<div class="control-group">
		<div class="control-label">Fish Audio API Key</div>
		<input type="password" class="input-tech" bind:value={tts.fishApiKey} placeholder="Enter Fish Audio API key..." autocomplete="off" data-1p-ignore data-lpignore="true" />
	</div>

	<div class="control-group">
		<div class="control-label">Your Voice Models</div>
		<div class="ref-audio-row">
			<button class="btn-init" onclick={loadFishModels} disabled={fishLoading}>
				{fishLoading ? 'Loading...' : 'Load My Models'}
			</button>
		</div>
		{#if fishModels.length > 0}
			{#each fishModels as model}
				<div class="saved-voice-row">
					<button class="saved-voice-btn" class:active={tts.fishVoiceId === model.id} onclick={() => selectFishModel(model.id)}>
						{model.name}
					</button>
				</div>
			{/each}
		{/if}
	</div>

	<div class="control-group">
		<div class="control-label">Search Public Models</div>
		<div class="ref-audio-row">
			<input type="text" class="input-tech" style="flex:1" bind:value={fishSearchQuery} placeholder="Search voices..." onkeydown={(e) => e.key === 'Enter' && searchFishModels()} />
			<button class="btn-init" onclick={searchFishModels} disabled={fishSearching}>
				{fishSearching ? '...' : 'Search'}
			</button>
		</div>
		{#if fishSearchResults.length > 0}
			{#each fishSearchResults as model}
				<div class="saved-voice-row">
					<button class="saved-voice-btn" class:active={tts.fishVoiceId === model.id} onclick={() => selectFishModel(model.id)}>
						{model.name} {model.author ? `(${model.author})` : ''}
					</button>
				</div>
			{/each}
		{/if}
	</div>

	<div class="control-group">
		<div class="control-label">Create Custom Voice</div>
		<input type="text" class="input-tech" bind:value={fishVoiceName} placeholder="Voice name..." />
		<div class="ref-audio-row">
			<input type="file" accept="audio/*" bind:this={fishVoiceInput} onchange={createFishVoice} style="display:none" />
			<button class="btn-tech" style="flex:1" onclick={() => { if (!fishVoiceName.trim()) { toast('Enter a voice name first'); return; } fishVoiceInput?.click(); }} disabled={fishCreating}>
				{fishCreating ? 'Creating...' : 'Select Audio + Create Voice'}
			</button>
		</div>
		<small class="hint">Upload a .wav/.mp3 sample to train a custom Fish Audio voice</small>
	</div>

	<div class="control-group">
		<div class="control-label">Voice / Reference ID</div>
		<input type="text" class="input-tech" bind:value={tts.fishVoiceId} placeholder="Reference ID (or select from above)" />
	</div>

	<div class="control-group">
		<div class="control-label">Engine Model</div>
		<select class="select-tech" onchange={(e) => tts.fishModel = (e.target as HTMLSelectElement).value}>
			{#each ['s1', 'speech-1.5', 'speech-1.6'] as m}
				<option value={m} selected={tts.fishModel === m}>{m}</option>
			{/each}
		</select>
	</div>
{/if}

<div class="control-group">
	<div class="control-label">Test Input</div>
	<input type="text" class="input-tech" bind:value={testInput} placeholder="Type text to test..." />
</div>

<button class="btn-tech" onclick={testVoice}>Test Voice</button>

<div class="toggle-row" style="margin-top:16px">
	<span>Enable TTS</span>
	<Toggle bind:checked={tts.enabled} />
</div>

<div class="control-group">
	<div class="control-label">Info</div>
	<div class="info-box">
		<strong class="accent">Kokoro:</strong> 28 voices, runs locally via WebGPU/WASM. No server needed!<br>
		<strong class="accent">Fish Audio:</strong> High quality cloud TTS with custom voice cloning. Requires API key.<br>
		<strong class="status">Current:</strong> <span>{statusText}</span>
	</div>
</div>

<style>
	.control-group { display: flex; flex-direction: column; gap: 8px; }
	.control-label { font-size: 0.7rem; color: var(--c-text-accent); font-family: var(--font-tech); text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }
	.input-tech, .select-tech {
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
	.select-tech { cursor: pointer; }
	.select-tech option, .select-tech optgroup { background: #0d1117; }
	.toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--c-border); }
	.toggle-row span { font-size: 0.9rem; }
	.hint { color: var(--text-dim); font-size: 0.7rem; }
	.btn-tech { width: 100%; padding: 10px; background: transparent; border: 1px solid var(--c-text-accent); color: var(--c-text-accent); font-family: var(--font-tech); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; transition: all 0.2s; }
	.btn-tech:hover { background: var(--c-text-accent); color: #000; }
	.info-box {
		background: rgba(56,189,248,0.05);
		border-left: 2px solid var(--c-text-accent);
		padding: 8px;
		font-size: 0.75rem;
		color: var(--text-muted);
		line-height: 1.6;
	}
	.info-box .accent { color: var(--c-text-accent); }
	.info-box .status { color: var(--success); }
	.kokoro-status { display: flex; align-items: center; gap: 10px; }
	.status-ready { color: var(--success); font-size: 0.85rem; }
	.status-loading { color: var(--c-text-accent); font-size: 0.8rem; }
	.status-hint { color: var(--text-muted); font-size: 0.7rem; }
	.btn-init {
		padding: 6px 12px;
		background: var(--c-text-accent);
		border: none;
		color: #000;
		font-family: var(--font-tech);
		font-size: 0.75rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: opacity 0.2s;
	}
	.btn-init:hover { opacity: 0.8; }
	.btn-init:disabled { opacity: 0.4; cursor: not-allowed; }
	.ref-audio-row { display: flex; gap: 8px; align-items: center; }
	.saved-voice-row { display: flex; gap: 4px; align-items: center; }
	.saved-voice-btn {
		flex: 1; padding: 6px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--c-border);
		color: var(--text-main); font-family: var(--font-tech); font-size: 0.75rem; cursor: pointer;
		text-align: left; transition: all 0.2s;
	}
	.saved-voice-btn:hover { border-color: var(--c-text-accent); }
	.saved-voice-btn.active { border-color: var(--c-text-accent); background: rgba(56,189,248,0.1); color: var(--c-text-accent); }
</style>
