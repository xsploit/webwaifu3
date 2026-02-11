/**
 * Kokoro-JS TTS Wrapper for SvelteKit
 * 
 * High-quality TTS running entirely in the browser via WebGPU/WASM.
 * Uses the hexgrad/Kokoro model with 28 voices.
 * 
 * @see https://github.com/hexgrad/kokoro
 */

import type { RawAudio, ProgressCallback } from '@huggingface/transformers';

// Import dynamically to avoid SSR issues
let KokoroTTS: typeof import('kokoro-js').KokoroTTS | null = null;

let tts: InstanceType<typeof import('kokoro-js').KokoroTTS> | null = null;
let audioCtx: AudioContext | null = null;
let isInitializing = false;
let isReady = false;

// Track initialization callbacks
const initCallbacks: Array<() => void> = [];
const errorCallbacks: Array<(err: Error) => void> = [];

/**
 * Available voices in Kokoro TTS
 */
export const KOKORO_VOICES = {
    // American Female
    af_heart: { name: 'Heart', language: 'en-US', gender: 'female' },
    af_alloy: { name: 'Alloy', language: 'en-US', gender: 'female' },
    af_aoede: { name: 'Aoede', language: 'en-US', gender: 'female' },
    af_bella: { name: 'Bella', language: 'en-US', gender: 'female' },
    af_jessica: { name: 'Jessica', language: 'en-US', gender: 'female' },
    af_kore: { name: 'Kore', language: 'en-US', gender: 'female' },
    af_nicole: { name: 'Nicole', language: 'en-US', gender: 'female' },
    af_nova: { name: 'Nova', language: 'en-US', gender: 'female' },
    af_river: { name: 'River', language: 'en-US', gender: 'female' },
    af_sarah: { name: 'Sarah', language: 'en-US', gender: 'female' },
    af_sky: { name: 'Sky', language: 'en-US', gender: 'female' },
    // American Male
    am_adam: { name: 'Adam', language: 'en-US', gender: 'male' },
    am_echo: { name: 'Echo', language: 'en-US', gender: 'male' },
    am_eric: { name: 'Eric', language: 'en-US', gender: 'male' },
    am_fenrir: { name: 'Fenrir', language: 'en-US', gender: 'male' },
    am_liam: { name: 'Liam', language: 'en-US', gender: 'male' },
    am_michael: { name: 'Michael', language: 'en-US', gender: 'male' },
    am_onyx: { name: 'Onyx', language: 'en-US', gender: 'male' },
    am_puck: { name: 'Puck', language: 'en-US', gender: 'male' },
    am_santa: { name: 'Santa', language: 'en-US', gender: 'male' },
    // British Female
    bf_emma: { name: 'Emma', language: 'en-GB', gender: 'female' },
    bf_isabella: { name: 'Isabella', language: 'en-GB', gender: 'female' },
    bf_alice: { name: 'Alice', language: 'en-GB', gender: 'female' },
    bf_lily: { name: 'Lily', language: 'en-GB', gender: 'female' },
    // British Male
    bm_george: { name: 'George', language: 'en-GB', gender: 'male' },
    bm_lewis: { name: 'Lewis', language: 'en-GB', gender: 'male' },
    bm_daniel: { name: 'Daniel', language: 'en-GB', gender: 'male' },
    bm_fable: { name: 'Fable', language: 'en-GB', gender: 'male' },
} as const;

export type KokoroVoice = keyof typeof KOKORO_VOICES;

export interface KokoroInitOptions {
    /** Data type: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16' (smaller = faster but less quality) */
    dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
    /** Device: 'webgpu' (fast, GPU) | 'wasm' (CPU fallback) | null (auto-detect) */
    device?: 'webgpu' | 'wasm' | 'cpu' | null;
    /** Progress callback for model download */
    onProgress?: ProgressCallback;
}

/**
 * Initialize Kokoro TTS
 * Downloads model on first load (q4 default for faster startup)
 */
