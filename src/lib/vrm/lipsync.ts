import type { VRM } from '@pixiv/three-vrm';
import type { TtsManager } from '../tts/manager.js';

export const PHONEME_TO_BLEND_SHAPE: Record<string, Record<string, number>> = {
	// Vowels
	'\u0259': { aa: 0.5, ih: 0.2 },
	'\u00e6': { aa: 0.7 },
	a: { aa: 0.8 },
	'\u0251': { aa: 1.0 },
	'\u0252': { oh: 0.8 },
	'\u0254': { oh: 1.0 },
	o: { oh: 0.9 },
	'\u028a': { ou: 0.7 },
	u: { ou: 1.0 },
	'\u028c': { aa: 0.5, oh: 0.3 },
	'\u026a': { ih: 0.6 },
	i: { ee: 0.8, ih: 0.3 },
	e: { ee: 0.7, ih: 0.2 },
	'\u025b': { ee: 0.6, ih: 0.3 },
	'\u025c': { aa: 0.5, oh: 0.3 },
	'\u0250': { aa: 0.6 },
	// Consonants
	f: { ih: 0.3 },
	v: { ih: 0.3 },
	'\u03b8': { ih: 0.4 },
	'\u00f0': { ih: 0.4 },
	s: { ih: 0.4 },
	z: { ee: 0.4 },
	'\u0283': { ou: 0.4 },
	'\u0292': { ou: 0.4 },
	t: { ih: 0.3 },
	d: { ih: 0.3 },
	n: { ih: 0.3 },
	l: { ih: 0.3 },
	'\u0279': { ou: 0.4 },
	w: { ou: 0.6 },
	j: { ee: 0.4 },
	p: { aa: 0.3 },
	b: { aa: 0.3 },
	m: { aa: 0.3 },
	k: { aa: 0.4 },
	'\u0261': { aa: 0.4 },
	'\u014b': { aa: 0.3 },
	h: { aa: 0.2 },
	'\u027e': { ih: 0.3 },
	't\u0283': { ou: 0.4 },
	'd\u0292': { ou: 0.4 }
};

let previousAa = 0;
let previousIh = 0;
let previousOu = 0;
let previousEe = 0;
let previousOh = 0;

// Cache cleaned phoneme arrays to avoid regex + split + filter every frame
const phonemeCache = new Map<string, string[]>();
function getCleanPhonemes(raw: string): string[] {
	let cached = phonemeCache.get(raw);
	if (!cached) {
		cached = raw
			.replace(/[\u02c8\u02cc\u02d0\u02d1\u032f\u0329\u0306\u0303\u0300\u0301\u0302\u0304]/g, '')
			.replace(/[,.!?]/g, '')
			.split('')
			.filter((c: string) => c.trim().length > 0);
		phonemeCache.set(raw, cached);
		// Limit cache size to prevent unbounded growth
		if (phonemeCache.size > 500) {
			const first = phonemeCache.keys().next().value;
			if (first !== undefined) phonemeCache.delete(first);
		}
	}
	return cached;
}

