type SessionInput = { message: string; sessionId: string; language: string };
type SessionResult = { message: string; outputCount: number };
export type TranslationInput = { text: string; sourceLanguage: string; targetLanguage: string };
type ChatInput = SessionInput & { requestId: string; selectLanguage?: boolean };

/** Keep CX in English; retrying output translation must not replay a CX turn. */
export function createTranslatedChat(dependencies: {
  run: (input: SessionInput) => Promise<SessionResult>;
  selectLanguage: (input: Omit<SessionInput, "message">) => Promise<SessionResult>;
  translate: (input: TranslationInput) => Promise<string>;
}) {
  const turns = new Map<string, { fingerprint: string; expires: number; result: Promise<SessionResult> }>();
  return async (input: ChatInput) => {
    const language = input.language.trim();
    const english = /^(english|en|en[-_][a-z]{2})$/i.test(language);
    const key = `${input.sessionId}:${input.requestId}`;
    const fingerprint = JSON.stringify([input.message, language, !!input.selectLanguage]);
    const now = Date.now();
    for (const [id, turn] of turns) if (turn.expires <= now) turns.delete(id);
    let turn = turns.get(key);
    if (turn && turn.fingerprint !== fingerprint) throw new Error("This request ID was already used for another message. Please send again.");
    if (!turn) {
      const result = (async () => {
        if (input.selectLanguage) {
          const selected = await dependencies.selectLanguage({sessionId: input.sessionId, language: "English"});
          // CX's English acknowledgement describes its internal language. The worker
          // receives a neutral greeting translated into their actual selection.
          return {...selected, message: "Hello, I’m MDW Compass. How can I help you today?"};
        }
        const message = english ? input.message : await dependencies.translate({text: input.message, sourceLanguage: language, targetLanguage: "English"});
        return dependencies.run({message, sessionId: input.sessionId, language: "English"});
      })();
      turn = {fingerprint, expires: now + 10 * 60_000, result};
      if (turns.size >= 200) turns.delete(turns.keys().next().value!);
      turns.set(key, turn);
      // A provider failure before we have an answer can be retried normally.
      void result.catch(() => { if (turns.get(key)?.result === result) turns.delete(key); });
    }
    const result = await turn.result;
    if (!result.message.trim()) throw new Error("The assistant did not return a text response. Please try again.");
    const message = english ? result.message : await dependencies.translate({text: result.message, sourceLanguage: "English", targetLanguage: language});
    return {...result, message, language};
  };
}
