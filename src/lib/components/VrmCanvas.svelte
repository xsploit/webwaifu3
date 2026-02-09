<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { VRMUtils } from '@pixiv/three-vrm';
	import { createScene, resizeScene, type SceneRefs } from '../vrm/scene.js';
	import { loadVrm, setRealisticMode } from '../vrm/loader.js';
	import { initPostProcessing, resizePostProcessing, type PostProcessingRefs } from '../vrm/postprocessing.js';
	import { loadMixamoAnimation, crossfadeToAction } from '../vrm/animation.js';
	import { updateLipSync } from '../vrm/lipsync.js';
	import { getVrmState, getSequencerState, toast } from '../stores/app.svelte.js';
	import { getTtsManager } from '../tts/manager.js';

	const vrmState = getVrmState();
	const seqState = getSequencerState();
	const ttsManager = getTtsManager();

	let canvasEl: HTMLCanvasElement;
	let sceneRefs: SceneRefs;
	let ppRefs: PostProcessingRefs;
	const scaleLimits = { min: 0.25, max: 4.0 };

	function hasActivePass(pp: PostProcessingRefs): boolean {
		return pp.bloomPass.enabled || pp.fxaaPass.enabled || pp.smaaPass.enabled ||
			pp.chromaticAberrationPass.enabled || pp.filmGrainPass.enabled ||
			pp.glitchPass.enabled || pp.outlinePass.enabled ||
			pp.bleachBypassPass.enabled || pp.colorCorrectionPass.enabled;
	}

	export function getSceneRefs() { return sceneRefs; }
	export function getPostProcessingRefs() { return ppRefs; }

	export async function loadVrmFromUrl(url: string) {
		try {
			if (vrmState.vrm) {
				VRMUtils.deepDispose(vrmState.vrm.scene);
				sceneRefs.scene.remove(vrmState.vrm.scene);
				vrmState.vrm = null;
			}
			vrmState.mixer = null;

			const vrm = await loadVrm(url);
			setRealisticMode(vrm.scene, sceneRefs.scene.environment, vrmState.realisticMode);
			sceneRefs.scene.add(vrm.scene);
			vrmState.vrm = vrm;

			// Auto-start animation sequencer on VRM load
			setTimeout(() => {
				if (vrmState.vrm === vrm) {
					window.dispatchEvent(new CustomEvent('nethoe:sequencer-start'));
				}
			}, 500);
		} catch (err: any) {
			console.error(err);
			toast('Failed to load VRM: ' + err.message);
		}
	}

	let _lastNetworkErrorToast = 0;
	export async function loadAnimationFromUrl(url: string, filename?: string) {
		if (!vrmState.vrm) return toast('Load VRM first');
		try {
			const clip = await loadMixamoAnimation(url, vrmState.vrm);
			if (clip) {
				if (!vrmState.mixer) vrmState.mixer = new THREE.AnimationMixer(vrmState.vrm.scene);
				crossfadeToAction(vrmState.mixer.clipAction(clip), vrmState.crossfadeDuration);
			}
		} catch (e: any) {
			const isNetworkError =
				e?.name === 'TypeError' ||
				(e?.message && (
					String(e.message).includes('fetch') ||
					String(e.message).includes('Failed to fetch') ||
					String(e.message).includes('ERR_CONNECTION_REFUSED') ||
					String(e.message).includes('NetworkError')
				));
			if (isNetworkError) {
				const now = Date.now();
				if (now - _lastNetworkErrorToast > 8000) {
					_lastNetworkErrorToast = now;
					toast('Assets unavailable (dev server may have restarted). Refresh the page.');
				}
			} else {
				console.error(e);
				toast('Failed to load animation');
			}
		}
	}

	onMount(() => {
		sceneRefs = createScene(canvasEl);
		ppRefs = initPostProcessing(sceneRefs.renderer, sceneRefs.scene, sceneRefs.camera);

		function animate() {
			requestAnimationFrame(animate);
			const delta = sceneRefs.clock.getDelta();

			if (vrmState.vrm) {
				vrmState.vrm.update(delta);
				updateLipSync(vrmState.vrm, ttsManager);
			}
			if (vrmState.mixer) {
				vrmState.mixer.timeScale = seqState.speed;
				vrmState.mixer.update(delta);
			}

			// Update film grain time only when the pass is actually enabled
			if (ppRefs.filmGrainPass?.enabled && vrmState.postProcessingEnabled) {
				ppRefs.filmGrainPass.uniforms['time'].value = performance.now() * 0.001;
			}

			// Render — bypass composer when no effects are enabled
			if (vrmState.useOutlineEffect && ppRefs.outlineEffect) {
				ppRefs.outlineEffect.render(sceneRefs.scene, sceneRefs.camera);
			} else if (ppRefs.composer && hasActivePass(ppRefs)) {
				ppRefs.composer.render();
			} else {
				sceneRefs.renderer.render(sceneRefs.scene, sceneRefs.camera);
			}
		}

		animate();

		function onResize() {
			resizeScene(sceneRefs);
			resizePostProcessing(ppRefs, sceneRefs.renderer);
		}

		function onWheel(e: WheelEvent) {
			e.preventDefault();
			if (vrmState.vrm) {
				const s = vrmState.vrm.scene.scale;
				const factor = Math.exp(-e.deltaY * 0.0015);
				const newS = THREE.MathUtils.clamp(s.x * factor, scaleLimits.min, scaleLimits.max);
				vrmState.vrm.scene.scale.set(newS, newS, 1.0);
			}
		}

		window.addEventListener('resize', onResize);
		canvasEl.addEventListener('wheel', onWheel, { passive: false });

		return () => {
			window.removeEventListener('resize', onResize);
			canvasEl.removeEventListener('wheel', onWheel);
			// Dispose VRM before renderer
			if (vrmState.vrm) {
				VRMUtils.deepDispose(vrmState.vrm.scene);
				vrmState.vrm = null;
			}
			vrmState.mixer = null;
			ppRefs.composer?.dispose();
			sceneRefs.renderer.dispose();
		};
	});
</script>

<canvas bind:this={canvasEl} id="c"></canvas>

<style>
	#c {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		display: block;
	}
</style>
