import { getStorageManager, type EmbeddingEntry } from '../storage/index.js';
import type { MemoryMode } from '../stores/app.svelte.js';
import type { LlmProvider } from '../llm/client.js';

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface SimilarityResult {
	text: string;
	role: string;
	score: number;
	conversationId: number;
}

export class MemoryManager {
	worker: Worker | null = null;
	mode: MemoryMode = 'hybrid';
	enabled = false;
	maxContextMessages = 20;
	windowSize = 30;
	topK = 3;
	similarityThreshold = 0.5;
	modelReady = false;
	modelLoading = false;

	// Summarization LLM config
	summarizationProvider: LlmProvider | '' = '';
	summarizationModel = '';
	summarizationApiKey = '';
	summarizationEndpoint = '';

	private _pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
	private _requestId = 0;

	private _createWorker() {
		if (this.worker) return;
		this.worker = new Worker(
			new URL('./embedding-worker.ts', import.meta.url),
			{ type: 'module' }
		);
		this.worker.addEventListener('message', (e: MessageEvent) => this._handleWorkerMessage(e));
	}

	private _handleWorkerMessage(event: MessageEvent) {
		const { type, id, ...rest } = event.data;

		switch (type) {
			case 'model-ready':
				this.modelReady = true;
				this.modelLoading = false;
				console.log('[MemoryManager] Embedding model ready');
				break;
			case 'model-error':
				this.modelLoading = false;
				console.error('[MemoryManager] Embedding model failed:', rest.error);
				break;
			case 'model-unloaded':
				this.modelReady = false;
				this.modelLoading = false;
				console.log('[MemoryManager] Embedding model unloaded');
				break;
			case 'embed-result':
				this._resolveRequest(id, rest.vector);
				break;
			case 'embed-batch-result':
				this._resolveRequest(id, rest.vectors);
				break;
			case 'embed-error':
			case 'error':
				this._rejectRequest(id, new Error(rest.error));
				break;
		}

		// Also resolve pending requests for model lifecycle
		if (id && this._pendingRequests.has(id)) {
			if (type === 'model-ready' || type === 'model-unloaded') {
				this._resolveRequest(id, true);
			} else if (type === 'model-error') {
				this._rejectRequest(id, new Error(rest.error));
			}
		}
	}

	private _nextId(): string {
		return `req_${++this._requestId}`;
	}

	private _postAndWait<T>(message: any): Promise<T> {
		return new Promise((resolve, reject) => {
			const id = this._nextId();
			this._pendingRequests.set(id, { resolve, reject });
			this.worker!.postMessage({ ...message, id });
		});
	}

	private _resolveRequest(id: string, value: any) {
		const pending = this._pendingRequests.get(id);
		if (pending) {
			this._pendingRequests.delete(id);
			pending.resolve(value);
		}
	}

	private _rejectRequest(id: string, error: Error) {
		const pending = this._pendingRequests.get(id);
		if (pending) {
			this._pendingRequests.delete(id);
			pending.reject(error);
		}
	}

	async initEmbeddingModel() {
		if (this.modelReady || this.modelLoading) return;
		this._createWorker();
		this.modelLoading = true;
		try {
			await this._postAndWait({ type: 'init-model' });
		} catch (e) {
			this.modelLoading = false;
			throw e;
		}
	}

	async unloadModel() {
		if (!this.worker || !this.modelReady) return;
		await this._postAndWait({ type: 'unload-model' });
	}

	async embedText(text: string): Promise<Float32Array> {
		if (!this.modelReady) throw new Error('Embedding model not loaded');
		return this._postAndWait<Float32Array>({ type: 'embed-text', data: { text } });
	}

	async addMessage(role: string, content: string, conversationId: number, messageIndex: number) {
		if (!this.enabled || !this.modelReady) return;
		if (!content.trim()) return;

		try {
			const vector = await this.embedText(content);
			const storage = getStorageManager();
			await storage.saveEmbedding({
				conversationId,
				messageIndex,
				role,
				text: content,
				vector,
				timestamp: Date.now()
			});
		} catch (e) {
			console.error('[MemoryManager] Failed to embed message:', e);
		}
	}

	async searchSimilar(query: string, topK?: number): Promise<SimilarityResult[]> {
		if (!this.modelReady) return [];

		const queryVector = await this.embedText(query);
		const storage = getStorageManager();
		const allEmbeddings = await storage.getAllEmbeddings();

		if (allEmbeddings.length === 0) return [];

		const scored = allEmbeddings.map(emb => ({
			text: emb.text,
			role: emb.role,
			score: cosineSimilarity(queryVector, emb.vector),
			conversationId: emb.conversationId
		}));

		scored.sort((a, b) => b.score - a.score);

		const k = topK ?? this.topK;
		return scored
			.filter(s => s.score >= this.similarityThreshold)
			.slice(0, k);
	}

