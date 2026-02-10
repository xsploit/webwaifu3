<script lang="ts">
	import { getSequencerState, getVrmState } from '../../stores/app.svelte.js';

	const seq = getSequencerState();
	const vrm = getVrmState();
	let animFileInput: HTMLInputElement;

	function toggleEnabled(index: number) {
		const item = seq.playlist[index];
		item.enabled = !item.enabled;
		seq.playlist = [...seq.playlist];
	}

	function playOne(index: number) {
		const entry = seq.playlist[index];
		window.dispatchEvent(new CustomEvent('webwaifu3:sequencer-play-one', { detail: { url: entry.url, index } }));
	}

	function toggleAutoPlay() {
		if (seq.playing) {
			window.dispatchEvent(new CustomEvent('webwaifu3:sequencer-stop'));
		} else {
			window.dispatchEvent(new CustomEvent('webwaifu3:sequencer-start'));
		}
	}

	function enableAllStandard() {
		seq.playlist = seq.playlist.map(a => ({ ...a, enabled: a.experimental ? a.enabled : true }));
	}

	function disableAll() {
		seq.playlist = seq.playlist.map(a => ({ ...a, enabled: false }));
	}

	function handleAnimFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const url = URL.createObjectURL(file);
		const name = file.name.replace(/\.(fbx|glb|gltf)$/i, '');
		seq.playlist = [...seq.playlist, {
			id: 'custom-' + Date.now(),
			name,
			url,
			enabled: true,
			experimental: false
		}];
	}
</script>

<!-- Controls -->
<div class="controls">
	<button class="btn-tech" class:active={seq.playing} onclick={toggleAutoPlay}>
		{seq.playing ? '[ STOP ]' : '[ AUTO-PLAY ]'}
	</button>

	<div class="control-row">
		<button class="btn-sm" class:on={seq.loop} onclick={() => seq.loop = !seq.loop}>Loop</button>
		<button class="btn-sm" class:on={seq.shuffle} onclick={() => seq.shuffle = !seq.shuffle}>Shuffle</button>
	</div>

	<div class="slider-row">
		<span>Speed</span>
		<input type="range" min="0.1" max="3.0" step="0.1" bind:value={seq.speed} />
		<span class="val">{seq.speed.toFixed(1)}x</span>
	</div>

	<div class="slider-row">
		<span>Duration</span>
		<input type="range" min="3" max="60" step="1" bind:value={seq.duration} />
		<span class="val">{seq.duration}s</span>
	</div>
</div>

<!-- Batch actions -->
<div class="batch-row">
	<button class="btn-xs" onclick={enableAllStandard}>Enable Standard</button>
	<button class="btn-xs" onclick={disableAll}>Disable All</button>
	<button class="btn-xs" onclick={() => animFileInput.click()}>+ Import FBX</button>
	<input bind:this={animFileInput} type="file" accept=".fbx,.glb,.gltf" style="display:none" onchange={handleAnimFile} />
</div>

<!-- Playlist -->
<div class="playlist">
	{#each seq.playlist as entry, i}
		<div
			class="row"
			class:active={seq.currentIndex === i}
			class:disabled={!entry.enabled}
		>
			<label class="check">
				<input type="checkbox" checked={entry.enabled} onchange={() => toggleEnabled(i)} />
			</label>
			<span class="name">
				{entry.name}
				{#if entry.experimental}<span class="badge">EXP</span>{/if}
			</span>
			<button class="play-btn" onclick={() => playOne(i)} title="Play">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
			</button>
		</div>
	{/each}
</div>

<style>
	.controls {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 10px;
	}
	.btn-tech {
		width: 100%;
		padding: 10px;
		background: transparent;
		border: 1px solid var(--c-text-accent);
		color: var(--c-text-accent);
		font-family: var(--font-tech);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-tech:hover, .btn-tech.active {
		background: var(--c-text-accent);
		color: #000;
	}
	.control-row {
		display: flex;
		gap: 6px;
	}
	.btn-sm {
		flex: 1;
		padding: 6px 8px;
		background: transparent;
		border: 1px solid var(--c-border);
		color: var(--text-muted);
		font-family: var(--font-tech);
		font-size: 0.7rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-sm:hover { border-color: var(--c-text-accent); color: var(--text-main); }
	.btn-sm.on {
		border-color: var(--c-text-accent);
		color: var(--c-text-accent);
		background: rgba(56,189,248,0.1);
	}
	.slider-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.8rem;
	}
	.slider-row span { min-width: 52px; color: var(--text-muted); font-family: var(--font-tech); font-size: 0.7rem; }
	.slider-row .val { min-width: 32px; text-align: right; color: var(--c-text-accent); }
	input[type='range'] { flex: 1; appearance: none; background: transparent; }
	input[type='range']::-webkit-slider-runnable-track { width: 100%; height: 2px; background: var(--c-border); }
	input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; height: 12px; width: 6px; background: var(--c-text-accent); margin-top: -5px; cursor: pointer; box-shadow: 0 0 10px var(--c-text-accent); }

	.batch-row {
		display: flex;
		gap: 4px;
		margin-bottom: 8px;
	}
	.btn-xs {
		flex: 1;
		padding: 4px 6px;
		background: transparent;
		border: 1px solid var(--c-border);
		color: var(--text-dim);
		font-family: var(--font-tech);
		font-size: 0.6rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-xs:hover { border-color: var(--text-muted); color: var(--text-muted); }

	.playlist {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 340px;
		overflow-y: auto;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 6px;
		border: 1px solid transparent;
		border-radius: 2px;
		transition: all 0.15s;
	}
	.row:hover { background: rgba(56,189,248,0.04); }
	.row.active {
		border-color: var(--c-text-accent);
		background: rgba(56,189,248,0.08);
	}
	.row.disabled { opacity: 0.4; }
	.check { display: flex; align-items: center; }
	.check input[type="checkbox"] {
		accent-color: var(--c-text-accent);
		width: 14px;
		height: 14px;
		cursor: pointer;
	}
	.name {
		flex: 1;
		font-size: 0.78rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.badge {
		display: inline-block;
		font-size: 0.55rem;
		padding: 1px 4px;
		margin-left: 4px;
		border: 1px solid var(--danger);
		color: var(--danger);
		font-family: var(--font-tech);
		text-transform: uppercase;
		vertical-align: middle;
	}
	.play-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 2px 4px;
		transition: color 0.15s;
	}
	.play-btn:hover { color: var(--c-text-accent); }
</style>


