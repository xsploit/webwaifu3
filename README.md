# WEBWAIFU 3

**Browser-based VRM avatar companion with AI chat, text-to-speech, speech-to-text, semantic memory, and real-time 3D animations.**

WEBWAIFU 3 runs entirely in your browser. Load any VRM model, connect a local or cloud LLM, and have a conversation with your 3D companion complete with lip sync, idle animations, and post-processing effects.

---

## Features

### AI Chat
- **Ollama** and **LM Studio** for free local inference
- **OpenAI** and **OpenRouter** for cloud models (100+ models via OpenRouter)
- Streaming responses with real-time TTS integration
- Customizable system prompts via character personas (Tsundere, Kuudere, Genki, etc.)
- Per-request Ollama tuning: `num_ctx`, `flash_attn`, `kv_cache_type`

### Semantic Memory
- **Embedding-based context** using MiniLM-L6-v2 (23MB, 384 dimensions, runs in browser)
- Three modes: **Auto-Prune**, **Auto-Summarize**, **Hybrid**
- Cosine similarity search injects relevant past messages into LLM context
- Optional summarization LLM compresses older messages
- All embeddings stored locally in IndexedDB

### Text-to-Speech
- **Kokoro** (Local) — 28 voices via WebGPU/WASM, no server or API key needed
- **Fish Audio** (Cloud) — High-quality streaming TTS with voice cloning, real-time WebSocket streaming

### Speech-to-Text
- **Whisper** via Web Worker — runs locally in your browser
- Push-to-talk mic button with auto-send option
- Mic permission pre-check with clear feedback
- Model downloads on first use (~40MB)

### 3D Avatar
- VRM model loading (built-in or custom upload, persisted across sessions)
- Animation sequencer with Mixamo FBX animations (auto-cycling, shuffle, speed control)
- PBR realistic materials toggle
- Post-processing: Bloom, Chromatic Aberration, Film Grain, FXAA/SMAA/TAA, Glitch, Vignette, Bleach Bypass, Color Correction
- Adjustable 5-point lighting (Key, Fill, Rim, Hemisphere, Ambient)
- Real-time lip sync driven by TTS audio amplitude

### Persistence
- All settings auto-saved to IndexedDB (API keys, visual settings, models, voices, memory config, etc.)
- VRM model files stored in IndexedDB for custom uploads
- Conversation history preserved across reloads
- Models (Kokoro, Whisper, embeddings) auto-load on startup when previously enabled

### Waifu Manager
- Dedicated settings page (`/manager`) for managing everything
- API keys and endpoints per provider
- LLM model defaults per provider
- Fish Audio voice browser with search and latency config
- Memory system configuration (mode, thresholds, summarization LLM)
- Conversation browser with export (JSON/TXT) and delete
- Data management: export all, import, clear history, factory reset

---

## Quick Start

### Prerequisites

You need **one** of the following for AI chat:

