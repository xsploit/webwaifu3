type StreamTextFn = typeof import('ai').streamText;
type CreateOpenAIFn = typeof import('@ai-sdk/openai').createOpenAI;
type CreateOpenResponsesFn = typeof import('@ai-sdk/open-responses').createOpenResponses;

type AiSdkRuntime = {
	streamText: StreamTextFn;
	createOpenAI: CreateOpenAIFn;
	createOpenResponses: CreateOpenResponsesFn;
};

let aiSdkRuntimePromise: Promise<AiSdkRuntime> | null = null;
async function loadAiSdkRuntime(): Promise<AiSdkRuntime> {
	if (!aiSdkRuntimePromise) {
		aiSdkRuntimePromise = Promise.all([
			import('ai'),
			import('@ai-sdk/openai'),
			import('@ai-sdk/open-responses')
		]).then(([aiModule, openaiModule, openResponsesModule]) => ({
			streamText: aiModule.streamText,
			createOpenAI: openaiModule.createOpenAI,
			createOpenResponses: openResponsesModule.createOpenResponses
		}));
	}
	return aiSdkRuntimePromise;
}

const OPENROUTER_REFERER = 'https://webwaifu.vercel.app';
const OPENROUTER_TITLE = 'WEBWAIFU 3';

export type LlmProvider = 'ollama' | 'lmstudio' | 'openai' | 'openrouter';

export interface ModelInfo {
	id: string;
	name: string;
}

export type ChatMessage = {
	role: 'system' | 'user' | 'assistant';
	content: string;
};

export class LlmClient {
	provider: LlmProvider = 'ollama';
	apiKey = '';
	endpoint = 'http://localhost:11434';
	model = '';
	systemPrompt = '';
	temperature = 0.8;
	maxTokens = 256;
	numCtx = 4096;
	flashAttn = true;
	kvCacheType = 'q8_0';

	conversationHistory: { role: string; content: string }[] = [];
	onResponseReceived: ((text: string) => void) | null = null;
	onStreamChunk: ((delta: string) => void) | null = null;
	onError: ((error: Error) => void) | null = null;

	_buildMessages(userMessage: string): ChatMessage[] {
		return [
			{ role: 'system' as const, content: this.systemPrompt || '' },
			{ role: 'user' as const, content: userMessage }
		];
	}

	_getOllamaBaseUrl() {
		const fallback = 'http://localhost:11434';
		if (!this.endpoint) return fallback;
		try {
			const parsed = new URL(this.endpoint);
			return `${parsed.protocol}//${parsed.host}`;
		} catch {
			return fallback;
		}
	}

	_getLmStudioBaseUrl() {
		const fallback = 'http://localhost:1234';
		if (!this.endpoint || this.endpoint.includes('11434')) return fallback;
		try {
			const parsed = new URL(this.endpoint);
			return `${parsed.protocol}//${parsed.host}`;
		} catch {
			return fallback;
		}
	}

	_ensureApiKeyIfRequired() {
		if ((this.provider === 'openai' || this.provider === 'openrouter') && !this.apiKey) {
			throw new Error(`${this.provider} requires an API key.`);
		}
	}

	_resolveModel(aiSdk: AiSdkRuntime) {
		if (!this.model) {
			throw new Error('Select a model before generating a response.');
		}
		this._ensureApiKeyIfRequired();

		switch (this.provider) {
			case 'openai': {
				const openai = aiSdk.createOpenAI({ apiKey: this.apiKey });
				return openai.responses(this.model);
			}
			case 'openrouter': {
				const openrouter = aiSdk.createOpenResponses({
					name: 'openrouter',
					url: 'https://openrouter.ai/api/v1/responses',
					apiKey: this.apiKey,
					headers: {
						'HTTP-Referer': OPENROUTER_REFERER,
						'X-Title': OPENROUTER_TITLE
					}
				});
				return openrouter(this.model);
			}
			case 'ollama': {
				const ollamaOpts = { num_ctx: this.numCtx, flash_attn: this.flashAttn, kv_cache_type: this.kvCacheType };
				const ollama = aiSdk.createOpenResponses({
					name: 'ollama',
					url: `${this._getOllamaBaseUrl()}/v1/responses`,
					fetch: async (url, init) => {
						if (init?.body && typeof init.body === 'string') {
							try {
								const body = JSON.parse(init.body);
								body.options = ollamaOpts;
								init = { ...init, body: JSON.stringify(body) };
							} catch { /* pass through */ }
						}
						return globalThis.fetch(url, init);
					}
				});
				return ollama(this.model);
			}
			case 'lmstudio': {
				const lmstudio = aiSdk.createOpenResponses({
					name: 'lmstudio',
					url: `${this._getLmStudioBaseUrl()}/v1/responses`
				});
				return lmstudio(this.model);
			}
			default:
				throw new Error(`Unknown LLM provider: ${this.provider}`);
		}
	}

