/// <reference lib="webworker" />

import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// Configure for remote models (Whisper models are ~40MB)
env.allowRemoteModels = true;
env.allowLocalModels = false;

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let isInitializing = false;
const MODEL_NAME = 'Xenova/whisper-tiny.en';
const DTYPE_PREFERENCES = ['q4', 'q8'] as const;
const createAsrPipeline = pipeline as unknown as (
	task: 'automatic-speech-recognition',
	model: string,
	options?: Record<string, unknown>
) => Promise<AutomaticSpeechRecognitionPipeline>;

async function initializeWhisperModel() {
	if (transcriber || isInitializing) return;

	isInitializing = true;
	console.log('[Worker] Initializing Whisper model...');

	try {
		let lastError: unknown = null;
		for (const dtype of DTYPE_PREFERENCES) {
			try {
				transcriber = await createAsrPipeline('automatic-speech-recognition', MODEL_NAME, {
					// @ts-ignore - cache option
					cache: 'force-cache',
					device: 'wasm',
					dtype
				});
				console.log(`[Worker] Whisper loaded with dtype=${dtype}`);
				break;
			} catch (err) {
				lastError = err;
				console.warn(`[Worker] Whisper dtype=${dtype} unavailable, trying fallback`, err);
			}
		}
		if (!transcriber) throw lastError instanceof Error ? lastError : new Error('Failed to load Whisper model');

		console.log('[Worker] Whisper model loaded');
		self.postMessage({ type: 'model-ready', success: true, modelName: MODEL_NAME });
	} catch (error: any) {
		console.error('[Worker] Failed to load Whisper model:', error);
		self.postMessage({ type: 'model-error', error: error.message });
	} finally {
		isInitializing = false;
	}
}

async function processAudioTranscription(
	audioData: Float32Array,
	options: { chunk_length_s?: number; stride_length_s?: number } = {}
) {
	if (!transcriber) throw new Error('Whisper model not initialized');

	console.log('[Worker] Starting transcription, samples:', audioData.length);

	const output = await transcriber(audioData, {
		chunk_length_s: options.chunk_length_s || 10,
		stride_length_s: options.stride_length_s || 2
	});

	const rawText = Array.isArray(output) ? output[0]?.text?.trim() ?? '' : (output as any).text?.trim() ?? '';
	const text = sanitizeTranscript(rawText);
	console.log('[Worker] Transcription result:', text || '(empty)');

	return { success: true, transcript: text, raw: output };
}

function sanitizeTranscript(text: string): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return '';

	// Guard obvious Whisper failure mode: extremely long repeated character runs (e.g., "PPPPPP...")
	if (/(.)\1{24,}/.test(normalized)) return '';

	const collapsed = normalized.replace(/\s+/g, '');
	if (collapsed.length >= 32) {
		const unique = new Set(collapsed.toLowerCase());
		if (unique.size <= 2) return '';
	}

	return normalized;
}

self.addEventListener('message', async (event: MessageEvent) => {
	const { type, data, id } = event.data;

	try {
		switch (type) {
			case 'init-model':
				await initializeWhisperModel();
				break;

			case 'transcribe':
				if (!transcriber) {
					self.postMessage({ type: 'transcribe-error', id, error: 'Whisper model not initialized' });
					return;
				}
				const result = await processAudioTranscription(data.audioData, data.options);
				self.postMessage({ type: 'transcribe-result', id, result });
				break;

			case 'unload-model':
				if (transcriber) {
					// Release the pipeline and its ONNX session to free GPU/WASM memory
					try { await (transcriber as any).dispose?.(); } catch { /* no dispose method */ }
					transcriber = null;
				}
				self.postMessage({ type: 'model-unloaded', id });
				break;

			case 'get-status':
				self.postMessage({
					type: 'status-response',
					id,
					status: { modelLoaded: !!transcriber, modelName: MODEL_NAME, isInitializing }
				});
				break;

			default:
				console.warn('[Worker] Unknown message type:', type);
		}
	} catch (error: any) {
		console.error('[Worker] Error:', error);
		self.postMessage({ type: 'error', id, error: error.message });
	}
});

console.log('[Worker] Whisper Worker started');
