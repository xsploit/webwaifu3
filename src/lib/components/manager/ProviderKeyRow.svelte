<script lang="ts">
	import type { ProviderConfig } from './providers.js';

	let {
		config,
		apiKey = '',
		endpoint = '',
		testing = false,
		testResult = null,
		onkeychange,
		onendpointchange,
		ontest
	}: {
		config: ProviderConfig;
		apiKey?: string;
		endpoint?: string;
		testing?: boolean;
		testResult?: { ok: boolean; msg: string } | null;
		onkeychange?: (val: string) => void;
		onendpointchange?: (val: string) => void;
		ontest: () => void;
	} = $props();

	let showKey = $state(false);
</script>

<div class="provider-row">
	<span class="provider-label">{config.label}</span>
	<div class="provider-inputs">
		{#if config.needsEndpoint}
			<input
				type="text"
				class="input-tech"
				value={endpoint}
				oninput={(e) => onendpointchange?.((e.target as HTMLInputElement).value)}
				placeholder={config.defaultEndpoint || 'http://localhost:...'}
			/>
		{/if}
		{#if config.needsApiKey}
			<div class="key-input-wrap">
				<input
					type={showKey ? 'text' : 'password'}
					class="input-tech"
					value={apiKey}
					oninput={(e) => onkeychange?.((e.target as HTMLInputElement).value)}
					placeholder="Enter API key..."
					autocomplete="off"
					data-1p-ignore
					data-lpignore="true"
				/>
				<button class="btn-eye" onclick={() => showKey = !showKey} title={showKey ? 'Hide' : 'Show'}>
					{showKey ? '◉' : '○'}
				</button>
			</div>
		{/if}
		<button class="btn-init" onclick={ontest} disabled={testing}>
			{testing ? '...' : 'Test'}
		</button>
	</div>
	{#if testResult}
		<span class="test-result" class:ok={testResult.ok} class:err={!testResult.ok}>
			{testResult.msg}
		</span>
	{/if}
</div>

<style>
	.provider-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px dashed var(--c-border);
		flex-wrap: wrap;
	}
	.provider-label {
		min-width: 90px;
		font-family: var(--font-tech);
		font-size: 0.75rem;
		color: var(--c-text-accent);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.provider-inputs {
		flex: 1;
		display: flex;
		gap: 8px;
		align-items: center;
		min-width: 0;
	}
	.input-tech {
		flex: 1;
		min-width: 0;
		background: rgba(0,0,0,0.4);
		border: 1px solid var(--c-border);
		color: var(--text-main);
		padding: 8px 10px;
		font-size: 0.8rem;
		font-family: var(--font-ui);
		transition: border-color 0.2s;
	}
	.input-tech:focus { outline: none; border-color: var(--c-text-accent); }
	.key-input-wrap {
		flex: 1;
		position: relative;
		min-width: 0;
	}
	.key-input-wrap .input-tech { width: 100%; padding-right: 32px; }
	.btn-eye {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 4px;
	}
	.btn-eye:hover { color: var(--c-text-accent); }
	.btn-init {
		padding: 8px 14px;
		background: var(--c-text-accent);
		border: none;
		color: #000;
		font-family: var(--font-tech);
		font-size: 0.7rem;
		text-transform: uppercase;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
		transition: opacity 0.2s;
	}
	.btn-init:hover { opacity: 0.8; }
	.btn-init:disabled { opacity: 0.4; cursor: not-allowed; }
	.test-result {
		width: 100%;
		font-size: 0.7rem;
		font-family: var(--font-tech);
		padding-left: 102px;
	}
	.test-result.ok { color: var(--success, #22c55e); }
	.test-result.err { color: var(--error, #ef4444); }
	@media (max-width: 500px) {
		.provider-row { flex-direction: column; align-items: stretch; gap: 6px; }
		.provider-label { min-width: unset; }
		.provider-inputs { flex-direction: column; }
		.test-result { padding-left: 0; }
	}
</style>
