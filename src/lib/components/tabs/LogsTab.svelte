<script lang="ts">
	import { getLogs } from '../../stores/app.svelte.js';

	const logs = getLogs();
	let logContainer: HTMLDivElement;

	$effect(() => {
		// Auto-scroll when new entries appear
		if (logs.entries.length && logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	});
</script>

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
</style>
