import type { VRM } from '@pixiv/three-vrm';
import type { LlmProvider } from '../llm/client.js';
import * as THREE from 'three';

// Toast state
let toastMessage = $state('');
let toastVisible = $state(false);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, duration = 3000) {
	toastMessage = `// ${message}`;
	toastVisible = true;
	addLog(message, 'info');
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		toastVisible = false;
	}, duration);
}

export function getToast() {
	return { get message() { return toastMessage; }, get visible() { return toastVisible; } };
}

// Settings panel state
let settingsPanelOpen = $state(false);
let activeTab = $state('vrm');

export function getSettingsPanel() {
	return {
		get open() { return settingsPanelOpen; },
		set open(v: boolean) { settingsPanelOpen = v; },
		get activeTab() { return activeTab; },
		set activeTab(v: string) { activeTab = v; },
		toggle() { settingsPanelOpen = !settingsPanelOpen; }
	};
}

// Chat state
let chatVisible = $state(true);
let chatInput = $state('');
let isGenerating = $state(false);
let conversationHistory = $state<{ role: string; content: string }[]>([]);
let chatLogOpen = $state(false);
let streamingText = $state('');

export function getChat() {
	return {
		get visible() { return chatVisible; },
		set visible(v: boolean) { chatVisible = v; },
		get input() { return chatInput; },
		set input(v: string) { chatInput = v; },
		get isGenerating() { return isGenerating; },
		set isGenerating(v: boolean) { isGenerating = v; },
		get history() { return conversationHistory; },
		set history(v: { role: string; content: string }[]) { conversationHistory = v; },
		get logOpen() { return chatLogOpen; },
		set logOpen(v: boolean) { chatLogOpen = v; },
		get streamingText() { return streamingText; },
		set streamingText(v: string) { streamingText = v; },
		toggleVisible() { chatVisible = !chatVisible; },
		toggleLog() { chatLogOpen = !chatLogOpen; }
	};
}

// VRM state
let currentVrm = $state<VRM | null>(null);
let mixer = $state<THREE.AnimationMixer | null>(null);
let realisticMode = $state(false);
let autoRotate = $state(false);
let useOutlineEffect = $state(true);
let postProcessingEnabled = $state(true);
let crossfadeDuration = $state(1.0);
let vrmUrl = $state('/assets/hikkyc2.vrm');

export function getVrmState() {
	return {
		get vrm() { return currentVrm; },
		set vrm(v: VRM | null) { currentVrm = v; },
		get mixer() { return mixer; },
		set mixer(v: THREE.AnimationMixer | null) { mixer = v; },
		get realisticMode() { return realisticMode; },
		set realisticMode(v: boolean) { realisticMode = v; },
		get autoRotate() { return autoRotate; },
		set autoRotate(v: boolean) { autoRotate = v; },
		get useOutlineEffect() { return useOutlineEffect; },
		set useOutlineEffect(v: boolean) { useOutlineEffect = v; },
		get postProcessingEnabled() { return postProcessingEnabled; },
		set postProcessingEnabled(v: boolean) { postProcessingEnabled = v; },
		get crossfadeDuration() { return crossfadeDuration; },
		set crossfadeDuration(v: number) { crossfadeDuration = v; },
		get vrmUrl() { return vrmUrl; },
		set vrmUrl(v: string) { vrmUrl = v; }
	};
}

// VRM visual settings (post-processing, shaders, lighting)
let ppOutline = $state(false);
let ppBloom = $state(false);
let ppChroma = $state(false);
let ppGrain = $state(false);
let ppGlitch = $state(false);
let ppFxaa = $state(false);
let ppSmaa = $state(false);
let ppTaa = $state(false);
let ppBleach = $state(false);
let ppColorCorr = $state(false);

let shBloomStrength = $state(0.4);
let shBloomRadius = $state(0.6);
let shBloomThreshold = $state(0.7);
let shChromaAmount = $state(0.0015);
let shChromaAngle = $state(0);
let shGrainAmount = $state(0.05);
let shVignetteAmount = $state(0.3);
let shVignetteHardness = $state(0.8);
let shBleachOpacity = $state(0.2);
let shColorPowR = $state(1.4);
let shColorPowG = $state(1.45);
let shColorPowB = $state(1.45);
let shTaaSampleLevel = $state(2);

