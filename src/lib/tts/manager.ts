import { isKokoroReady, generateSpeechBlob, KOKORO_VOICES, type KokoroVoice } from './kokoro.js';

// NOTE: Worker URL must be inline in `new Worker()` call so Vite
// recognizes the pattern and bundles the worker as a proper JS file.

export interface LipSyncData {
	wordBoundaries: WordBoundary[];
	phonemes: string[] | null;
	text: string;
}

export interface WordBoundary {
	word: string;
	offset: number;
	duration: number;
}

interface ChunkData {
	audioBlob: Blob;
	wordBoundaries: WordBoundary[];
	phonemes: string[] | null;
	text: string;
	sampleRate?: number | null;
}

export interface VoiceInfo {
	id: string;
	name: string;
	locale?: string;
	gender?: string;
	author?: string;
	language?: string;
}

type KokoroDtype = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
type KokoroDevice = 'webgpu' | 'wasm' | 'cpu' | null;

/** Accumulates LLM tokens and flushes on sentence-ending punctuation.
 *  Shared by both Kokoro and Fish TTS paths. */
class SentenceAccumulator {
	private buffer = '';
	private static sentenceEnds = new Set(['.', '!', '?', ',', ';', ':']);

	addToken(token: string): string | null {
		this.buffer += token;
		// Paragraph break → flush
		if (this.buffer.includes('\n\n')) {
			const sentence = this.buffer.trim();
			this.buffer = '';
			return sentence || null;
		}
		const last = this.buffer[this.buffer.length - 1];
		if (last && SentenceAccumulator.sentenceEnds.has(last)) {
			// Protect decimal numbers (3.14)
			if (last === '.' && this.buffer.length > 1 && /\d/.test(this.buffer[this.buffer.length - 2])) {
				return null;
			}
			const sentence = this.buffer.trim();
			this.buffer = '';
			return sentence || null;
		}
		// Fallback flush for long unpunctuated runs to keep latency low.
		if (last && this.buffer.length >= 80 && /\s/.test(last)) {
			const sentence = this.buffer.trim();
			this.buffer = '';
			return sentence || null;
		}
		return null;
	}

	flush(): string | null {
		const sentence = this.buffer.trim();
		this.buffer = '';
		return sentence || null;
	}

	clear() { this.buffer = ''; }
}

export class TtsManager {
	provider: 'fish' | 'kokoro' = 'kokoro';
	kokoroVoice: KokoroVoice = 'af_heart';
	kokoroDtype: KokoroDtype = 'q4';
	kokoroDevice: KokoroDevice = 'webgpu';
	fishApiKey = '';
	fishVoiceId = '';
	fishModel: 's1' | 'speech-1.5' | 'speech-1.6' = 's1';
	fishLatency: 'normal' | 'balanced' = 'balanced';
	fishSampleRate = 24000;
	enableTts = true;

	audioContext: AudioContext | null = null;
	audioQueue: any[] = [];
	isPlaying = false;
	currentSource: AudioBufferSourceNode | null = null;
	currentAudio: HTMLAudioElement | null = null;

	// Shared streaming state (used by both providers)
	textQueue: string[] = [];
	accumulator = new SentenceAccumulator();
	chunkBuffer = '';  // Batches cleaned sentences to minimum length before TTS
	isFirstChunkOfTurn = true;
	ttsWorkerRunning = false;
	ttsWorker: Worker | null = null;
	kokoroReadyInWorker = false;
	synthesizing = false;
	pendingChunk: ChunkData | null = null;  // Prefetched chunk for zero-gap Kokoro playback

	// Fish WebSocket streaming
	_fishAbortController: AbortController | null = null;
	_fishTextEncoder = new TextEncoder();
	_fishTextController: WritableStreamDefaultWriter<Uint8Array> | null = null;
	_fishAudioPromise: Promise<void> | null = null;
	_fishResponseSampleRate: number | null = null;
	_fishChunkCount = 0;
	_fishTotalBytes = 0;
	_fishPlaybackCursorTime = 0;
	_fishTrailingByte: number | null = null;
	_fishActiveSources = new Set<AudioBufferSourceNode>();
	_fishLipSyncChain: Promise<void> = Promise.resolve();
	_phonemizerPromise: Promise<{ phonemize: (text: string, language?: string) => Promise<string[]> } | null> | null = null;
	_analyserConnected = false;

	wordBoundaries: WordBoundary[] = [];
	currentPhonemes: string[] | null = null;
	wordBoundaryStartTime: number | null = null;

