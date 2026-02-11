import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FishAudioClient, RealtimeEvents } from 'fish-audio';
import type { Backends } from 'fish-audio';

async function safeParseJson(request: Request) {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get('content-type') || '';

	// JSON mode: full text in body (used by speak())
	if (contentType.includes('application/json')) {
		return handleFullText(request);
	}

	// Streaming mode: text chunks arrive via request body stream (used by enqueueStreamChunk)
	// Config is in headers since body is the text stream
	return handleStreamingText(request);
};

/** Full text mode — receives all text at once, returns complete audio */
async function handleFullText(request: Request): Promise<Response> {
	const body = await safeParseJson(request);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { text, apiKey, referenceId, model, format, latency, sampleRate } = body;

	if (!text || !apiKey) {
		return json({ error: 'text and apiKey required' }, { status: 400 });
	}

	const client = new FishAudioClient({ apiKey });
	const sentences = splitIntoSentences(text);

	async function* textGenerator() {
		for (const sentence of sentences) {
			yield sentence + ' ';
		}
	}

	return runWebSocketSession(client, textGenerator(), {
		referenceId,
		model,
		format,
		latency,
		sampleRate: normalizeSampleRate(sampleRate)
	});
}

/** Streaming mode — reads text chunks from request body as they arrive */
async function handleStreamingText(request: Request): Promise<Response> {
	const apiKey = request.headers.get('x-fish-api-key');
	const referenceId = request.headers.get('x-fish-reference-id') || undefined;
	const model = request.headers.get('x-fish-model') || 's1';
	const format = request.headers.get('x-fish-format') || 'mp3';
	const latency = request.headers.get('x-fish-latency') || 'balanced';
	const sampleRate = normalizeSampleRate(request.headers.get('x-fish-sample-rate'));

	if (!apiKey) {
		return json({ error: 'x-fish-api-key header required' }, { status: 400 });
	}

	if (!request.body) {
		return json({ error: 'Request body stream required' }, { status: 400 });
	}

	const client = new FishAudioClient({ apiKey });

	// Async generator that reads text chunks from the request body stream
	async function* textFromBody() {
		const reader = request.body!.getReader();
		const decoder = new TextDecoder();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const text = decoder.decode(value, { stream: true });
				if (text) yield text;
			}
			// Flush any remaining bytes in the decoder
			const remaining = decoder.decode();
			if (remaining) yield remaining;
		} finally {
			reader.releaseLock();
		}
	}

	return runWebSocketSession(client, textFromBody(), {
		referenceId,
		model,
		format,
		latency,
		sampleRate
	});
}

interface SessionConfig {
	referenceId?: string;
	model?: string;
	format?: string;
	latency?: string;
	sampleRate?: number;
}

/** Shared: opens one Fish WebSocket session, streams audio chunks to client in real-time */
async function runWebSocketSession(
	client: FishAudioClient,
	textStream: AsyncGenerator<string>,
	config: SessionConfig
): Promise<Response> {
	const ttsRequest = {
		text: '', // content flows via text stream
		reference_id: config.referenceId || undefined,
		format: (config.format || 'mp3') as 'wav' | 'pcm' | 'mp3' | 'opus',
		sample_rate: config.sampleRate,
		mp3_bitrate: 128 as const,
		chunk_length: 200,
		normalize: true,
		latency: (config.latency || 'balanced') as 'normal' | 'balanced',
		prosody: { speed: 1.0, volume: 0.0 }
	};

	const ct =
		config.format === 'wav'
			? 'audio/wav'
			: config.format === 'pcm'
				? 'audio/pcm'
			: config.format === 'opus'
				? 'audio/opus'
				: 'audio/mpeg';

	try {
		const connection = await client.textToSpeech.convertRealtime(
			ttsRequest,
			textStream,
			(config.model || 's1') as Backends
		);

		// Stream audio chunks to client as they arrive from Fish WebSocket
		const stream = new ReadableStream({
			start(controller) {
				let chunkCount = 0;
				let streamEnded = false;

				const safeClose = () => {
					if (streamEnded) return;
					streamEnded = true;
					try {
						controller.close();
					} catch {
						// Ignore invalid state if stream has already transitioned.
					}
				};

				const safeError = (error: Error) => {
					if (streamEnded) return;
					streamEnded = true;
					try {
						controller.error(error);
					} catch {
						// Ignore invalid state if stream has already transitioned.
					}
				};

				connection.on(RealtimeEvents.AUDIO_CHUNK, (data: unknown) => {
					if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
						if (streamEnded) return;
						try {
							controller.enqueue(new Uint8Array(data));
							chunkCount++;
						} catch {
							// Ignore enqueue after stream closure.
						}
					}
				});

				connection.on(RealtimeEvents.ERROR, (err: unknown) => {
					console.error('[Fish Stream] WebSocket error:', err);
					safeError(err instanceof Error ? err : new Error(String(err)));
				});

				connection.on(RealtimeEvents.CLOSE, () => {
					console.log(`[Fish Stream] Session complete: ${chunkCount} audio chunks streamed`);
					safeClose();
				});
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': ct,
				...(config.sampleRate ? { 'x-fish-sample-rate': String(config.sampleRate) } : {})
			}
		});
	} catch (err: any) {
		const message = err?.message || 'Fish Audio WebSocket TTS failed';
		const status = /(?:^|\\s|:)429(?:\\b|$)/.test(message) ? 429 : 500;
		console.error('[Fish Stream] Error:', message);
		return json({ error: message }, { status });
	}
}

function normalizeSampleRate(value: unknown): number | undefined {
	if (value == null || value === '') return undefined;
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string'
				? Number(value)
				: NaN;
	if (!Number.isFinite(parsed)) return undefined;
	const rounded = Math.round(parsed);
	return rounded > 0 ? rounded : undefined;
}

function splitIntoSentences(text: string): string[] {
	const sentences: string[] = [];
	let current = '';

	for (let i = 0; i < text.length; i++) {
		current += text[i];
		const ch = text[i];

		if ((ch === '.' || ch === '!' || ch === '?') && current.trim().length > 5) {
			if (
				ch === '.' &&
				i > 0 &&
				i < text.length - 1 &&
				/\d/.test(text[i - 1]) &&
				/\d/.test(text[i + 1])
			) {
				continue;
			}
			sentences.push(current.trim());
			current = '';
		}
	}

	if (current.trim()) {
		sentences.push(current.trim());
	}

	return sentences.length > 0 ? sentences : [text];
}
