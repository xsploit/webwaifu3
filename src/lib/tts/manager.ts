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
}

export interface VoiceInfo {
	id: string;
	name: string;
	locale?: string;
	gender?: string;
	author?: string;
	language?: string;
}

export class TtsManager {
	provider: 'fish' | 'kokoro' = 'kokoro';
	kokoroVoice: KokoroVoice = 'af_heart';
	fishApiKey = '';
	fishVoiceId = '';
	fishModel: 's1' | 'speech-1.5' | 'speech-1.6' = 's1';
	fishLatency: 'normal' | 'balanced' = 'balanced';
	enableTts = true;

	audioContext: AudioContext | null = null;
	audioQueue: any[] = [];
	isPlaying = false;
	currentSource: AudioBufferSourceNode | null = null;
	currentAudio: HTMLAudioElement | null = null;

	textQueue: string[] = [];
	streamBuffer = '';
	sentenceBuffer = '';  // Accumulates cleaned sentences until MIN_TTS_LENGTH
	isFirstChunkOfTurn = true;
	ttsWorkerRunning = false;
	ttsWorker: Worker | null = null;
	kokoroReadyInWorker = false;
	synthesizing = false;

	// Fish WebSocket streaming: send text chunks through one session as they arrive
	_fishStreamAccumulator = '';
	_fishAbortController: AbortController | null = null;
	_fishTextEncoder = new TextEncoder();
	_fishTextController: WritableStreamDefaultWriter<Uint8Array> | null = null;
	_fishAudioPromise: Promise<Blob> | null = null;

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
		// Close existing AudioContext before creating a new one
		if (this.audioContext && this.audioContext.state !== 'closed') {
			try { await this.audioContext.close(); } catch { /* ignore */ }
		}
		this.audioSource = null; // invalidated when context closes
		this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		this.audioAnalyser = this.audioContext.createAnalyser();
		this.audioAnalyser.fftSize = 128;
		this.audioAnalyser.smoothingTimeConstant = 0.05;
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

	enqueueStreamChunk(chunk: string, isFinal = false) {
		if (!this.enableTts) return;

		// Fish WebSocket: stream text chunks through one session as they arrive
		// Sentences are extracted and sent immediately — Fish synthesizes in parallel with LLM
		if (this.provider === 'fish') {
			this._fishStreamAccumulator += chunk || '';

			// Extract complete sentences and send each to Fish immediately
			const sentences = this._extractFishSentences(isFinal);
			for (const sentence of sentences) {
				const cleaned = this._cleanForSpeech(sentence);
				if (cleaned.length < 3) continue;

				// Open the streaming session on first text
				if (!this._fishTextController) {
					this._startFishStreamSession();
				}
				if (!this._fishTextController) {
					this.onError?.(
						new Error('Fish stream unavailable (missing API key or failed stream init)')
					);
					continue;
				}

				// Send this sentence to Fish via the streaming body
				void this._fishTextController
					.write(this._fishTextEncoder.encode(cleaned + ' '))
					.catch((err) => {
						const e = err instanceof Error ? err : new Error(String(err));
						this.onError?.(e);
					});
			}

			if (isFinal) {
				this._fishStreamAccumulator = '';
				this.isFirstChunkOfTurn = true;

				// Close the text stream — Fish will finish processing and send remaining audio
				if (this._fishTextController) {
					void this._fishTextController.close().catch(() => {
						// Stream may already be closed/canceled; ignore.
					});
					this._fishTextController = null;
				}

				// Play the collected audio
				this._finalizeFishStream();
			}
			return;
		}

		// Kokoro: sentence-level chunking for low-latency playback
		this.streamBuffer += chunk || '';

		// Extract complete sentences from the raw stream buffer
		const rawSentences = this._extractRawSentences(isFinal);

		// Clean each sentence and add to the persistent sentence buffer
		for (const raw of rawSentences) {
			const clean = this._cleanForSpeech(raw);
			if (clean.length < 3) continue;
			this.sentenceBuffer += (this.sentenceBuffer ? ' ' : '') + clean;
		}

		// Flush sentence buffer when it's long enough (or final)
		// First chunk of a turn uses a lower threshold for faster time-to-first-audio
		const threshold = this.isFirstChunkOfTurn ? 40 : 70;
		if (this.sentenceBuffer.length >= threshold || (isFinal && this.sentenceBuffer.length > 2)) {
			const chunks = this._splitForTts(this.sentenceBuffer);
			for (const c of chunks) {
				if (c.length > 2) {
					console.log('[TtsManager] Queued:', c.slice(0, 50));
					this.textQueue.push(c);
					this.isFirstChunkOfTurn = false;
				}
			}
			this.sentenceBuffer = '';
		}

		if (isFinal) {
			this.streamBuffer = '';
			this.sentenceBuffer = '';
			this.isFirstChunkOfTurn = true; // Reset for next turn
		}

		if (!this.ttsWorkerRunning && this.textQueue.length > 0) this.initialize();
		this._processNext();
	}

