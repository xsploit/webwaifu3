<script lang="ts">
	import { getChat, getLlmSettings, getSttState, toast, addLog } from '../stores/app.svelte.js';
	import { getSttRecorder } from '../stt/recorder.js';

	let { onsend }: { onsend: (message: string) => void } = $props();
	const chat = getChat();
	const llm = getLlmSettings();
	const stt = getSttState();
	const recorder = getSttRecorder();

	let textareaEl: HTMLTextAreaElement;
	let recorderInitialized = false;

	async function handleMicClick() {
		if (!stt.enabled) {
			toast('STT is disabled');
			return;
		}

		// If recording, stop and transcribe
		if (stt.recording) {
			stt.recording = false;
			stt.transcribing = true;
			try {
				const transcript = await recorder.stopRecording();
				if (transcript) {
					chat.input = (chat.input ? chat.input + ' ' : '') + transcript;
					addLog(`STT: "${transcript.slice(0, 60)}"`, 'info');
					if (stt.autoSend && transcript.trim()) {
						onsend(transcript.trim());
						chat.input = '';
					}
				}
			} catch (e: any) {
				toast('Transcription failed: ' + e.message);
			} finally {
				stt.transcribing = false;
			}
			return;
		}

		// Lazy-init: first click downloads model
		if (!recorderInitialized) {
			stt.modelLoading = true;
			try {
				recorder.onModelReady = () => {
					stt.modelLoading = false;
					stt.modelReady = true;
					toast('Whisper model ready');
					addLog('Whisper model loaded', 'info');
				};
				recorder.onModelError = (err) => {
					stt.modelLoading = false;
					toast('Whisper model failed: ' + err);
				};
				recorder.onError = (err) => {
					toast('STT error: ' + err);
					stt.recording = false;
				};
				await recorder.initialize();
				recorderInitialized = true;
			} catch (e: any) {
				stt.modelLoading = false;
				toast('Failed to init STT: ' + e.message);
				return;
			}

			// Wait for model to be ready before starting
			if (!recorder.isModelReady()) {
				toast('Loading Whisper model...');
				return;
			}
		}

		if (!recorder.isModelReady()) {
			toast('Whisper model still loading...');
			return;
		}

		// Start recording
		await recorder.startRecording();
		stt.recording = true;
	}

	function handleSend() {
		const msg = chat.input.trim();
		if (msg && !chat.isGenerating) {
			onsend(msg);
			chat.input = '';
			if (textareaEl) textareaEl.style.height = 'auto';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	function handleInput() {
		if (textareaEl) {
			textareaEl.style.height = 'auto';
			textareaEl.style.height = textareaEl.scrollHeight + 'px';
		}
	}
</script>

<div id="chat-container" class:visible={chat.visible}>
	<div class="chat-meta">
		<div style="display:flex; gap:16px;">
			<button class="meta-item" class:active={stt.autoSend} title="Toggle Auto-send" onclick={() => stt.autoSend = !stt.autoSend}>
				<span>&#9889;</span> AUTO
			</button>
			<button class="meta-item" class:active={llm.streaming} title="Toggle LLM Streaming" onclick={() => llm.streaming = !llm.streaming}>
				<span>&#128225;</span> STREAM
			</button>
		</div>
	</div>

	<div id="chat-wrapper">
		<div class="chat-deco-line"></div>
		<div id="chat-inner">
			<button
				class="icon-btn"
				class:recording={stt.recording}
				class:loading={stt.modelLoading || stt.transcribing}
				title={stt.recording ? 'Stop Recording' : stt.modelLoading ? 'Loading Model...' : stt.transcribing ? 'Transcribing...' : 'Voice Input'}
				onclick={handleMicClick}
				disabled={stt.modelLoading || stt.transcribing}
			>
				{#if stt.modelLoading || stt.transcribing}
					<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>
				{:else}
					<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
						<path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
						<line x1="12" y1="19" x2="12" y2="23"></line>
						<line x1="8" y1="23" x2="16" y2="23"></line>
					</svg>
				{/if}
			</button>
			<textarea
				bind:this={textareaEl}
				bind:value={chat.input}
				rows="1"
				placeholder="Input command..."
				onkeydown={handleKeydown}
				oninput={handleInput}
			></textarea>
			<div class="chat-actions">
				<button
					class="icon-btn primary"
					class:active={chat.isGenerating}
					title="Send"
					onclick={handleSend}
				>
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="22" y1="2" x2="11" y2="13"></line>
						<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
					</svg>
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	#chat-container {
		position: absolute;
		bottom: clamp(8px, 4vh, 24px);
		left: 50%;
		transform: translateX(-50%) translateY(20px);
		width: min(650px, 92vw);
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		gap: 4px;
		z-index: 50;
		opacity: 0;
		visibility: hidden;
		transition: all 0.3s var(--ease-tech);
	}
	#chat-container.visible {
		transform: translateX(-50%) translateY(0);
		opacity: 1;
		visibility: visible;
	}
	#chat-wrapper {
		position: relative;
		background: var(--c-panel);
		padding: 2px;
		clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
		transition: filter 0.2s;
	}
	#chat-wrapper::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--c-border);
		z-index: -2;
	}
	#chat-inner {
		background: var(--c-panel);
		clip-path: polygon(19px 0, 100% 0, 100% calc(100% - 19px), calc(100% - 19px) 100%, 0 100%, 0 19px);
		display: flex;
		align-items: flex-end;
		padding: 10px 16px;
		min-height: 56px;
	}
	#chat-wrapper:focus-within::before { background: var(--c-text-accent); }
	#chat-wrapper:focus-within { filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.2)); }
	textarea {
		flex: 1;
		background: transparent;
		border: none;
		color: var(--text-main);
		resize: none;
		min-height: 24px;
		max-height: 140px;
		padding: 8px 0;
		font-size: 1rem;
		line-height: 1.5;
		font-family: var(--font-ui);
	}
	textarea::placeholder { color: var(--text-dim); }
	.chat-actions { display: flex; gap: 8px; margin-left: 12px; padding-bottom: 4px; }
	.icon-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid transparent;
		color: var(--text-muted);
		cursor: pointer;
		clip-path: polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px);
		transition: all 0.2s;
	}
	.icon-btn:hover { background: rgba(255,255,255,0.05); color: var(--text-main); border-color: var(--c-border); }
	.icon-btn.primary { border: 1px solid var(--c-text-accent); color: var(--c-text-accent); }
	.icon-btn.primary:hover { background: var(--c-text-accent); color: #000; }
	.icon-btn.active { color: var(--danger); border-color: var(--danger); animation: pulse 1.5s infinite; }
	.icon-btn.recording { color: var(--danger); border-color: var(--danger); animation: pulse 1s infinite; background: rgba(239,68,68,0.1); }
	.icon-btn.loading { color: var(--text-dim); cursor: wait; }
	.icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.chat-deco-line {
		position: absolute;
		top: -1px;
		left: 20px;
		right: 20px;
		height: 1px;
		background: linear-gradient(90deg, transparent, var(--c-text-accent), transparent);
		opacity: 0.5;
		pointer-events: none;
	}
	.chat-meta {
		display: flex;
		justify-content: space-between;
		padding: 0 4px;
		font-size: 0.7rem;
		font-family: var(--font-tech);
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.meta-item {
		cursor: pointer;
		transition: color 0.2s;
		display: flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 0.7rem;
		font-family: var(--font-tech);
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.meta-item:hover { color: var(--text-main); }
	.meta-item.active { color: var(--c-text-accent); text-shadow: 0 0 8px var(--c-text-accent); }
	@media (max-width: 900px) {
		#chat-container { width: 100%; bottom: 0; max-width: 100%; }
		#chat-wrapper { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
		#chat-inner { clip-path: none; }
	}
</style>
