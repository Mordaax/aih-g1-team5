type RateLimitEntry = {
  count: number;
  windowStartedAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

const globalForRateLimit = globalThis as typeof globalThis & {
  __mdwCompassRateLimit?: Map<string, RateLimitEntry>;
};

const entries =
  globalForRateLimit.__mdwCompassRateLimit ??
  new Map<string, RateLimitEntry>();

globalForRateLimit.__mdwCompassRateLimit = entries;

export function getClientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  return forwardedFor?.split(",")[0]?.trim() || realIp || "anonymous";
}

export function checkRateLimit(identifier: string) {
  const now = Date.now();
  const current = entries.get(identifier);

  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    entries.set(identifier, { count: 1, windowStartedAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(
        (WINDOW_MS - (now - current.windowStartedAt)) / 1000,
      ),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