	stop() {
		this.ttsWorkerRunning = false;
		this.synthesizing = false;
		this.textQueue.length = 0;
		this.audioQueue.length = 0;
		this.streamBuffer = '';
		this.sentenceBuffer = '';
		this.isFirstChunkOfTurn = true;
		this._fishStreamAccumulator = '';

		// Close any active Fish text stream
		if (this._fishTextController) {
			void this._fishTextController.close().catch(() => {
				// already closed
			});
			this._fishTextController = null;
		}
		this._fishAudioPromise = null;

		// Abort any in-flight Fish WebSocket request
		if (this._fishAbortController) {
			this._fishAbortController.abort();
			this._fishAbortController = null;
		}

		if (this.currentSource) {
			try {
				this.currentSource.stop();
			} catch {
				// Already stopped
			}
			this.currentSource = null;
		}

		if (this.currentAudio) {
			this.currentAudio.onplay = null;
			this.currentAudio.onended = null;
			this.currentAudio.onerror = null;
			if (this.currentAudio.src?.startsWith('blob:')) {
				URL.revokeObjectURL(this.currentAudio.src);
			}
			try {
				this.currentAudio.pause();
			} catch {
				// ignore
			}
			this.currentAudio = null;
		}

		this.isPlaying = false;
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

	/**
	 * Initialize Kokoro TTS inside a Web Worker (so synthesis doesn't block animation).
	 * Call this from the TTS tab when user clicks "Initialize Kokoro".
	 */
	initKokoroInWorker(options: { dtype?: string; device?: string | null } = {}) {
		if (this.ttsWorker) {
			window.dispatchEvent(new CustomEvent('kokoro-tts-status', { detail: 'Already initialized' }));
			return;
		}
		this.ttsWorker = new Worker(new URL('./tts-worker.ts', import.meta.url), { type: 'module' });
		this.ttsWorker.onmessage = (e: MessageEvent) => this._onTtsWorkerMessage(e);
		this.ttsWorker.onerror = (err) => {
			this.kokoroReadyInWorker = false;
			window.dispatchEvent(new CustomEvent('kokoro-tts-status', { detail: 'Worker error: ' + err.message }));
		};
		this.ttsWorker.postMessage({ type: 'init', options: { dtype: options.dtype ?? 'q4', device: options.device ?? null } });
		window.dispatchEvent(new CustomEvent('kokoro-tts-status', { detail: 'Downloading Kokoro TTS model...' }));
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
			const play = async () => {
				if (!this.audioContext) await this.initialize();
				return this._playAudioChunk(chunkData);
			};
			play().then(() => this._processNext()).catch((err) => {
				console.error('[TtsManager] Playback error:', err);
				this._processNext();
			});
		} else if (type === 'result-error') {
			this.synthesizing = false;
			this.onError?.(new Error(error));
			this._processNext();
		}
	}

