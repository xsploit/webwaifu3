/**
 * TTS Worker: runs Kokoro synthesis off the main thread so animation/UI stay smooth.
 * WebGPU/WASM runs inside this worker.
 *
 * Device: null = auto (WebGPU if available, else WASM). Prefer WebGPU for speed.
 * dtype: "q8" = good balance; "q4" = lighter/faster, slightly worse quality (good for wasm/cpu).
 */
/// <reference lib="webworker" />

export type KokoroVoice = string;

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
	view.setUint32(0, 0x46464952, true);
	view.setUint32(4, 36 + samples.length * 2, true);
	view.setUint32(8, 0x45564157, true);
	view.setUint32(12, 0x20746d66, true);
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	view.setUint32(36, 0x61746164, true);
	view.setUint32(40, samples.length * 2, true);
	let offset = 44;
	for (let i = 0; i < samples.length; i++) {
		view.setInt16(offset, samples[i], true);
		offset += 2;
	}
	return new Blob([view], { type: 'audio/wav' });
}

let tts: any = null;

self.onmessage = async (e: MessageEvent) => {
	const { type, text, voice, speed, options } = e.data as {
		type: string;
		text?: string;
		voice?: KokoroVoice;
		speed?: number;
		options?: { dtype?: string; device?: string | null; onProgress?: (p: unknown) => void };
	};

	if (type === 'init') {
		try {
			const { KokoroTTS } = await import('kokoro-js');
			// device: null = auto (webgpu then wasm). Use "wasm" for CPU-only; "webgpu" to force GPU.
			// dtype: q8 = best balance; q4 = lighter/faster (good with device: "wasm" on low-end).
			tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
				dtype: options?.dtype ?? 'q8',
				device: options?.device ?? null,
				progress_callback: (p: unknown) => {
					self.postMessage({ type: 'init-progress', detail: p });
				}
			});
			self.postMessage({ type: 'init-done' });
		} catch (err) {
			self.postMessage({ type: 'init-error', error: err instanceof Error ? err.message : String(err) });
		}
		return;
	}

	if (type === 'synthesize') {
		if (!tts) {
			self.postMessage({ type: 'result-error', error: 'Kokoro not initialized' });
			return;
		}
		try {
			const v = voice ?? 'af_heart';
			const sp = speed ?? 1.0;
			const audio = await tts.generate(text ?? '', { voice: v, speed: sp });
			const blob = samplesToWavBlob(audio.audio, audio.sampling_rate);
			const words = (text ?? '').split(/\s+/).filter((w: string) => w.length > 0);
			const wordBoundaries = words.map((word: string, i: number) => ({
				word,
				offset: i * 300000,
				duration: 300000
			}));
			// Don't use transfer list: some environments lose the blob when transferring worker -> main
			self.postMessage({ type: 'result', audioBlob: blob, wordBoundaries, text: text ?? '' });
		} catch (err) {
			self.postMessage({
				type: 'result-error',
				error: err instanceof Error ? err.message : String(err)
			});
		}
	}
};
