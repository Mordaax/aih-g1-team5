import { NextResponse } from "next/server";

import {
  CxAgentError,
  isPreferredLanguage,
  runCxSession,
  type PreferredLanguage,
} from "@/lib/cx-agent";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { selectCxLanguage } from "@/lib/language-onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_]{4,62}$/;
const MAX_MESSAGE_LENGTH = 4_000;

type ChatRequestBody = {
  message?: unknown;
  sessionId?: unknown;
  language?: unknown;
  selectLanguage?: unknown;
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
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return jsonResponse({ error: "Please send a valid JSON request." }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const language = body.language;

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

  if (!message && !body.language) {
    return jsonResponse({ error: "Please enter a message." }, 400);
  }

  try {
    const result = body.selectLanguage === true
      ? await selectCxLanguage(runCxSession, { sessionId, language: language as PreferredLanguage })
      : await runCxSession({
      message,
      sessionId,
      language: language as PreferredLanguage,
    });

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
    });
  } catch (error) {
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
