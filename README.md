# NetHoe

**Browser-based VRM avatar companion with AI chat, text-to-speech, speech-to-text, and real-time 3D animations.**

NetHoe runs entirely in your browser. Load any VRM model, connect a local or cloud LLM, and have a conversation with your 3D companion complete with lip sync, idle animations, and post-processing effects.

---

## Features

### AI Chat
- **Ollama** and **LM Studio** for free local inference
- **OpenAI** and **OpenRouter** for cloud models (100+ models via OpenRouter)
- Streaming responses with real-time TTS integration
- Customizable system prompts via character personas (Tsundere, Kuudere, Genki, etc.)
- Per-request Ollama tuning: `num_ctx`, `flash_attn`, `kv_cache_type`

### Text-to-Speech
- **Kokoro** (Local) &mdash; 28 voices via WebGPU/WASM, no server or API key needed
- **Fish Audio** (Cloud) &mdash; High-quality TTS with custom voice model creation, public model search, and voice cloning
- **Qwen3 Voice Clone** (Cloud) &mdash; Clone any voice from a reference audio sample via WaveSpeed

### Speech-to-Text
- **Whisper** via Web Worker &mdash; runs locally in your browser
- Push-to-talk mic button with auto-send option
- Model downloads on first use (~40MB)

### 3D Avatar
- VRM model loading (built-in or custom upload, persisted across sessions)
- Animation sequencer with Mixamo FBX animations (auto-cycling, shuffle, speed control)
- PBR realistic materials toggle
- Post-processing: Bloom, Chromatic Aberration, Film Grain, FXAA/SMAA/TAA, Glitch, Vignette, Bleach Bypass, Color Correction
- Adjustable 5-point lighting (Key, Fill, Rim, Hemisphere, Ambient)
- Real-time lip sync driven by TTS audio amplitude

### Persistence
- All settings auto-saved to IndexedDB (API keys, visual settings, selected model, character, etc.)
- VRM model files stored in IndexedDB for custom uploads
- Conversation history preserved across reloads
- Saved voice references for Fish Audio and WaveSpeed

---

## Quick Start

### Prerequisites

You need **one** of the following for AI chat:

| Provider | Cost | Setup |
|----------|------|-------|
| [Ollama](https://ollama.ai) | Free | Install, pull a model, run with CORS enabled |
| [LM Studio](https://lmstudio.ai) | Free | Install, download a model, start the server |
| [OpenRouter](https://openrouter.ai) | Pay per token | Get an API key, 100+ models available |
| [OpenAI](https://platform.openai.com) | Pay per token | Get an API key |

### Install and Run

```bash
git clone https://github.com/user/NetHoe.git
cd NetHoe
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Ollama CORS Setup

Ollama blocks cross-origin requests by default. You **must** allow your dev server origin:

**Mac/Linux:**
```bash
OLLAMA_ORIGINS=* ollama serve
```

**Windows (PowerShell):**
```powershell
$env:OLLAMA_ORIGINS="*"; ollama serve
```

**Windows (CMD):**
```cmd
set OLLAMA_ORIGINS=* && ollama serve
```

### LM Studio Setup

1. Open LM Studio and download a model
2. Go to the **Local Server** tab
3. Enable **CORS** in server settings
4. Start the server (default port: 1234)

---

## Security Model

### API Keys
All API keys are stored **locally** in your browser's IndexedDB. They are only sent directly to their respective provider APIs (OpenAI, OpenRouter, Fish Audio, WaveSpeed) and never to any third-party server.

### Cloud TTS Proxies
Fish Audio and WaveSpeed don't support browser CORS, so TTS requests are proxied through SvelteKit server routes (`/api/tts/fish` and `/api/tts/qwen`). When self-hosting, your API keys pass through your own server. On Vercel, they pass through Vercel's serverless functions.

### Client-Side Risks
Since API keys are stored in the browser, they are subject to standard client-side risks (XSS, malicious browser extensions, local malware). Use dedicated API keys with spending limits where possible.

---

## Architecture

```
SvelteKit 2 + Svelte 5 (runes)
├── Three.js + @pixiv/three-vrm    3D rendering
├── Vercel AI SDK (streamText)      LLM integration
├── Kokoro TTS (Web Worker)         Local text-to-speech
├── Whisper STT (Web Worker)        Local speech-to-text
├── Fish Audio SDK                  Cloud TTS + voice cloning
├── WaveSpeed SDK                   Qwen3 voice cloning
├── IndexedDB                       Settings + file persistence
└── Vite 7 + @tailwindcss/vite      Build tooling
```

### Optional: Qwen3-TTS streaming (local Python server)

The repo includes a clone of [Qwen3-TTS-streaming](https://github.com/dffdeeq/Qwen3-TTS-streaming) in the subdirectory `Qwen3-TTS-streaming/` for local streaming TTS (Python, CUDA). To set it up on Windows, see **`Qwen3-TTS-streaming/SETUP-Windows.md`** and run `setup-windows.ps1` after installing SOX and creating the conda env. The NetHoe app itself does not depend on this; it is optional for running Qwen3-TTS locally with streaming.

### Directory Structure

```
src/
├── lib/
│   ├── components/       UI (VrmCanvas, ChatBar, SettingsPanel, SplashModal)
│   ├── llm/              LLM client (Ollama, LM Studio, OpenAI, OpenRouter)
│   ├── tts/              TTS manager, Kokoro worker, phonemizer
│   ├── stt/              Whisper STT recorder + worker
│   ├── vrm/              Scene, animation, sequencer, loader, lipsync, postprocessing
│   ├── stores/           Svelte 5 reactive state (app.svelte.ts)
│   └── storage/          IndexedDB persistence layer
├── routes/
│   ├── +page.svelte      Main app page
│   └── api/tts/          Server-side TTS proxies (Fish Audio, WaveSpeed)
└── app.css               Global styles
```

---

## Performance Notes

- Client bundle is ~2.7MB (Three.js + VRM + AI SDK). Expected for a 3D web app.
- Kokoro TTS model downloads ~86MB on first use (cached by the browser).
- Whisper STT model downloads ~40MB on first use.
- WebGPU is preferred for Kokoro TTS; falls back to WASM if unavailable.

---

## Deployment

### Vercel (Recommended)

Push to GitHub and import on [vercel.com](https://vercel.com). Auto-detected as SvelteKit. Serverless functions handle TTS proxies with 60s timeout on the free tier.

### Netlify

Switch adapter in `svelte.config.js`:
```js
import adapter from '@sveltejs/adapter-netlify';
```

Note: Netlify free tier has a 10s function timeout which may be too short for TTS proxy routes.

---

## Tech Stack

- **Frontend:** SvelteKit 2, Svelte 5, TypeScript
- **3D:** Three.js, @pixiv/three-vrm
- **AI:** Vercel AI SDK, OpenAI-compatible providers
- **TTS:** Kokoro (local), Fish Audio SDK, WaveSpeed SDK
- **STT:** Hugging Face Transformers (Whisper)
- **Build:** Vite 7, @tailwindcss/vite
- **Hosting:** Vercel (serverless functions for TTS proxies)

---

## License

MIT
