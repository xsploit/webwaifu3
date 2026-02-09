<script lang="ts">
	let { checked = $bindable(false), onchange }: { checked: boolean; onchange?: (checked: boolean) => void } = $props();
</script>

<label class="switch">
	<input type="checkbox" bind:checked onchange={() => onchange?.(checked)} />
	<span class="sw-slider"></span>
</label>

<style>
	.switch {
		position: relative;
		display: inline-block;
		width: 32px;
		height: 18px;
	}
	.switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}
	.sw-slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: #1f2937;
		transition: 0.2s;
		clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
	}
	.sw-slider:before {
		position: absolute;
		content: '';
		height: 10px;
		width: 10px;
		left: 4px;
		bottom: 4px;
		background-color: var(--text-muted);
		transition: 0.2s;
	}
	input:checked + .sw-slider {
		background-color: rgba(56, 189, 248, 0.2);
		border: 1px solid var(--c-text-accent);
	}
	input:checked + .sw-slider:before {
		transform: translateX(14px);
		background-color: var(--c-text-accent);
	}
</style>
