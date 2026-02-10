<script lang="ts">
	import Toggle from '../ui/Toggle.svelte';
	import Slider from '../ui/Slider.svelte';
	import { getVrmState, getVrmVisuals, toast } from '../../stores/app.svelte.js';
	import { setRealisticMode } from '../../vrm/loader.js';

	const vrm = getVrmState();
	const vis = getVrmVisuals();

	let vrmFileInput: HTMLInputElement;

	function handleVrmFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) {
			const url = URL.createObjectURL(file);
			file.arrayBuffer().then(data => {
				window.dispatchEvent(new CustomEvent('nethoe:load-vrm', { detail: { url, fileData: data } }));
			});
		}
	}

	function loadSample() {
		window.dispatchEvent(new CustomEvent('nethoe:load-vrm', { detail: { url: '/assets/hikkyc2.vrm' } }));
	}

	function toggleRealistic(checked: boolean) {
		vrm.realisticMode = checked;
		if (vrm.vrm) setRealisticMode(vrm.vrm.scene, null, checked);
	}

	function togglePass(name: string, checked: boolean) {
		window.dispatchEvent(new CustomEvent('nethoe:toggle-pass', { detail: { name, enabled: checked } }));
	}

	function updatePassUniform(name: string, uniform: string, value: number) {
		window.dispatchEvent(new CustomEvent('nethoe:pass-uniform', { detail: { name, uniform, value } }));
	}
</script>

<div class="control-group">
	<div class="control-label">Avatar Source</div>
	<div class="file-drop-area" role="button" tabindex="0" onclick={() => vrmFileInput.click()} onkeydown={(e) => e.key === 'Enter' && vrmFileInput.click()}>
		[ LOAD .VRM FILE ]
		<input bind:this={vrmFileInput} type="file" accept=".vrm" style="display:none" onchange={handleVrmFile} />
	</div>
	<button class="btn-tech secondary" onclick={loadSample}>Load Sample Data</button>
</div>

<div class="control-group">
	<div class="control-label">Rendering Protocols</div>
	<div class="toggle-row">
		<span>PBR Realism</span>
		<Toggle bind:checked={vrm.realisticMode} onchange={toggleRealistic} />
	</div>
	<div class="toggle-row">
		<span>Auto-Rotation</span>
		<Toggle bind:checked={vrm.autoRotate} />
	</div>
</div>

<div class="control-group">
	<div class="control-label">Post-Processing FX</div>
	<div class="toggle-row"><span>Anime Outlines</span><Toggle bind:checked={vis.outline} onchange={(c) => { vrm.useOutlineEffect = c; }} /></div>
	<div class="toggle-row"><span>Bloom</span><Toggle bind:checked={vis.bloom} onchange={(c) => togglePass('bloom', c)} /></div>
	<div class="toggle-row"><span>Chromatic Aberration</span><Toggle bind:checked={vis.chroma} onchange={(c) => togglePass('chromatic', c)} /></div>
	<div class="toggle-row"><span>Film Grain</span><Toggle bind:checked={vis.grain} onchange={(c) => togglePass('grain', c)} /></div>
	<div class="toggle-row"><span>Glitch Effect</span><Toggle bind:checked={vis.glitch} onchange={(c) => togglePass('glitch', c)} /></div>
	<div class="toggle-row"><span>Anti-Aliasing (FXAA)</span><Toggle bind:checked={vis.fxaa} onchange={(c) => togglePass('fxaa', c)} /></div>
	<div class="toggle-row"><span>SMAA (Better Quality)</span><Toggle bind:checked={vis.smaa} onchange={(c) => togglePass('smaa', c)} /></div>
	<div class="toggle-row"><span>TAA (Best for Motion)</span><Toggle bind:checked={vis.taa} onchange={(c) => togglePass('taa', c)} /></div>
	<Slider label="TAA Quality" bind:value={vis.taaSampleLevel} min={0} max={5} step={1} oninput={(v) => updatePassUniform('taa', 'sampleLevel', v)} />
</div>

<div class="control-group">
	<div class="control-label">Animation Quality</div>
	<Slider label="Crossfade Duration" bind:value={vrm.crossfadeDuration} min={0.1} max={3.0} step={0.1} />
</div>

