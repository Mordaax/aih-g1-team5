/* MERaLiON expects 512-sample frames of 16 kHz mono signed PCM16. */
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(512);
    this.offset = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data === "flush") {
        this.stopped = true;
        if (this.offset) this.emit();
        this.port.postMessage({ type: "flushed" });
      }
    };
  }
  emit() {
    const pcm = this.samples.slice(0, this.offset).buffer;
    this.port.postMessage({ type: "pcm", pcm }, [pcm]);
    this.offset = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      value = Math.max(-1, Math.min(1, value));
      this.samples[this.offset++] = Math.round(value * (value < 0 ? 32768 : 32767));
      if (this.offset === 512) this.emit();
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