export function updateLipSync(vrm: VRM | null, ttsManager: TtsManager) {
	if (!vrm || !vrm.expressionManager) return;
	if (!ttsManager.currentAudio) return;

	const manager = vrm.expressionManager;

	if (ttsManager.currentAudio.paused || ttsManager.currentAudio.ended) {
		manager.setValue('aa', 0);
		manager.setValue('ih', 0);
		manager.setValue('ou', 0);
		manager.setValue('ee', 0);
		manager.setValue('oh', 0);
		previousAa = previousIh = previousOu = previousEe = previousOh = 0;
		return;
	}

	const audioAmplitude = ttsManager.getAudioAmplitude();
	const isAudioActive = audioAmplitude > 0.02;

	if (!isAudioActive) {
		manager.setValue('aa', 0);
		manager.setValue('ih', 0);
		manager.setValue('ou', 0);
		manager.setValue('ee', 0);
		manager.setValue('oh', 0);
		previousAa = previousIh = previousOu = previousEe = previousOh = 0;
		return;
	}

	const currentTime = ttsManager.currentAudio.currentTime;
	let targetAa = 0,
		targetIh = 0,
		targetOu = 0,
		targetEe = 0,
		targetOh = 0;

	const hasValidTiming =
		ttsManager.wordBoundaries &&
		ttsManager.wordBoundaries.length > 1 &&
		ttsManager.wordBoundaries.some((wb, i) => {
			if (i === 0) return false;
			const prevOffset = ttsManager.wordBoundaries[i - 1].offset || 0;
			const currOffset = wb.offset || 0;
			return currOffset > prevOffset;
		});

	let currentWordBoundary: (typeof ttsManager.wordBoundaries)[0] | null = null;
	let wordIndex = -1;
	if (hasValidTiming) {
		for (let i = 0; i < ttsManager.wordBoundaries.length; i++) {
			const wb = ttsManager.wordBoundaries[i];
			const wordStart = (wb.offset || 0) / 10000000;
			const wordEnd = wordStart + (wb.duration || 0) / 10000000;
			if (currentTime >= wordStart && currentTime <= wordEnd) {
				currentWordBoundary = wb;
				wordIndex = i;
				break;
			}
		}
	}

	// Phoneme mode
	if (hasValidTiming && currentWordBoundary && ttsManager.currentPhonemes) {
		let wordPhonemes = '';
		if (Array.isArray(ttsManager.currentPhonemes)) {
			if (wordIndex >= 0 && wordIndex < ttsManager.currentPhonemes.length) {
				wordPhonemes = ttsManager.currentPhonemes[wordIndex];
			}
		}

		if (wordPhonemes) {
			const wordStart = (currentWordBoundary.offset || 0) / 10000000;
			const wordDuration = (currentWordBoundary.duration || 0) / 10000000;
			const timeInWord = Math.max(0, Math.min(1, (currentTime - wordStart) / wordDuration));

			const cleanPhonemes = getCleanPhonemes(wordPhonemes);

			if (cleanPhonemes.length > 0) {
				const acceleratedTime = Math.min(timeInWord * 1.5, 1.0);
				const phonemeIndex = Math.floor(acceleratedTime * cleanPhonemes.length);
				const currentPhoneme = cleanPhonemes[phonemeIndex] || cleanPhonemes[cleanPhonemes.length - 1];

				let phonemeKey = currentPhoneme;
				if (phonemeIndex < cleanPhonemes.length - 1) {
					const twoChar = currentPhoneme + cleanPhonemes[phonemeIndex + 1];
					if (PHONEME_TO_BLEND_SHAPE.hasOwnProperty(twoChar)) {
						phonemeKey = twoChar;
					}
				}

				const blendMap = PHONEME_TO_BLEND_SHAPE[phonemeKey] || {};
				targetAa = blendMap.aa || 0;
				targetIh = blendMap.ih || 0;
				targetOu = blendMap.ou || 0;
				targetEe = blendMap.ee || 0;
				targetOh = blendMap.oh || 0;

				const hasMapping =
					targetAa > 0 || targetIh > 0 || targetOu > 0 || targetEe > 0 || targetOh > 0;

				if (hasMapping) {
					const effectiveAmplitude = Math.max(audioAmplitude, 0.3);
					const amplitudeMultiplier = Math.min(effectiveAmplitude * 2.0, 1.0);
					targetAa = Math.min(targetAa * amplitudeMultiplier + effectiveAmplitude * 0.5, 1.0);
					targetIh = Math.min(targetIh * amplitudeMultiplier + effectiveAmplitude * 0.3, 1.0);
					targetOu = Math.min(targetOu * amplitudeMultiplier + effectiveAmplitude * 0.3, 1.0);
					targetEe = Math.min(targetEe * amplitudeMultiplier + effectiveAmplitude * 0.3, 1.0);
					targetOh = Math.min(targetOh * amplitudeMultiplier + effectiveAmplitude * 0.3, 1.0);
					if (targetAa + targetIh + targetOu + targetEe + targetOh < 0.2) {
						targetAa = Math.max(targetAa, effectiveAmplitude * 0.5);
					}
				} else {
					targetAa = Math.max(audioAmplitude * 1.0, 0.3);
				}
			}
		}
	}

	// Amplitude mode (fallback)
	if (targetAa === 0 && targetIh === 0 && targetOu === 0 && targetEe === 0 && targetOh === 0) {
		const time = currentTime * 4.5;
		const cycle = Math.sin(time) * 0.5 + 0.5;
		targetAa = audioAmplitude * 1.0;

		if (cycle < 0.2) {
			targetAa = Math.min(targetAa * 1.3, 1.0);
		} else if (cycle < 0.4) {
			targetIh = Math.min(audioAmplitude * 0.75, 1.0);
			targetAa *= 0.6;
		} else if (cycle < 0.6) {
			targetOu = Math.min(audioAmplitude * 0.75, 1.0);
			targetAa *= 0.6;
		} else if (cycle < 0.8) {
			targetEe = Math.min(audioAmplitude * 0.75, 1.0);
			targetAa *= 0.6;
		} else {
			targetOh = Math.min(audioAmplitude * 0.75, 1.0);
			targetAa *= 0.6;
		}
	}

	// Smooth transitions
	const smoothing = 0.1;
	const smoothedAa = previousAa + (targetAa - previousAa) * (1 - smoothing);
	const smoothedIh = previousIh + (targetIh - previousIh) * (1 - smoothing);
	const smoothedOu = previousOu + (targetOu - previousOu) * (1 - smoothing);
	const smoothedEe = previousEe + (targetEe - previousEe) * (1 - smoothing);
	const smoothedOh = previousOh + (targetOh - previousOh) * (1 - smoothing);

	manager.setValue('aa', Math.min(Math.max(smoothedAa, 0), 1.0));
	manager.setValue('ih', Math.min(Math.max(smoothedIh, 0), 1.0));
	manager.setValue('ou', Math.min(Math.max(smoothedOu, 0), 1.0));
	manager.setValue('ee', Math.min(Math.max(smoothedEe, 0), 1.0));
	manager.setValue('oh', Math.min(Math.max(smoothedOh, 0), 1.0));

	previousAa = smoothedAa;
	previousIh = smoothedIh;
	previousOu = smoothedOu;
	previousEe = smoothedEe;
	previousOh = smoothedOh;
}

export function resetLipSync(vrm: VRM | null) {
	if (!vrm?.expressionManager) return;
	vrm.expressionManager.setValue('aa', 0);
	vrm.expressionManager.setValue('ih', 0);
	vrm.expressionManager.setValue('ou', 0);
	vrm.expressionManager.setValue('ee', 0);
	vrm.expressionManager.setValue('oh', 0);
	previousAa = previousIh = previousOu = previousEe = previousOh = 0;
}
