// @ts-nocheck
class SttCaptureProcessor extends AudioWorkletProcessor {
	process(inputs) {
		const input = inputs[0];
		const channel = input?.[0];
		if (channel && channel.length > 0) {
			const copy = new Float32Array(channel);
			this.port.postMessage(copy, [copy.buffer]);
		}
		return true;
	}
}

registerProcessor('stt-capture-processor', SttCaptureProcessor);