	audioAnalyser: AnalyserNode | null = null;
	audioSource: MediaElementAudioSourceNode | null = null;
	audioDataArray: Uint8Array<ArrayBuffer> | null = null;

	onSpeechStarted: (() => void) | null = null;
	onSpeechFinished: (() => void) | null = null;
	onError: ((error: Error) => void) | null = null;
	onLipSyncData: ((data: LipSyncData) => void) | null = null;

	async initialize() {
		if (this.audioContext && this.audioContext.state !== 'closed') {
			try { await this.audioContext.close(); } catch { /* ignore */ }
		}
		this.audioSource = null;
		this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		this.audioAnalyser = this.audioContext.createAnalyser();
		this.audioAnalyser.fftSize = 128;
		this.audioAnalyser.smoothingTimeConstant = 0.05;
		this._analyserConnected = false;
		this.audioDataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
		this.startTtsWorker();
		console.log('[TtsManager] Initialized with lip sync support');
	}

	async speak(text: string) {
		if (!this.enableTts || !text || text.trim().length === 0) return;
		console.log('[TtsManager] speak() called with:', text.slice(0, 50));
		const chunks = this._chunkText(text);
		for (const chunk of chunks) {
			this.textQueue.push(chunk);
		}
		console.log('[TtsManager] Queue length now:', this.textQueue.length);
		if (!this.ttsWorkerRunning) await this.initialize();
		this._processNext();
	}

	/** Unified streaming entry — accumulates LLM tokens, splits on punctuation,
	 *  batches to minimum length, routes to Kokoro queue or Fish WebSocket. */
	enqueueStreamChunk(chunk: string, isFinal = false) {
		if (!this.enableTts) return;

		// 1. Feed token to shared accumulator
		let sentence: string | null = null;
		if (chunk) {
			sentence = this.accumulator.addToken(chunk);
		}

		// 2. Clean sentence and add to chunk buffer
		if (sentence) {
			const cleaned = this._cleanForSpeech(sentence);
			if (cleaned.length >= 3) {
				this.chunkBuffer += (this.chunkBuffer ? ' ' : '') + cleaned;
			}
		}

		// On final, flush any remaining text in the accumulator
		if (isFinal) {
			const remaining = this.accumulator.flush();
			if (remaining) {
				const cleaned = this._cleanForSpeech(remaining);
				if (cleaned.length >= 3) {
					this.chunkBuffer += (this.chunkBuffer ? ' ' : '') + cleaned;
				}
			}
		}

		// 3. Flush chunk buffer when long enough (lower threshold for first chunk).
		// Fish benefits from earlier flushes so TTS synthesis can overlap LLM generation.
		const threshold = this.isFirstChunkOfTurn
			? 12
			: this.provider === 'fish'
				? 28
				: 70;
		if (this.chunkBuffer.length >= threshold || (isFinal && this.chunkBuffer.length > 2)) {
			const chunks = this._splitForTts(this.chunkBuffer);
			for (const c of chunks) {
				if (c.length > 2) {
					console.log('[TtsManager] Queued:', c.slice(0, 50));
					this._sendToProvider(c);
					this.isFirstChunkOfTurn = false;
				}
			}
			this.chunkBuffer = '';
		}

		// 4. Finalize on last chunk
		if (isFinal) {
			this.chunkBuffer = '';
			this.isFirstChunkOfTurn = true;
			this._finalizeProvider();
		}
	}

	/** Route a TTS-ready text chunk to the active provider */
	_sendToProvider(text: string) {
		if (this.provider === 'fish') {
			// Realtime mode: keep one Fish WebSocket session open and stream text chunks into it.
			if (!this._fishTextController) {
				this._startFishStreamSession();
			}
			if (!this._fishTextController) {
				this.onError?.(new Error('Fish realtime stream unavailable (missing API key or failed stream init)'));
				return;
			}
			// Generate approximate word boundaries + phonemes for lip sync
		this._fishLipSyncChain = this._fishLipSyncChain.then(() => this._appendFishApproxLipSync(text));

		void this._fishTextController
				.write(this._fishTextEncoder.encode(text + ' '))
				.catch((err) => {
					const e = err instanceof Error ? err : new Error(String(err));
					this.onError?.(e);
				});
		} else {
			// Kokoro: queue for worker processing
			this.textQueue.push(text);
			if (!this.ttsWorkerRunning && this.textQueue.length > 0) this.initialize();
			this._processNext();
		}
	}