	async buildContext(
		userMessage: string,
		conversationHistory: { role: string; content: string }[],
		systemPrompt: string
	): Promise<{ role: string; content: string }[]> {
		const messages: { role: string; content: string }[] = [
			{ role: 'system', content: systemPrompt }
		];

		if (!this.enabled || !this.modelReady) {
			// Fallback: just system + user (no memory)
			messages.push({ role: 'user', content: userMessage });
			return messages;
		}

		const effectiveMode = this._resolveMode();

		// Get summaries for this conversation
		if (effectiveMode === 'auto-summarize') {
			const storage = getStorageManager();
			const currentId = await storage.getSetting('currentConversationId');
			if (currentId) {
				const summaries = await storage.getSummariesByConversation(currentId);
				if (summaries.length > 0) {
					const summaryText = summaries.map(s => s.summary).join('\n');
					messages.push({
						role: 'system',
						content: `[Memory Context - Previous Conversation Summary]\n${summaryText}`
					});
				}
			}
		}

		// Semantic search — find relevant past messages
		try {
			const similar = await this.searchSimilar(userMessage);
			for (const match of similar) {
				// Don't inject if the text is already in the recent history window
				const inHistory = conversationHistory.some(h => h.content === match.text);
				if (!inHistory) {
					messages.push({
						role: 'system',
						content: `[Memory Context - ${match.role} (relevance: ${(match.score * 100).toFixed(0)}%)]\n${match.text}`
					});
				}
			}
		} catch (e) {
			console.error('[MemoryManager] Semantic search failed:', e);
		}

		// Add recent conversation history based on mode
		const historyWindow = effectiveMode === 'auto-summarize'
			? this.windowSize
			: this.maxContextMessages;

		const recentHistory = conversationHistory.slice(-historyWindow);
		for (const msg of recentHistory) {
			messages.push({ role: msg.role, content: msg.content });
		}

		// Add current user message
		messages.push({ role: 'user', content: userMessage });

		return messages;
	}

	async pruneAndSummarize(conversationId: number): Promise<void> {
		const effectiveMode = this._resolveMode();
		if (effectiveMode !== 'auto-summarize') return;
		if (!this.summarizationProvider || !this.summarizationModel) return;

		const storage = getStorageManager();
		const convo = await storage.getConversation(conversationId);
		if (!convo || !convo.messages) return;

		const totalMessages = convo.messages.length;
		if (totalMessages <= this.windowSize) return; // Nothing to summarize

		// Find messages outside the window that haven't been summarized yet
		const existingSummaries = await storage.getSummariesByConversation(conversationId);
		const lastSummarizedIndex = existingSummaries.length > 0
			? Math.max(...existingSummaries.map(s => s.messageRange[1]))
			: -1;

		const startIndex = lastSummarizedIndex + 1;
		const endIndex = totalMessages - this.windowSize;

		if (startIndex >= endIndex) return; // Already summarized up to window

		const messagesToSummarize = convo.messages.slice(startIndex, endIndex);
		if (messagesToSummarize.length === 0) return;

		try {
			const summary = await this._callSummarizationLlm(messagesToSummarize);
			if (summary) {
				await storage.saveSummary({
					conversationId,
					summary,
					messageRange: [startIndex, endIndex - 1],
					timestamp: Date.now()
				});
				console.log(`[MemoryManager] Summarized messages ${startIndex}-${endIndex - 1}`);
			}
		} catch (e) {
			console.error('[MemoryManager] Summarization failed:', e);
		}
	}

	private async _callSummarizationLlm(
		messages: { role: string; content: string }[]
	): Promise<string | null> {
		if (!this.summarizationProvider || !this.summarizationModel) return null;

		// Dynamic import to avoid circular dependency
		const { streamText } = await import('ai');
		const { createOpenResponses } = await import('@ai-sdk/open-responses');
		const { createOpenAI } = await import('@ai-sdk/openai');

		let model: any;
		switch (this.summarizationProvider) {
			case 'openai': {
				const openai = createOpenAI({ apiKey: this.summarizationApiKey });
				model = openai.responses(this.summarizationModel);
				break;
			}
			case 'openrouter': {
				const or = createOpenResponses({
					name: 'openrouter-summary',
					url: 'https://openrouter.ai/api/v1/responses',
					apiKey: this.summarizationApiKey
				});
				model = or(this.summarizationModel);
				break;
			}
			case 'ollama': {
				const baseUrl = this.summarizationEndpoint || 'http://localhost:11434';
				const ollama = createOpenResponses({
					name: 'ollama-summary',
					url: `${baseUrl}/v1/responses`
				});
				model = ollama(this.summarizationModel);
				break;
			}
			case 'lmstudio': {
				const baseUrl = this.summarizationEndpoint || 'http://localhost:1234';
				const lm = createOpenResponses({
					name: 'lmstudio-summary',
					url: `${baseUrl}/v1/responses`
				});
				model = lm(this.summarizationModel);
				break;
			}
			default:
				return null;
		}

		const formatted = messages.map(m => `${m.role}: ${m.content}`).join('\n');
		const result = await streamText({
			model,
			messages: [
				{
					role: 'system',
					content: 'You are a conversation summarizer. Summarize the following conversation concisely, preserving key facts, preferences, and emotional context. Output only the summary, no preamble.'
				},
				{
					role: 'user',
					content: `Summarize this conversation:\n\n${formatted}`
				}
			],
			maxOutputTokens: 512
		});

		return await result.text;
	}

	private _resolveMode(): 'auto-prune' | 'auto-summarize' {
		if (this.mode === 'hybrid') {
			return (this.summarizationProvider && this.summarizationModel) ? 'auto-summarize' : 'auto-prune';
		}
		return this.mode === 'auto-summarize' ? 'auto-summarize' : 'auto-prune';
	}

	destroy() {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.modelReady = false;
		this.modelLoading = false;
		this._pendingRequests.clear();
	}
}

let instance: MemoryManager | null = null;
export function getMemoryManager() {
	if (!instance) instance = new MemoryManager();
	return instance;
}
