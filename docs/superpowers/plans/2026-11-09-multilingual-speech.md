# Multilingual Speech Implementation Plan

**Goal:** Implement the approved SEA-LION → English CX → SEA-LION flow, retaining MERaLiON speech input and adding Azure F0-compatible neural speech output.

**Architecture:** The website retains original text and the user's display language. Server-side translation surrounds the existing English CX session. Azure synthesis runs on the server; the browser plays MP3 audio with pause/resume/stop. Credentials stay server-only. Missing credentials, unsupported languages, timeouts and quota failures remain explicit errors.

**Tech stack:** Existing Next.js 16/React 19, native fetch, Node test runner, SEA-LION OpenAI-compatible API, Azure Speech REST API.

**Spec:** User-approved flow in this chat, 9 November 2026.

**Verification result:** Implementation, 38 behavioral tests, TypeScript, ESLint, and production build passed. Live SEA-LION Thai/Mandarin translation and the Thai website → English CX → Thai response flow passed. Browser checks confirmed a translated Thai greeting, voice/speed controls, responsive layouts and the expected Azure configuration error before credentials were supplied.

**Azure activated and verified, 9 November 2026:** The user configured the Azure key and region locally. The website's `/api/speech` endpoint successfully generated valid MP3 audio for all 24 configured voices across the twelve menu languages. Requests were paced to stay within F0 request limits. Thai browser playback, pause, resume and stop passed; the missing-configuration error cleared. Azure remains the selected provider. This verifies synthesis availability and playback, not native-speaker pronunciation quality or the Azure resource's billing tier.

Run `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/verify-azure-speech.mjs --all` to repeat the live voice check. It saves short samples and `results.json` in the operating system's temporary directory under `mdw-compass-azure-speech-verification`, and uses the provider's synthesis allowance. Audio samples and screenshots are local verification artifacts, not repository files.

## Task 1: Translate around English CX

- [x] Add failing behavior tests in `tests/translated-chat.test.mjs` for Thai and Mandarin round trips, English bypass, language onboarding and failed answer-translation retry without duplicate CX input.
- [x] Add `lib/translated-chat.ts`: `createTranslatedChat({ run, translate, selectLanguage })` returns a handler accepting `{message, language, sessionId, requestId, selectLanguage?}` and returning `{message, language, outputCount}`. Keep a bounded, expiring in-memory cache of English results for retry.
- [x] Add `lib/sealion.ts`: `translateText({text, sourceLanguage, targetLanguage})`, validated configuration, translation-only prompts, timeout and quota/configuration errors. Use the existing SEA-LION key; never send credentials to the client.
- [x] Integrate in `app/api/chat/route.ts`; validate JSON shape, message size, language and request IDs. Force CX language to English, including onboarding.
- [x] Run the new tests and existing suite.

## Task 2: Azure neural speech

- [x] Add failing tests in `tests/speech.test.mjs` for Thai/Mandarin locale and voice selection, XML escaping, unknown languages, rate validation, provider failures and MP3 response handling.
- [x] Add `lib/speech-languages.ts` with the app's listed languages, explicit aliases and two Azure neural voice choices per language. No English fallback for unknown languages.
- [x] Add `lib/azure-speech.ts` for server-only SSML synthesis with a slightly slower default, validated voice IDs, timeouts, no-store MP3 responses and F0-compatible request throttling.
- [x] Add `app/api/speech/route.ts`; validate requests and expose public configuration/quota errors without secrets.
- [x] Add `lib/speech-player.ts` with cancellable loading, MP3 playback, pause/resume/stop, bounded in-memory audio reuse and cleanup; test cancellation and stale playback events.
- [x] Run provider and playback tests.

## Task 3: Connect playback, preserve language and verify

- [x] Update `components/mdw-compass-chat.tsx` to use Azure playback, expose loading/stop and voice/speed controls, retain message language, invalidate stale events and stop on recording/language changes/reset.
- [x] Extend `lib/browser-session.ts` to persist optional per-message language without breaking old saved conversations; add a regression test.
- [x] Update `.env.example`, preserve `.env.local` secrets, document Azure F0 setup and translation limitations in `README.md`.
- [x] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- [x] Verify real SEA-LION translation and English CX integration using harmless sample questions. Verify Azure live if credentials are supplied; otherwise verify the explicit setup error and report the exact missing settings.
- [x] Inspect desktop/mobile UI and save a screenshot of the final result.