let litKey = $state(0.8);
let litFill = $state(0.3);
let litRim = $state(0.35);
let litHemi = $state(0.35);
let litAmbient = $state(0.35);

export function getVrmVisuals() {
	return {
		// Post-processing toggles
		get outline() { return ppOutline; }, set outline(v: boolean) { ppOutline = v; },
		get bloom() { return ppBloom; }, set bloom(v: boolean) { ppBloom = v; },
		get chroma() { return ppChroma; }, set chroma(v: boolean) { ppChroma = v; },
		get grain() { return ppGrain; }, set grain(v: boolean) { ppGrain = v; },
		get glitch() { return ppGlitch; }, set glitch(v: boolean) { ppGlitch = v; },
		get fxaa() { return ppFxaa; }, set fxaa(v: boolean) { ppFxaa = v; },
		get smaa() { return ppSmaa; }, set smaa(v: boolean) { ppSmaa = v; },
		get taa() { return ppTaa; }, set taa(v: boolean) { ppTaa = v; },
		get bleach() { return ppBleach; }, set bleach(v: boolean) { ppBleach = v; },
		get colorCorr() { return ppColorCorr; }, set colorCorr(v: boolean) { ppColorCorr = v; },
		// Shader uniforms
		get bloomStrength() { return shBloomStrength; }, set bloomStrength(v: number) { shBloomStrength = v; },
		get bloomRadius() { return shBloomRadius; }, set bloomRadius(v: number) { shBloomRadius = v; },
		get bloomThreshold() { return shBloomThreshold; }, set bloomThreshold(v: number) { shBloomThreshold = v; },
		get chromaAmount() { return shChromaAmount; }, set chromaAmount(v: number) { shChromaAmount = v; },
		get chromaAngle() { return shChromaAngle; }, set chromaAngle(v: number) { shChromaAngle = v; },
		get grainAmount() { return shGrainAmount; }, set grainAmount(v: number) { shGrainAmount = v; },
		get vignetteAmount() { return shVignetteAmount; }, set vignetteAmount(v: number) { shVignetteAmount = v; },
		get vignetteHardness() { return shVignetteHardness; }, set vignetteHardness(v: number) { shVignetteHardness = v; },
		get bleachOpacity() { return shBleachOpacity; }, set bleachOpacity(v: number) { shBleachOpacity = v; },
		get colorPowR() { return shColorPowR; }, set colorPowR(v: number) { shColorPowR = v; },
		get colorPowG() { return shColorPowG; }, set colorPowG(v: number) { shColorPowG = v; },
		get colorPowB() { return shColorPowB; }, set colorPowB(v: number) { shColorPowB = v; },
		get taaSampleLevel() { return shTaaSampleLevel; }, set taaSampleLevel(v: number) { shTaaSampleLevel = v; },
		// Lighting
		get keyLight() { return litKey; }, set keyLight(v: number) { litKey = v; },
		get fillLight() { return litFill; }, set fillLight(v: number) { litFill = v; },
		get rimLight() { return litRim; }, set rimLight(v: number) { litRim = v; },
		get hemiLight() { return litHemi; }, set hemiLight(v: number) { litHemi = v; },
		get ambientLight() { return litAmbient; }, set ambientLight(v: number) { litAmbient = v; },
	};
}

// LLM settings state
let llmProvider = $state<LlmProvider>('ollama');
let llmModel = $state('');
let llmApiKey = $state('');
let llmEndpoint = $state('http://localhost:11434/api/chat');
let llmTemperature = $state(0.8);
let llmMaxTokens = $state(256);
let llmStreaming = $state(true);
let llmNumCtx = $state(4096);
let llmFlashAttn = $state(true);
let llmKvCacheType = $state<string>('q8_0');

export function getLlmSettings() {
	return {
		get provider() { return llmProvider; },
		set provider(v: LlmProvider) { llmProvider = v; },
		get model() { return llmModel; },
		set model(v: string) { llmModel = v; },
		get apiKey() { return llmApiKey; },
		set apiKey(v: string) { llmApiKey = v; },
		get endpoint() { return llmEndpoint; },
		set endpoint(v: string) { llmEndpoint = v; },
		get temperature() { return llmTemperature; },
		set temperature(v: number) { llmTemperature = v; },
		get maxTokens() { return llmMaxTokens; },
		set maxTokens(v: number) { llmMaxTokens = v; },
		get streaming() { return llmStreaming; },
		set streaming(v: boolean) { llmStreaming = v; },
		get numCtx() { return llmNumCtx; },
		set numCtx(v: number) { llmNumCtx = v; },
		get flashAttn() { return llmFlashAttn; },
		set flashAttn(v: boolean) { llmFlashAttn = v; },
		get kvCacheType() { return llmKvCacheType; },
		set kvCacheType(v: string) { llmKvCacheType = v; }
	};
}