| Provider | Cost | Setup |
|----------|------|-------|
| [Ollama](https://ollama.ai) | Free | Install, pull a model, enable network access |
| [LM Studio](https://lmstudio.ai) | Free | Install, download a model, start the server |
| [OpenRouter](https://openrouter.ai) | Pay per token | Get an API key, 100+ models available |
| [OpenAI](https://platform.openai.com) | Pay per token | Get an API key |

### Install and Run

```bash
git clone https://github.com/xsploit/webwaifu3.git
cd webwaifu3
npm install
npm run dev
```

Opens on `https://localhost:5173` (HTTPS via `@vitejs/plugin-basic-ssl` for HTTP/2 streaming support).

### Ollama Setup

Ollama needs two things to work with WEBWAIFU 3:

**1. Allow network access** — In Ollama's system tray settings, enable **"Allow through network"**.

**2. Set allowed origins** — The browser needs CORS permission to reach Ollama.

**Mac/Linux:**
```bash
OLLAMA_ORIGINS=* ollama serve
```

**Windows** — Set `OLLAMA_ORIGINS` as a system environment variable:
1. Open Start > search "Environment Variables" > Edit system environment variables
2. Under System Variables, click New
3. Variable name: `OLLAMA_ORIGINS`, Value: `*`
4. Restart Ollama

### LM Studio Setup

1. Open LM Studio and download a model
2. Go to the **Local Server** tab
3. Enable **CORS** in server settings
4. Start the server (default port: 1234)

---

## Security Model

### API Keys
All API keys are stored **locally** in your browser's IndexedDB. They are only sent directly to their respective provider APIs (OpenAI, OpenRouter, Fish Audio) and never to any third-party server.

### Cloud TTS Proxy
Fish Audio doesn't support browser CORS, so TTS requests are proxied through a SvelteKit server route (`/api/tts/fish-stream`). When self-hosting, your API key passes through your own server. On Vercel, it passes through Vercel's serverless functions.

### Client-Side Risks
Since API keys are stored in the browser, they are subject to standard client-side risks (XSS, malicious browser extensions, local malware). Use dedicated API keys with spending limits where possible.

---

## Architecture

```
SvelteKit 2 + Svelte 5 (runes)
├── Three.js + @pixiv/three-vrm    3D rendering
├── Vercel AI SDK (Responses API)   LLM integration (all 4 providers)
├── Kokoro TTS (Web Worker)         Local text-to-speech (28 voices)
├── Whisper STT (Web Worker)        Local speech-to-text
├── Fish Audio SDK                  Cloud TTS + WebSocket streaming
├── MiniLM-L6-v2 (Web Worker)      Semantic memory embeddings
├── IndexedDB (v2)                  Settings, conversations, embeddings, summaries
└── Vite 7 + @tailwindcss/vite     Build tooling
```

### Directory Structure

```
src/
├── lib/
│   ├── components/       UI (VrmCanvas, ChatBar, SettingsPanel, SplashModal, tabs/)
│   ├── components/manager/  Waifu Manager sections (API keys, models, voices, memory, data)
│   ├── llm/              LLM client (Ollama, LM Studio, OpenAI, OpenRouter)
│   ├── tts/              TTS manager, Kokoro worker
│   ├── stt/              Whisper STT recorder + worker
│   ├── memory/           Embedding worker + MemoryManager (semantic search, summarization)
│   ├── vrm/              Scene, animation, sequencer, loader, lipsync, postprocessing
│   ├── stores/           Svelte 5 reactive state (app.svelte.ts)
│   └── storage/          IndexedDB persistence layer (DB v2)
├── routes/
│   ├── +page.svelte      Main app page
│   ├── manager/          Waifu Manager settings page
│   └── api/tts/          Server-side TTS proxy (Fish Audio streaming)
└── app.css               Global styles
```

---

## Performance Notes

- Client bundle is ~2.3MB (Three.js + VRM + AI SDK). Expected for a 3D web app.
- Kokoro TTS model downloads ~86MB on first use (cached by the browser).
- Whisper STT model downloads ~40MB on first use.
- MiniLM-L6-v2 embedding model downloads ~23MB on first use.
- WebGPU is preferred for Kokoro TTS; falls back to WASM if unavailable.

---

## Deployment

### Vercel (Recommended)

Push to GitHub and import on [vercel.com](https://vercel.com). Auto-detected as SvelteKit with `@sveltejs/adapter-vercel`. Serverless functions handle the Fish Audio TTS proxy.

### Self-Hosting

Use any Node.js hosting. Switch adapter in `svelte.config.js` as needed (e.g., `adapter-node` for a standalone server).

---

## Tech Stack

- **Frontend:** SvelteKit 2, Svelte 5, TypeScript
- **3D:** Three.js, @pixiv/three-vrm
- **AI:** Vercel AI SDK (Responses API), OpenAI-compatible providers
- **TTS:** Kokoro (local WebGPU/WASM), Fish Audio (cloud WebSocket streaming)
- **STT:** Hugging Face Transformers (Whisper, local)
- **Memory:** MiniLM-L6-v2 embeddings (local), cosine similarity search
- **Storage:** IndexedDB (settings, conversations, embeddings, summaries)
- **Build:** Vite 7, @tailwindcss/vite
- **Hosting:** Vercel (serverless functions for TTS proxy)

---

## License

MIT