	/** Finalize the current turn for the active provider */
	_finalizeProvider() {
		if (this.provider === 'fish') {
			if (this._fishTextController) {
				void this._fishTextController.close().catch(() => {});
				this._fishTextController = null;
			}
			void this._finalizeFishStream();
		} else {
			// Kokoro: just kick the queue — it'll drain naturally
			if (!this.ttsWorkerRunning && this.textQueue.length > 0) this.initialize();
			this._processNext();
		}
	}

	stop() {
		this.ttsWorkerRunning = false;
		this.synthesizing = false;
		this.textQueue.length = 0;
		this.audioQueue.length = 0;
		this.accumulator.clear();
		this.chunkBuffer = '';
		this.isFirstChunkOfTurn = true;
		this.pendingChunk = null;

		if (this._fishTextController) {
			void this._fishTextController.close().catch(() => {});
			this._fishTextController = null;
		}
		this._fishAudioPromise = null;
		this._resetFishRealtimeState(true);

		if (this._fishAbortController) {
			this._fishAbortController.abort();
			this._fishAbortController = null;
		}

		if (this.currentSource) {
			try { this.currentSource.stop(); } catch { /* Already stopped */ }
			this.currentSource = null;
		}

		if (this.currentAudio) {
			this.currentAudio.onplay = null;
			this.currentAudio.onended = null;
			this.currentAudio.onerror = null;
			if (this.currentAudio.src?.startsWith('blob:')) {
				URL.revokeObjectURL(this.currentAudio.src);
			}
			try { this.currentAudio.pause(); } catch { /* ignore */ }
			this.currentAudio = null;
		}

		this.isPlaying = false;
		this.wordBoundaryStartTime = null;
	}

	clearQueue() {
		this.stop();
	}

	destroy() {
		this.stop();
		this.ttsWorkerRunning = false;
		this.kokoroReadyInWorker = false;
		if (this.ttsWorker) {
			this.ttsWorker.terminate();
			this.ttsWorker = null;
		}
		if (this.audioContext && this.audioContext.state !== 'closed') {
			this.audioContext.close().catch(() => { });
		}
		this.audioContext = null;
	}

	initKokoroInWorker(options: { dtype?: KokoroDtype; device?: KokoroDevice } = {}) {
		if (this.ttsWorker) {
			window.dispatchEvent(new CustomEvent('kokoro-tts-status', { detail: 'Already initialized' }));
			return;
		}
		const dtype = options.dtype ?? this.kokoroDtype;
		const device = options.device ?? this.kokoroDevice;
		this.kokoroDtype = dtype;
		this.kokoroDevice = device;
		this.ttsWorker = new Worker(new URL('./tts-worker.ts', import.meta.url), { type: 'module' });
		this.ttsWorker.onmessage = (e: MessageEvent) => this._onTtsWorkerMessage(e);
		this.ttsWorker.onerror = (err) => {
			this.kokoroReadyInWorker = false;
			window.dispatchEvent(new CustomEvent('kokoro-tts-status', { detail: 'Worker error: ' + err.message }));
		};
		this.ttsWorker.postMessage({ type: 'init', options: { dtype, device } });
		window.dispatchEvent(new CustomEvent('kokoro-tts-status', { detail: 'Downloading Kokoro TTS model...' }));
	}

	reinitKokoroInWorker(options: { dtype?: KokoroDtype; device?: KokoroDevice } = {}) {
		this.stop();
		if (this.ttsWorker) {
			this.ttsWorker.terminate();
			this.ttsWorker = null;
		}
		this.kokoroReadyInWorker = false;
		this.initKokoroInWorker(options);
	}

	_onTtsWorkerMessage(e: MessageEvent) {
		const { type, audioBlob, wordBoundaries, text, error, detail } = e.data;
		if (type === 'init-done') {
			this.kokoroReadyInWorker = true;
			window.dispatchEvent(new CustomEvent('kokoro-tts-status', { detail: '' }));
			this._processNext();
		} else if (type === 'init-progress' && detail?.status === 'progress') {
			const pct = ((detail.progress ?? 0) * 100).toFixed(1);
			window.dispatchEvent(new CustomEvent('kokoro-tts-status', { detail: `Downloading: ${pct}%` }));
		} else if (type === 'init-error') {
			this.kokoroReadyInWorker = false;
			window.dispatchEvent(new CustomEvent('kokoro-tts-status', { detail: 'Failed: ' + error }));
		} else if (type === 'result') {
			this.synthesizing = false;
			if (!audioBlob || !(audioBlob instanceof Blob) || audioBlob.size === 0) {
				console.warn('[TtsManager] Worker result missing or empty audio blob');
				this._processNext();
				return;
			}
			const chunkData: ChunkData = { audioBlob, wordBoundaries: wordBoundaries ?? [], phonemes: null, text: text ?? '' };

			// Kokoro prefetch: if currently playing, stash for zero-gap transition
			if (this.isPlaying) {
				this.pendingChunk = chunkData;
				this._processNext();  // Start synthesizing NEXT chunk while this one waits
			} else {
				this._playChunkAndContinue(chunkData);
			}
		} else if (type === 'result-error') {
			this.synthesizing = false;
			this.onError?.(new Error(error));
			this._processNext();
		}
	}

