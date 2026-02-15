<script lang="ts">
	import { getSettingsPanel } from '../stores/app.svelte.js';
	const panel = getSettingsPanel();
</script>

<button
	id="menu-fab"
	class:active={panel.open}
	title="Menu"
	onclick={(e) => { e.stopPropagation(); panel.toggle(); }}
>
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<line x1="3" y1="12" x2="21" y2="12"></line>
		<line x1="3" y1="6" x2="21" y2="6"></line>
		<line x1="3" y1="18" x2="21" y2="18"></line>
	</svg>
</button>

<style>
	#menu-fab {
		position: absolute;
		top: clamp(12px, 2vh, 24px);
		right: clamp(12px, 2vw, 24px);
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
	#menu-fab::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--c-border);
		z-index: -1;
	}
	#menu-fab::after {
		content: '';
		position: absolute;
		inset: 1px;
		background: var(--c-panel);
		z-index: -1;
		clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
	}
	#menu-fab:hover { transform: scale(1.05); }
	#menu-fab:hover::before { background: var(--c-text-accent); }
	#menu-fab svg { width: 24px; height: 24px; transition: transform 0.4s var(--ease-tech); }
	#menu-fab.active svg { transform: rotate(90deg); }
	@media (max-width: 900px) {
		#menu-fab {
			top: calc(clamp(12px, 2vh, 24px) + var(--safe-top, 0px));
			right: calc(clamp(12px, 2vw, 24px) + var(--safe-right, 0px));
			min-width: 44px;
			min-height: 44px;
		}
	}
</style>
