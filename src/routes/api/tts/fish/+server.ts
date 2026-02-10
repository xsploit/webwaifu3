import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FishAudioClient } from 'fish-audio';

async function safeParseJson(request: Request) {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get('content-type') || '';

	// Handle file upload for voice creation (multipart)
	if (contentType.includes('multipart/form-data')) {
		let formData: FormData;
		try {
			formData = await request.formData();
		} catch {
			return json({ error: 'Invalid multipart form data' }, { status: 400 });
		}

		const apiKey = formData.get('apiKey') as string;
		const title = formData.get('title') as string;
		const file = formData.get('voice') as File | null;

		if (!apiKey || !title || !file) {
			return json({ error: 'apiKey, title, and voice file required' }, { status: 400 });
		}

		const client = new FishAudioClient({ apiKey });
		try {
			const result = await client.voices.ivc.create({
				title,
				voices: [file],
				visibility: 'private',
				train_mode: 'fast',
				enhance_audio_quality: true
			});
			console.log('[Fish] Created voice model:', result._id, result.title);
			return json({ id: result._id, title: result.title || title });
		} catch (err: any) {
			console.error('[Fish] Create model error:', err.message);
			return json({ error: err.message || 'Failed to create voice model' }, { status: 500 });
		}
	}

	if (!contentType.includes('application/json')) {
		return json({ error: 'Unsupported content-type, expected application/json or multipart/form-data' }, { status: 415 });
	}

	// JSON body actions
	const body = await safeParseJson(request);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	// List models (user's own)
	if (body.action === 'list-models') {
		if (!body.apiKey) return json({ items: [] });
		const client = new FishAudioClient({ apiKey: body.apiKey });
		try {
			const result = await client.voices.search({
				page_size: 100,
				self: true
			});
			const items = (result.items || []).map((m) => ({
				id: m._id,
				name: m.title || m._id,
				author: m.author?.nickname,
				languages: m.languages,
				state: m.state
			}));
			return json({ items });
		} catch (err: any) {
			console.error('[Fish] List models error:', err.message);
			return json({ items: [] });
		}
	}

	// Search public models
	if (body.action === 'search-models') {
		if (!body.apiKey) return json({ items: [] });
		const client = new FishAudioClient({ apiKey: body.apiKey });
		try {
			const result = await client.voices.search({
				page_size: 20,
				title: body.query || '',
				self: false
			});
			const items = (result.items || []).map((m) => ({
				id: m._id,
				name: m.title || m._id,
				author: m.author?.nickname,
				languages: m.languages
			}));
			return json({ items });
		} catch (err: any) {
			return json({ items: [] });
		}
	}

	// Delete model
	if (body.action === 'delete-model') {
		if (!body.apiKey || !body.modelId) return json({ error: 'apiKey and modelId required' }, { status: 400 });
		const client = new FishAudioClient({ apiKey: body.apiKey });
		try {
			await client.voices.delete(body.modelId);
			return json({ ok: true });
		} catch (err: any) {
			return json({ error: err.message }, { status: 500 });
		}
	}

	// TTS synthesis
	const { text, apiKey, referenceId, model, format, latency } = body;

	if (!text || !apiKey) {
		return json({ error: 'text and apiKey required' }, { status: 400 });
	}

	const client = new FishAudioClient({ apiKey });

	try {
		const stream = await client.textToSpeech.convert(
			{
				text,
				format: (format || 'mp3') as any,
				mp3_bitrate: 128,
				chunk_length: 200,
				normalize: true,
				latency: (latency || 'balanced') as 'normal' | 'balanced',
				reference_id: referenceId || undefined,
				prosody: { speed: 1.0, volume: 0.0 }
			},
			(model || 'speech-1.5') as any
		);

		// Collect the ReadableStream into a single buffer
		const reader = stream.getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}

		const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
		const audioBuffer = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			audioBuffer.set(chunk, offset);
			offset += chunk.length;
		}

		return new Response(audioBuffer, {
			headers: {
				'Content-Type': format === 'wav' ? 'audio/wav' : format === 'opus' ? 'audio/opus' : 'audio/mpeg',
				'Content-Length': audioBuffer.length.toString()
			}
		});
	} catch (err: any) {
		const message = err?.message || 'Fish Audio TTS failed';
		const status = /(?:^|\\s|:)429(?:\\b|$)/.test(message) ? 429 : 500;
		return json({ error: message }, { status });
	}
};