<div class="control-group">
	<div class="control-label">Film Look (Perry-Smith)</div>
	<div class="toggle-row"><span>Bleach Bypass</span><Toggle bind:checked={vis.bleach} onchange={(c) => togglePass('bleach', c)} /></div>
	<Slider label="Intensity" bind:value={vis.bleachOpacity} min={0} max={1} step={0.05} oninput={(v) => updatePassUniform('bleach', 'opacity', v)} />
	<div class="toggle-row"><span>Color Correction</span><Toggle bind:checked={vis.colorCorr} onchange={(c) => togglePass('colorCorrection', c)} /></div>
	<Slider label="Red Power" bind:value={vis.colorPowR} min={1} max={2} step={0.05} oninput={(v) => updatePassUniform('colorCorrection', 'powR', v)} />
	<Slider label="Green Power" bind:value={vis.colorPowG} min={1} max={2} step={0.05} oninput={(v) => updatePassUniform('colorCorrection', 'powG', v)} />
	<Slider label="Blue Power" bind:value={vis.colorPowB} min={1} max={2} step={0.05} oninput={(v) => updatePassUniform('colorCorrection', 'powB', v)} />
</div>

<div class="control-group">
	<div class="control-label">Shader Controls</div>
	<Slider label="Bloom Strength" bind:value={vis.bloomStrength} min={0} max={2} step={0.1} oninput={(v) => updatePassUniform('bloom', 'strength', v)} />
	<Slider label="Bloom Radius" bind:value={vis.bloomRadius} min={0} max={1} step={0.1} oninput={(v) => updatePassUniform('bloom', 'radius', v)} />
	<Slider label="Bloom Threshold" bind:value={vis.bloomThreshold} min={0} max={1} step={0.05} oninput={(v) => updatePassUniform('bloom', 'threshold', v)} />
	<Slider label="Chroma Amount" bind:value={vis.chromaAmount} min={0} max={0.01} step={0.0001} oninput={(v) => updatePassUniform('chromatic', 'amount', v)} />
	<Slider label="Chroma Angle" bind:value={vis.chromaAngle} min={0} max={6.28} step={0.1} oninput={(v) => updatePassUniform('chromatic', 'angle', v)} />
	<Slider label="Grain Amount" bind:value={vis.grainAmount} min={0} max={0.2} step={0.01} oninput={(v) => updatePassUniform('grain', 'grainAmount', v)} />
	<Slider label="Vignette Amount" bind:value={vis.vignetteAmount} min={0} max={1} step={0.05} oninput={(v) => updatePassUniform('grain', 'vignetteAmount', v)} />
	<Slider label="Vignette Hard" bind:value={vis.vignetteHardness} min={0} max={2} step={0.1} oninput={(v) => updatePassUniform('grain', 'vignetteHardness', v)} />
</div>

<div class="control-group">
	<div class="control-label">Lighting Controls</div>
	<Slider label="Key Light" bind:value={vis.keyLight} min={0} max={3} step={0.1} oninput={(v) => window.dispatchEvent(new CustomEvent('nethoe:light', { detail: { light: 'key', value: v } }))} />
	<Slider label="Fill Light" bind:value={vis.fillLight} min={0} max={2} step={0.1} oninput={(v) => window.dispatchEvent(new CustomEvent('nethoe:light', { detail: { light: 'fill', value: v } }))} />
	<Slider label="Rim Light" bind:value={vis.rimLight} min={0} max={2} step={0.05} oninput={(v) => window.dispatchEvent(new CustomEvent('nethoe:light', { detail: { light: 'rim', value: v } }))} />
	<Slider label="Hemi Light" bind:value={vis.hemiLight} min={0} max={2} step={0.05} oninput={(v) => window.dispatchEvent(new CustomEvent('nethoe:light', { detail: { light: 'hemi', value: v } }))} />
	<Slider label="Ambient Light" bind:value={vis.ambientLight} min={0} max={2} step={0.05} oninput={(v) => window.dispatchEvent(new CustomEvent('nethoe:light', { detail: { light: 'ambient', value: v } }))} />
</div>

<style>
	.control-group { display: flex; flex-direction: column; gap: 8px; }
	.control-label { font-size: 0.7rem; color: var(--c-text-accent); font-family: var(--font-tech); text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }
	.toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--c-border); }
	.toggle-row:last-child { border-bottom: none; }
	.toggle-row span { font-size: 0.9rem; }
	.file-drop-area { border: 1px dashed var(--c-border); background: rgba(56,189,248,0.02); padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.8rem; cursor: pointer; transition: all 0.2s; clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%); }
	.file-drop-area:hover { border-color: var(--c-text-accent); color: var(--text-main); }
	.btn-tech { width: 100%; padding: 10px; background: transparent; border: 1px solid var(--c-text-accent); color: var(--c-text-accent); font-family: var(--font-tech); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; transition: all 0.2s; }
	.btn-tech:hover { background: var(--c-text-accent); color: #000; box-shadow: 0 0 15px rgba(56,189,248,0.4); }
	.btn-tech.secondary { border-color: var(--c-border); color: var(--text-muted); }
	.btn-tech.secondary:hover { border-color: var(--text-main); color: var(--text-main); background: transparent; }
</style>
