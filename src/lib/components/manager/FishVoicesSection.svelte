<script lang="ts">
	let {
		fishApiKey,
		fishSavedVoices = $bindable(),
		fishModel = $bindable('s1'),
		fishVoiceId = $bindable(''),
		fishLatency = $bindable('balanced')
	}: {
		fishApiKey: string;
		fishSavedVoices: { id: string; name: string }[];
		fishModel: string;
		fishVoiceId: string;
		fishLatency: string;
	} = $props();

	let myModels = $state<{ id: string; name: string; state?: string }[]>([]);
	let loadingModels = $state(false);
	let searchQuery = $state('');
	let searchResults = $state<{ id: string; name: string; author?: string }[]>([]);
	let searching = $state(false);
	let voiceName = $state('');
	let creating = $state(false);
	let fileInput = $state<HTMLInputElement>(null!);
	let statusMsg = $state('');

	async function loadMyModels() {
		if (!fishApiKey) { statusMsg = 'Enter Fish Audio API key first'; return; }
		loadingModels = true;
		statusMsg = '';
		try {
			const res = await fetch('/api/tts/fish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'list-models', apiKey: fishApiKey })
			});
			const data = await res.json();
			myModels = data.items || [];
			statusMsg = myModels.length > 0 ? `${myModels.length} models loaded` : 'No models found';
		} catch (e: any) {
			statusMsg = 'Failed: ' + e.message;
		} finally {
			loadingModels = false;
		}
	}

	async function searchPublic() {
		if (!fishApiKey || !searchQuery.trim()) return;
		searching = true;
		try {
			const res = await fetch('/api/tts/fish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'search-models', apiKey: fishApiKey, query: searchQuery.trim() })
			});
			const data = await res.json();
			searchResults = data.items || [];
			if (searchResults.length === 0) statusMsg = 'No results found';
		} catch (e: any) {
			statusMsg = 'Search failed: ' + e.message;
		} finally {
			searching = false;
		}
	}

	async function createVoice() {
		if (!fishApiKey) { statusMsg = 'Enter Fish Audio API key first'; return; }
		const file = fileInput?.files?.[0];
		if (!file) { statusMsg = 'Select an audio file'; return; }
		if (!voiceName.trim()) { statusMsg = 'Enter a voice name'; return; }
		creating = true;
		statusMsg = '';
		try {
			const formData = new FormData();
			formData.append('apiKey', fishApiKey);
			formData.append('title', voiceName.trim());
			formData.append('voice', file);
			const res = await fetch('/api/tts/fish', { method: 'POST', body: formData });
			const data = await res.json();
			if (!res.ok) {
				statusMsg = 'Create failed: ' + (data.error || 'Unknown error');
			} else {
				// Auto-save to fishSavedVoices
				const newVoice = { id: data.id, name: voiceName.trim() };
				fishSavedVoices = [...fishSavedVoices, newVoice];
				fishVoiceId = data.id;
				voiceName = '';
				statusMsg = 'Voice created! ID: ' + data.id;
				loadMyModels();
			}
		} catch (e: any) {
			statusMsg = 'Create error: ' + e.message;
		} finally {
			creating = false;
		}
	}

	async function deleteModel(id: string) {
		if (!fishApiKey) return;
		try {
			await fetch('/api/tts/fish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'delete-model', apiKey: fishApiKey, modelId: id })
			});
			myModels = myModels.filter(m => m.id !== id);
			fishSavedVoices = fishSavedVoices.filter(v => v.id !== id);
			if (fishVoiceId === id) fishVoiceId = '';
			statusMsg = 'Model deleted';
		} catch (e: any) {
			statusMsg = 'Delete failed: ' + e.message;
		}
	}

	function selectVoice(id: string) {
		fishVoiceId = id;
	}

	function saveToQuickList(id: string, name: string) {
		if (fishSavedVoices.some(v => v.id === id)) return;
		fishSavedVoices = [...fishSavedVoices, { id, name }];
	}

	function removeFromSaved(id: string) {
		fishSavedVoices = fishSavedVoices.filter(v => v.id !== id);
	}
</script>

