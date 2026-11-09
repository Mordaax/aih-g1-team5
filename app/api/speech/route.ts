import { SpeechError, synthesizeSpeech } from "@/lib/azure-speech";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

function errorResponse(error: string, status: number) {
  return Response.json({error}, {status, headers: {"Cache-Control": "no-store"}});
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 150_000) return errorResponse("This response is too long to read aloud.", 413);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 100_000) return errorResponse("This response is too long to read aloud.", 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return errorResponse("Please send valid speech settings.", 400);
    body = parsed as Record<string, unknown>;
  } catch { return errorResponse("Please send valid speech settings.", 400); }
  if (typeof body.text !== "string" || typeof body.language !== "string" || (body.voice !== undefined && typeof body.voice !== "string") || (body.rate !== undefined && typeof body.rate !== "number")) return errorResponse("Please send text and a supported language.", 400);
  // Azure F0 allows 20 synthesis transactions per minute; Azure enforces its resource quota across instances.
  const limit = checkRateLimit("azure-speech:f0", 20);
  if (!limit.allowed) return errorResponse("Read-aloud is busy. Please wait a minute and try again.", 429);
  try {
    const bytes = await synthesizeSpeech({text: body.text, language: body.language, voice: body.voice as string | undefined, rate: body.rate as number | undefined, signal: request.signal});
    return new Response(Buffer.from(bytes), {headers: {"Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
  } catch (error) {
    if (error instanceof SpeechError) return errorResponse(error.message, error.code === "VALIDATION" ? 400 : error.code === "RATE_LIMIT" ? 429 : error.code === "CONFIGURATION" || error.code === "AUTHENTICATION" ? 503 : 502);
    return errorResponse("Read-aloud is unavailable right now. Please try again.", 502);
  }
}
