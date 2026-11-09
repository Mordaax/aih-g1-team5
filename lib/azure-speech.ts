import { getSpeechLanguage } from "./speech-languages.ts";

type SpeechErrorCode = "CONFIGURATION" | "AUTHENTICATION" | "RATE_LIMIT" | "TIMEOUT" | "UPSTREAM" | "VALIDATION";
export class SpeechError extends Error {
  readonly code: SpeechErrorCode;
  constructor(message: string, code: SpeechErrorCode) {
    super(message);
    this.name = "SpeechError";
    this.code = code;
  }
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, char => ({"<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;"})[char]!);
}

export function createSpeechSynthesizer(options: {env?: Record<string, string | undefined>; fetch?: typeof fetch} = {}) {
  return async (input: {text: string; language: string; voice?: string; rate?: number; signal?: AbortSignal}): Promise<Uint8Array> => {
    const config = getSpeechLanguage(input.language);
    if (!config) throw new SpeechError("Read-aloud is not available for this language yet. You can still read the response.", "VALIDATION");
    const voice = input.voice || config.voices[0].id;
    const rate = input.rate ?? 0.9;
    if (!config.voices.some(item => item.id === voice) || !Number.isFinite(rate) || rate < 0.75 || rate > 1.15 || !input.text.trim() || input.text.length > 20_000) {
      throw new SpeechError("Please choose a voice for this language and a supported reading speed.", "VALIDATION");
    }
    const env = options.env || process.env;
    const key = env.AZURE_SPEECH_KEY?.trim();
    const region = env.AZURE_SPEECH_REGION?.trim();
    if (!key || !region || !/^[a-z0-9]{3,40}$/.test(region)) throw new SpeechError("Read-aloud is not configured yet. Please ask the app administrator to configure Azure Speech. Text chat is still available.", "CONFIGURATION");
    const percent = Math.round((rate - 1) * 100);
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${config.locale}"><voice name="${voice}"><prosody rate="${percent >= 0 ? "+" : ""}${percent}%" volume="soft">${escapeXml(input.text)}</prosody></voice></speak>`;
    let response: Response;
    try {
      response = await (options.fetch || fetch)(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "MDW-Compass"},
        body: ssml,
        cache: "no-store",
        signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(35_000)]) : AbortSignal.timeout(35_000),
      });
    } catch (error) {
      const timeout = error instanceof Error && /timeout|abort/i.test(error.name);
      throw new SpeechError(timeout ? "Read-aloud took too long. Please try again." : "We could not load the audio. Please try again.", timeout ? "TIMEOUT" : "UPSTREAM");
    }
    if (response.status === 429) throw new SpeechError("Read-aloud is busy or the Azure free quota has been reached. Please try again later; text chat is still available.", "RATE_LIMIT");
    if (response.status === 401 || response.status === 403) throw new SpeechError("Azure Speech credentials were not accepted. Please ask the app administrator to check the key, region and free-tier quota.", "AUTHENTICATION");
    if (!response.ok) throw new SpeechError("This voice could not be loaded. Try another voice or read the text response.", "UPSTREAM");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 8_000_000 || !response.headers.get("Content-Type")?.toLowerCase().startsWith("audio/")) throw new SpeechError("The audio service returned an invalid recording. Please try again.", "UPSTREAM");
    return bytes;
  };
}

export const synthesizeSpeech = createSpeechSynthesizer();