	async _fetchJson(url: string, headers: Record<string, string> = {}) {
		const res = await fetch(url, { headers });
		if (!res.ok) return null;
		return res.json();
	}

	clearHistory() {
		this.conversationHistory = [];
	}

	async generateResponse(
		userMessage: string,
		onStreamToken?: ((delta: string) => void) | null,
		opts: { signal?: AbortSignal; collectFullResponse?: boolean; contextMessages?: ChatMessage[] } = {}
	) {
		const { signal, collectFullResponse = true, contextMessages } = opts;
		console.log(`[LLM] Generating: provider=${this.provider} model=${this.model} endpoint=${this.endpoint}`);
		const aiSdk = await loadAiSdkRuntime();
		const model = this._resolveModel(aiSdk);
		const messages: ChatMessage[] = contextMessages || this._buildMessages(userMessage);
		console.log(`[LLM] Sending ${messages.length} messages, temp=${this.temperature}, maxTokens=${this.maxTokens}`);
		let streamedText = '';
		let chunkCount = 0;

		try {
			const result = await aiSdk.streamText({
				model,
				messages: messages as any,
				temperature: this.temperature,
				maxOutputTokens: this.maxTokens,
				abortSignal: signal
			});

			for await (const delta of result.textStream) {
				if (!delta) continue;
				chunkCount++;
				if (collectFullResponse) streamedText += delta;
				onStreamToken?.(delta);
				this.onStreamChunk?.(delta);
			}

			console.log(`[LLM] Stream done: ${chunkCount} chunks, ${streamedText.length} chars`);

			const finalizedText = (await result.text) || streamedText || '';
			const fullResponse = collectFullResponse ? finalizedText || streamedText : finalizedText;

			if (!fullResponse) {
				console.error('[LLM] Empty response from provider — no output generated');
			}

			this.onResponseReceived?.(fullResponse);
			return fullResponse;
		} catch (error: any) {
			console.error(`[LLM] Request failed: ${error?.message || error}`, error);
			// Try to extract API error body if available
			if (error?.responseBody) {
				console.error('[LLM] Response body:', error.responseBody);
			}
			if (error?.statusCode) {
				console.error(`[LLM] Status code: ${error.statusCode}`);
			}
			if (error?.cause) {
				console.error('[LLM] Cause:', error.cause?.message || error.cause);
			}
			this.onError?.(error as Error);
			throw error;
		}
	}

	async fetchModels(): Promise<ModelInfo[]> {
		try {
			switch (this.provider) {
				case 'ollama':
					return await this._fetchOllamaModels();
				case 'lmstudio':
					return await this._fetchLmStudioModels();
				case 'openai':
					return await this._fetchOpenAIModels();
				case 'openrouter':
					return await this._fetchOpenRouterModels();
				default:
					return [];
			}
		} catch (error) {
			console.error('[LlmClient] Failed to fetch models:', error);
			return [];
		}
	}

	async _fetchOllamaModels(): Promise<ModelInfo[]> {
		const data = await this._fetchJson(`${this._getOllamaBaseUrl()}/api/tags`);
		return data?.models?.map((m: { name: string }) => ({ id: m.name, name: m.name })) || [];
	}

	async _fetchLmStudioModels(): Promise<ModelInfo[]> {
		const data = await this._fetchJson(`${this._getLmStudioBaseUrl()}/v1/models`);
		return data?.data?.map((m: { id: string }) => ({ id: m.id, name: m.id })) || [];
	}

	async _fetchOpenAIModels(): Promise<ModelInfo[]> {
		const data = await this._fetchJson('https://api.openai.com/v1/models', {
			Authorization: `Bearer ${this.apiKey}`
		});
		return (
			data?.data
				?.filter((m: { id: string }) => m.id.includes('gpt'))
				.map((m: { id: string }) => ({ id: m.id, name: m.id })) || []
		);
	}

	async _fetchOpenRouterModels(): Promise<ModelInfo[]> {
		const data = await this._fetchJson(
			'https://openrouter.ai/api/v1/models',
			this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
		);
		return (
			data?.data?.map((m: { id: string; name?: string }) => ({
				id: m.id,
				name: m.name || m.id
			})) || []
		);
	}

	setProvider(provider: LlmProvider) {
		this.provider = provider;
		switch (provider) {
			case 'ollama':
				this.endpoint = 'http://localhost:11434';
				break;
			case 'lmstudio':
				this.endpoint = 'http://localhost:1234';
				break;
			case 'openai':
				this.endpoint = 'https://api.openai.com/v1/responses';
				break;
			case 'openrouter':
				this.endpoint = 'https://openrouter.ai/api/v1/responses';
				break;
		}
	}
}

let instance: LlmClient | null = null;
export function getLlmClient() {
	if (!instance) instance = new LlmClient();
	return instance;
}

