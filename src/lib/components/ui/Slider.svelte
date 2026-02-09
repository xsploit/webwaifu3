<script lang="ts">
	let {
		label = '',
		value = $bindable(0),
		min = 0,
		max = 1,
		step = 0.1,
		oninput
	}: {
		label?: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		oninput?: (value: number) => void;
	} = $props();
</script>

<div class="slider-row">
	<span>{label}</span>
	<input
		type="range"
		{min}
		{max}
		{step}
		bind:value
		oninput={() => oninput?.(value)}
	/>
</div>

<style>
	.slider-row {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 0.85rem;
	}
	.slider-row span {
		min-width: 60px;
		color: var(--text-muted);
	}
	input[type='range'] {
		flex: 1;
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
	}
	input[type='range']::-webkit-slider-runnable-track {
		width: 100%;
		height: 2px;
		background: var(--c-border);
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		height: 12px;
		width: 6px;
		background: var(--c-text-accent);
		margin-top: -5px;
		border-radius: 0;
		box-shadow: 0 0 10px var(--c-text-accent);
		cursor: pointer;
	}
</style>
