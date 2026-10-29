import { CxAgentError } from "@/lib/cx-agent";

const MERALION_TRANSCRIPTION_URL =
  "https://api.meralion.ai/v1/audio/transcriptions";
const MAX_AUDIO_DATA_URL_LENGTH = 12_000_000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function getApiKey() {
  const apiKey = process.env.MERALION_API_KEY?.trim();

  if (!apiKey) {
    throw new CxAgentError(
      "Missing MERALION_API_KEY",
      "CONFIGURATION",
    );
  }

  return apiKey;
}

function extractTranscript(response: unknown) {
  if (!isRecord(response)) return "";

  if (typeof response.text === "string") return response.text.trim();
  if (typeof response.transcript === "string") return response.transcript.trim();

  if (!Array.isArray(response.choices)) return "";
  const firstChoice = response.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return "";

  const content = firstChoice.message.content;
  return typeof content === "string" ? content.trim() : "";
}

export async function transcribeAudio(audioUrl: string) {
  if (audioUrl.length > MAX_AUDIO_DATA_URL_LENGTH) {
    throw new CxAgentError("Audio recording is too large", "CONFIGURATION");
  }

  const audioUrlPattern =
    /^data:audio\/[a-z0-9.+-]+(?:;[a-z0-9=+._-]+)*;base64,[a-z0-9+/=]+$/i;

  if (!audioUrlPattern.test(audioUrl)) {
    throw new CxAgentError("Invalid audio data", "CONFIGURATION");
  }

  let response: Response;

  try {
    response = await fetch(MERALION_TRANSCRIPTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audio_url: audioUrl }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof CxAgentError) throw error;

    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new CxAgentError(
        "MERaLiON transcription request timed out",
        "TIMEOUT",
      );
    }

    throw new CxAgentError(
      error instanceof Error ? error.message : "MERaLiON request failed",
      "UPSTREAM",
    );
  }

  if (!response.ok) {
    throw new CxAgentError(
      `MERaLiON returned HTTP ${response.status}`,
      "UPSTREAM",
      response.status,
    );
  }

  const responseBody = (await response.json()) as unknown;
  const transcript = extractTranscript(responseBody);

  if (!transcript) {
    throw new CxAgentError(
      "MERaLiON returned an empty transcript",
      "UPSTREAM",
    );
  }

  return transcript;
}
