<script lang="ts">
	import { getStorageManager } from '../../storage/index.js';

	const storage = getStorageManager();

	let storageUsage = $state('Calculating...');
	let statusMsg = $state('');
	let confirmClear = $state(false);
	let confirmReset = $state(false);
	let resetInput = $state('');
	let importing = $state(false);
	let fileInput = $state<HTMLInputElement>(null!);

	async function loadUsage() {
		try {
			const usage = await storage.estimateStorageUsage();
			storageUsage = usage.formatted;
		} catch {
			storageUsage = 'Unknown';
		}
	}

	async function exportAll() {
		try {
			statusMsg = 'Exporting...';
			const data = await storage.exportAllData();
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `WEBWAIFU 3-backup-${new Date().toISOString().split('T')[0]}.json`;
			a.click();
			URL.revokeObjectURL(url);
			statusMsg = 'Export complete!';
		} catch (e: any) {
			statusMsg = 'Export failed: ' + e.message;
		}
	}

	async function importData() {
		const file = fileInput?.files?.[0];
		if (!file) return;
		importing = true;
		statusMsg = 'Importing...';
		try {
			const text = await file.text();
			const data = JSON.parse(text);
			const counts = await storage.importData(data);
			statusMsg = `Imported: ${counts.settings} settings, ${counts.conversations} conversations, ${counts.characters} characters, ${counts.embeddings} embeddings, ${counts.summaries} summaries`;
			loadUsage();
		} catch (e: any) {
			statusMsg = 'Import failed: ' + e.message;
		} finally {
			importing = false;
		}
	}

	async function clearHistory() {
		try {
			await storage.clearAllConversations();
			confirmClear = false;
			statusMsg = 'Chat history cleared';
			loadUsage();
		} catch (e: any) {
			statusMsg = 'Clear failed: ' + e.message;
		}
	}

	async function factoryReset() {
		if (resetInput !== 'RESET') return;
		try {
			await storage.factoryReset();
			statusMsg = 'Factory reset complete. Reloading...';
			setTimeout(() => window.location.reload(), 1000);
		} catch (e: any) {
			statusMsg = 'Reset failed: ' + e.message;
		}
	}

	$effect(() => {
		if (storage.db) loadUsage();
	});
</script>

<div class="section-card">
	<h2 class="section-title">Data Management</h2>

	<!-- Storage Usage -->
	<div class="sub-section">
		<h3 class="sub-title">Storage Usage</h3>
		<div class="usage-display">{storageUsage}</div>
	</div>

	<!-- Export -->
	<div class="sub-section">
		<h3 class="sub-title">Export</h3>
		<button class="btn-tech" onclick={exportAll}>Export All Data</button>
		<small class="hint">Downloads settings, conversations, characters, embeddings, and summaries as JSON</small>
	</div>

	<!-- Import -->
	<div class="sub-section">
		<h3 class="sub-title">Import</h3>
		<input type="file" accept=".json" bind:this={fileInput} onchange={importData} style="display:none" />
		<button class="btn-tech" onclick={() => fileInput.click()} disabled={importing}>
			{importing ? 'Importing...' : 'Import Data'}
		</button>
		<small class="hint">Merges data from a backup JSON file</small>
	</div>

	<!-- Clear Chat History -->
	<div class="sub-section">
		<h3 class="sub-title">Clear Chat History</h3>
		{#if !confirmClear}
			<button class="btn-danger" onclick={() => confirmClear = true}>Clear All Conversations</button>
		{:else}
			<p class="warning">This will delete all conversations, embeddings, and summaries.</p>
			<div class="confirm-row">
				<button class="btn-danger confirm" onclick={clearHistory}>Yes, Clear Everything</button>
				<button class="btn-cancel" onclick={() => confirmClear = false}>Cancel</button>
			</div>
		{/if}
	</div>

	<!-- Factory Reset -->
	<div class="sub-section">
		<h3 class="sub-title">Factory Reset</h3>
		{#if !confirmReset}
			<button class="btn-danger" onclick={() => confirmReset = true}>Factory Reset</button>
			<small class="hint">Deletes all data and reloads the app</small>
		{:else}
			<p class="warning">This will permanently delete ALL data. Type RESET to confirm:</p>
			<input type="text" class="input-tech" bind:value={resetInput} placeholder='Type "RESET" to confirm' />
			<div class="confirm-row">
				<button class="btn-danger confirm" onclick={factoryReset} disabled={resetInput !== 'RESET'}>Confirm Factory Reset</button>
				<button class="btn-cancel" onclick={() => { confirmReset = false; resetInput = ''; }}>Cancel</button>
			</div>
		{/if}
	</div>

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
	.sub-title {
		font-family: var(--font-tech);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-muted);
		margin: 0 0 8px;
	}
	.sub-section {
		margin-bottom: 16px;
		padding-bottom: 16px;
		border-bottom: 1px dashed var(--c-border);
	}
	.sub-section:last-of-type { border-bottom: none; }
	.usage-display {
		font-family: var(--font-tech);
		font-size: 1rem;
		color: var(--c-text-accent);
		padding: 8px 0;
	}
	.btn-tech {
		width: 100%;
		padding: 10px;
		background: transparent;
		border: 1px solid var(--c-text-accent);
		color: var(--c-text-accent);
		font-family: var(--font-tech);
		font-size: 0.75rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-tech:hover { background: var(--c-text-accent); color: #000; }
	.btn-tech:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn-danger {
		width: 100%;
		padding: 10px;
		background: transparent;
		border: 1px solid rgba(255,80,80,0.4);
		color: rgba(255,80,80,0.7);
		font-family: var(--font-tech);
		font-size: 0.75rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-danger:hover { border-color: rgba(255,80,80,0.8); color: rgba(255,80,80,1); }
	.btn-danger.confirm { background: rgba(255,80,80,0.1); border-color: rgba(255,80,80,0.8); color: rgba(255,80,80,1); }
	.btn-danger:disabled { opacity: 0.3; cursor: not-allowed; }
	.btn-cancel {
		padding: 10px 16px;
		background: transparent;
		border: 1px solid var(--c-border);
		color: var(--text-muted);
		font-family: var(--font-tech);
		font-size: 0.75rem;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-cancel:hover { border-color: var(--c-text-accent); color: var(--c-text-accent); }
	.hint { color: var(--text-muted); font-size: 0.7rem; display: block; margin-top: 4px; }
	.warning {
		font-size: 0.75rem;
		color: rgba(255,80,80,0.8);
		margin: 0 0 8px;
	}
	.confirm-row {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.confirm-row .btn-danger { width: auto; flex: 1; }
	.input-tech {
		width: 100%;
		min-width: 0;
		background: rgba(0,0,0,0.4);
		border: 1px solid var(--c-border);
		color: var(--text-main);
		padding: 8px 10px;
		font-size: 0.8rem;
		font-family: var(--font-ui);
		transition: border-color 0.2s;
		margin-top: 6px;
	}
	.input-tech:focus { outline: none; border-color: var(--c-text-accent); }
	.status-msg {
		margin-top: 12px;
		font-size: 0.7rem;
		font-family: var(--font-tech);
		color: var(--text-muted);
		padding: 6px 10px;
		background: rgba(0,0,0,0.3);
		border-left: 2px solid var(--c-text-accent);
	}
</style>

