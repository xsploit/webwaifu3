<script lang="ts">
	import { getToast } from '../stores/app.svelte.js';
	const toast = getToast();
</script>

<div id="toast" class:show={toast.visible}>{toast.message}</div>

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
	}
</style>