// TTS settings state
let ttsProvider = $state<'fish' | 'kokoro'>('kokoro');
let ttsKokoroVoice = $state('af_heart');
let ttsKokoroDtype = $state<'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'>('q4');
let ttsKokoroDevice = $state<'webgpu' | 'wasm' | 'cpu' | 'auto'>('webgpu');
let ttsFishVoiceId = $state('');
let ttsFishLatency = $state<'normal' | 'balanced'>('balanced');
let ttsEnabled = $state(true);
let fishApiKey = $state('');
let kokoroReady = $state(false);
let kokoroLoading = $state(false);
let fishModel = $state('s1');
let fishSavedVoices = $state<{ id: string; name: string }[]>([]);

export function getTtsSettings() {
	return {
		get provider() { return ttsProvider; },
		set provider(v: 'fish' | 'kokoro') { ttsProvider = v; },
		get kokoroVoice() { return ttsKokoroVoice; },
		set kokoroVoice(v: string) { ttsKokoroVoice = v; },
		get kokoroDtype() { return ttsKokoroDtype; },
		set kokoroDtype(v: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16') { ttsKokoroDtype = v; },
		get kokoroDevice() { return ttsKokoroDevice; },
		set kokoroDevice(v: 'webgpu' | 'wasm' | 'cpu' | 'auto') { ttsKokoroDevice = v; },
		get fishVoiceId() { return ttsFishVoiceId; },
		set fishVoiceId(v: string) { ttsFishVoiceId = v; },
		get fishLatency() { return ttsFishLatency; },
		set fishLatency(v: 'normal' | 'balanced') { ttsFishLatency = v; },
		get enabled() { return ttsEnabled; },
		set enabled(v: boolean) { ttsEnabled = v; },
		get fishApiKey() { return fishApiKey; },
		set fishApiKey(v: string) { fishApiKey = v; },
		get kokoroReady() { return kokoroReady; },
		set kokoroReady(v: boolean) { kokoroReady = v; },
		get kokoroLoading() { return kokoroLoading; },
		set kokoroLoading(v: boolean) { kokoroLoading = v; },
		get fishModel() { return fishModel; },
		set fishModel(v: string) { fishModel = v; },
		get fishSavedVoices() { return fishSavedVoices; },
		set fishSavedVoices(v: { id: string; name: string }[]) { fishSavedVoices = v; }
	};
}

// Character state
interface Character {
	id?: number;
	name: string;
	systemPrompt: string;
	description?: string;
	userNickname?: string;
}

let currentCharacter = $state<Character | null>(null);
let characters = $state<Character[]>([]);

export function getCharacterState() {
	return {
		get current() { return currentCharacter; },
		set current(v: Character | null) { currentCharacter = v; },
		get all() { return characters; },
		set all(v: Character[]) { characters = v; }
	};
}

// Logs state
interface LogEntry {
	time: string;
	message: string;
	level: 'info' | 'warn' | 'err';
}

let logs = $state<LogEntry[]>([]);

export function addLog(message: string, level: 'info' | 'warn' | 'err' = 'info') {
	const time = new Date().toLocaleTimeString('en-US', { hour12: false });
	logs = [...logs, { time, message, level }];
	if (logs.length > 200) logs = logs.slice(-200);
}

export function getLogs() {
	return { get entries() { return logs; } };
}

// Model list for LLM provider
let modelList = $state<{ id: string; name: string }[]>([]);

export function getModelList() {
	return {
		get models() { return modelList; },
		set models(v: { id: string; name: string }[]) { modelList = v; }
	};
}

// Voice list for TTS provider
let voiceList = $state<any[]>([]);

export function getVoiceList() {
	return {
		get voices() { return voiceList; },
		set voices(v: any[]) { voiceList = v; }
	};
}

// Animation Sequencer state
export interface AnimationEntry {
	id: string;
	name: string;
	url: string;
	enabled: boolean;
	experimental: boolean;
}

let seqPlaying = $state(false);
let seqShuffle = $state(false);
let seqLoop = $state(true);
let seqSpeed = $state(1.0);
let seqDuration = $state(10);
let seqCurrentIndex = $state(-1);
let seqPlaylist = $state<AnimationEntry[]>([]);

export function getSequencerState() {
	return {
		get playing() { return seqPlaying; },
		set playing(v: boolean) { seqPlaying = v; },
		get shuffle() { return seqShuffle; },
		set shuffle(v: boolean) { seqShuffle = v; },
		get loop() { return seqLoop; },
		set loop(v: boolean) { seqLoop = v; },
		get speed() { return seqSpeed; },
		set speed(v: number) { seqSpeed = v; },
		get duration() { return seqDuration; },
		set duration(v: number) { seqDuration = v; },
		get currentIndex() { return seqCurrentIndex; },
		set currentIndex(v: number) { seqCurrentIndex = v; },
		get playlist() { return seqPlaylist; },
		set playlist(v: AnimationEntry[]) { seqPlaylist = v; }
	};
}

// STT state
let sttEnabled = $state(true);
let sttAutoSend = $state(false);
let sttModelLoading = $state(false);
let sttModelReady = $state(false);
let sttRecording = $state(false);
let sttTranscribing = $state(false);

export function getSttState() {
	return {
		get enabled() { return sttEnabled; },
		set enabled(v: boolean) { sttEnabled = v; },
		get autoSend() { return sttAutoSend; },
		set autoSend(v: boolean) { sttAutoSend = v; },
		get modelLoading() { return sttModelLoading; },
		set modelLoading(v: boolean) { sttModelLoading = v; },
		get modelReady() { return sttModelReady; },
		set modelReady(v: boolean) { sttModelReady = v; },
		get recording() { return sttRecording; },
		set recording(v: boolean) { sttRecording = v; },
		get transcribing() { return sttTranscribing; },
		set transcribing(v: boolean) { sttTranscribing = v; }
	};
}

// Memory system state
export type MemoryMode = 'auto-prune' | 'auto-summarize' | 'hybrid';

let memoryEnabled = $state(false);
let memoryMode = $state<MemoryMode>('hybrid');
let memoryMaxContext = $state(20);
let memoryWindowSize = $state(30);
let memoryTopK = $state(3);
let memorySimilarityThreshold = $state(0.5);
let memoryModelReady = $state(false);
let memoryModelLoading = $state(false);
let memorySummarizationProvider = $state('');
let memorySummarizationModel = $state('');
let memorySummarizationApiKey = $state('');
let memorySummarizationEndpoint = $state('');

export function getMemoryState() {
	return {
		get enabled() { return memoryEnabled; },
		set enabled(v: boolean) { memoryEnabled = v; },
		get mode() { return memoryMode; },
		set mode(v: MemoryMode) { memoryMode = v; },
		get maxContext() { return memoryMaxContext; },
		set maxContext(v: number) { memoryMaxContext = v; },
		get windowSize() { return memoryWindowSize; },
		set windowSize(v: number) { memoryWindowSize = v; },
		get topK() { return memoryTopK; },
		set topK(v: number) { memoryTopK = v; },
		get similarityThreshold() { return memorySimilarityThreshold; },
		set similarityThreshold(v: number) { memorySimilarityThreshold = v; },
		get modelReady() { return memoryModelReady; },
		set modelReady(v: boolean) { memoryModelReady = v; },
		get modelLoading() { return memoryModelLoading; },
		set modelLoading(v: boolean) { memoryModelLoading = v; },
		get summarizationProvider() { return memorySummarizationProvider; },
		set summarizationProvider(v: string) { memorySummarizationProvider = v; },
		get summarizationModel() { return memorySummarizationModel; },
		set summarizationModel(v: string) { memorySummarizationModel = v; },
		get summarizationApiKey() { return memorySummarizationApiKey; },
		set summarizationApiKey(v: string) { memorySummarizationApiKey = v; },
		get summarizationEndpoint() { return memorySummarizationEndpoint; },
		set summarizationEndpoint(v: string) { memorySummarizationEndpoint = v; }
	};
}
