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

/** Accumulates LLM tokens and flushes on sentence-ending punctuation.
 *  Shared by both Kokoro and Fish TTS paths. */
class SentenceAccumulator {
	private buffer = '';
	private static sentenceEnds = new Set(['.', '!', '?']);

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
		if (this.audioContext && this.audioContext.state !== 'closed') {
			try { await this.audioContext.close(); } catch { /* ignore */ }
		}
		this.audioSource = null;
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

		// 3. Flush chunk buffer when long enough (lower threshold for first chunk)
		const threshold = this.isFirstChunkOfTurn ? 20 : 70;
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
			// Open the streaming session on first text
			if (!this._fishTextController) {
				this._startFishStreamSession();
			}
			if (!this._fishTextController) {
				this.onError?.(new Error('Fish stream unavailable (missing API key or failed stream init)'));
				return;
			}
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
			this._finalizeFishStream();
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

	_startFishStreamSession() {
		if (!this.fishApiKey) return;

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
				'x-fish-format': 'mp3',
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
			// Stream the response body — collect chunks as they arrive from Fish
			const reader = response.body!.getReader();
			const chunks: Uint8Array[] = [];
			let totalSize = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				totalSize += value.length;
			}
			console.log(`[TtsManager] Fish stream received: ${(totalSize / 1024).toFixed(1)}KB in ${chunks.length} chunks`);
			const blobParts: BlobPart[] = chunks.map((chunk) => {
				// Copy into a standard ArrayBuffer-backed view to satisfy strict BlobPart typing.
				const copy = new Uint8Array(chunk.byteLength);
				copy.set(chunk);
				return copy;
			});
			return new Blob(blobParts, { type: 'audio/mpeg' });
		});
	}

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
