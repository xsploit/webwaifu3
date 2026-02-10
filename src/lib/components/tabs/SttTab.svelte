<script lang="ts">
	import { getSttState, toast, addLog } from '../../stores/app.svelte.js';
	import { getSttRecorder } from '../../stt/recorder.js';

	const stt = getSttState();
	const recorder = getSttRecorder();

	async function preloadModel() {
		if (stt.modelReady || stt.modelLoading) return;
		stt.modelLoading = true;
		try {
			recorder.onModelReady = () => {
				stt.modelLoading = false;
				stt.modelReady = true;
				toast('Whisper model ready');
				addLog('Whisper model pre-loaded', 'info');
			};
			recorder.onModelError = (err) => {
				stt.modelLoading = false;
				toast('Model failed: ' + err);
			};
			await recorder.initialize();
		} catch (e: any) {
			stt.modelLoading = false;
			toast('Failed: ' + e.message);
		}
	}
</script>

<div class="control-group">
	<div class="control-label">Speech-to-Text</div>

	<div class="toggle-row">
		<span>Enable STT</span>
		<label class="switch">
			<input type="checkbox" bind:checked={stt.enabled} />
			<span class="sw-slider"></span>
		</label>
	</div>

	<div class="toggle-row">
		<span>Auto-Send</span>
		<label class="switch">
			<input type="checkbox" bind:checked={stt.autoSend} />
			<span class="sw-slider"></span>
		</label>
	</div>
</div>

<div class="control-group">
	<div class="control-label">Whisper Model</div>

	<div class="status-row">
		<span class="status-dot" class:ready={stt.modelReady} class:loading={stt.modelLoading}></span>
		<span class="status-text">
			{#if stt.modelReady}
				Model Ready
			{:else if stt.modelLoading}
				Loading model...
			{:else}
				Not loaded
			{/if}
		</span>
	</div>

	<button
		class="btn-tech"
		onclick={preloadModel}
		disabled={stt.modelReady || stt.modelLoading}
	>
		{stt.modelLoading ? 'Loading...' : stt.modelReady ? 'Loaded' : 'Pre-load Model'}
	</button>

	<p class="hint">Model downloads ~40MB on first use. Pre-loading avoids delay on first mic click.</p>
</div>

<style>
	.control-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
	.control-label { font-size: 0.7rem; color: var(--c-text-accent); font-family: var(--font-tech); text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }
	.toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--c-border); }
	.toggle-row span { font-size: 0.9rem; }
	.switch { position: relative; display: inline-block; width: 32px; height: 18px; }
	.switch input { opacity: 0; width: 0; height: 0; }
	.sw-slider { position: absolute; cursor: pointer; inset: 0; background-color: #1f2937; transition: 0.2s; clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px); }
	.sw-slider:before { position: absolute; content: ''; height: 10px; width: 10px; left: 4px; bottom: 4px; background-color: var(--text-muted); transition: 0.2s; }
	input:checked + .sw-slider { background-color: rgba(56,189,248,0.2); border: 1px solid var(--c-text-accent); }
	input:checked + .sw-slider:before { transform: translateX(14px); background-color: var(--c-text-accent); }
	.btn-tech { width: 100%; padding: 10px; background: transparent; border: 1px solid var(--c-text-accent); color: var(--c-text-accent); font-family: var(--font-tech); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; transition: all 0.2s; }
	.btn-tech:hover { background: var(--c-text-accent); color: #000; }
	.btn-tech:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn-tech:disabled:hover { background: transparent; color: var(--c-text-accent); }
	.status-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
	.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim); }
	.status-dot.ready { background: var(--success); box-shadow: 0 0 6px var(--success); }
	.status-dot.loading { background: var(--c-text-accent); animation: pulse 1.5s infinite; }
	.status-text { font-size: 0.8rem; color: var(--text-muted); font-family: var(--font-tech); }
	.hint { font-size: 0.7rem; color: var(--text-dim); margin: 4px 0 0; line-height: 1.4; }
</style>
