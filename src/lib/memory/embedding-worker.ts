/// <reference lib="webworker" />

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

env.allowRemoteModels = true;
env.allowLocalModels = false;

let embedder: FeatureExtractionPipeline | null = null;
let isInitializing = false;
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

async function initializeModel() {
	if (embedder || isInitializing) return;

	isInitializing = true;
	console.log('[EmbeddingWorker] Loading model:', MODEL_NAME);

	try {
		embedder = await pipeline('feature-extraction', MODEL_NAME, {
			// @ts-ignore - cache option
			cache: 'force-cache'
		});

		console.log('[EmbeddingWorker] Model loaded');
		self.postMessage({ type: 'model-ready', success: true, modelName: MODEL_NAME });
	} catch (error: any) {
		console.error('[EmbeddingWorker] Failed to load model:', error);
		self.postMessage({ type: 'model-error', error: error.message });
	} finally {
		isInitializing = false;
	}
}

async function embedText(text: string): Promise<Float32Array> {
	if (!embedder) throw new Error('Embedding model not initialized');

	const output = await embedder(text, { pooling: 'mean', normalize: true });
	// output is a Tensor — .data is the underlying Float32Array
	return new Float32Array(output.data as Float32Array);
}

async function embedBatch(texts: string[]): Promise<Float32Array[]> {
	if (!embedder) throw new Error('Embedding model not initialized');

	const results: Float32Array[] = [];
	for (const text of texts) {
		const output = await embedder(text, { pooling: 'mean', normalize: true });
		results.push(new Float32Array(output.data as Float32Array));
	}
	return results;
}

self.addEventListener('message', async (event: MessageEvent) => {
	const { type, data, id } = event.data;

	try {
		switch (type) {
			case 'init-model':
				await initializeModel();
				break;

			case 'embed-text': {
				if (!embedder) {
					self.postMessage({ type: 'embed-error', id, error: 'Model not initialized' });
					return;
				}
				const vector = await embedText(data.text);
				self.postMessage({ type: 'embed-result', id, vector }, [vector.buffer]);
				break;
			}

			case 'embed-batch': {
				if (!embedder) {
					self.postMessage({ type: 'embed-error', id, error: 'Model not initialized' });
					return;
				}
				const vectors = await embedBatch(data.texts);
				const buffers = vectors.map(v => v.buffer);
				self.postMessage({ type: 'embed-batch-result', id, vectors }, buffers);
				break;
			}

			case 'unload-model':
				if (embedder) {
					try { await (embedder as any).dispose?.(); } catch { /* no dispose */ }
					embedder = null;
				}
				self.postMessage({ type: 'model-unloaded', id });
				break;

			case 'get-status':
				self.postMessage({
					type: 'status-response',
					id,
					status: { modelLoaded: !!embedder, modelName: MODEL_NAME, isInitializing }
				});
				break;

			default:
				console.warn('[EmbeddingWorker] Unknown message type:', type);
		}
	} catch (error: any) {
		console.error('[EmbeddingWorker] Error:', error);
		self.postMessage({ type: 'error', id, error: error.message });
	}
});

console.log('[EmbeddingWorker] Started');
