import { LlmClient } from '../../llm/client.js';

export interface ProviderConfig {
	id: string;
	label: string;
	type: 'local' | 'cloud';
	category: 'llm' | 'tts';
	needsApiKey: boolean;
	needsEndpoint: boolean;
	defaultEndpoint?: string;
}

export interface ProviderDefaults {
	model: string;
	apiKey: string;
	endpoint: string;
}

export const LLM_PROVIDERS: ProviderConfig[] = [
	{ id: 'ollama', label: 'Ollama', type: 'local', category: 'llm', needsApiKey: false, needsEndpoint: true, defaultEndpoint: 'http://localhost:11434' },
	{ id: 'lmstudio', label: 'LM Studio', type: 'local', category: 'llm', needsApiKey: false, needsEndpoint: true, defaultEndpoint: 'http://localhost:1234' },
	{ id: 'openai', label: 'OpenAI', type: 'cloud', category: 'llm', needsApiKey: true, needsEndpoint: false },
	{ id: 'openrouter', label: 'OpenRouter', type: 'cloud', category: 'llm', needsApiKey: true, needsEndpoint: false },
];

export const TTS_PROVIDERS: ProviderConfig[] = [
	{ id: 'fish', label: 'Fish Audio', type: 'cloud', category: 'tts', needsApiKey: true, needsEndpoint: false },
];

export async function testLlmProvider(
	providerId: string,
	apiKey: string,
	endpoint: string
): Promise<{ ok: boolean; models: { id: string; name: string }[]; error?: string }> {
	try {
		const client = new LlmClient();
		client.provider = providerId as any;
		client.apiKey = apiKey;
		client.endpoint = endpoint;
		const models = await client.fetchModels();
		if (models.length > 0) {
			return { ok: true, models };
		}
		return { ok: false, models: [], error: 'No models found' };
	} catch (e: any) {
		return { ok: false, models: [], error: e.message };
	}
}

export async function testFishProvider(
	apiKey: string
): Promise<{ ok: boolean; count?: number; error?: string }> {
	try {
		const res = await fetch('/api/tts/fish', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'list-models', apiKey })
		});
		const data = await res.json();
		if (!res.ok) return { ok: false, error: data.error || 'Request failed' };
		return { ok: true, count: data.items?.length ?? 0 };
	} catch (e: any) {
		return { ok: false, error: e.message };
	}
}