	_processNext() {
		if (!this.ttsWorkerRunning || this.textQueue.length === 0 || this.isPlaying || this.synthesizing) return;

		if (this.provider === 'kokoro') {
			if (!this.ttsWorker || !this.kokoroReadyInWorker) return;
			const text = this.textQueue.shift()!;
			this.synthesizing = true;
			console.log('[TtsManager] Worker processing:', text.slice(0, 40), 'provider: kokoro');
			this.ttsWorker!.postMessage({ type: 'synthesize', text, voice: this.kokoroVoice, speed: 1.0 });
			return;
		}

		// Fish — event-driven, no polling
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

		// Use WebSocket streaming endpoint for consistent voice (single session, no drift)
		this._fishAbortController = new AbortController();

		const response = await fetch('/api/tts/fish-stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: this._fishAbortController.signal,
			body: JSON.stringify({
				text,
				apiKey: this.fishApiKey,
				referenceId: this.fishVoiceId || undefined,
				model: this.fishModel,
				format: 'mp3',
				latency: this.fishLatency
			})
		});

		this._fishAbortController = null;

		if (!response.ok) {
			const err = await response.json().catch(() => ({ error: response.statusText }));
			throw new Error(err.error || `Fish Audio error ${response.status}`);
		}

		const audioBlob = await response.blob();
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

		// Generate simple word boundaries for lip sync
		const words = text.split(/\s+/).filter(w => w.length > 0);
		const wordBoundaries: WordBoundary[] = [];
		const avgDuration = 300000; // ~300ms per word in 100ns ticks
		let offset = 0;
		for (const word of words) {
			wordBoundaries.push({ word, offset, duration: avgDuration });
			offset += avgDuration;
		}

