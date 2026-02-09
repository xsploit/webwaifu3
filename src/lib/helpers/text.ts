const SENTENCE_ENDERS = /[.!?]+/g;
const SENTENCE_ENDERS_SINGLE = /[.!?]/g;

export function chunkTextBySentence(text: string): string[] {
	const chunks: string[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = SENTENCE_ENDERS.exec(text)) !== null) {
		const sentence = text.substring(lastIndex, match.index + match[0].length).trim();
		if (sentence.length > 2) {
			chunks.push(sentence);
		}
		lastIndex = match.index + match[0].length;
	}

	const remaining = text.substring(lastIndex).trim();
	if (remaining.length > 2) {
		chunks.push(remaining);
	}

	return chunks;
}

export function extractSentences(
	buffer: string,
	isFinal: boolean
): { sentences: string[]; remaining: string } {
	const sentences: string[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = SENTENCE_ENDERS_SINGLE.exec(buffer)) !== null) {
		const sentence = buffer.substring(lastIndex, match.index + 1).trim();
		if (sentence.length > 2) {
			sentences.push(sentence);
		}
		lastIndex = match.index + 1;
	}

	let remaining = buffer.substring(lastIndex);

	if (isFinal && remaining.trim().length > 2) {
		sentences.push(remaining.trim());
		remaining = '';
	}

	return { sentences, remaining };
}