<div class="section-card">
	<h2 class="section-title">Fish Audio Voices</h2>

	{#if !fishApiKey}
		<p class="hint">Configure your Fish Audio API key above to manage voices.</p>
	{:else}
		<!-- My Models -->
		<div class="sub-section">
			<div class="row">
				<h3 class="sub-title">Your Models</h3>
				<button class="btn-init" onclick={loadMyModels} disabled={loadingModels}>
					{loadingModels ? 'Loading...' : 'Load My Models'}
				</button>
			</div>
			{#if myModels.length > 0}
				<div class="voice-list">
					{#each myModels as model}
						<div class="voice-row" class:active={fishVoiceId === model.id}>
							<div class="voice-info">
								<span class="voice-name">{model.name}</span>
								{#if model.state}
									<span class="voice-state">{model.state}</span>
								{/if}
							</div>
							<div class="voice-actions">
								<button class="btn-small" onclick={() => selectVoice(model.id)}>Select</button>
								<button class="btn-small" onclick={() => saveToQuickList(model.id, model.name)}>Save</button>
								<button class="btn-small danger" onclick={() => deleteModel(model.id)}>Del</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Saved Voices -->
		{#if fishSavedVoices.length > 0}
			<div class="sub-section">
				<h3 class="sub-title">Saved Voices</h3>
				<div class="voice-list">
					{#each fishSavedVoices as voice}
						<div class="voice-row" class:active={fishVoiceId === voice.id}>
							<div class="voice-info">
								<span class="voice-name">{voice.name}</span>
								<span class="voice-id">{voice.id.slice(0, 12)}...</span>
							</div>
							<div class="voice-actions">
								<button class="btn-small" onclick={() => selectVoice(voice.id)}>Select</button>
								<button class="btn-small danger" onclick={() => removeFromSaved(voice.id)}>Remove</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Create New Voice -->
		<div class="sub-section">
			<h3 class="sub-title">Create New Voice</h3>
			<input type="text" class="input-tech" bind:value={voiceName} placeholder="Voice name..." />
			<div class="row" style="margin-top:8px">
				<input type="file" accept="audio/*" bind:this={fileInput} onchange={createVoice} style="display:none" />
				<button class="btn-tech" onclick={() => { if (!voiceName.trim()) { statusMsg = 'Enter a voice name first'; return; } fileInput.click(); }} disabled={creating}>
					{creating ? 'Creating...' : 'Choose Audio + Create'}
				</button>
			</div>
			<small class="hint">Upload a .wav/.mp3 sample to train a custom Fish Audio voice</small>
		</div>

		<!-- Search Public -->
		<div class="sub-section">
			<h3 class="sub-title">Search Public Models</h3>
			<div class="row">
				<input type="text" class="input-tech" style="flex:1" bind:value={searchQuery} placeholder="Search voices..." onkeydown={(e) => e.key === 'Enter' && searchPublic()} />
				<button class="btn-init" onclick={searchPublic} disabled={searching}>
					{searching ? '...' : 'Search'}
				</button>
			</div>
			{#if searchResults.length > 0}
				<div class="voice-list">
					{#each searchResults as model}
						<div class="voice-row" class:active={fishVoiceId === model.id}>
							<div class="voice-info">
								<span class="voice-name">{model.name}</span>
								{#if model.author}
									<span class="voice-id">by {model.author}</span>
								{/if}
							</div>
							<div class="voice-actions">
								<button class="btn-small" onclick={() => selectVoice(model.id)}>Select</button>
								<button class="btn-small" onclick={() => saveToQuickList(model.id, model.name)}>Save</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Engine Model -->
		<div class="sub-section">
			<h3 class="sub-title">Engine Model</h3>
			<select class="select-tech" onchange={(e) => fishModel = (e.target as HTMLSelectElement).value}>
				{#each ['s1', 'speech-1.5', 'speech-1.6'] as m}
					<option value={m} selected={fishModel === m}>{m}</option>
				{/each}
			</select>
		</div>

		<!-- Latency -->
		<div class="sub-section">
			<h3 class="sub-title">Latency Mode</h3>
			<select class="select-tech" onchange={(e) => fishLatency = (e.target as HTMLSelectElement).value}>
				<option value="balanced" selected={fishLatency === 'balanced'}>Balanced</option>
				<option value="normal" selected={fishLatency === 'normal'}>Normal</option>
			</select>
			<small class="hint">Balanced = faster first response; Normal = higher quality</small>
		</div>

		<!-- Voice / Reference ID -->
		<div class="sub-section">
			<h3 class="sub-title">Selected Voice ID</h3>
			<input type="text" class="input-tech" bind:value={fishVoiceId} placeholder="Voice reference ID (or select above)" />
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
		margin: 0;
	}
	.sub-section {
		margin-bottom: 16px;
		padding-bottom: 16px;
		border-bottom: 1px dashed var(--c-border);
	}
	.sub-section:last-of-type { border-bottom: none; }
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
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
	.btn-tech {
		width: 100%;
		padding: 10px;
		background: transparent;
		border: 1px solid var(--c-text-accent);
		color: var(--c-text-accent);
		font-family: var(--font-tech);
		font-size: 0.75rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-tech:hover { background: var(--c-text-accent); color: #000; }
	.btn-tech:disabled { opacity: 0.4; cursor: not-allowed; }
	.voice-list {
		margin-top: 8px;
		border: 1px solid var(--c-border);
		max-height: 250px;
		overflow-y: auto;
	}
	.voice-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid rgba(255,255,255,0.03);
		transition: background 0.15s;
	}
	.voice-row:hover { background: rgba(56,189,248,0.03); }
	.voice-row.active { background: rgba(56,189,248,0.08); border-left: 2px solid var(--c-text-accent); }
	.voice-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
	.voice-name { font-size: 0.8rem; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; }
	.voice-id { font-size: 0.65rem; color: var(--text-muted); font-family: var(--font-tech); }
	.voice-state { font-size: 0.6rem; color: var(--c-text-accent); font-family: var(--font-tech); text-transform: uppercase; }
	.voice-actions { display: flex; gap: 4px; }
	.btn-small {
		padding: 3px 8px;
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
	.hint { color: var(--text-muted); font-size: 0.7rem; display: block; margin-top: 4px; }
	.status-msg {
		margin-top: 12px;
		font-size: 0.7rem;
		font-family: var(--font-tech);
		color: var(--text-muted);
		padding: 6px 10px;
		background: rgba(0,0,0,0.3);
		border-left: 2px solid var(--c-text-accent);
	}
	@media (max-width: 500px) {
		.voice-row { flex-direction: column; align-items: flex-start; gap: 6px; }
		.voice-actions { width: 100%; justify-content: flex-start; }
	}
</style>
