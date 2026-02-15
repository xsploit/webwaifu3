<script lang="ts">
	import { getSettingsPanel } from '../stores/app.svelte.js';

	const panel = getSettingsPanel();

	type TabId = 'vrm' | 'anim' | 'character' | 'ai' | 'tts' | 'stt' | 'logs';
	type TabModule = { default: any };

	const tabs: { id: TabId; label: string }[] = [
		{ id: 'vrm', label: 'VRM' },
		{ id: 'anim', label: 'Anim' },
		{ id: 'character', label: 'Char' },
		{ id: 'ai', label: 'AI' },
		{ id: 'tts', label: 'TTS' },
		{ id: 'stt', label: 'STT' },
		{ id: 'logs', label: 'Logs' }
	];

	const tabLoaders: Record<TabId, () => Promise<TabModule>> = {
		vrm: () => import('./tabs/VrmTab.svelte'),
		anim: () => import('./tabs/AnimTab.svelte'),
		character: () => import('./tabs/CharacterTab.svelte'),
		ai: () => import('./tabs/AiTab.svelte'),
		tts: () => import('./tabs/TtsTab.svelte'),
		stt: () => import('./tabs/SttTab.svelte'),
		logs: () => import('./tabs/LogsTab.svelte')
	};
	const tabCache = new Map<TabId, Promise<TabModule>>();

	function getTabModule(tabId: TabId): Promise<TabModule> {
		const cached = tabCache.get(tabId);
		if (cached) return cached;
		const loaded = tabLoaders[tabId]();
		tabCache.set(tabId, loaded);
		return loaded;
	}

	function getActiveTabId(): TabId {
		return tabs.some((tab) => tab.id === panel.activeTab) ? panel.activeTab as TabId : 'vrm';
	}

	function getActiveTabModule(): Promise<TabModule> {
		return getTabModule(getActiveTabId());
	}

	// Swipe-down-to-close on mobile
	let touchStartY = 0;
	let touchStartX = 0;

	function handleTouchStart(e: TouchEvent) {
		touchStartY = e.touches[0].clientY;
		touchStartX = e.touches[0].clientX;
	}

	function handleTouchEnd(e: TouchEvent) {
		const deltaY = e.changedTouches[0].clientY - touchStartY;
		const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX);
		if (deltaY > 80 && deltaY > deltaX && touchStartY < 160) {
			panel.open = false;
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="settings-panel" class:open={panel.open} onclick={(e) => e.stopPropagation()} ontouchstart={handleTouchStart} ontouchend={handleTouchEnd}>
	<svg class="svg-ui-bg panel-frame" preserveAspectRatio="none" viewBox="0 0 500 800">
		<path d="M0,20 L20,0 L500,0 L500,780 L480,800 L0,800 Z" fill="var(--c-panel)" stroke="var(--c-border)" stroke-width="1" vector-effect="non-scaling-stroke"></path>
		<line x1="20" y1="60" x2="480" y2="60" stroke="var(--c-border)" stroke-width="1" vector-effect="non-scaling-stroke"></line>
		<rect x="20" y="790" width="50" height="4" fill="var(--c-text-accent)" opacity="0.5"></rect>
	</svg>

	<div class="tabs-header">
		{#each tabs as tab}
			<button
				class="tab-btn"
				class:active={panel.activeTab === tab.id}
				onclick={() => panel.activeTab = tab.id}
			>{tab.label}</button>
		{/each}
		<a href="/manager" class="manager-link" title="Waifu Manager">MGR</a>
	</div>

	<div class="panel-scroll">
		{#await getActiveTabModule()}
			<div class="tab-loading">Loading tab...</div>
		{:then tabModule}
			<svelte:component this={tabModule.default} />
		{:catch}
			<div class="tab-error">Failed to load tab.</div>
		{/await}
	</div>
</div>

<style>
	#settings-panel {
		position: absolute;
		top: clamp(64px, 10vh, 84px);
		right: clamp(12px, 2vw, 24px);
		width: clamp(320px, 70vw, 380px);
		height: clamp(440px, 75vh, 640px);
		max-height: calc(100vh - 72px);
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		transform-origin: top right;
		transform: scale(0.95) translateY(-10px);
		opacity: 0;
		visibility: hidden;
		transition: all 0.3s var(--ease-tech);
		z-index: 40;
	}
	#settings-panel.open {
		transform: scale(1) translateY(0);
		opacity: 1;
		visibility: visible;
	}
	.svg-ui-bg {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: -1;
		pointer-events: none;
		filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5));
	}
	.tabs-header {
		display: flex;
		gap: 2px;
		padding: 24px 24px 10px 24px;
		height: 60px;
		align-items: center;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tabs-header::-webkit-scrollbar { display: none; }
	.manager-link {
		margin-left: auto;
		font-family: var(--font-tech);
		font-size: 0.6rem;
		color: var(--text-muted);
		text-decoration: none;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 4px 8px;
		border: 1px solid var(--c-border);
		transition: all 0.2s;
	}
	.manager-link:hover { color: var(--c-text-accent); border-color: var(--c-text-accent); }
	.tab-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		padding: 6px 12px;
		font-size: 0.75rem;
		font-family: var(--font-tech);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: color 0.2s;
		position: relative;
	}
	.tab-btn:hover { color: var(--c-text-accent); }
	.tab-btn.active { color: var(--c-text-accent); font-weight: 600; }
	.tab-btn.active::after {
		content: '';
		position: absolute;
		bottom: -8px;
		left: 0;
		width: 100%;
		height: 2px;
		background: var(--c-text-accent);
		box-shadow: 0 0 8px var(--c-text-accent);
	}
	.panel-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 20px 24px 30px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		animation: fadeIn 0.3s ease;
	}
	.tab-loading, .tab-error {
		font-family: var(--font-tech);
		font-size: 0.75rem;
		color: var(--text-muted);
		padding: 12px;
		border: 1px dashed var(--c-border);
	}
	.tab-error { color: var(--danger); }
	@media (max-width: 900px) {
		#settings-panel {
			width: 100%;
			height: 100%;
			top: 0;
			right: 0;
			max-height: 100vh;
			max-height: 100dvh;
			transform: none;
			background: var(--c-panel);
			padding-top: var(--safe-top, 0px);
			padding-bottom: var(--safe-bottom, 0px);
		}
		.tabs-header {
			padding-top: calc(var(--safe-top, 0px) + 16px);
		}
		.tab-btn {
			min-width: max-content;
			padding: 8px 14px;
			font-size: 0.8rem;
			min-height: 44px;
		}
	}
</style>