	/** Play a chunk and kick the queue when it finishes */
	_playChunkAndContinue(chunkData: ChunkData) {
		const play = async () => {
			if (!this.audioContext) await this.initialize();
			return this._playAudioChunk(chunkData);
		};
		play().then(() => this._processNext()).catch((err) => {
			console.error('[TtsManager] Playback error:', err);
			this._processNext();
		});
	}

	_processNext() {
		// Allow synthesis even while playing (prefetch) — just not double-synthesis
		if (!this.ttsWorkerRunning || this.textQueue.length === 0 || this.synthesizing) return;

		if (this.provider === 'kokoro') {
			if (!this.ttsWorker || !this.kokoroReadyInWorker) return;
			const text = this.textQueue.shift()!;
			this.synthesizing = true;
			console.log('[TtsManager] Worker processing:', text.slice(0, 40), 'provider: kokoro');
			this.ttsWorker!.postMessage({ type: 'synthesize', text, voice: this.kokoroVoice, speed: 1.0 });
			return;
		}

		// Fish — event-driven via speak() fallback path (non-streaming)
		const text = this.textQueue.shift()!;
		this.synthesizing = true;
		console.log('[TtsManager] Processing:', text.slice(0, 40), 'provider:', this.provider);

		this._synthesizeWithLipSync(text)
			.then(async (chunkData) => {
				this.synthesizing = false;
				if (!chunkData) {
					this._processNext();
					return;
				}
				await this._playAudioChunk(chunkData);
				this._processNext();
			})
			.catch((err) => {
				console.error('[TtsManager] Synthesis error:', err);
				this.synthesizing = false;
				this.isPlaying = false;
				this.onError?.(err as Error);
				this._processNext();
			});
	}

	async startTtsWorker() {
		if (this.ttsWorkerRunning) return;
		this.ttsWorkerRunning = true;
		this._processNext();
	}

	async _synthesizeWithLipSync(text: string): Promise<ChunkData | null> {
		if (this.provider === 'kokoro') return this._synthesizeKokoro(text);
		if (this.provider === 'fish') return this._synthesizeFish(text);
		throw new Error(`Unsupported TTS provider: ${this.provider}`);
	}

	async _synthesizeFish(text: string): Promise<ChunkData> {
		if (!this.fishApiKey) throw new Error('Fish Audio requires API key');
		const effectiveModel = this.fishModel === 's1' ? 'speech-1.5' : this.fishModel;

		let lastError: Error | null = null;
		let audioBlob: Blob | null = null;

		for (let attempt = 0; attempt < 2; attempt++) {
			this._fishAbortController = new AbortController();
			try {
				// Use stable non-stream endpoint per chunk to avoid HTTP/2 protocol issues under rapid chunk cadence.
				const response = await fetch('/api/tts/fish', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					signal: this._fishAbortController.signal,
					body: JSON.stringify({
						text,
						apiKey: this.fishApiKey,
						referenceId: this.fishVoiceId || undefined,
						model: effectiveModel,
						format: 'mp3',
						latency: this.fishLatency
					})
				});

				if (!response.ok) {
					const err = await response.json().catch(() => ({ error: response.statusText }));
					throw new Error(err.error || `Fish Audio error ${response.status}`);
				}

				audioBlob = await response.blob();
				break;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				if (attempt === 0) {
					await new Promise((r) => setTimeout(r, 150));
					continue;
				}
			} finally {
				this._fishAbortController = null;
			}
		}

		if (!audioBlob) {
			throw lastError ?? new Error('Fish Audio synthesis failed');
		}

