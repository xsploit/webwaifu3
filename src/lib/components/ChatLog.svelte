<script lang="ts">
	import { getChat } from '../stores/app.svelte.js';
	import { tick } from 'svelte';

	const chat = getChat();
	let scrollEl: HTMLDivElement;
	let wasAtBottom = true;

	function isScrolledToBottom() {
		if (!scrollEl) return true;
		return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 40;
	}

	function scrollToBottom() {
		if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
	}

	$effect(() => {
		// Track history length and streaming text to auto-scroll
		chat.history.length;
		chat.streamingText;
		if (wasAtBottom) {
			tick().then(scrollToBottom);
		}
	});

	function handleScroll() {
		wasAtBottom = isScrolledToBottom();
	}
</script>

<!-- Toggle button (always visible) -->
<button
	class="log-toggle"
	class:active={chat.logOpen}
	title={chat.logOpen ? 'Close Chat Log' : 'Open Chat Log'}
	onclick={(e) => { e.stopPropagation(); chat.toggleLog(); }}
>
	<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
	</svg>
</button>

<!-- Panel -->
<div class="log-panel" class:open={chat.logOpen}>
	<div class="log-header">
		<span class="log-title">// CHAT LOG</span>
		<span class="log-count">{chat.history.length} msgs</span>
	</div>
	<div class="log-deco"></div>
	<div class="log-messages" bind:this={scrollEl} onscroll={handleScroll}>
		{#if chat.history.length === 0 && !chat.streamingText}
			<div class="log-empty">No messages yet.</div>
		{/if}
		{#each chat.history as msg, i (i)}
			<div class="log-msg" class:user={msg.role === 'user'} class:assistant={msg.role === 'assistant'} class:system={msg.role === 'system'}>
				<span class="msg-role">{msg.role === 'user' ? 'YOU' : msg.role === 'assistant' ? 'AI' : 'SYS'}</span>
				<span class="msg-text">{msg.content}</span>
			</div>
		{/each}
		{#if chat.streamingText}
			<div class="log-msg assistant streaming">
				<span class="msg-role">AI</span>
				<span class="msg-text">{chat.streamingText}<span class="cursor-blink">_</span></span>
			</div>
		{/if}
	</div>
</div>

<style>
	.log-toggle {
		position: absolute;
		top: clamp(12px, 2vh, 24px);
		left: clamp(12px, 2vw, 24px);
		width: clamp(40px, 7vw, 48px);
		height: clamp(40px, 7vw, 48px);
		background: var(--c-panel);
		border: none;
		color: var(--text-main);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		pointer-events: auto;
		z-index: 50;
		transition: all 0.2s var(--ease-tech);
		clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
	}
	.log-toggle::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--c-border);
		z-index: -1;
	}
	.log-toggle::after {
		content: '';
		position: absolute;
		inset: 1px;
		background: var(--c-panel);
		z-index: -1;
		clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
	}
	.log-toggle:hover { transform: scale(1.05); }
	.log-toggle:hover::before { background: var(--c-text-accent); }
	.log-toggle.active { color: var(--c-text-accent); }
	.log-toggle.active::before { background: var(--c-text-accent); }

	.log-panel {
		position: absolute;
		top: 0;
		left: 0;
		width: min(380px, 85vw);
		height: 100%;
		background: var(--c-panel);
		border-right: 1px solid var(--c-border);
		pointer-events: auto;
		z-index: 40;
		display: flex;
		flex-direction: column;
		transform: translateX(-100%);
		opacity: 0;
		transition: transform 0.35s var(--ease-tech), opacity 0.25s var(--ease-tech);
	}
	.log-panel.open {
		transform: translateX(0);
		opacity: 1;
	}

	.log-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 20px 12px;
		padding-top: calc(clamp(12px, 2vh, 24px) + clamp(40px, 7vw, 48px) + 12px);
	}
	.log-title {
		font-family: var(--font-tech);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.15em;
		color: var(--c-text-accent);
		text-transform: uppercase;
	}
	.log-count {
		font-family: var(--font-tech);
		font-size: 0.65rem;
		color: var(--text-dim);
		letter-spacing: 0.1em;
	}

	.log-deco {
		height: 1px;
		margin: 0 20px 8px;
		background: linear-gradient(90deg, var(--c-text-accent), transparent);
		opacity: 0.4;
	}

	.log-messages {
		flex: 1;
		overflow-y: auto;
		padding: 8px 16px 120px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		scrollbar-width: thin;
		scrollbar-color: var(--c-border) transparent;
	}

	.log-empty {
		font-family: var(--font-tech);
		font-size: 0.75rem;
		color: var(--text-dim);
		text-align: center;
		padding: 40px 0;
		letter-spacing: 0.05em;
	}

	.log-msg {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 12px;
		border-left: 2px solid var(--c-border);
		transition: border-color 0.2s;
	}
	.log-msg.user {
		border-left-color: var(--c-text-accent);
	}
	.log-msg.assistant {
		border-left-color: #818cf8;
	}
	.log-msg.system {
		border-left-color: var(--text-dim);
		opacity: 0.6;
	}
	.log-msg.streaming {
		border-left-color: #22d3ee;
		animation: streamPulse 1.5s ease-in-out infinite;
	}

	.msg-role {
		font-family: var(--font-tech);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	.log-msg.user .msg-role { color: var(--c-text-accent); }
	.log-msg.assistant .msg-role { color: #818cf8; }
	.log-msg.system .msg-role { color: var(--text-dim); }
	.log-msg.streaming .msg-role { color: #22d3ee; }

	.msg-text {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--text-main);
		word-break: break-word;
		white-space: pre-wrap;
	}

	.cursor-blink {
		color: #22d3ee;
		animation: blink 0.8s step-end infinite;
	}

	@keyframes blink {
		50% { opacity: 0; }
	}

	@keyframes streamPulse {
		0%, 100% { border-left-color: #22d3ee; }
		50% { border-left-color: #818cf8; }
	}

	@media (max-width: 900px) {
		.log-toggle {
			top: calc(clamp(12px, 2vh, 24px) + var(--safe-top, 0px));
			left: calc(clamp(12px, 2vw, 24px) + var(--safe-left, 0px));
			min-width: 44px;
			min-height: 44px;
		}
		.log-panel {
			padding-top: var(--safe-top, 0px);
		}
		.log-header {
			padding-top: calc(var(--safe-top, 0px) + clamp(12px, 2vh, 24px) + clamp(40px, 7vw, 48px) + 12px);
		}
		.log-messages {
			padding-bottom: calc(120px + var(--safe-bottom, 0px));
		}
	}
	@media (max-width: 640px) {
		.log-panel { width: 100vw; }
	}
</style>