export async function initKokoroTTS(options: KokoroInitOptions = {}): Promise<void> {
    if (isReady) return;
    if (isInitializing) {
        return new Promise((resolve, reject) => {
            initCallbacks.push(resolve);
            errorCallbacks.push(reject);
        });
    }

    isInitializing = true;

    try {
        // Dynamic import to avoid SSR issues
        const kokoroModule = await import('kokoro-js');
        KokoroTTS = kokoroModule.KokoroTTS;

        console.log('[Kokoro] Loading model with options:', options);

        // Dispatch status event
        window.dispatchEvent(new CustomEvent('kokoro-tts-status', {
            detail: 'Downloading Kokoro TTS model...'
        }));

        const progressCallback: ProgressCallback = (progress) => {
            if (options.onProgress) options.onProgress(progress);
            if (progress.status === 'progress') {
                const pct = ((progress.progress ?? 0) * 100).toFixed(1);
                window.dispatchEvent(new CustomEvent('kokoro-tts-status', {
                    detail: `Downloading: ${pct}%`
                }));
            }
        };

        tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
            dtype: options.dtype ?? 'q4',
            device: options.device ?? 'webgpu',
            progress_callback: progressCallback,
        });

        console.log('[Kokoro] TTS ready! Available voices:', Object.keys(tts.voices).length);
        window.dispatchEvent(new CustomEvent('kokoro-tts-status', { detail: '' }));

        isReady = true;
        isInitializing = false;
        initCallbacks.forEach(cb => cb());
        initCallbacks.length = 0;
        errorCallbacks.length = 0;
    } catch (e: unknown) {
        console.error('[Kokoro] Failed to initialize:', e);
        isInitializing = false;
        const error = e instanceof Error ? e : new Error(String(e));
        errorCallbacks.forEach(cb => cb(error));
        initCallbacks.length = 0;
        errorCallbacks.length = 0;
        throw error;
    }
}

/**
 * Check if TTS is ready
 */
export function isKokoroReady(): boolean {
    return isReady && tts !== null;
}

/**
 * Get list of available voices
 */
export function getVoices(): typeof KOKORO_VOICES {
    return KOKORO_VOICES;
}

export interface TTSResult {
    samples: Float32Array;
    sampleRate: number;
}

/**
 * Generate speech from text
 * 
 * @param text - Text to synthesize
 * @param voice - Voice ID (e.g. 'af_heart', 'am_adam')
 * @param speed - Speech speed (default 1.0)
 */
export async function generateSpeech(
    text: string,
    voice: KokoroVoice = 'af_heart',
    speed: number = 1.0
): Promise<TTSResult> {
    if (!isKokoroReady() || !tts) {
        throw new Error('Kokoro TTS not initialized - call initKokoroTTS() first');
    }

    console.log(`[Kokoro] Generating: "${text.substring(0, 50)}..." voice=${voice} speed=${speed}`);

    const audio: RawAudio = await tts.generate(text, { voice, speed });

    console.log(`[Kokoro] Generated ${audio.audio.length} samples at ${audio.sampling_rate}Hz`);

    return {
        samples: audio.audio,
        sampleRate: audio.sampling_rate,
    };
}

/**
 * Generate speech and play immediately
 */
export async function speakText(
    text: string,
    voice: KokoroVoice = 'af_heart',
    speed: number = 1.0
): Promise<void> {
    const audio = await generateSpeech(text, voice, speed);

    if (!audioCtx) {
        audioCtx = new AudioContext({ sampleRate: audio.sampleRate });
    }

    const buffer = audioCtx.createBuffer(1, audio.samples.length, audio.sampleRate);
    buffer.getChannelData(0).set(audio.samples);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();

    return new Promise(resolve => {
        source.onended = () => resolve();
    });
}

/**
 * Generate speech as WAV Blob
 */
export async function generateSpeechBlob(
    text: string,
    voice: KokoroVoice = 'af_heart',
    speed: number = 1.0
): Promise<Blob> {
    const audio = await generateSpeech(text, voice, speed);
    return samplesToWavBlob(audio.samples, audio.sampleRate);
}

/**
 * Stream speech generation (for long text)
 */
export async function* streamSpeech(
    text: string,
    voice: KokoroVoice = 'af_heart',
    speed: number = 1.0
): AsyncGenerator<TTSResult, void, void> {
    if (!isKokoroReady() || !tts) {
        throw new Error('Kokoro TTS not initialized - call initKokoroTTS() first');
    }

    for await (const chunk of tts.stream(text, { voice, speed })) {
        yield {
            samples: chunk.audio.audio,
            sampleRate: chunk.audio.sampling_rate,
        };
    }
}

/**
 * Convert Float32 samples to WAV Blob
 */
function samplesToWavBlob(floatSamples: Float32Array, sampleRate: number): Blob {
    const samples = new Int16Array(floatSamples.length);
    for (let i = 0; i < samples.length; i++) {
        let s = floatSamples[i];
        if (s >= 1) s = 1;
        else if (s <= -1) s = -1;
        samples[i] = s * 32767;
    }

    const buf = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buf);

    // WAV header
    view.setUint32(0, 0x46464952, true);  // "RIFF"
    view.setUint32(4, 36 + samples.length * 2, true);
    view.setUint32(8, 0x45564157, true);  // "WAVE"
    view.setUint32(12, 0x20746d66, true); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);  // PCM
    view.setUint16(22, 1, true);  // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x61746164, true); // "data"
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        view.setInt16(offset, samples[i], true);
        offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
}

/**
 * Clean up resources
 */
export function destroyKokoroTTS(): void {
    tts = null;
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }
    isReady = false;
}
