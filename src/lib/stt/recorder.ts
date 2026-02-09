export class SttRecorder {
	private worker: Worker | null = null;
	private stream: MediaStream | null = null;
	private audioContext: AudioContext | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;
	private processorNode: ScriptProcessorNode | null = null;
	private audioChunks: Float32Array[] = [];
	private recording = false;
	private modelReady = false;
	private messageId = 0;
	private pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

	onModelReady: (() => void) | null = null;
	onModelError: ((error: string) => void) | null = null;
	onTranscript: ((text: string) => void) | null = null;
	onError: ((error: string) => void) | null = null;

	async initialize() {
		this.worker = new Worker(new URL('./whisper-worker.ts', import.meta.url), { type: 'module' });

		this.worker.addEventListener('message', (e: MessageEvent) => {
			const { type, id, result, error, status } = e.data;

			switch (type) {
				case 'model-ready':
					this.modelReady = true;
					this.onModelReady?.();
					break;
				case 'model-error':
					this.onModelError?.(error);
					break;
				case 'transcribe-result':
					if (this.pendingRequests.has(id)) {
						this.pendingRequests.get(id)!.resolve(result);
						this.pendingRequests.delete(id);
					}
					if (result?.transcript) {
						this.onTranscript?.(result.transcript);
					}
					break;
				case 'transcribe-error':
					if (this.pendingRequests.has(id)) {
						this.pendingRequests.get(id)!.reject(new Error(error));
						this.pendingRequests.delete(id);
					}
					this.onError?.(error);
					break;
				case 'status-response':
					if (this.pendingRequests.has(id)) {
						this.pendingRequests.get(id)!.resolve(status);
						this.pendingRequests.delete(id);
					}
					break;
				case 'error':
					if (this.pendingRequests.has(id)) {
						this.pendingRequests.get(id)!.reject(new Error(error));
						this.pendingRequests.delete(id);
					}
					this.onError?.(error);
					break;
			}
		});

		this.worker.postMessage({ type: 'init-model' });
	}

	async startRecording() {
		if (this.recording) return;

		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
			});

			this.audioContext = new AudioContext({ sampleRate: 16000 });
			this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
			this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
			this.audioChunks = [];

			this.processorNode.onaudioprocess = (e) => {
				if (this.recording) {
					const data = e.inputBuffer.getChannelData(0);
					this.audioChunks.push(new Float32Array(data));
				}
			};

			this.sourceNode.connect(this.processorNode);
			this.processorNode.connect(this.audioContext.destination);
			this.recording = true;
		} catch (err: any) {
			this.onError?.('Microphone access denied: ' + err.message);
		}
	}

	async stopRecording(): Promise<string | null> {
		if (!this.recording) return null;
		this.recording = false;

		// Stop media tracks
		this.stream?.getTracks().forEach((t) => t.stop());
		this.processorNode?.disconnect();
		this.sourceNode?.disconnect();

		if (this.audioContext && this.audioContext.state !== 'closed') {
			await this.audioContext.close();
		}

		this.stream = null;
		this.sourceNode = null;
		this.processorNode = null;
		this.audioContext = null;

		// Merge audio chunks
		const totalLength = this.audioChunks.reduce((sum, c) => sum + c.length, 0);
		if (totalLength === 0) return null;

		const merged = new Float32Array(totalLength);
		let offset = 0;
		for (const chunk of this.audioChunks) {
			merged.set(chunk, offset);
			offset += chunk.length;
		}
		this.audioChunks = [];

		// Send to worker for transcription
		if (!this.worker || !this.modelReady) {
			this.onError?.('Whisper model not ready');
			return null;
		}

		const id = ++this.messageId;
		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve: (r) => resolve(r?.transcript ?? null), reject });
			this.worker!.postMessage(
				{ type: 'transcribe', id, data: { audioData: merged, options: { chunk_length_s: 10, stride_length_s: 2 } } },
				[merged.buffer]
			);
		});
	}

	isRecording() {
		return this.recording;
	}

	isModelReady() {
		return this.modelReady;
	}

	unloadModel() {
		if (this.worker && this.modelReady) {
			this.worker.postMessage({ type: 'unload-model', id: ++this.messageId });
			this.modelReady = false;
		}
	}

	destroy() {
		this.recording = false;
		this.stream?.getTracks().forEach((t) => t.stop());
		this.audioChunks = [];
		if (this.audioContext && this.audioContext.state !== 'closed') {
			this.audioContext.close().catch(() => {});
		}
		this.audioContext = null;
		this.processorNode = null;
		this.sourceNode = null;
		this.stream = null;
		this.pendingRequests.clear();
		this.worker?.terminate();
		this.worker = null;
	}
}

let instance: SttRecorder | null = null;
export function getSttRecorder() {
	if (!instance) instance = new SttRecorder();
	return instance;
}