		return {
			audioBlob: new Blob([audioBlob], { type: 'audio/mpeg' }),
			wordBoundaries: [],
			phonemes: null,
			text
		};
	}

	async _synthesizeKokoro(text: string): Promise<ChunkData | null> {
		if (!isKokoroReady()) {
			throw new Error('Kokoro TTS not initialized - call initKokoroTTS() first');
		}

		const audioBlob = await generateSpeechBlob(text, this.kokoroVoice, 1.0);

		const words = text.split(/\s+/).filter(w => w.length > 0);
		const wordBoundaries: WordBoundary[] = [];
		const avgDuration = 300000;
		let offset = 0;
		for (const word of words) {
			wordBoundaries.push({ word, offset, duration: avgDuration });
			offset += avgDuration;
		}

		return { audioBlob, wordBoundaries, phonemes: null, text };
	}

	async _getPhonemizer() {
		if (!this._phonemizerPromise) {
			this._phonemizerPromise = import('phonemizer')
				.then((mod) => ({ phonemize: mod.phonemize }))
				.catch((err) => {
					console.warn('[TtsManager] Phonemizer unavailable, using fallback visemes:', err);
					return null;
				});
		}
		return this._phonemizerPromise;
	}

	async _appendFishApproxLipSync(text: string) {
		const cleaned = this._cleanForSpeech(text);
		if (!cleaned) return;

		const words = cleaned.split(/\s+/).filter(Boolean);
		if (words.length === 0) return;

		let phonemeWords: string[] = [];
		const phonemizer = await this._getPhonemizer();
		if (phonemizer) {
			try {
				const result = await phonemizer.phonemize(cleaned, 'en-us');
				const line = Array.isArray(result) ? (result[0] ?? '') : '';
				phonemeWords = line.split(/\s+/).filter(Boolean);
			} catch {
				phonemeWords = [];
			}
		}

		if (phonemeWords.length === 0) {
			phonemeWords = words.map((w) => w.toLowerCase());
		}
		if (phonemeWords.length < words.length) {
			const filled = [...phonemeWords];
			while (filled.length < words.length) {
				filled.push(words[filled.length].toLowerCase());
			}
			phonemeWords = filled;
		} else if (phonemeWords.length > words.length) {
			phonemeWords = phonemeWords.slice(0, words.length);
		}

		let cursorSeconds = 0;
		if (this.wordBoundaries.length > 0) {
			const last = this.wordBoundaries[this.wordBoundaries.length - 1];
			cursorSeconds = (last.offset + last.duration) / 10000000;
		}

		const appendedBoundaries: WordBoundary[] = [];
		for (let i = 0; i < words.length; i++) {
			const word = words[i];
			const sanitizedWord = word.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '') || word;
			let durationSec = 0.09 + Math.min(sanitizedWord.length, 14) * 0.027;
			if (/[,.!?;:]$/.test(word)) durationSec += 0.07;
			durationSec = Math.max(0.1, Math.min(durationSec, 0.5));

			appendedBoundaries.push({
				word: sanitizedWord,
				offset: Math.round(cursorSeconds * 10000000),
				duration: Math.round(durationSec * 10000000)
			});
			cursorSeconds += durationSec;
		}

		const existingPhonemes = this.currentPhonemes ?? [];
		this.wordBoundaries = [...this.wordBoundaries, ...appendedBoundaries];
		this.currentPhonemes = [...existingPhonemes, ...phonemeWords];

		const maxWords = 320;
		if (this.wordBoundaries.length > maxWords && this.currentPhonemes) {
			const drop = this.wordBoundaries.length - maxWords;
			this.wordBoundaries = this.wordBoundaries.slice(drop);
			this.currentPhonemes = this.currentPhonemes.slice(drop);
		}

		this.onLipSyncData?.({
			wordBoundaries: this.wordBoundaries,
			phonemes: this.currentPhonemes,
			text: cleaned
		});
	}

	_ensureAnalyserConnected() {
		if (!this.audioContext || !this.audioAnalyser || this._analyserConnected) return;
		try {
			this.audioAnalyser.connect(this.audioContext.destination);
			this._analyserConnected = true;
		} catch {
			// Ignore duplicate/invalid graph connection attempts.
		}
	}

	_resetFishRealtimeState(stopSources = false) {
		this._fishResponseSampleRate = null;
		this._fishChunkCount = 0;
		this._fishTotalBytes = 0;
		this._fishTrailingByte = null;
		const now = this.audioContext?.currentTime ?? 0;
		this._fishPlaybackCursorTime = stopSources ? now : Math.max(this._fishPlaybackCursorTime, now);

		if (stopSources) {
			for (const source of this._fishActiveSources) {
				try { source.onended = null; } catch { /* ignore */ }
				try { source.stop(); } catch { /* already stopped */ }
				try { source.disconnect(); } catch { /* ignore */ }
			}
			this._fishActiveSources.clear();
		}
	}

	_scheduleFishPcmChunk(chunk: Uint8Array, sampleRate: number) {
		if (!this.audioContext || !this.audioAnalyser || chunk.length === 0) return;

		let pcm = chunk;
		if (this._fishTrailingByte !== null) {
			const merged = new Uint8Array(chunk.length + 1);
			merged[0] = this._fishTrailingByte;
			merged.set(chunk, 1);
			pcm = merged;
			this._fishTrailingByte = null;
		}

		if ((pcm.length & 1) === 1) {
			this._fishTrailingByte = pcm[pcm.length - 1];
			pcm = pcm.subarray(0, pcm.length - 1);
		}
		if (pcm.length === 0) return;

		const sampleCount = pcm.length / 2;
		const floatSamples = new Float32Array(sampleCount);
		for (let i = 0, j = 0; i < sampleCount; i++, j += 2) {
			let sample = (pcm[j + 1] << 8) | pcm[j];
			if (sample >= 0x8000) sample -= 0x10000;
			floatSamples[i] = sample / 32768;
		}

		if (this.audioContext.state === 'suspended') {
			void this.audioContext.resume().catch(() => {});
		}

		const audioBuffer = this.audioContext.createBuffer(1, sampleCount, sampleRate);
		audioBuffer.copyToChannel(floatSamples, 0);

		const source = this.audioContext.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(this.audioAnalyser);
		this._ensureAnalyserConnected();

		const now = this.audioContext.currentTime;
		if (this._fishPlaybackCursorTime < now + 0.01) {
			this._fishPlaybackCursorTime = now + 0.01;
		}
		const startAt = this._fishPlaybackCursorTime;
		source.start(startAt);
		this._fishPlaybackCursorTime += audioBuffer.duration;

		this._fishActiveSources.add(source);
		source.onended = () => {
			this._fishActiveSources.delete(source);
			try { source.disconnect(); } catch { /* ignore */ }
		};

		if (!this.isPlaying) {
			this.isPlaying = true;
			this.wordBoundaryStartTime = startAt;
			this.onSpeechStarted?.();
			this.onLipSyncData?.({
				wordBoundaries: this.wordBoundaries,
				phonemes: this.currentPhonemes,
				text: ''
			});
		}
	}

	async _waitForFishPlaybackDrain() {
		if (!this.audioContext) return;
		const remaining = this._fishPlaybackCursorTime - this.audioContext.currentTime;
		if (remaining > 0) {
			await new Promise((resolve) => setTimeout(resolve, Math.ceil(remaining * 1000) + 25));
		}
	}

	_startFishStreamSession() {
		if (!this.fishApiKey) return;
		this._resetFishRealtimeState(false);
		this._fishLipSyncChain = Promise.resolve();
		this.wordBoundaries = [];
		this.currentPhonemes = [];
		this.wordBoundaryStartTime = null;

		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
		this._fishTextController = writable.getWriter();
		this._fishAbortController = new AbortController();

		console.log('[TtsManager] Opening Fish WebSocket stream session');

		// Read streamed audio chunks from server as they arrive from Fish WebSocket
		this._fishAudioPromise = fetch('/api/tts/fish-stream', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/octet-stream',
				'x-fish-api-key': this.fishApiKey,
				'x-fish-reference-id': this.fishVoiceId || '',
				'x-fish-model': this.fishModel,
				'x-fish-format': 'pcm',
				'x-fish-sample-rate': String(this.fishSampleRate),
				'x-fish-latency': this.fishLatency,
			},
			body: readable,
			signal: this._fishAbortController.signal,
			// @ts-ignore — duplex: 'half' for streaming request body (Chrome 105+)
			duplex: 'half',
		}).then(async (response) => {
			if (!response.ok) {
				const err = await response.json().catch(() => ({ error: response.statusText }));
				throw new Error(err.error || `Fish Audio error ${response.status}`);
			}
			const responseType = (response.headers.get('Content-Type') || 'audio/mpeg').toLowerCase();
			const isPcm = responseType.includes('audio/pcm');
			const sampleRateHeader = response.headers.get('x-fish-sample-rate');
			const parsed = sampleRateHeader ? Number(sampleRateHeader) : NaN;
			const sampleRate = Number.isFinite(parsed) ? parsed : this.fishSampleRate;
			this._fishResponseSampleRate = sampleRate;

			if (!response.body) {
				throw new Error('Fish stream missing response body');
			}

			if (!this.audioContext) await this.initialize();
			const now = this.audioContext?.currentTime ?? 0;
			this._fishPlaybackCursorTime = Math.max(this._fishPlaybackCursorTime, now);

			const reader = response.body!.getReader();
			const fallbackChunks: Uint8Array[] = [];
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (!value || value.length === 0) continue;
				this._fishChunkCount++;
				this._fishTotalBytes += value.length;
				if (isPcm) {
					this._scheduleFishPcmChunk(value, sampleRate);
				} else {
					fallbackChunks.push(value);
				}
			}

			if (!isPcm && fallbackChunks.length > 0) {
				const blobParts: BlobPart[] = fallbackChunks.map((chunk) => {
					const copy = new Uint8Array(chunk.byteLength);
					copy.set(chunk);
					return copy;
				});
				const blob = new Blob(blobParts, { type: responseType });
				await this._playAudioChunk({
					audioBlob: blob,
					wordBoundaries: [],
					phonemes: null,
					text: '',
					sampleRate
				});
			}

			this._fishTrailingByte = null;
			console.log(
				`[TtsManager] Fish stream received: ${(this._fishTotalBytes / 1024).toFixed(1)}KB in ${this._fishChunkCount} chunks`
			);
		});
	}

	async _finalizeFishStream() {
		if (!this._fishAudioPromise) return;

		const audioPromise = this._fishAudioPromise;
		this._fishAudioPromise = null;

		try {
			await audioPromise;
			await this._waitForFishPlaybackDrain();
			if (this.isPlaying) {
				this.isPlaying = false;
				this.wordBoundaries = [];
				this.currentPhonemes = null;
				this.wordBoundaryStartTime = null;
				this.onSpeechFinished?.();
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			console.error('[TtsManager] Fish stream playback error:', err);
			this._resetFishRealtimeState(true);
			this.isPlaying = false;
			this.wordBoundaryStartTime = null;
			this.onError?.(err as Error);
		} finally {
			this._fishAbortController = null;
			this._resetFishRealtimeState(false);
		}
	}

	_pcmToWav(pcmBlob: Blob, sampleRate = 24000): Promise<Blob> {
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => {
				const pcmData = new Uint8Array(reader.result as ArrayBuffer);
				const wavHeader = new ArrayBuffer(44);
				const view = new DataView(wavHeader);
				view.setUint32(0, 0x52494646, false);
				view.setUint32(4, 36 + pcmData.length, true);
				view.setUint32(8, 0x57415645, false);
				view.setUint32(12, 0x666d7420, false);
				view.setUint32(16, 16, true);
				view.setUint16(20, 1, true);
				view.setUint16(22, 1, true);
				view.setUint32(24, sampleRate, true);
				view.setUint32(28, sampleRate * 2, true);
				view.setUint16(32, 2, true);
				view.setUint16(34, 16, true);
				view.setUint32(36, 0x64617461, false);
				view.setUint32(40, pcmData.length, true);
				resolve(new Blob([wavHeader, pcmData], { type: 'audio/wav' }));
			};
			reader.readAsArrayBuffer(pcmBlob);
		});
	}

	async _playAudioChunk(chunkData: ChunkData) {
		return new Promise<void>(async (resolve, reject) => {
			let { audioBlob, wordBoundaries, phonemes, text, sampleRate } = chunkData;

			if (this.currentAudio) {
				this.currentAudio.pause();
				if (this.currentAudio.src?.startsWith('blob:')) {
					URL.revokeObjectURL(this.currentAudio.src);
				}
				this.currentAudio = null;
			}

			if (audioBlob.type === 'audio/pcm') {
				audioBlob = await this._pcmToWav(audioBlob, sampleRate ?? this.fishSampleRate);
			}

			this.wordBoundaries = wordBoundaries;
			this.currentPhonemes = phonemes;
			this.wordBoundaryStartTime = null;

			if (!this.audioContext) {
				reject(new Error('AudioContext not initialized'));
				return;
			}

			const audioUrl = URL.createObjectURL(audioBlob);
			this.currentAudio = new Audio(audioUrl);

			try {
				if (this.audioSource) {
					try { this.audioSource.disconnect(); } catch { /* already disconnected */ }
					this.audioSource = null;
				}
				this.audioSource = this.audioContext.createMediaElementSource(this.currentAudio);
				this.audioSource.connect(this.audioAnalyser!);
				this._ensureAnalyserConnected();
			} catch (e) {
				console.warn('[TtsManager] Audio graph connect:', e);
			}

			if (this.audioContext.state === 'suspended') {
				this.audioContext.resume().catch(() => {});
			}

			this.currentAudio.onplay = () => {
				this.wordBoundaryStartTime = this.currentAudio!.currentTime || 0;
				if (this.audioContext!.state === 'suspended') {
					this.audioContext!.resume();
				}
				if (!this.isPlaying) {
					this.isPlaying = true;
					this.onSpeechStarted?.();
				}
				this.onLipSyncData?.({ wordBoundaries, phonemes, text });
			};

			this.currentAudio.onended = () => {
				URL.revokeObjectURL(audioUrl);
				this.isPlaying = false;

				// Kokoro prefetch: play pending chunk immediately for zero-gap audio
				if (this.pendingChunk) {
					const next = this.pendingChunk;
					this.pendingChunk = null;
					this._playChunkAndContinue(next);
				} else if (this.textQueue.length === 0) {
					this.wordBoundaries = [];
					this.currentPhonemes = null;
					this.onSpeechFinished?.();
				}
				resolve();
			};

			this.currentAudio.onerror = (error) => {
				URL.revokeObjectURL(audioUrl);
				this.isPlaying = false;
				reject(error);
			};

			this.currentAudio.play().catch(reject);
		});
	}

	_cleanForSpeech(text: string): string {
		return text
			.replace(/\*[^*]*\*/g, '')
			.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
			.replace(/([.!?,;:—])\1+/g, '$1')
			.replace(/\s+/g, ' ')
			.trim();
	}

	_chunkText(text: string): string[] {
		const cleaned = this._cleanForSpeech(text);
		if (cleaned.length < 3) return [];
		return this._splitForTts(cleaned);
	}

	_splitForTts(text: string): string[] {
		if (text.length <= 200) return [text];

		const parts: string[] = [];
		let current = '';
		for (let i = 0; i < text.length; i++) {
			current += text[i];
			const ch = text[i];
			if ((ch === ',' || ch === ';' || ch === ':' || ch === '—' ||
				ch === '.' || ch === '!' || ch === '?') && current.length >= 30) {
				parts.push(current.trim());
				current = '';
			}
		}
		if (current.trim()) parts.push(current.trim());

		const merged: string[] = [];
		for (const p of parts) {
			if (merged.length > 0 && (p.length < 10 || merged[merged.length - 1].length < 10)) {
				merged[merged.length - 1] += ' ' + p;
			} else {
				merged.push(p);
			}
		}

		return merged.filter(c => c.length > 2);
	}

	getAudioAmplitude(): number {
		if (!this.audioAnalyser || !this.audioDataArray) {
			return this.isPlaying ? 0.5 : 0;
		}
		if (!this.isPlaying) {
			return 0;
		}
		if (this.currentAudio && this.currentAudio.paused) {
			return 0;
		}

		this.audioAnalyser.getByteFrequencyData(this.audioDataArray);

		let sum = 0;
		const len = this.audioDataArray.length;
		for (let i = 0; i < len; i++) {
			let weight = 1.0;
			if (i < 20) weight = 2.0;
			else if (i < 50) weight = 1.5;
			sum += this.audioDataArray[i] * weight;
		}
		const average = sum / (len * 1.5);
		// Fish PCM is much hotter than HTMLAudioElement — scale down to avoid saturation
		const scale = this.currentAudio ? 2.5 : 1.0;
		return Math.min((average / 255) * scale, 1.0);
	}

	async getFishVoices(): Promise<VoiceInfo[]> {
		if (!this.fishApiKey) return [];
		try {
			const response = await fetch('/api/tts/fish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'list-voices', apiKey: this.fishApiKey })
			});
			if (!response.ok) return [];
			const data = await response.json();
			return (Array.isArray(data) ? data : []).map((v: any) => ({
				id: v.id || v._id,
				name: v.name || v.title || v._id,
				author: v.author,
				language: v.language
			}));
		} catch {
			return [];
		}
	}

	getKokoroVoices(): VoiceInfo[] {
		return Object.entries(KOKORO_VOICES).map(([id, info]) => ({
			id,
			name: info.name,
			locale: info.language,
			gender: info.gender
		}));
	}

	async getVoices(): Promise<VoiceInfo[]> {
		switch (this.provider) {
			case 'kokoro':
				return this.getKokoroVoices();
			case 'fish':
				return this.getFishVoices();
			default:
				return [];
		}
	}
}

let instance: TtsManager | null = null;
export function getTtsManager() {
	if (!instance) instance = new TtsManager();
	return instance;
}
