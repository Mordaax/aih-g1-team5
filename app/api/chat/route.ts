import { NextResponse } from "next/server";

import {
  CxAgentError,
  isPreferredLanguage,
  runCxSession,
  type PreferredLanguage,
} from "@/lib/cx-agent";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { selectCxLanguage } from "@/lib/language-onboarding";
import { createTranslatedChat } from "@/lib/translated-chat";
import { translateText, TranslationError } from "@/lib/sealion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const translatedChat = createTranslatedChat({
  run: runCxSession,
  selectLanguage: (selection) => selectCxLanguage(runCxSession, selection),
  translate: translateText,
});

const SESSION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_]{4,62}$/;
const MAX_MESSAGE_LENGTH = 4_000;

type ChatRequestBody = {
  message?: unknown;
  sessionId?: unknown;
  language?: unknown;
  selectLanguage?: unknown;
  requestId?: unknown;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(getClientIdentifier(request));

  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        error: "Too many requests. Please wait a moment and try again.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
    );
  }

  let body: ChatRequestBody;

  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonResponse({error: "Please send a valid JSON request."}, 400);
    body = parsed as ChatRequestBody;
  } catch {
    return jsonResponse({ error: "Please send a valid JSON request." }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const language = body.language;
  const requestId = typeof body.requestId === "string" ? body.requestId : crypto.randomUUID();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) return jsonResponse({error: "Please send a valid request ID."}, 400);

  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return jsonResponse({ error: "Please start a new chat session." }, 400);
  }

  if (!isPreferredLanguage(language)) {
    return jsonResponse({ error: "Please choose a supported language." }, 400);
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      { error: `Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.` },
      400,
    );
  }

  if (!message && body.selectLanguage !== true) {
    return jsonResponse({ error: "Please enter a message." }, 400);
  }

  try {
    const result = await translatedChat({message, sessionId, language: (language as PreferredLanguage).trim(), requestId, selectLanguage: body.selectLanguage === true});

    if (!result.message && message) {
      return jsonResponse(
        {
          error:
            "The assistant did not return a text response. Please try again.",
        },
        502,
      );
    }

    return jsonResponse({
      message: result.message,
      outputCount: result.outputCount,
      language: result.language,
      ...(result.sources?.length ? {sources: result.sources} : {}),
    });
  } catch (error) {
    if (error instanceof TranslationError) {
      return jsonResponse({error: error.message}, error.code === "RATE_LIMIT" ? 429 : error.code === "CONFIGURATION" || error.code === "AUTHENTICATION" ? 503 : 502);
    }
    console.error("MDW Compass chat request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    const publicError =
      error instanceof CxAgentError && error.code === "AUTHENTICATION"
        ? "Google Cloud authentication is not configured on this server. Run `gcloud auth application-default login` locally, or configure server-side credentials for deployment."
        : error instanceof CxAgentError && error.code === "CONFIGURATION"
          ? "MDW Compass is missing its Google CX configuration. Check the server environment variables."
          : error instanceof CxAgentError && error.code === "TIMEOUT"
            ? "MDW Compass took too long to respond. Please try again."
            : "We could not reach MDW Compass right now. Please try again in a moment.";

    return jsonResponse(
      {
        error: publicError,
      },
      error instanceof CxAgentError && error.code === "AUTHENTICATION"
        ? 503
        : 502,
    );
  }
}
