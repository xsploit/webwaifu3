<script lang="ts">
	import { getStorageManager } from '../../storage/index.js';

	const storage = getStorageManager();

	interface ConvoSummary {
		id: number;
		title: string;
		messageCount: number;
		timestamp: number;
	}

	let conversations = $state<ConvoSummary[]>([]);
	let loading = $state(true);
	let statusMsg = $state('');
	let confirmDeleteAll = $state(false);

	async function loadConversations() {
		loading = true;
		try {
			const all = await storage.getAllConversations();
			conversations = all.map(c => ({
				id: c.id,
				title: getTitle(c.messages),
				messageCount: c.messages?.length || 0,
				timestamp: c.timestamp || 0
			})).sort((a, b) => b.timestamp - a.timestamp);
		} catch (e) {
			console.error('[Conversations] Load failed:', e);
		} finally {
			loading = false;
		}
	}

	function getTitle(messages: any[]): string {
		if (!messages || messages.length === 0) return 'Empty conversation';
		const firstUser = messages.find((m: any) => m.role === 'user');
		if (!firstUser) return 'No user messages';
		const text = firstUser.content || '';
		return text.length > 50 ? text.slice(0, 50) + '...' : text;
	}

	function formatDate(ts: number): string {
		if (!ts) return 'Unknown';
		return new Date(ts).toLocaleString();
	}

	async function exportJson(id: number) {
		try {
			const data = await storage.exportConversation(id);
			if (!data) return;
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `conversation-${id}.json`;
			a.click();
			URL.revokeObjectURL(url);
			statusMsg = 'Exported conversation #' + id;
		} catch (e: any) {
			statusMsg = 'Export failed: ' + e.message;
		}
	}

	async function exportText(id: number) {
		try {
			const convo = await storage.getConversation(id);
			if (!convo) return;
			const text = (convo.messages || [])
				.map((m: any) => `[${m.role}] ${m.content}`)
				.join('\n\n');
			const blob = new Blob([text], { type: 'text/plain' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `conversation-${id}.txt`;
			a.click();
			URL.revokeObjectURL(url);
			statusMsg = 'Exported as text';
		} catch (e: any) {
			statusMsg = 'Export failed: ' + e.message;
		}
	}

	async function deleteConvo(id: number) {
		await storage.deleteConversation(id);
		conversations = conversations.filter(c => c.id !== id);
		statusMsg = 'Deleted conversation #' + id;
	}

	async function deleteAll() {
		await storage.clearAllConversations();
		conversations = [];
		confirmDeleteAll = false;
		statusMsg = 'All conversations cleared';
	}

	$effect(() => {
		if (storage.db) loadConversations();
	});
</script>

<div class="section-card">
	<h2 class="section-title">Conversations</h2>

	{#if loading}
		<p class="hint">Loading conversations...</p>
	{:else if conversations.length === 0}
		<p class="hint">No conversations saved yet.</p>
	{:else}
		<div class="convo-list">
			{#each conversations as convo}
				<div class="convo-row">
					<div class="convo-info">
						<span class="convo-title">{convo.title}</span>
						<span class="convo-meta">{convo.messageCount} messages &middot; {formatDate(convo.timestamp)}</span>
					</div>
					<div class="convo-actions">
						<button class="btn-small" onclick={() => exportJson(convo.id)}>JSON</button>
						<button class="btn-small" onclick={() => exportText(convo.id)}>TXT</button>
						<button class="btn-small danger" onclick={() => deleteConvo(convo.id)}>Del</button>
					</div>
				</div>
			{/each}
		</div>

		<div class="bulk-actions">
			{#if !confirmDeleteAll}
				<button class="btn-small danger" onclick={() => confirmDeleteAll = true}>Delete All</button>
			{:else}
				<button class="btn-small danger confirm" onclick={deleteAll}>Confirm Delete All</button>
				<button class="btn-small" onclick={() => confirmDeleteAll = false}>Cancel</button>
			{/if}
		</div>
	{/if}

	{#if statusMsg}
		<div class="status-msg">{statusMsg}</div>
	{/if}
</div>

<style>
	.section-card {
		background: var(--c-panel, rgba(13,17,23,0.95));
		border: 1px solid var(--c-border);
		padding: 20px;
		overflow: hidden;
	}
	@media (max-width: 500px) { .section-card { padding: 14px; } }
	.section-title {
		font-family: var(--font-tech);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: var(--c-text-accent);
		margin: 0 0 16px;
	}
	.hint { color: var(--text-muted); font-size: 0.75rem; }
	.convo-list {
		max-height: 400px;
		overflow-y: auto;
		border: 1px solid var(--c-border);
	}
	.convo-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid rgba(255,255,255,0.03);
		transition: background 0.15s;
	}
	.convo-row:hover { background: rgba(56,189,248,0.03); }
	.convo-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
	.convo-title {
		font-size: 0.8rem;
		color: var(--text-main);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.convo-meta {
		font-size: 0.6rem;
		color: var(--text-muted);
		font-family: var(--font-tech);
	}
	.convo-actions { display: flex; gap: 4px; flex-shrink: 0; }
	.bulk-actions {
		margin-top: 12px;
		display: flex;
		gap: 6px;
	}
	.btn-small {
		padding: 3px 8px;
		background: transparent;
		border: 1px solid var(--c-border);
		color: var(--text-muted);
		font-family: var(--font-tech);
		font-size: 0.6rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-small:hover { border-color: var(--c-text-accent); color: var(--c-text-accent); }
	.btn-small.danger:hover { border-color: rgba(255,80,80,0.8); color: rgba(255,80,80,1); }
	.btn-small.danger.confirm { border-color: rgba(255,80,80,0.8); color: rgba(255,80,80,1); background: rgba(255,80,80,0.1); }
	.status-msg {
		margin-top: 12px;
		font-size: 0.7rem;
		font-family: var(--font-tech);
		color: var(--text-muted);
		padding: 6px 10px;
		background: rgba(0,0,0,0.3);
		border-left: 2px solid var(--c-text-accent);
	}
	@media (max-width: 500px) {
		.convo-row { flex-direction: column; align-items: flex-start; gap: 6px; }
		.convo-actions { width: 100%; justify-content: flex-start; }
	}
</style>
