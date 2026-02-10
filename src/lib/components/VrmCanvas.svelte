<script lang="ts">
	import { onMount } from 'svelte';
	import { getVrmState, getSequencerState, toast } from '../stores/app.svelte.js';
	import { getTtsManager } from '../tts/manager.js';
	import type { SceneRefs } from '../vrm/scene.js';
	import type { PostProcessingRefs } from '../vrm/postprocessing.js';

	const vrmState = getVrmState();
	const seqState = getSequencerState();
	const ttsManager = getTtsManager();

	let canvasEl: HTMLCanvasElement;
	let sceneRefs: SceneRefs | null = null;
	let ppRefs: PostProcessingRefs | null = null;
	const scaleLimits = { min: 0.25, max: 4.0 };
	let rafId: number | null = null;
	let disposed = false;
	let teardown: (() => void) | null = null;

	type VrmRuntime = {
		THREE: typeof import('three');
		VRMUtils: typeof import('@pixiv/three-vrm').VRMUtils;
		createScene: typeof import('../vrm/scene.js').createScene;
		resizeScene: typeof import('../vrm/scene.js').resizeScene;
		loadVrm: typeof import('../vrm/loader.js').loadVrm;
		setRealisticMode: typeof import('../vrm/loader.js').setRealisticMode;
		initPostProcessing: typeof import('../vrm/postprocessing.js').initPostProcessing;
		resizePostProcessing: typeof import('../vrm/postprocessing.js').resizePostProcessing;
		loadMixamoAnimation: typeof import('../vrm/animation.js').loadMixamoAnimation;
		crossfadeToAction: typeof import('../vrm/animation.js').crossfadeToAction;
		updateLipSync: typeof import('../vrm/lipsync.js').updateLipSync;
	};

	let runtime: VrmRuntime | null = null;
	let runtimePromise: Promise<VrmRuntime> | null = null;
	let initPromise: Promise<void> | null = null;

	function ensureRuntime(): Promise<VrmRuntime> {
		if (runtime) return Promise.resolve(runtime);
		if (!runtimePromise) {
			runtimePromise = Promise.all([
				import('three'),
				import('@pixiv/three-vrm'),
				import('../vrm/scene.js'),
				import('../vrm/loader.js'),
				import('../vrm/postprocessing.js'),
				import('../vrm/animation.js'),
				import('../vrm/lipsync.js')
			]).then(([
				threeModule,
				vrmModule,
				sceneModule,
				loaderModule,
				postModule,
				animModule,
				lipsyncModule
			]) => ({
				THREE: threeModule,
				VRMUtils: vrmModule.VRMUtils,
				createScene: sceneModule.createScene,
				resizeScene: sceneModule.resizeScene,
				loadVrm: loaderModule.loadVrm,
				setRealisticMode: loaderModule.setRealisticMode,
				initPostProcessing: postModule.initPostProcessing,
				resizePostProcessing: postModule.resizePostProcessing,
				loadMixamoAnimation: animModule.loadMixamoAnimation,
				crossfadeToAction: animModule.crossfadeToAction,
				updateLipSync: lipsyncModule.updateLipSync
			}));
		}
		return runtimePromise.then((loaded) => {
			runtime = loaded;
			return loaded;
		});
	}

	function hasActivePass(pp: PostProcessingRefs | null): boolean {
		if (!pp) return false;
		return pp.bloomPass.enabled || pp.fxaaPass.enabled || pp.smaaPass.enabled ||
			pp.chromaticAberrationPass.enabled || pp.filmGrainPass.enabled ||
			pp.glitchPass.enabled || pp.outlinePass.enabled ||
			pp.bleachBypassPass.enabled || pp.colorCorrectionPass.enabled;
	}

	function ensureSceneInitialized(): Promise<void> {
		if (sceneRefs && ppRefs) return Promise.resolve();
		if (initPromise) return initPromise;

		initPromise = (async () => {
			const rt = await ensureRuntime();
			if (disposed || sceneRefs || !canvasEl) return;

			sceneRefs = rt.createScene(canvasEl);
			ppRefs = rt.initPostProcessing(sceneRefs.renderer, sceneRefs.scene, sceneRefs.camera);

			function animate() {
				if (disposed || !sceneRefs || !ppRefs || !runtime) return;
				rafId = requestAnimationFrame(animate);
				const delta = sceneRefs.clock.getDelta();

				if (vrmState.vrm) {
					vrmState.vrm.update(delta);
					rt.updateLipSync(vrmState.vrm, ttsManager);
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

			function onResize() {
				if (!sceneRefs || !ppRefs || !runtime) return;
				rt.resizeScene(sceneRefs);
				rt.resizePostProcessing(ppRefs, sceneRefs.renderer);
			}

			function onWheel(e: WheelEvent) {
				e.preventDefault();
				if (vrmState.vrm && runtime) {
					const s = vrmState.vrm.scene.scale;
					const factor = Math.exp(-e.deltaY * 0.0015);
					const newS = runtime.THREE.MathUtils.clamp(s.x * factor, scaleLimits.min, scaleLimits.max);
					vrmState.vrm.scene.scale.set(newS, newS, 1.0);
				}
			}

			animate();
			window.addEventListener('resize', onResize);
			canvasEl.addEventListener('wheel', onWheel, { passive: false });

			teardown = () => {
				window.removeEventListener('resize', onResize);
				canvasEl.removeEventListener('wheel', onWheel);

				// Dispose VRM before renderer
				if (vrmState.vrm && runtime) {
					runtime.VRMUtils.deepDispose(vrmState.vrm.scene);
					vrmState.vrm = null;
				}
				vrmState.mixer = null;
				ppRefs?.composer?.dispose();
				sceneRefs?.renderer.dispose();
				ppRefs = null;
				sceneRefs = null;
			};
		})().finally(() => {
			initPromise = null;
		});

		return initPromise;
	}

	export function getSceneRefs() { return sceneRefs; }
	export function getPostProcessingRefs() { return ppRefs; }

	export async function loadVrmFromUrl(url: string) {
		await ensureSceneInitialized();
		const rt = await ensureRuntime();
		if (!sceneRefs) return;

		try {
			if (vrmState.vrm) {
				rt.VRMUtils.deepDispose(vrmState.vrm.scene);
				sceneRefs.scene.remove(vrmState.vrm.scene);
				vrmState.vrm = null;
			}
			vrmState.mixer = null;

			const vrm = await rt.loadVrm(url);
			rt.setRealisticMode(vrm.scene, sceneRefs.scene.environment, vrmState.realisticMode);
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
		await ensureSceneInitialized();
		const rt = await ensureRuntime();
		if (!vrmState.vrm) return toast('Load VRM first');
		try {
			const clip = await rt.loadMixamoAnimation(url, vrmState.vrm);
			if (clip) {
				if (!vrmState.mixer) vrmState.mixer = new rt.THREE.AnimationMixer(vrmState.vrm.scene);
				rt.crossfadeToAction(vrmState.mixer.clipAction(clip), vrmState.crossfadeDuration);
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
		disposed = false;
		void ensureSceneInitialized();

		return () => {
			disposed = true;
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
			teardown?.();
			teardown = null;
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
