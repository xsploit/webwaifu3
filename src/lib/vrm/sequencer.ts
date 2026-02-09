import type { AnimationEntry } from '../stores/app.svelte.js';

export const DEFAULT_ANIMATIONS: AnimationEntry[] = [
	// 3 idle animations - crossfade between them
	{ id: 'idle', name: 'Idle', url: '/assets/animations/Idle.fbx', enabled: true, experimental: false },
	{ id: 'idle2', name: 'Idle 2', url: '/assets/animations/Idle2.fbx', enabled: true, experimental: false },
	{ id: 'idle3', name: 'Idle 3', url: '/assets/animations/Idle3.fbx', enabled: true, experimental: false },
	// Extra (disabled by default - enable in AnimTab)
	{ id: 'thinking', name: 'Thinking', url: '/assets/animations/Thinking.fbx', enabled: false, experimental: false },
];

export class AnimationSequencer {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private _currentIndex = -1;
	private _shuffleOrder: number[] = [];
	private _shufflePos = 0;

	onAdvance: ((entry: AnimationEntry, index: number) => void) | null = null;

	get currentIndex() { return this._currentIndex; }

	start(playlist: AnimationEntry[], opts: { shuffle: boolean; loop: boolean; duration: number }) {
		this.stop();
		const enabled = playlist.filter(e => e.enabled);
		if (enabled.length === 0) return;

		if (opts.shuffle) {
			this._shuffleOrder = this.fisherYatesShuffle(enabled.map((_, i) => i));
			this._shufflePos = 0;
		}

		this.advance(playlist, enabled, opts);
	}

	stop() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		this._currentIndex = -1;
	}

	private advance(playlist: AnimationEntry[], enabled: AnimationEntry[], opts: { shuffle: boolean; loop: boolean; duration: number }) {
		let nextEnabled: AnimationEntry;
		let nextEnabledIdx: number;

		if (opts.shuffle) {
			if (this._shufflePos >= enabled.length) {
				if (!opts.loop) { this.stop(); return; }
				this._shuffleOrder = this.fisherYatesShuffle(enabled.map((_, i) => i));
				this._shufflePos = 0;
			}
			nextEnabledIdx = this._shuffleOrder[this._shufflePos++];
			nextEnabled = enabled[nextEnabledIdx];
		} else {
			// Sequential through enabled items
			const currentEnabledIdx = this._currentIndex >= 0
				? enabled.indexOf(playlist[this._currentIndex])
				: -1;
			const nextIdx = currentEnabledIdx + 1;

			if (nextIdx >= enabled.length) {
				if (!opts.loop) { this.stop(); return; }
				nextEnabledIdx = 0;
			} else {
				nextEnabledIdx = nextIdx;
			}
			nextEnabled = enabled[nextEnabledIdx];
		}

		// Find the absolute index in the full playlist
		const absoluteIndex = playlist.indexOf(nextEnabled);
		this._currentIndex = absoluteIndex;

		if (this.onAdvance) {
			this.onAdvance(nextEnabled, absoluteIndex);
		}

		this.timer = setTimeout(() => {
			this.advance(playlist, enabled, opts);
		}, opts.duration * 1000);
	}

	private fisherYatesShuffle(arr: number[]): number[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}
}

let instance: AnimationSequencer | null = null;

export function getAnimationSequencer(): AnimationSequencer {
	if (!instance) instance = new AnimationSequencer();
	return instance;
}
