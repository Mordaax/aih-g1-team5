export type PlaybackState = { messageId: string | null; status: "idle" | "loading" | "playing" | "paused" };
type SpeechInput = {messageId: string; text: string; language: string; voice?: string; rate?: number};

/** Audio and its cache live only in memory. No browser speech voices are needed. */
export function createSpeechPlayer(options: {
  onState: (state: PlaybackState) => void;
  onError: (message: string) => void;
  fetch?: typeof fetch;
  createAudio?: (url: string) => HTMLAudioElement;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}) {
  let generation = 0;
  let abort: AbortController | undefined;
  let audio: HTMLAudioElement | undefined;
  let objectUrl: string | undefined;
  let state: PlaybackState = {messageId: null, status: "idle"};
  const cache = new Map<string, Blob>();
  const emit = (next: PlaybackState) => { state = next; options.onState(next); };
  const release = () => {
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.src = ""; audio = undefined; }
    if (objectUrl) { (options.revokeObjectURL || URL.revokeObjectURL)(objectUrl); objectUrl = undefined; }
  };
  const stop = () => {
    generation++;
    abort?.abort(); abort = undefined;
    release();
    emit({messageId: null, status: "idle"});
  };
  const fail = (id: number, error: unknown) => {
    if (id !== generation) return;
    stop();
    options.onError(error instanceof Error ? error.message : "Read-aloud could not start. Please try again.");
  };
  return {
    stop,
    async play(input: SpeechInput) {
      stop();
      const id = generation;
      abort = new AbortController();
      emit({messageId: input.messageId, status: "loading"});
      const key = JSON.stringify([input.text, input.language, input.voice, input.rate]);
      try {
        let blob = cache.get(key);
        if (!blob) {
          const response = await (options.fetch || fetch)("/api/speech", {
            method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({text: input.text, language: input.language, voice: input.voice, rate: input.rate}),
            signal: abort.signal,
          });
          if (id !== generation) return;
          if (!response.ok) {
            const data = await response.json().catch(() => ({})) as {error?: string};
            throw new Error(typeof data.error === "string" ? data.error : "We could not load the audio. Please try again.");
          }
          if (!response.headers.get("Content-Type")?.startsWith("audio/")) throw new Error("The audio service did not return audio. Please try again.");
          blob = await response.blob();
          if (id !== generation) return;
          if (!blob.size) throw new Error("No audio was returned. Please try again.");
          if (cache.size >= 3) cache.delete(cache.keys().next().value!);
          cache.set(key, blob);
        }
        if (id !== generation) return;
        objectUrl = (options.createObjectURL || URL.createObjectURL)(blob);
        audio = options.createAudio ? options.createAudio(objectUrl) : new Audio(objectUrl);
        audio.onended = () => { if (id === generation) stop(); };
        audio.onerror = () => fail(id, new Error("This browser could not play the audio. Please try again."));
        await audio.play();
        if (id === generation) emit({messageId: input.messageId, status: "playing"});
      } catch (error) { fail(id, error); }
    },
    pause() {
      if (audio && state.status === "playing") { audio.pause(); emit({...state, status: "paused"}); }
    },
    async resume() {
      if (!audio || state.status !== "paused") return;
      const id = generation;
      try { await audio.play(); if (id === generation) emit({...state, status: "playing"}); }
      catch (error) { fail(id, error); }
    },
    dispose() { stop(); cache.clear(); },
  };
}
