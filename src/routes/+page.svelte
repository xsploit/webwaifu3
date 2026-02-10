<script lang="ts">
	import { onMount } from 'svelte';
	import VrmCanvas from '$lib/components/VrmCanvas.svelte';
	import SettingsPanel from '$lib/components/SettingsPanel.svelte';
	import ChatBar from '$lib/components/ChatBar.svelte';
	import MenuFab from '$lib/components/MenuFab.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import SplashModal from '$lib/components/SplashModal.svelte';
	import {
		getChat,
		getVrmState,
		getVrmVisuals,
		getLlmSettings,
		getTtsSettings,
		getCharacterState,
		getSettingsPanel,
		getSequencerState,
		getSttState,
		getModelList,
		getMemoryState,
		toast,
		addLog
	} from '$lib/stores/app.svelte.js';
	import { getLlmClient } from '$lib/llm/client.js';
	import { getTtsManager } from '$lib/tts/manager.js';
	import { getStorageManager } from '$lib/storage/index.js';
	import { getAnimationSequencer, DEFAULT_ANIMATIONS } from '$lib/vrm/sequencer.js';
	import { getMemoryManager } from '$lib/memory/manager.js';
	import { getSttRecorder } from '$lib/stt/recorder.js';
	import type { ChatMessage } from '$lib/llm/client.js';

	const chat = getChat();
	const vrmState = getVrmState();
	const llmSettings = getLlmSettings();
	const ttsSettings = getTtsSettings();
	const chars = getCharacterState();
	const panel = getSettingsPanel();
	const seqState = getSequencerState();
	const sttState = getSttState();
	const models = getModelList();
	const visuals = getVrmVisuals();
	const ttsManager = getTtsManager();
	const sequencer = getAnimationSequencer();
	const memState = getMemoryState();
	const memoryManager = getMemoryManager();

	let vrmCanvas: VrmCanvas;
	const storage = getStorageManager();

	function revokeBlobUrl(url: string | null | undefined) {
		if (url && url.startsWith('blob:')) {
			try {
				URL.revokeObjectURL(url);
			} catch {
				// ignore invalid/expired URL revocation
			}
		}
	}

	function toChatMessage(message: { role: string; content: string }): ChatMessage | null {
		if (message.role === 'system' || message.role === 'user' || message.role === 'assistant') {
			return { role: message.role, content: message.content };
		}
		return null;
	}

	async function loadAndCommitVrm(url: string): Promise<boolean> {
		const previousUrl = vrmState.vrmUrl;
		const loaded = await vrmCanvas?.loadVrmFromUrl(url);
		if (!loaded) return false;
		if (previousUrl !== url) {
			revokeBlobUrl(previousUrl);
		}
		vrmState.vrmUrl = url;
		return true;
	}

	// Initialize playlist on first load
	if (seqState.playlist.length === 0) {
		seqState.playlist = DEFAULT_ANIMATIONS.map(a => ({ ...a }));
	}

	async function handleSend(message: string) {
		if (chat.isGenerating) return;

		chat.history = [...chat.history, { role: 'user', content: message }];
		chat.isGenerating = true;
		addLog(`User: ${message.slice(0, 60)}...`, 'info');

		try {
			const client = getLlmClient();
			client.provider = llmSettings.provider;
			client.model = llmSettings.model;
			client.apiKey = llmSettings.apiKey;
			client.endpoint = llmSettings.endpoint;
			client.systemPrompt = chars.current?.systemPrompt ?? '';
			client.temperature = llmSettings.temperature;
			client.maxTokens = llmSettings.maxTokens;
			client.numCtx = llmSettings.numCtx;
			client.flashAttn = llmSettings.flashAttn;
			client.kvCacheType = llmSettings.kvCacheType;

			if (llmSettings.streaming) {
				client.onStreamChunk = (delta: string) => {
					if (ttsSettings.enabled) {
						ttsManager.enqueueStreamChunk(delta);
					}
				};
			}

			client.onResponseReceived = async (text: string) => {
				console.log('[LLM Response]', text);
				chat.history = [...chat.history, { role: 'assistant', content: text }];
				addLog(`AI: ${text.slice(0, 60)}...`, 'info');
				if (ttsSettings.enabled) {
					if (llmSettings.streaming) {
						ttsManager.enqueueStreamChunk('', true);
					} else {
						ttsManager.speak(text);
					}
				}
				// Embed assistant response for memory
				if (memState.enabled && memoryManager.modelReady) {
					const currentConvoId = await storage.getSetting('currentConversationId');
					if (currentConvoId) {
						memoryManager.addMessage('assistant', text, currentConvoId, chat.history.length - 1);
						memoryManager.pruneAndSummarize(currentConvoId);
					}
				}
			};

			client.onError = (err: Error) => {
				toast('LLM Error: ' + err.message);
				addLog('LLM Error: ' + err.message, 'err');
			};

			// Configure TTS before sending
			if (ttsSettings.enabled) {
				ttsManager.provider = ttsSettings.provider;
				if (ttsSettings.provider === 'kokoro') {
					ttsManager.kokoroVoice = ttsSettings.kokoroVoice as any;
				}
				if (ttsSettings.provider === 'fish') {
					ttsManager.fishApiKey = ttsSettings.fishApiKey;
					ttsManager.fishVoiceId = ttsSettings.fishVoiceId;
					ttsManager.fishModel = ttsSettings.fishModel as any;
				}

				ttsManager.enableTts = true;
			}

			// Build context with memory system if enabled
			let contextMessages: ChatMessage[] | undefined;
			if (memState.enabled && memoryManager.modelReady) {
				try {
					const rawContextMessages = await memoryManager.buildContext(
						message,
						chat.history.slice(0, -1), // exclude the user message we just added
						chars.current?.systemPrompt ?? ''
					);
					contextMessages = rawContextMessages
						.map(toChatMessage)
						.filter((m): m is ChatMessage => m !== null);
					// Embed the user message
					const currentConvoId = await storage.getSetting('currentConversationId');
					if (currentConvoId) {
						memoryManager.addMessage('user', message, currentConvoId, chat.history.length - 1);
					}
				} catch (e) {
					console.error('[Memory] buildContext failed, falling back:', e);
				}
			}

			await client.generateResponse(message, null, { contextMessages });
		} catch (err: any) {
			toast('Error: ' + err.message);
			addLog('Error: ' + err.message, 'err');
		} finally {
			chat.isGenerating = false;
		}
	}

	onMount(() => {
		// Initialize storage and load saved settings
		storage.initialize().then(async () => {
			try {
				await storage.initializeDefaultCharacters();
				const state = await storage.loadAppState();

				if (state.llm) {
					// Migrate legacy -responses variants to base provider name
					llmSettings.provider = (state.llm.provider?.replace('-responses', '') || 'ollama') as any;
					llmSettings.model = state.llm.model;
					llmSettings.apiKey = state.llm.apiKey;
					llmSettings.endpoint = state.llm.endpoint;
					llmSettings.temperature = state.llm.temperature;
					llmSettings.maxTokens = state.llm.maxTokens;
					if (state.llm.streaming !== undefined) llmSettings.streaming = state.llm.streaming;
					if (state.llm.numCtx !== undefined) llmSettings.numCtx = state.llm.numCtx;
					if (state.llm.flashAttn !== undefined) llmSettings.flashAttn = state.llm.flashAttn;
					if (state.llm.kvCacheType !== undefined) llmSettings.kvCacheType = state.llm.kvCacheType;
				}

				// Apply per-provider defaults from manager page (manager is canonical for API keys)
				const providerDefaults = await storage.getSetting('manager.providerDefaults', {});
				if (providerDefaults[llmSettings.provider]) {
					const d = providerDefaults[llmSettings.provider];
					llmSettings.apiKey = d.apiKey ?? llmSettings.apiKey;
					llmSettings.endpoint = d.endpoint ?? llmSettings.endpoint;
					llmSettings.model = d.model ?? llmSettings.model;
				}
				if (state.tts) {
					ttsSettings.provider = state.tts.provider ?? ttsSettings.provider;
					ttsSettings.kokoroVoice = state.tts.kokoroVoice ?? ttsSettings.kokoroVoice;
					ttsSettings.fishVoiceId = state.tts.fishVoiceId ?? '';
					ttsSettings.fishLatency = state.tts.fishLatency ?? ttsSettings.fishLatency;
					ttsSettings.fishApiKey = state.tts.fishApiKey ?? '';
					ttsSettings.enabled = state.tts.enabled ?? ttsSettings.enabled;
					ttsSettings.fishModel = state.tts.fishModel ?? ttsSettings.fishModel;
					ttsSettings.fishSavedVoices = state.tts.fishSavedVoices ?? [];
				}
				if (state.stt) {
					sttState.enabled = state.stt.enabled;
					sttState.autoSend = state.stt.autoSend;

					// Auto-init Whisper model if STT was enabled
					if (state.stt.enabled) {
						const recorder = getSttRecorder();
						sttState.modelLoading = true;
						recorder.onModelReady = () => {
							sttState.modelLoading = false;
							sttState.modelReady = true;
							addLog('Whisper model auto-loaded', 'info');
						};
						recorder.onModelError = (err) => {
							sttState.modelLoading = false;
							console.error('[STT] Auto-init failed:', err);
						};
						recorder.initialize().catch((e) => {
							sttState.modelLoading = false;
							console.error('[STT] Auto-init failed:', e);
						});
					}
				}
				if (state.sequencer) {
					seqState.speed = state.sequencer.speed;
					seqState.duration = state.sequencer.duration;
					seqState.shuffle = state.sequencer.shuffle;
					seqState.loop = state.sequencer.loop;
				}
				if (state.ui) {
					if (state.ui.settingsPanelOpen !== undefined) {
						panel.open = !!state.ui.settingsPanelOpen;
					}
					if (typeof state.ui.activeTab === 'string' && state.ui.activeTab.trim().length > 0) {
						panel.activeTab = state.ui.activeTab;
					}
				}

				// Restore visual settings (post-processing, shaders, lighting)
				if (state.visuals) {
					const v = state.visuals;
					// VRM state props
					if (v.realisticMode !== undefined) vrmState.realisticMode = v.realisticMode;
					if (v.autoRotate !== undefined) vrmState.autoRotate = v.autoRotate;
					if (v.crossfadeDuration !== undefined) vrmState.crossfadeDuration = v.crossfadeDuration;
					if (v.postProcessingEnabled !== undefined) vrmState.postProcessingEnabled = v.postProcessingEnabled;
					// Toggles
					if (v.outline !== undefined) { visuals.outline = v.outline; vrmState.useOutlineEffect = v.outline; }
					if (v.bloom !== undefined) visuals.bloom = v.bloom;
					if (v.chroma !== undefined) visuals.chroma = v.chroma;
					if (v.grain !== undefined) visuals.grain = v.grain;
					if (v.glitch !== undefined) visuals.glitch = v.glitch;
					if (v.fxaa !== undefined) visuals.fxaa = v.fxaa;
					if (v.smaa !== undefined) visuals.smaa = v.smaa;
					if (v.taa !== undefined) visuals.taa = v.taa;
					if (v.bleach !== undefined) visuals.bleach = v.bleach;
					if (v.colorCorr !== undefined) visuals.colorCorr = v.colorCorr;
					// Shader uniforms
					if (v.bloomStrength !== undefined) visuals.bloomStrength = v.bloomStrength;
					if (v.bloomRadius !== undefined) visuals.bloomRadius = v.bloomRadius;
					if (v.bloomThreshold !== undefined) visuals.bloomThreshold = v.bloomThreshold;
					if (v.chromaAmount !== undefined) visuals.chromaAmount = v.chromaAmount;
					if (v.chromaAngle !== undefined) visuals.chromaAngle = v.chromaAngle;
					if (v.grainAmount !== undefined) visuals.grainAmount = v.grainAmount;
					if (v.vignetteAmount !== undefined) visuals.vignetteAmount = v.vignetteAmount;
					if (v.vignetteHardness !== undefined) visuals.vignetteHardness = v.vignetteHardness;
					if (v.bleachOpacity !== undefined) visuals.bleachOpacity = v.bleachOpacity;
					if (v.colorPowR !== undefined) visuals.colorPowR = v.colorPowR;
					if (v.colorPowG !== undefined) visuals.colorPowG = v.colorPowG;
					if (v.colorPowB !== undefined) visuals.colorPowB = v.colorPowB;
					if (v.taaSampleLevel !== undefined) visuals.taaSampleLevel = v.taaSampleLevel;
					// Lighting
					if (v.keyLight !== undefined) visuals.keyLight = v.keyLight;
					if (v.fillLight !== undefined) visuals.fillLight = v.fillLight;
					if (v.rimLight !== undefined) visuals.rimLight = v.rimLight;
					if (v.hemiLight !== undefined) visuals.hemiLight = v.hemiLight;
					if (v.ambientLight !== undefined) visuals.ambientLight = v.ambientLight;

					// Apply pass toggles and uniforms to the scene after a tick
					setTimeout(() => {
						// Toggle passes
						const passToggles: Record<string, boolean> = {
							bloom: visuals.bloom, chromatic: visuals.chroma, grain: visuals.grain,
							glitch: visuals.glitch, fxaa: visuals.fxaa, smaa: visuals.smaa,
							taa: visuals.taa, bleach: visuals.bleach, colorCorrection: visuals.colorCorr
						};
						for (const [name, enabled] of Object.entries(passToggles)) {
							window.dispatchEvent(new CustomEvent('webwaifu3:toggle-pass', { detail: { name, enabled } }));
						}
						// Shader uniforms
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'bloom', uniform: 'strength', value: visuals.bloomStrength } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'bloom', uniform: 'radius', value: visuals.bloomRadius } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'bloom', uniform: 'threshold', value: visuals.bloomThreshold } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'chromatic', uniform: 'amount', value: visuals.chromaAmount } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'chromatic', uniform: 'angle', value: visuals.chromaAngle } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'grain', uniform: 'grainAmount', value: visuals.grainAmount } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'grain', uniform: 'vignetteAmount', value: visuals.vignetteAmount } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'grain', uniform: 'vignetteHardness', value: visuals.vignetteHardness } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'bleach', uniform: 'opacity', value: visuals.bleachOpacity } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'colorCorrection', uniform: 'powR', value: visuals.colorPowR } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'colorCorrection', uniform: 'powG', value: visuals.colorPowG } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'colorCorrection', uniform: 'powB', value: visuals.colorPowB } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:pass-uniform', { detail: { name: 'taa', uniform: 'sampleLevel', value: visuals.taaSampleLevel } }));
						// Lighting
						window.dispatchEvent(new CustomEvent('webwaifu3:light', { detail: { light: 'key', value: visuals.keyLight } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:light', { detail: { light: 'fill', value: visuals.fillLight } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:light', { detail: { light: 'rim', value: visuals.rimLight } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:light', { detail: { light: 'hemi', value: visuals.hemiLight } }));
						window.dispatchEvent(new CustomEvent('webwaifu3:light', { detail: { light: 'ambient', value: visuals.ambientLight } }));
					}, 100);
				}

				// Restore playlist enabled states
				if (state.playlistEnabled) {
					seqState.playlist = seqState.playlist.map(a => ({
						...a,
						enabled: state.playlistEnabled![a.id] ?? a.enabled
					}));
				}

				const allChars = await storage.getAllCharacters();
				chars.all = allChars;
				if (state.character) {
					chars.current = state.character;
				} else if (allChars.length > 0) {
					chars.current = allChars[0];
				}

				if (state.conversation?.messages) {
					chat.history = state.conversation.messages;
				}

				// Apply loaded settings to TTS manager singleton
				ttsManager.provider = ttsSettings.provider;
				ttsManager.enableTts = ttsSettings.enabled;
				if (ttsSettings.provider === 'kokoro') {
					ttsManager.kokoroVoice = ttsSettings.kokoroVoice as any;
					// Auto-init Kokoro worker so TTS is ready on first message
					if (!ttsManager.kokoroReadyInWorker && !ttsManager.ttsWorker) {
						ttsManager.initKokoroInWorker();
					}
				}
				if (ttsSettings.provider === 'fish') {
					ttsManager.fishApiKey = ttsSettings.fishApiKey;
					ttsManager.fishVoiceId = ttsSettings.fishVoiceId;
					ttsManager.fishModel = ttsSettings.fishModel as any;
				}

				// Load memory settings
				if (state.memory) {
					memState.enabled = state.memory.enabled;
					memState.mode = state.memory.mode;
					memState.maxContext = state.memory.maxContext;
					memState.windowSize = state.memory.windowSize;
					memState.topK = state.memory.topK;
					memState.similarityThreshold = state.memory.similarityThreshold;
					memState.summarizationProvider = state.memory.summarizationProvider;
					memState.summarizationModel = state.memory.summarizationModel;
					memState.summarizationApiKey = state.memory.summarizationApiKey;
					memState.summarizationEndpoint = state.memory.summarizationEndpoint;

					// Wire memory manager
					memoryManager.enabled = state.memory.enabled;
					memoryManager.mode = state.memory.mode;
					memoryManager.maxContextMessages = state.memory.maxContext;
					memoryManager.windowSize = state.memory.windowSize;
					memoryManager.topK = state.memory.topK;
					memoryManager.similarityThreshold = state.memory.similarityThreshold;
					memoryManager.summarizationProvider = state.memory.summarizationProvider as any;
					memoryManager.summarizationModel = state.memory.summarizationModel;
					memoryManager.summarizationApiKey = state.memory.summarizationApiKey;
					memoryManager.summarizationEndpoint = state.memory.summarizationEndpoint;

					// Auto-init embedding model if memory was enabled
					if (state.memory.enabled) {
						memState.modelLoading = true;
						memoryManager.initEmbeddingModel().then(() => {
							memState.modelReady = true;
							memState.modelLoading = false;
							addLog('Embedding model auto-loaded', 'info');
						}).catch((e) => {
							memState.modelLoading = false;
							console.error('[Memory] Auto-init failed:', e);
						});
					}
				}


				// Restore saved VRM model
				const savedVrmUrl = state.vrmUrl || '/assets/hikkyc2.vrm';
				if (savedVrmUrl === 'idb://vrmFile') {
					const fileData = await storage.getVrmFile();
					if (fileData) {
						const blob = new Blob([fileData], { type: 'application/octet-stream' });
						const blobUrl = URL.createObjectURL(blob);
						const loaded = await loadAndCommitVrm(blobUrl);
						if (!loaded) {
							revokeBlobUrl(blobUrl);
							await loadAndCommitVrm('/assets/hikkyc2.vrm');
						}
					} else {
						await loadAndCommitVrm('/assets/hikkyc2.vrm');
					}
				} else {
					const loaded = await loadAndCommitVrm(savedVrmUrl);
					if (!loaded) {
						await loadAndCommitVrm('/assets/hikkyc2.vrm');
					}
				}
			} catch (e) {
				console.error('Failed to load settings:', e);
				// Fallback: load default VRM
				await loadAndCommitVrm('/assets/hikkyc2.vrm');
			}
			// Auto-fetch models for configured providers
			if (models.models.length === 0) {
				const client = getLlmClient();
				client.provider = llmSettings.provider;
				client.apiKey = llmSettings.apiKey;
				client.endpoint = llmSettings.endpoint;
				client.fetchModels().then((fetched) => {
					if (fetched.length > 0) {
						models.models = fetched;
						addLog(`Auto-loaded ${fetched.length} models`, 'info');
					}
				}).catch(() => { /* silent fail on auto-fetch */ });
			}

			addLog('Storage initialized', 'info');
		});

		// Wire up custom events from VrmTab/AnimTab to VrmCanvas
		async function onLoadVrm(e: Event) {
			// Stop sequencer when loading new VRM
			sequencer.stop();
			seqState.playing = false;
			seqState.currentIndex = -1;
			const detail = (e as CustomEvent).detail;
			const url = typeof detail === 'string' ? detail : detail.url;
			const fileData: ArrayBuffer | undefined = typeof detail === 'string' ? undefined : detail.fileData;

			try {
				const loaded = await loadAndCommitVrm(url);
				if (!loaded) {
					if (url.startsWith('blob:')) revokeBlobUrl(url);
					return;
				}

				// Persist VRM choice
				if (fileData) {
					await storage.saveVrmFile(fileData);
					await storage.setSetting('vrmUrl', 'idb://vrmFile');
				} else {
					await storage.clearVrmFile();
					await storage.setSetting('vrmUrl', url);
				}
			} catch (err) {
				console.error('[VRM] Failed to load:', err);
				toast('Failed to load VRM model');
				if (url.startsWith('blob:')) revokeBlobUrl(url);
			}
		}

		function onLoadAnim(e: Event) {
			const url = (e as CustomEvent).detail;
			vrmCanvas?.loadAnimationFromUrl(url);
		}

		function onTogglePass(e: Event) {
			const { name, enabled } = (e as CustomEvent).detail;
			const ppRefs = vrmCanvas?.getPostProcessingRefs();
			if (!ppRefs) return;
			const passMap: Record<string, any> = {
				bloom: ppRefs.bloomPass,
				chromatic: ppRefs.chromaticAberrationPass,
				grain: ppRefs.filmGrainPass,
				glitch: ppRefs.glitchPass,
				fxaa: ppRefs.fxaaPass,
				smaa: ppRefs.smaaPass,
				taa: ppRefs.taaPass,
				bleach: ppRefs.bleachBypassPass,
				colorCorrection: ppRefs.colorCorrectionPass
			};
			const pass = passMap[name];
			if (pass) pass.enabled = enabled;
		}

		function onPassUniform(e: Event) {
			const { name, uniform, value } = (e as CustomEvent).detail;
			const ppRefs = vrmCanvas?.getPostProcessingRefs();
			if (!ppRefs) return;
			const passMap: Record<string, any> = {
				bloom: ppRefs.bloomPass,
				chromatic: ppRefs.chromaticAberrationPass,
				grain: ppRefs.filmGrainPass,
				bleach: ppRefs.bleachBypassPass,
				colorCorrection: ppRefs.colorCorrectionPass,
				taa: ppRefs.taaPass
			};
			const pass = passMap[name];
			if (!pass) return;

			// Special handling for bloom pass properties
			if (name === 'bloom') {
				if (uniform === 'strength') pass.strength = value;
				else if (uniform === 'radius') pass.radius = value;
				else if (uniform === 'threshold') pass.threshold = value;
			} else if (name === 'taa') {
				if (uniform === 'sampleLevel') pass.sampleLevel = value;
			} else if (pass.uniforms?.[uniform]) {
				pass.uniforms[uniform].value = value;
			}
		}

		function onLight(e: Event) {
			const { light, value } = (e as CustomEvent).detail;
			const sceneRefs = vrmCanvas?.getSceneRefs();
			if (!sceneRefs) return;
			const lightMap: Record<string, any> = {
				key: sceneRefs.key,
				fill: sceneRefs.fill,
				rim: sceneRefs.rim,
				hemi: sceneRefs.hemi,
				ambient: sceneRefs.ambient
			};
			const l = lightMap[light];
			if (l) l.intensity = value;
		}

		// Sequencer events
		function onSeqStart() {
			sequencer.onAdvance = (entry, index) => {
				seqState.currentIndex = index;
				vrmCanvas?.loadAnimationFromUrl(entry.url);
				addLog(`Sequencer: ${entry.name}`, 'info');
			};
			sequencer.start(seqState.playlist, {
				shuffle: seqState.shuffle,
				loop: seqState.loop,
				duration: seqState.duration
			});
			seqState.playing = true;
		}

		function onSeqStop() {
			sequencer.stop();
			seqState.playing = false;
			seqState.currentIndex = -1;
		}

		function onSeqPlayOne(e: Event) {
			const { url, index } = (e as CustomEvent).detail;
			seqState.currentIndex = index;
			vrmCanvas?.loadAnimationFromUrl(url);
		}

		window.addEventListener('webwaifu3:load-vrm', onLoadVrm);
		window.addEventListener('webwaifu3:load-anim', onLoadAnim);
		window.addEventListener('webwaifu3:toggle-pass', onTogglePass);
		window.addEventListener('webwaifu3:pass-uniform', onPassUniform);
		window.addEventListener('webwaifu3:light', onLight);
		window.addEventListener('webwaifu3:sequencer-start', onSeqStart);
		window.addEventListener('webwaifu3:sequencer-stop', onSeqStop);
		window.addEventListener('webwaifu3:sequencer-play-one', onSeqPlayOne);

		toast('WEBWAIFU 3 initialized');

		return () => {
			window.removeEventListener('webwaifu3:load-vrm', onLoadVrm);
			window.removeEventListener('webwaifu3:load-anim', onLoadAnim);
			window.removeEventListener('webwaifu3:toggle-pass', onTogglePass);
			window.removeEventListener('webwaifu3:pass-uniform', onPassUniform);
			window.removeEventListener('webwaifu3:light', onLight);
			window.removeEventListener('webwaifu3:sequencer-start', onSeqStart);
			window.removeEventListener('webwaifu3:sequencer-stop', onSeqStop);
			window.removeEventListener('webwaifu3:sequencer-play-one', onSeqPlayOne);
			sequencer.stop();
			revokeBlobUrl(vrmState.vrmUrl);
		};
	});

	// Auto-save settings when they change (debounced to avoid excessive IDB writes)
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let saveChain: Promise<void> = Promise.resolve();
	$effect(() => {
		// IMPORTANT: Read ALL reactive deps FIRST, before any non-reactive guard.
		// storage.db is NOT reactive ($state), so if we return early before reading
		// reactive vars, the $effect never subscribes and never re-runs — settings
		// would never be saved.

		// Build playlist enabled map
		const playlistEnabled: Record<string, boolean> = {};
		for (const a of seqState.playlist) {
			playlistEnabled[a.id] = a.enabled;
		}

		// Capture all reactive values to establish Svelte 5 dependency tracking
		const snapshot = {
			llm: {
				provider: llmSettings.provider,
				model: llmSettings.model,
				apiKey: llmSettings.apiKey,
				endpoint: llmSettings.endpoint,
				temperature: llmSettings.temperature,
				maxTokens: llmSettings.maxTokens,
				streaming: llmSettings.streaming,
				numCtx: llmSettings.numCtx,
				flashAttn: llmSettings.flashAttn,
				kvCacheType: llmSettings.kvCacheType
			},
			tts: {
				provider: ttsSettings.provider,
				kokoroVoice: ttsSettings.kokoroVoice,
				fishVoiceId: ttsSettings.fishVoiceId,
				fishLatency: ttsSettings.fishLatency,
				fishApiKey: ttsSettings.fishApiKey,
				enabled: ttsSettings.enabled,
				fishModel: ttsSettings.fishModel,
				fishSavedVoices: $state.snapshot(ttsSettings.fishSavedVoices)
			},
			stt: {
				enabled: sttState.enabled,
				autoSend: sttState.autoSend
			},
			sequencer: {
				speed: seqState.speed,
				duration: seqState.duration,
				shuffle: seqState.shuffle,
				loop: seqState.loop
			},
			visuals: {
				realisticMode: vrmState.realisticMode, autoRotate: vrmState.autoRotate,
				crossfadeDuration: vrmState.crossfadeDuration, postProcessingEnabled: vrmState.postProcessingEnabled,
				outline: visuals.outline, bloom: visuals.bloom, chroma: visuals.chroma,
				grain: visuals.grain, glitch: visuals.glitch, fxaa: visuals.fxaa,
				smaa: visuals.smaa, taa: visuals.taa, bleach: visuals.bleach, colorCorr: visuals.colorCorr,
				bloomStrength: visuals.bloomStrength, bloomRadius: visuals.bloomRadius, bloomThreshold: visuals.bloomThreshold,
				chromaAmount: visuals.chromaAmount, chromaAngle: visuals.chromaAngle,
				grainAmount: visuals.grainAmount, vignetteAmount: visuals.vignetteAmount, vignetteHardness: visuals.vignetteHardness,
				bleachOpacity: visuals.bleachOpacity, colorPowR: visuals.colorPowR, colorPowG: visuals.colorPowG, colorPowB: visuals.colorPowB,
				taaSampleLevel: visuals.taaSampleLevel,
				keyLight: visuals.keyLight, fillLight: visuals.fillLight, rimLight: visuals.rimLight,
				hemiLight: visuals.hemiLight, ambientLight: visuals.ambientLight
			},
			ui: {
				settingsPanelOpen: panel.open,
				activeTab: panel.activeTab
			},
			playlistEnabled,
			character: chars.current,
			memory: {
				enabled: memState.enabled,
				mode: memState.mode,
				maxContext: memState.maxContext,
				windowSize: memState.windowSize,
				topK: memState.topK,
				similarityThreshold: memState.similarityThreshold,
				summarizationProvider: memState.summarizationProvider,
				summarizationModel: memState.summarizationModel,
				summarizationApiKey: memState.summarizationApiKey,
				summarizationEndpoint: memState.summarizationEndpoint
			}
		};

		// NOW check non-reactive guard — deps are already tracked above
		if (!storage.db) return;

		// Debounce: wait 500ms after last change before writing to IndexedDB
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			// Serialize async saves so older writes cannot finish after newer ones.
			saveChain = saveChain
				.catch(() => {
					// keep queue alive after a failed write
				})
				.then(async () => {
					await storage.saveAppState(snapshot);

					// Sync active LLM settings back to manager.providerDefaults.
					// Persist explicit empty strings so clearing credentials actually sticks.
					try {
						const defaults = await storage.getSetting('manager.providerDefaults', {});
						const provider = snapshot.llm.provider;
						defaults[provider] = {
							model: snapshot.llm.model ?? '',
							apiKey: snapshot.llm.apiKey ?? '',
							endpoint: snapshot.llm.endpoint ?? ''
						};
						await storage.setSetting('manager.providerDefaults', defaults);
					} catch {
						/* non-critical */
					}
				});
		}, 500);

		return () => {
			if (saveTimer) {
				clearTimeout(saveTimer);
				saveTimer = null;
			}
		};
	});

	function handleClickOutside() {
		if (panel.open) panel.open = false;
	}
</script>

<svelte:head>
	<title>WEBWAIFU 3 | VRM Companion</title>
</svelte:head>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="shell" onclick={handleClickOutside}>
	<VrmCanvas bind:this={vrmCanvas} />
	<div class="ui-layer">
		<a href="/manager" class="mgr-btn" title="Waifu Manager">MGR</a>
		<MenuFab />
		<SettingsPanel />
		<ChatBar onsend={handleSend} />
		<Toast />
	</div>
	<SplashModal />
</div>

<style>
	.shell {
		position: fixed;
		inset: 0;
		background: #02040a;
	}

	.ui-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 10;
	}

	.mgr-btn {
		position: absolute;
		top: clamp(12px, 2vh, 24px);
		left: clamp(12px, 2vw, 24px);
		pointer-events: auto;
		z-index: 50;
		font-family: var(--font-tech);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		text-decoration: none;
		color: var(--text-main);
		background: var(--c-panel);
		padding: 10px 16px;
		border: 1px solid var(--c-border);
		clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
		transition: all 0.2s var(--ease-tech);
	}
	.mgr-btn:hover {
		color: var(--c-text-accent);
		border-color: var(--c-text-accent);
		transform: scale(1.05);
	}
</style>

