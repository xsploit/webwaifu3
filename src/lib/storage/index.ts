export interface EmbeddingEntry {
	id?: number;
	conversationId: number;
	messageIndex: number;
	role: string;
	text: string;
	vector: Float32Array;
	timestamp: number;
}

export interface SummaryEntry {
	id?: number;
	conversationId: number;
	summary: string;
	messageRange: [number, number];
	timestamp: number;
}

export class StorageManager {
	dbName = 'WaifuMATE';
	dbVersion = 2;
	db: IDBDatabase | null = null;

	async initialize() {
		return new Promise<void>((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.dbVersion);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				console.log('[StorageManager] Database initialized');
				resolve();
			};
			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains('settings')) {
					db.createObjectStore('settings', { keyPath: 'key' });
				}
				if (!db.objectStoreNames.contains('models')) {
					const modelsStore = db.createObjectStore('models', { keyPath: 'provider' });
					modelsStore.createIndex('timestamp', 'timestamp', { unique: false });
				}
				if (!db.objectStoreNames.contains('conversations')) {
					const convoStore = db.createObjectStore('conversations', {
						keyPath: 'id',
						autoIncrement: true
					});
					convoStore.createIndex('timestamp', 'timestamp', { unique: false });
				}
				if (!db.objectStoreNames.contains('characters')) {
					const charStore = db.createObjectStore('characters', {
						keyPath: 'id',
						autoIncrement: true
					});
					charStore.createIndex('name', 'name', { unique: true });
				}
				// v2: embeddings and summaries stores for memory system
				if (!db.objectStoreNames.contains('embeddings')) {
					const embStore = db.createObjectStore('embeddings', {
						keyPath: 'id',
						autoIncrement: true
					});
					embStore.createIndex('conversationId', 'conversationId', { unique: false });
					embStore.createIndex('timestamp', 'timestamp', { unique: false });
				}
				if (!db.objectStoreNames.contains('summaries')) {
					const sumStore = db.createObjectStore('summaries', {
						keyPath: 'id',
						autoIncrement: true
					});
					sumStore.createIndex('conversationId', 'conversationId', { unique: false });
					sumStore.createIndex('timestamp', 'timestamp', { unique: false });
				}
				console.log('[StorageManager] Database schema created/upgraded');
			};
		});
	}

	async get(storeName: string, key: IDBValidKey) {
		return new Promise<any>((resolve, reject) => {
			const transaction = this.db!.transaction([storeName], 'readonly');
			const store = transaction.objectStore(storeName);
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async put(storeName: string, data: any) {
		return new Promise<any>((resolve, reject) => {
			const transaction = this.db!.transaction([storeName], 'readwrite');
			const store = transaction.objectStore(storeName);
			const request = store.put(data);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async delete(storeName: string, key: IDBValidKey) {
		return new Promise<void>((resolve, reject) => {
			const transaction = this.db!.transaction([storeName], 'readwrite');
			const store = transaction.objectStore(storeName);
			const request = store.delete(key);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async getAll(storeName: string) {
		return new Promise<any[]>((resolve, reject) => {
			const transaction = this.db!.transaction([storeName], 'readonly');
			const store = transaction.objectStore(storeName);
			const request = store.getAll();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async clearStore(storeName: string) {
		return new Promise<void>((resolve, reject) => {
			const transaction = this.db!.transaction([storeName], 'readwrite');
			const store = transaction.objectStore(storeName);
			const request = store.clear();
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	async getAllByIndex(storeName: string, indexName: string, key: IDBValidKey) {
		return new Promise<any[]>((resolve, reject) => {
			const transaction = this.db!.transaction([storeName], 'readonly');
			const store = transaction.objectStore(storeName);
			const index = store.index(indexName);
			const request = index.getAll(key);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	// Settings
	async getSetting(key: string, defaultValue: any = null) {
		const result = await this.get('settings', key);
		return result ? result.value : defaultValue;
	}

	async setSetting(key: string, value: any) {
		return this.put('settings', { key, value });
	}

	async loadAllSettings() {
		const settings = await this.getAll('settings');
		const result: Record<string, any> = {};
		settings.forEach((s) => (result[s.key] = s.value));
		return result;
	}

	// Models cache
	async getCachedModels(provider: string) {
		const cache = await this.get('models', provider);
		if (!cache) return null;
		if (Date.now() - cache.timestamp > 3600000) return null;
		return cache.models;
	}

	async setCachedModels(provider: string, models: any[]) {
		return this.put('models', { provider, models, timestamp: Date.now() });
	}

	async clearExpiredModelCache() {
		const allModels = await this.getAll('models');
		const now = Date.now();
		let cleared = 0;
		for (const entry of allModels) {
			if (now - entry.timestamp > 3600000) {
				await this.delete('models', entry.provider);
				cleared++;
			}
		}
		if (cleared > 0) {
			console.log(`[StorageManager] Cleared ${cleared} expired model cache entries`);
		}
	}

	// Conversations
	async saveConversation(messages: any[], metadata: Record<string, any> = {}) {
		return this.put('conversations', { messages, timestamp: Date.now(), ...metadata });
	}

	async getConversation(id: number) {
		return this.get('conversations', id);
	}

	async getAllConversations() {
		return this.getAll('conversations');
	}

	async deleteConversation(id: number) {
		return this.delete('conversations', id);
	}

	async getCurrentConversation() {
		const current = await this.getSetting('currentConversationId');
		if (!current) return null;
		return this.getConversation(current);
	}

	async saveCurrentConversation(messages: any[]) {
		const currentId = await this.getSetting('currentConversationId');
		if (currentId) {
			const convo = await this.getConversation(currentId);
			if (convo) {
				convo.messages = messages;
				convo.timestamp = Date.now();
				return this.put('conversations', convo);
			}
		}
		const id = await this.saveConversation(messages);
		await this.setSetting('currentConversationId', id);
		return id;
	}

	async clearAllConversations() {
		await this.clearStore('conversations');
		await this.clearStore('embeddings');
		await this.clearStore('summaries');
		try { await this.delete('settings', 'currentConversationId'); } catch { /* ignore */ }
		console.log('[StorageManager] All conversations, embeddings, and summaries cleared');
	}

	// Characters
	async saveCharacter(character: any) {
		return this.put('characters', { ...character, timestamp: Date.now() });
	}

	async getCharacter(id: number) {
		return this.get('characters', id);
	}

	async getCharacterByName(name: string) {
		return new Promise<any>((resolve, reject) => {
			const transaction = this.db!.transaction(['characters'], 'readonly');
			const store = transaction.objectStore('characters');
			const index = store.index('name');
			const request = index.get(name);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async getAllCharacters() {
		return this.getAll('characters');
	}

	async deleteCharacter(id: number) {
		return this.delete('characters', id);
	}

	async getActiveCharacter() {
		const activeId = await this.getSetting('activeCharacterId');
		if (!activeId) return null;
		return this.getCharacter(activeId);
	}

	async setActiveCharacter(id: number) {
		return this.setSetting('activeCharacterId', id);
	}

	// VRM file persistence
	async saveVrmFile(data: ArrayBuffer) {
		return this.setSetting('vrmFileData', data);
	}

	async getVrmFile(): Promise<ArrayBuffer | null> {
		return this.getSetting('vrmFileData', null);
	}

	async clearVrmFile() {
		try { await this.delete('settings', 'vrmFileData'); } catch { /* ignore */ }
	}

	// Embeddings (memory system)
	async saveEmbedding(entry: Omit<EmbeddingEntry, 'id'>) {
		return this.put('embeddings', entry);
	}

	async getEmbeddingsByConversation(conversationId: number): Promise<EmbeddingEntry[]> {
		return this.getAllByIndex('embeddings', 'conversationId', conversationId);
	}

	async getAllEmbeddings(): Promise<EmbeddingEntry[]> {
		return this.getAll('embeddings');
	}

	async clearEmbeddings() {
		await this.clearStore('embeddings');
		console.log('[StorageManager] All embeddings cleared');
	}

	// Summaries (memory system)
	async saveSummary(entry: Omit<SummaryEntry, 'id'>) {
		return this.put('summaries', entry);
	}

	async getSummariesByConversation(conversationId: number): Promise<SummaryEntry[]> {
		return this.getAllByIndex('summaries', 'conversationId', conversationId);
	}

	async getAllSummaries(): Promise<SummaryEntry[]> {
		return this.getAll('summaries');
	}

	async clearSummaries() {
		await this.clearStore('summaries');
		console.log('[StorageManager] All summaries cleared');
	}

	// Bulk save/load
	async saveAppState(state: {
		llm?: any;
		tts?: any;
		stt?: any;
		sequencer?: any;
		visuals?: any;
		playlistEnabled?: Record<string, boolean>;
		character?: any;
		conversation?: any[];
		memory?: any;
	}) {
		const { llm, tts, stt, sequencer, visuals, playlistEnabled, character, conversation, memory } = state;
		if (llm) {
			await this.setSetting('llm.provider', llm.provider);
			await this.setSetting('llm.model', llm.model);
			await this.setSetting('llm.apiKey', llm.apiKey);
			await this.setSetting('llm.temperature', llm.temperature);
			await this.setSetting('llm.maxTokens', llm.maxTokens);
			await this.setSetting('llm.endpoint', llm.endpoint);
			await this.setSetting('llm.streaming', llm.streaming);
			await this.setSetting('llm.numCtx', llm.numCtx);
			await this.setSetting('llm.flashAttn', llm.flashAttn);
			await this.setSetting('llm.kvCacheType', llm.kvCacheType);
		}
		if (tts) {
			await this.setSetting('tts.provider', tts.provider);
			await this.setSetting('tts.kokoroVoice', tts.kokoroVoice);
			await this.setSetting('tts.fishVoiceId', tts.fishVoiceId);
			await this.setSetting('tts.fishLatency', tts.fishLatency);
			await this.setSetting('tts.fishApiKey', tts.fishApiKey);
			await this.setSetting('tts.enabled', tts.enabled);
			await this.setSetting('tts.fishModel', tts.fishModel);
			if (tts.fishSavedVoices) await this.setSetting('tts.fishSavedVoices', tts.fishSavedVoices);
		}
		if (stt) {
			await this.setSetting('stt.enabled', stt.enabled);
			await this.setSetting('stt.autoSend', stt.autoSend);
		}
		if (sequencer) {
			await this.setSetting('seq.speed', sequencer.speed);
			await this.setSetting('seq.duration', sequencer.duration);
			await this.setSetting('seq.shuffle', sequencer.shuffle);
			await this.setSetting('seq.loop', sequencer.loop);
		}
		if (visuals) {
			await this.setSetting('visuals', visuals);
		}
		if (playlistEnabled) {
			await this.setSetting('playlist.enabled', playlistEnabled);
		}
		if (character) {
			await this.setSetting('activeCharacterId', character.id);
		}
		if (conversation) {
			await this.saveCurrentConversation(conversation);
		}
		if (memory) {
			await this.setSetting('memory.enabled', memory.enabled);
			await this.setSetting('memory.mode', memory.mode);
			await this.setSetting('memory.maxContext', memory.maxContext);
			await this.setSetting('memory.windowSize', memory.windowSize);
			await this.setSetting('memory.topK', memory.topK);
			await this.setSetting('memory.similarityThreshold', memory.similarityThreshold);
			await this.setSetting('memory.summarizationProvider', memory.summarizationProvider);
			await this.setSetting('memory.summarizationModel', memory.summarizationModel);
			await this.setSetting('memory.summarizationApiKey', memory.summarizationApiKey);
			await this.setSetting('memory.summarizationEndpoint', memory.summarizationEndpoint);
		}
	}

	async loadAppState() {
		// Migration: detect legacy tts.voice and split into kokoroVoice / fishVoiceId
		const legacyVoice = await this.getSetting('tts.voice', null);
		const ttsProvider = await this.getSetting('tts.provider', 'kokoro');
		let kokoroVoice = await this.getSetting('tts.kokoroVoice', null);
		let fishVoiceId = await this.getSetting('tts.fishVoiceId', null);

		if (kokoroVoice === null && fishVoiceId === null && legacyVoice) {
			// Migrate: if provider was fish, legacy voice is likely a Fish UUID
			if (ttsProvider === 'fish') {
				fishVoiceId = legacyVoice;
				kokoroVoice = 'af_heart';
			} else {
				kokoroVoice = legacyVoice;
				fishVoiceId = '';
			}
		}

		return {
			llm: {
				provider: await this.getSetting('llm.provider', 'ollama'),
				model: await this.getSetting('llm.model', ''),
				apiKey: await this.getSetting('llm.apiKey', ''),
				temperature: await this.getSetting('llm.temperature', 0.8),
				maxTokens: await this.getSetting('llm.maxTokens', 256),
				endpoint: await this.getSetting('llm.endpoint', 'http://localhost:11434/api/chat'),
				streaming: await this.getSetting('llm.streaming', true),
				numCtx: await this.getSetting('llm.numCtx', 4096),
				flashAttn: await this.getSetting('llm.flashAttn', true),
				kvCacheType: await this.getSetting('llm.kvCacheType', 'q8_0')
			},
			tts: {
				provider: ttsProvider,
				kokoroVoice: kokoroVoice ?? 'af_heart',
				fishVoiceId: fishVoiceId ?? '',
				fishLatency: await this.getSetting('tts.fishLatency', 'balanced'),
				fishApiKey: (await this.getSetting('tts.fishApiKey', '')) || (await this.getSetting('tts.apiKey', '')),
				enabled: await this.getSetting('tts.enabled', true),
				fishModel: await this.getSetting('tts.fishModel', 's1'),
				fishSavedVoices: await this.getSetting('tts.fishSavedVoices', [])
			},
			stt: {
				enabled: await this.getSetting('stt.enabled', true),
				autoSend: await this.getSetting('stt.autoSend', false)
			},
			sequencer: {
				speed: await this.getSetting('seq.speed', 1.0),
				duration: await this.getSetting('seq.duration', 10),
				shuffle: await this.getSetting('seq.shuffle', false),
				loop: await this.getSetting('seq.loop', true)
			},
			memory: {
				enabled: await this.getSetting('memory.enabled', false),
				mode: await this.getSetting('memory.mode', 'hybrid'),
				maxContext: await this.getSetting('memory.maxContext', 20),
				windowSize: await this.getSetting('memory.windowSize', 30),
				topK: await this.getSetting('memory.topK', 3),
				similarityThreshold: await this.getSetting('memory.similarityThreshold', 0.5),
				summarizationProvider: await this.getSetting('memory.summarizationProvider', ''),
				summarizationModel: await this.getSetting('memory.summarizationModel', ''),
				summarizationApiKey: await this.getSetting('memory.summarizationApiKey', ''),
				summarizationEndpoint: await this.getSetting('memory.summarizationEndpoint', '')
			},
			visuals: await this.getSetting('visuals', null),
			playlistEnabled: await this.getSetting('playlist.enabled', null) as Record<string, boolean> | null,
			vrmUrl: await this.getSetting('vrmUrl', '/assets/hikkyc2.vrm'),
			character: await this.getActiveCharacter(),
			conversation: await this.getCurrentConversation()
		};
	}

	// Data management
	async exportAllData() {
		const settings = await this.loadAllSettings();
		const conversations = await this.getAllConversations();
		const characters = await this.getAllCharacters();
		const embeddings = await this.getAllEmbeddings();
		const summaries = await this.getAllSummaries();
		return {
			version: 2,
			exportDate: new Date().toISOString(),
			settings,
			conversations,
			characters,
			embeddings: embeddings.map(e => ({
				...e,
				vector: Array.from(e.vector) // Float32Array → JSON-safe array
			})),
			summaries
		};
	}

	async importData(data: any): Promise<{ settings: number; conversations: number; characters: number; embeddings: number; summaries: number }> {
		const counts = { settings: 0, conversations: 0, characters: 0, embeddings: 0, summaries: 0 };
		if (data.settings) {
			for (const [key, value] of Object.entries(data.settings)) {
				await this.setSetting(key, value);
				counts.settings++;
			}
		}
		if (data.conversations) {
			for (const convo of data.conversations) {
				await this.put('conversations', convo);
				counts.conversations++;
			}
		}
		if (data.characters) {
			for (const char of data.characters) {
				await this.put('characters', char);
				counts.characters++;
			}
		}
		if (data.embeddings) {
			for (const emb of data.embeddings) {
				// Restore Float32Array from plain array
				if (Array.isArray(emb.vector)) {
					emb.vector = new Float32Array(emb.vector);
				}
				await this.put('embeddings', emb);
				counts.embeddings++;
			}
		}
		if (data.summaries) {
			for (const sum of data.summaries) {
				await this.put('summaries', sum);
				counts.summaries++;
			}
		}
		console.log('[StorageManager] Import complete:', counts);
		return counts;
	}

	async exportConversation(id: number) {
		const convo = await this.getConversation(id);
		if (!convo) return null;
		const embeddings = await this.getEmbeddingsByConversation(id);
		const summaries = await this.getSummariesByConversation(id);
		return {
			conversation: convo,
			embeddings: embeddings.map(e => ({ ...e, vector: Array.from(e.vector) })),
			summaries
		};
	}

	async estimateStorageUsage() {
		if (navigator.storage?.estimate) {
			const { usage, quota } = await navigator.storage.estimate();
			const formatBytes = (bytes: number) => {
				if (bytes < 1024) return `${bytes} B`;
				if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
				return `${(bytes / 1048576).toFixed(1)} MB`;
			};
			return {
				usage: usage || 0,
				quota: quota || 0,
				formatted: `${formatBytes(usage || 0)} / ${formatBytes(quota || 0)}`
			};
		}
		return { usage: 0, quota: 0, formatted: 'Unknown' };
	}

	async factoryReset() {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
		return new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(this.dbName);
			request.onsuccess = () => {
				console.log('[StorageManager] Factory reset complete');
				resolve();
			};
			request.onerror = () => reject(request.error);
		});
	}

	async initializeDefaultCharacters() {
		const existing = await this.getAllCharacters();
		if (existing.length > 0) return;

		const defaults = [
			{
				name: 'Default',
				systemPrompt: 'You are a friendly anime companion. Keep responses brief and cute.',
				description: 'Standard friendly companion'
			},
			{
				name: 'Tsundere',
				systemPrompt:
					"You are a tsundere anime girl. Act cold and dismissive at first, but occasionally show warmth. Use phrases like \"B-baka!\" and \"It's not like I care!\" Keep responses brief and emotional.",
				description: 'Classic tsundere personality'
			},
			{
				name: 'Kuudere',
				systemPrompt:
					'You are a kuudere anime girl. Speak in a calm, emotionless tone. Use short, direct sentences. Rarely show emotion, but have subtle moments of warmth.',
				description: 'Cool and collected personality'
			},
			{
				name: 'Genki',
				systemPrompt:
					'You are an energetic, cheerful anime girl! Use lots of exclamation marks! Always upbeat and enthusiastic! Keep responses brief but full of energy!',
				description: 'High-energy cheerful personality'
			},
			{
				name: 'Onee-san',
				systemPrompt:
					'You are a caring older sister type. Speak warmly and protectively. Use gentle teasing and caring words. Keep responses brief but nurturing.',
				description: 'Caring big sister personality'
			}
		];

		for (const char of defaults) {
			await this.saveCharacter(char);
		}

		const defaultChar = await this.getCharacterByName('Default');
		if (defaultChar) {
			await this.setActiveCharacter(defaultChar.id);
		}
		console.log('[StorageManager] Default characters initialized');
	}
}

let instance: StorageManager | null = null;
export function getStorageManager() {
	if (!instance) instance = new StorageManager();
	return instance;
}