		return { audioBlob, wordBoundaries, phonemes: null, text };
	}

	/** Open a streaming fetch to Fish — text is sent via the body stream, audio comes back */
	_startFishStreamSession() {
		if (!this.fishApiKey) return;

		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
		this._fishTextController = writable.getWriter();
		this._fishAbortController = new AbortController();

		console.log('[TtsManager] Opening Fish WebSocket stream session');

		this._fishAudioPromise = fetch('/api/tts/fish-stream', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/octet-stream',
				'x-fish-api-key': this.fishApiKey,
				'x-fish-reference-id': this.fishVoiceId || '',
				'x-fish-model': this.fishModel,
				'x-fish-format': 'mp3',
				'x-fish-latency': this.fishLatency,
			},
			body: readable,
			signal: this._fishAbortController.signal,
			// duplex: 'half' = streaming request body (Fetch spec). Required when body is a ReadableStream
			// so the client can stream text to the server instead of buffering the whole body. Only value
			// supported by the Fetch API for streaming uploads. Chrome/Edge 105+.
			// @ts-ignore — not in all TS libs
			duplex: 'half',
		}).then(async (response) => {
			if (!response.ok) {
				const err = await response.json().catch(() => ({ error: response.statusText }));
				throw new Error(err.error || `Fish Audio error ${response.status}`);
			}
			return response.blob();
		});
	}

	/** Called on isFinal — waits for the audio response and plays it */
	async _finalizeFishStream() {
		if (!this._fishAudioPromise) return;

		const audioPromise = this._fishAudioPromise;
		this._fishAudioPromise = null;
		this._fishAbortController = null;

		try {
			const audioBlob = await audioPromise;
			if (!audioBlob || audioBlob.size === 0) {
				console.warn('[TtsManager] Fish stream returned empty audio');
				return;
			}

			console.log('[TtsManager] Fish stream audio ready:', (audioBlob.size / 1024).toFixed(1), 'KB');

			if (!this.audioContext) await this.initialize();
			if (!this.ttsWorkerRunning) await this.startTtsWorker();

			const chunkData: ChunkData = {
				audioBlob: new Blob([audioBlob], { type: 'audio/mpeg' }),
				wordBoundaries: [],
				phonemes: null,
				text: ''
			};

			await this._playAudioChunk(chunkData);
			this.onSpeechFinished?.();
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			console.error('[TtsManager] Fish stream playback error:', err);
			this.onError?.(err as Error);
		}
	}

	/** Extract complete sentences from _fishStreamAccumulator, leave remainder */
	_extractFishSentences(isFinal: boolean): string[] {
		const sentences: string[] = [];
		let lastIndex = 0;

		for (let i = 0; i < this._fishStreamAccumulator.length; i++) {
			const ch = this._fishStreamAccumulator[i];
			if (ch === '.' || ch === '!' || ch === '?') {
				// Protect decimal numbers
				if (ch === '.' && i > 0 && i < this._fishStreamAccumulator.length - 1 &&
					/\d/.test(this._fishStreamAccumulator[i - 1]) && /\d/.test(this._fishStreamAccumulator[i + 1])) {
					continue;
				}
				const sentence = this._fishStreamAccumulator.substring(lastIndex, i + 1).trim();
				if (sentence.length > 0) sentences.push(sentence);
				lastIndex = i + 1;
			}
		}

		this._fishStreamAccumulator = this._fishStreamAccumulator.substring(lastIndex);

		if (isFinal && this._fishStreamAccumulator.trim().length > 0) {
			sentences.push(this._fishStreamAccumulator.trim());
			this._fishStreamAccumulator = '';
		}

		return sentences;
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
			let { audioBlob, wordBoundaries, phonemes, text } = chunkData;

			if (this.currentAudio) {
				this.currentAudio.pause();
				// Revoke old blob URL to prevent memory leak
				if (this.currentAudio.src?.startsWith('blob:')) {
					URL.revokeObjectURL(this.currentAudio.src);
				}
				this.currentAudio = null;
			}

			if (audioBlob.type === 'audio/pcm') {
				audioBlob = await this._pcmToWav(audioBlob);
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
				this.audioAnalyser!.connect(this.audioContext.destination);
			} catch (e) {
				console.warn('[TtsManager] Audio graph connect:', e);
			}

			// Resume if suspended (browser autoplay policy) so play() can start
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
				if (this.textQueue.length === 0) {
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

	/** Strip roleplay actions (*text*), emojis, consecutive punctuation, and excess whitespace */
	_cleanForSpeech(text: string): string {
		return text
			.replace(/\*[^*]*\*/g, '')                         // *action text*
			.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '') // emojis
			.replace(/([.!?,;:—])\1+/g, '$1')                  // consecutive punctuation → single
			.replace(/\s+/g, ' ')                               // collapse whitespace
			.trim();
	}

	/** For non-streaming speak(): split full text into TTS-sized chunks */
	_chunkText(text: string): string[] {
		const cleaned = this._cleanForSpeech(text);
		if (cleaned.length < 3) return [];
		return this._splitForTts(cleaned);
	}

	/** Extract complete sentences from streamBuffer, leave remainder for next call */
	_extractRawSentences(isFinal: boolean): string[] {
		const sentences: string[] = [];
		let lastIndex = 0;

		for (let i = 0; i < this.streamBuffer.length; i++) {
			const ch = this.streamBuffer[i];
			if (ch === '.' || ch === '!' || ch === '?') {
				// Protect decimal numbers (e.g., 3.14)
				if (ch === '.' && i > 0 && i < this.streamBuffer.length - 1 &&
					/\d/.test(this.streamBuffer[i - 1]) && /\d/.test(this.streamBuffer[i + 1])) {
					continue;
				}
				const sentence = this.streamBuffer.substring(lastIndex, i + 1).trim();
				if (sentence.length > 0) sentences.push(sentence);
				lastIndex = i + 1;
			}
		}

		// Keep the unfinished part in streamBuffer
		this.streamBuffer = this.streamBuffer.substring(lastIndex);

		// On final, flush whatever remains
		if (isFinal && this.streamBuffer.trim().length > 0) {
			sentences.push(this.streamBuffer.trim());
			this.streamBuffer = '';
		}

		return sentences;
	}

	/** Split text into TTS-ready chunks: split long text at punctuation, batch short pieces */
	_splitForTts(text: string): string[] {
		if (text.length <= 200) return [text];

		// Split at commas, semicolons, colons, dashes, and sentence enders
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

		// Merge short fragments (under 10 chars) into their neighbor
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

	_sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	getAudioAmplitude(): number {
		if (!this.audioAnalyser || !this.audioDataArray) {
			return this.isPlaying ? 0.5 : 0;
		}
		// Skip FFT when audio is paused/ended - no point analyzing silence
		if (!this.isPlaying || !this.currentAudio || this.currentAudio.paused) {
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
		return Math.min((average / 255) * 2.5, 1.0);
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
