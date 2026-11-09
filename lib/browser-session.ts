export type SavedMessage = { id: string; role: "user" | "assistant"; content: string; language?: string };
export type BrowserSession = {
  sessionId: string;
  language: string;
  messages: SavedMessage[];
  draft: string;
  reviewTranscript: boolean;
  languageConfirmed?: boolean;
};

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const STORAGE_KEY = "mdw-compass.conversation.v1";
const SESSION_LIFETIME = 24 * 60 * 60 * 1000;

function validSession(value: unknown): value is BrowserSession & { version: number; expiresAt: number } {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return data.version === 1 && typeof data.expiresAt === "number" && Number.isFinite(data.expiresAt)
    && typeof data.sessionId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9-_]{4,62}$/.test(data.sessionId)
    && typeof data.language === "string" && data.language.trim().length >= 2 && data.language.length <= 64 && !/[\r\n]/.test(data.language)
    && typeof data.draft === "string" && data.draft.length <= 4000
    && typeof data.reviewTranscript === "boolean"
    && (data.languageConfirmed === undefined || typeof data.languageConfirmed === "boolean") && Array.isArray(data.messages)
    && data.messages.every((message: unknown) => {
      if (!message || typeof message !== "object") return false;
      const entry = message as Record<string, unknown>;
      return typeof entry.id === "string" && (entry.role === "user" || entry.role === "assistant") && typeof entry.content === "string"
        && (entry.language === undefined || (typeof entry.language === "string" && entry.language.trim().length >= 2 && entry.language.length <= 64 && !/[\r\n]/.test(entry.language)));
    });
}

export function loadBrowserSession(storage: BrowserStorage, now = Date.now()): BrowserSession | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!validSession(data) || data.expiresAt <= now) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return { sessionId: data.sessionId, language: data.language, messages: data.messages, draft: data.draft, reviewTranscript: data.reviewTranscript,
      ...(data.languageConfirmed === undefined ? {} : { languageConfirmed: data.languageConfirmed }),
    };
  } catch {
    return null;
  }
}

export function saveBrowserSession(storage: BrowserStorage, session: BrowserSession, now = Date.now()): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...session, version: 1, expiresAt: now + SESSION_LIFETIME }));
    return true;
  } catch {
    return false;
  }
}

export function clearBrowserSession(storage: BrowserStorage): boolean {
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
