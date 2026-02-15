<script lang="ts">
	import { getChat } from '../stores/app.svelte.js';

	const chat = getChat();

	let bubbleText = $derived.by(() => {
		if (chat.streamingText) return chat.streamingText;
		for (let i = chat.history.length - 1; i >= 0; i--) {
			if (chat.history[i].role === 'assistant') return chat.history[i].content;
		}
		return '';
	});

	let isStreaming = $derived(!!chat.streamingText);

	let showBubble = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | null = null;
	let lastHistoryLen = 0;

	$effect(() => {
		const currentLen = chat.history.length;
		const streaming = !!chat.streamingText;

		if (streaming) {
			showBubble = true;
			if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
		} else if (currentLen > lastHistoryLen && bubbleText) {
			showBubble = true;
			if (hideTimer) clearTimeout(hideTimer);
			hideTimer = setTimeout(() => { showBubble = false; hideTimer = null; }, 12000);
		}
		lastHistoryLen = currentLen;

		return () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } };
	});

	function dismiss() {
		showBubble = false;
		if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
	}

	let displayText = $derived.by(() => {
		if (!bubbleText) return '';
		if (bubbleText.length <= 300) return bubbleText;
		return '\u2026' + bubbleText.slice(-300);
	});
</script>

{#if showBubble && displayText}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="speech-bubble" class:streaming={isStreaming} onclick={dismiss}>
		<div class="bubble-content">
			{displayText}{#if isStreaming}<span class="cursor-blink">_</span>{/if}
		</div>
		<div class="bubble-tail"></div>
	</div>
{/if}

<style>
	.speech-bubble {
		display: none;
		position: absolute;
		bottom: calc(80px + var(--safe-bottom, 0px));
		left: 50%;
		transform: translateX(-50%);
		width: min(92vw, 500px);
		pointer-events: auto;
		z-index: 45;
		animation: bubbleIn 0.25s var(--ease-tech);
	}

	.bubble-content {
		background: var(--c-panel);
		border: 1px solid var(--c-border);
		padding: 12px 16px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.55;
		color: var(--text-main);
		max-height: 150px;
		overflow-y: auto;
		word-break: break-word;
		white-space: pre-wrap;
		clip-path: polygon(
			12px 0, 100% 0,
			100% calc(100% - 12px), calc(100% - 12px) 100%,
			0 100%, 0 12px
		);
	}

	.speech-bubble.streaming .bubble-content {
		border-color: #22d3ee;
		box-shadow: 0 0 12px rgba(34, 211, 238, 0.15);
	}

	.bubble-tail {
		position: absolute;
		bottom: -8px;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
		border-top: 8px solid var(--c-border);
	}

	.speech-bubble.streaming .bubble-tail {
		border-top-color: #22d3ee;
	}

	.cursor-blink {
		color: #22d3ee;
		animation: blink 0.8s step-end infinite;
	}

	@keyframes blink {
		50% { opacity: 0; }
	}

	@keyframes bubbleIn {
		from { opacity: 0; transform: translateX(-50%) translateY(8px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	@media (max-width: 900px) {
		.speech-bubble {
			display: block;
		}
	}
</style>
