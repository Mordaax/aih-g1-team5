import { NextResponse } from "next/server";

import { CxAgentError } from "@/lib/cx-agent";
import { transcribeAudio } from "@/lib/meralion";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_DATA_URL_LENGTH = 12_000_000;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(`transcribe:${getClientIdentifier(request)}`);

  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        error: "Too many recordings. Please wait a moment and try again.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_AUDIO_DATA_URL_LENGTH + 100_000) {
    return jsonResponse({ error: "This recording is too large." }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Please send a valid audio recording." }, 400);
  }

  const audioUrl =
    typeof body === "object" && body !== null && "audioUrl" in body
      ? body.audioUrl
      : undefined;

  if (typeof audioUrl !== "string" || !audioUrl.trim()) {
    return jsonResponse({ error: "No audio recording was received." }, 400);
  }

  try {
    const transcript = await transcribeAudio(audioUrl);
    return jsonResponse({ transcript });
  } catch (error) {
    console.error("MDW Compass transcription request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    const publicError =
      error instanceof CxAgentError && error.code === "CONFIGURATION"
        ? "Voice transcription is not configured yet. Text chat is still available."
        : error instanceof CxAgentError && error.code === "TIMEOUT"
          ? "Transcription took too long. Please try again or type your message."
          : "We could not transcribe that recording. Please try again or type your message.";

    return jsonResponse(
      { error: publicError },
      error instanceof CxAgentError && error.code === "CONFIGURATION"
        ? 503
        : 502,
    );
  }
}
