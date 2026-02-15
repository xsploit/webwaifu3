<script lang="ts">
	import { getLogs, toast } from '../../stores/app.svelte.js';

	const logs = getLogs();
	let logContainer: HTMLDivElement;

	$effect(() => {
		// Auto-scroll when new entries appear
		if (logs.entries.length && logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	});

	async function copyLogs() {
		const text = logs.entries
			.map(e => `[${e.time}] [${e.level}] ${e.message}`)
			.join('\n');
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			toast('Logs copied to clipboard');
		} catch {
			toast('Failed to copy logs');
		}
	}
</script>

<button class="btn-copy" onclick={copyLogs} disabled={logs.entries.length === 0}>Copy All Logs</button>
<div class="log-container" bind:this={logContainer}>
	{#each logs.entries as entry}
		<div class="log-entry {entry.level}">
			<span class="log-time">[{entry.time}]</span>
			<span class="log-msg">{entry.message}</span>
		</div>
	{/each}
	{#if logs.entries.length === 0}
		<div class="log-empty">// No log entries yet</div>
	{/if}
</div>

<style>
	.log-container {
		flex: 1;
		overflow-y: auto;
		font-family: var(--font-tech);
		font-size: 0.75rem;
		line-height: 1.6;
		max-height: 400px;
	}
	.log-entry {
		padding: 2px 0;
		border-bottom: 1px solid rgba(255,255,255,0.03);
		display: flex;
		gap: 8px;
	}
	.log-time {
		color: var(--text-dim);
		white-space: nowrap;
	}
	.log-msg {
		color: var(--text-muted);
		word-break: break-word;
	}
	.log-entry.warn .log-msg { color: #f59e0b; }
	.log-entry.err .log-msg { color: var(--danger); }
	.log-entry.info .log-msg { color: var(--text-muted); }
	.log-empty {
		color: var(--text-dim);
		text-align: center;
		padding: 40px 0;
	}
	.btn-copy {
		width: 100%;
		padding: 8px;
		margin-bottom: 8px;
		background: transparent;
		border: 1px solid var(--c-border);
		color: var(--text-muted);
		font-family: var(--font-tech);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-copy:hover { border-color: var(--c-text-accent); color: var(--c-text-accent); }
	.btn-copy:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
