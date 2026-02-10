<script lang="ts">
	let visible = $state(true);
	let accepted = $state(false);

	function dismiss() {
		if (!accepted) return;
		visible = false;
		window.dispatchEvent(new CustomEvent('webwaifu3:splash-accepted'));
	}
</script>

{#if visible}
	<div class="splash-overlay">
		<div class="splash-modal" role="dialog" aria-modal="true" aria-labelledby="splash-title">
			<div class="splash-header">
				<h1 class="splash-title" id="splash-title">WEBWAIFU 3</h1>
				<span class="splash-sub">VRM Companion Engine</span>
			</div>

			<div class="splash-body">
				<section class="splash-section">
					<h2>What is this?</h2>
					<p>WEBWAIFU 3 is a browser-based VRM avatar companion powered by local or cloud AI. Chat with your 3D character using text or voice, with real-time lip sync and animations.</p>
				</section>

				<section class="splash-section warn">
					<h2>Before You Start</h2>
					<ul>
						<li><strong>LLM Required</strong> &mdash; You need either a local model server (<strong>Ollama</strong> or <strong>LM Studio</strong>) or a cloud API key (<strong>OpenAI</strong> / <strong>OpenRouter</strong>).</li>
						<li><strong>Ollama Network Access</strong> &mdash; In Ollama's settings, enable <strong>"Allow through network"</strong> so the browser can reach it. You also need to set allowed origins: set the environment variable <code>OLLAMA_ORIGINS=*</code> (or add your app's URL) before running <code>ollama serve</code>. On Windows, set it in System Environment Variables and restart Ollama.</li>
						<li><strong>LM Studio CORS</strong> &mdash; Enable CORS in the LM Studio server settings.</li>
						<li><strong>API Keys are Stored Locally</strong> &mdash; All API keys (LLM, TTS) are saved in your browser's IndexedDB. They never leave your machine except when sent directly to the provider APIs.</li>
					</ul>
				</section>

				<section class="splash-section">
					<h2>TTS (Text-to-Speech)</h2>
					<ul>
						<li><strong>Kokoro</strong> &mdash; Runs 100% locally in your browser via WebGPU/WASM. 28 voices, no API key needed.</li>
						<li><strong>Fish Audio</strong> &mdash; Cloud TTS with custom voice cloning. Requires API key.</li>
					</ul>
				</section>

				<section class="splash-section">
					<h2>Quick Setup (Free)</h2>
					<ol>
						<li>Install <a href="https://ollama.ai" target="_blank" rel="noopener">Ollama</a> or <a href="https://lmstudio.ai" target="_blank" rel="noopener">LM Studio</a></li>
						<li>Pull a model: <code>ollama pull llama3.2</code></li>
						<li>In Ollama settings, enable <strong>"Allow through network"</strong></li>
						<li>Set <code>OLLAMA_ORIGINS=*</code> as an environment variable and restart Ollama</li>
						<li>Open settings (gear icon) &rarr; AI tab &rarr; Refresh Models</li>
						<li>Start chatting!</li>
					</ol>
				</section>
			</div>

			<div class="splash-ack-box">
				<label class="splash-ack-row">
					<input type="checkbox" bind:checked={accepted} />
					<span>
						I agree / I accept that WEBWAIFU 3 needs either local AI (Ollama or LM Studio) or cloud API keys (OpenAI/OpenRouter) to generate responses.
					</span>
				</label>
			</div>

			<button class="splash-dismiss" onclick={dismiss} disabled={!accepted}>
				I Accept - Continue
			</button>
		</div>
	</div>
{/if}

<style>
	.splash-overlay {
		position: fixed; inset: 0; z-index: 9999;
		background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
		display: flex; align-items: center; justify-content: center;
		pointer-events: all;
	}
	.splash-modal {
		width: min(560px, 92vw); max-height: 85vh; overflow-y: auto;
		background: #0d1117; border: 1px solid rgba(56,189,248,0.2);
		box-shadow: 0 0 60px rgba(56,189,248,0.08);
	}
	.splash-header {
		padding: 28px 28px 16px;
		border-bottom: 1px solid rgba(56,189,248,0.1);
		text-align: center;
	}
	.splash-title {
		font-family: var(--font-tech, 'JetBrains Mono', monospace);
		font-size: 2rem; font-weight: 600; letter-spacing: 0.3em;
		color: var(--c-text-accent, #38bdf8); margin: 0;
	}
	.splash-sub {
		font-family: var(--font-tech, monospace);
		font-size: 0.7rem; color: rgba(255,255,255,0.4);
		text-transform: uppercase; letter-spacing: 0.15em;
	}
	.splash-body { padding: 20px 28px; }
	.splash-section { margin-bottom: 18px; }
	.splash-section h2 {
		font-family: var(--font-tech, monospace);
		font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;
		color: var(--c-text-accent, #38bdf8); margin: 0 0 8px; opacity: 0.9;
	}
	.splash-section p, .splash-section li {
		font-size: 0.82rem; line-height: 1.65; color: rgba(255,255,255,0.7);
		margin: 0;
	}
	.splash-section ul, .splash-section ol {
		padding-left: 18px; margin: 0;
	}
	.splash-section li { margin-bottom: 6px; }
	.splash-section strong { color: rgba(255,255,255,0.95); }
	.splash-section code {
		background: rgba(56,189,248,0.1); padding: 1px 5px;
		font-family: var(--font-tech, monospace); font-size: 0.75rem;
		color: var(--c-text-accent, #38bdf8);
	}
	.splash-section a {
		color: var(--c-text-accent, #38bdf8); text-decoration: none;
	}
	.splash-section a:hover { text-decoration: underline; }
	.splash-section.warn {
		background: rgba(250,204,21,0.04);
		border-left: 2px solid rgba(250,204,21,0.3);
		padding: 12px 14px;
	}
	.splash-section.warn h2 { color: rgba(250,204,21,0.9); }
	.splash-dismiss {
		display: block; width: calc(100% - 56px); margin: 8px 28px 24px;
		padding: 12px; background: var(--c-text-accent, #38bdf8);
		border: none; color: #000; font-family: var(--font-tech, monospace);
		font-size: 0.85rem; font-weight: 600; text-transform: uppercase;
		letter-spacing: 0.1em; cursor: pointer; transition: opacity 0.2s;
	}
	.splash-dismiss:hover { opacity: 0.85; }
	.splash-dismiss:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.splash-dismiss:disabled:hover { opacity: 0.45; }
	.splash-ack-box {
		margin: 0 28px;
		padding: 12px 14px;
		border: 1px solid rgba(56,189,248,0.25);
		background: rgba(56,189,248,0.06);
	}
	.splash-ack-row {
		display: grid;
		grid-template-columns: 16px 1fr;
		gap: 10px;
		align-items: start;
		cursor: pointer;
	}
	.splash-ack-row input[type='checkbox'] {
		margin-top: 3px;
		accent-color: #38bdf8;
	}
	.splash-ack-row span {
		font-size: 0.78rem;
		line-height: 1.55;
		color: rgba(255,255,255,0.82);
	}
	/* Scrollbar */
	.splash-modal::-webkit-scrollbar { width: 4px; }
	.splash-modal::-webkit-scrollbar-track { background: transparent; }
	.splash-modal::-webkit-scrollbar-thumb { background: rgba(56,189,248,0.2); }
</style>


