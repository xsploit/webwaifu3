<script lang="ts">
	import { getToast } from '../stores/app.svelte.js';
	const toast = getToast();
	let copied = $state(false);

	async function copyToClipboard() {
		if (!toast.message) return;
		try {
			await navigator.clipboard.writeText(toast.message.replace(/^\/\/ /, ''));
			copied = true;
			setTimeout(() => { copied = false; }, 1500);
		} catch { /* clipboard not available */ }
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="toast" class:show={toast.visible} class:copied onclick={copyToClipboard}>
	{copied ? '// Copied!' : toast.message}
</div>

<style>
	#toast {
		position: absolute;
		top: 24px;
		left: 50%;
		transform: translateX(-50%) translateY(-20px);
		background: var(--c-panel);
		border: 1px solid var(--c-border);
		padding: 8px 16px;
		color: var(--c-text-accent);
		font-family: var(--font-tech);
		font-size: 0.8rem;
		pointer-events: none;
		opacity: 0;
		transition: all 0.3s;
		z-index: 100;
		clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px);
	}
	#toast.show {
		opacity: 1;
		transform: translateX(-50%) translateY(0);
		pointer-events: auto;
		cursor: pointer;
	}
	#toast.copied {
		border-color: var(--success);
		color: var(--success);
	}
	@media (max-width: 900px) {
		#toast {
			top: calc(24px + var(--safe-top, 0px));
			max-width: 90vw;
			font-size: 0.75rem;
		}
	}
</style>
