# MDW Compass

MDW Compass is a mobile-first Next.js chatbot frontend for migrant domestic workers in Singapore. SEA-LION translates questions into English, the existing Google CX Agent Studio Root Agent answers in English, and SEA-LION translates the answer into the worker's selected language. MERaLiON provides speech input; Azure neural voices provide optional read-aloud. The frontend does not recreate or route between specialist agents.

See [the technical architecture and request sequence](docs/architecture.md) for the text, voice, translation and speech-output paths.

## Included

- English, Tagalog, Indonesian, Burmese, Tamil, Bengali, Sinhala, Hindi, Khmer, Thai, Malay, and Mandarin Chinese language selection.
- An "Other languages" entry for SEA-LION translation; model support and translation quality must be checked individually. Speech output supports the twelve menu languages and their documented aliases.
- Quick-start prompts for salary rights, welfare and well-being, abuse and mistreatment, and human support.
- Browser-saved CX session IDs, selected language, messages, and unsent drafts survive refresh. New Chat and Clear chat reset the saved conversation and start a fresh CX session.
- Server-only Google authentication through `google-auth-library`.
- Mobile-first responsive layout with safe-area support, expandable topic navigation, accessible emergency links, and 44px touch targets.
- Voice recording with browser `MediaRecorder`, format detection, a 90-second/8MB limit, microphone permission handling, transcription review, editing, re-record, cancel, and send confirmation.
- Azure neural read-aloud with two voice choices per menu language, a soft volume and 0.9× default pace, speed controls, loading/cancellation, pause/resume, stop and an in-memory replay cache. Each answer retains its own language after language changes and refresh.
- Server-only MERaLiON transcription proxy at `/api/transcribe`; recordings are held in memory only for the request and are not stored by this app.
- Input validation, a basic in-memory per-IP rate limit, request timeouts, and browser conversation persistence with a 24-hour inactivity expiry.
- Responsive accessible UI with loading, retry, emergency information, and human-support prompts.

## Install and run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Keep the existing Google configuration in `.env.local`. Add `MERALION_API_KEY`, `SEALION_API_KEY`, `AZURE_SPEECH_KEY`, and `AZURE_SPEECH_REGION` as server-only settings. `SEALION_MODEL` defaults to `aisingapore/Gemma-SEA-LION-v4-27B-IT`; an existing `SEALION_FALLBACK_API_KEY` is accepted if the primary key is absent. Never commit keys or prefix them with `NEXT_PUBLIC_`.

### Azure free speech setup

Create a **Speech** resource in the Azure portal with the **Free (F0)** pricing tier. Copy its key and region code from **Keys and Endpoint** into `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`. An Azure subscription is required even for F0. The pricing tier is selected in Azure, not by this application's API key or code. F0 includes 500,000 neural synthesis characters per month and 20 transactions per minute; the provider enforces the resource quota. This application also limits synthesis to 20 requests/minute per server instance, keeps audio only in memory and does not automatically switch to a paid tier.

Until Azure is configured, text chat and MERaLiON input remain usable and Listen reports the missing setup. Unsupported languages, authentication failures, timeouts and quota failures produce explicit errors; no English voice is silently substituted. See [Azure pricing](https://azure.microsoft.com/en-us/pricing/details/speech/) and [Speech API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech).

Live local verification on 9 November 2026 successfully generated MP3 audio through `/api/speech` for both configured voices in all twelve menu languages (24 voices). Thai browser playback, pause, resume and stop were also verified. This does not establish native-speaker pronunciation quality or confirm the Azure resource's billing tier. To generate the same short greeting samples, run `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/verify-azure-speech.mjs --all`; requests are paced for F0 limits and consume synthesis characters.

`CX_APPLICATION_VERSION_ID` is sent as the `config.app_version` resource name, alongside the new `CX_DEPLOYMENT_ID`, using the configured `CX_API_VERSION` (`v1beta`). The code accepts the requested `GCP_PROJECT_ID`/`GCP_REGION_ID` names and the earlier `GOOGLE_CLOUD_PROJECT_ID`/`CX_REGION` aliases.

## Local Google Cloud authentication

The server uses Application Default Credentials (ADC). Install and initialize the Google Cloud CLI, then run:

```bash
gcloud init
gcloud auth application-default login
gcloud auth application-default set-quota-project aih-g1-team-5
```

The account or service account needs permission to run the CX session, including `ces.sessions.runSession`. Do not put an access token or service-account key in browser code or commit one to this repository.

## Test the MDW Compass API connection

Start the app in another terminal:

```bash
npm run dev
```

Then call the server-side route with a valid session ID:

```bash
curl -i http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId": "test-session-123",
    "language": "English",
    "message": "What should I know about salary deductions?"
  }'
```

A successful response contains a `message` returned by CX Agent Studio. A `503` response means credentials or configuration are missing; a `502` response means the upstream request failed. Check the dev-server logs and confirm ADC, IAM, API access deployment IDs, and project configuration. The supplied CX deployment returned a live response during local verification. MERaLiON was live-tested through `/api/transcribe` using a synthetic English WAV recording; the returned transcript matched the sample. Physical microphone capture and language-specific accuracy still depend on browser and provider support.

## Test voice transcription

Set `MERALION_API_KEY` in `.env.local`, start the app, and use the microphone button from a secure origin (`localhost` is allowed during local development). The browser asks for microphone access only after the worker taps Record. The recording is transcribed through the server route and placed into the editable composer; it is not sent to CX until the worker taps Send.

The direct MERaLiON request uses the documented JSON shape:

```json
{
  "audio_url": "data:audio/webm;base64,..."
}
```

The server supports the documented response shape (`choices[0].message.content`) and common direct `text`/`transcript` response fields. The app does not use MERaLiON for conversation or legal-answer generation.

## Deploy to Vercel securely

1. Import the repository into Vercel.
2. Add `GCP_PROJECT_ID`, `GCP_REGION_ID`, `CX_APPLICATION_ID`, `CX_DEPLOYMENT_ID`, `CX_APPLICATION_VERSION_ID`, `MERALION_API_KEY`, `SEALION_API_KEY`, `AZURE_SPEECH_KEY`, and `AZURE_SPEECH_REGION` as server-side Vercel environment variables for the required environments. Optionally set `SEALION_MODEL` to a model available to your SEA-LION key.
3. Prefer Google Workload Identity Federation with a narrowly scoped service account and a Vercel/OIDC identity provider. Set `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, and `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` in Vercel. The server exchanges the current Vercel OIDC token for a short-lived Google access token. Configure the provider's allowed audience as `https://vercel.com/YOUR_TEAM_SLUG` and restrict its subject and the service-account binding to `owner:YOUR_TEAM_SLUG:project:aih-g1-team5:environment:production`. Do not upload your local personal application-default credentials. A server-only `GOOGLE_APPLICATION_CREDENTIALS_JSON` remains supported as an alternative when federation variables are absent.
4. Grant only the permission needed for the CX deployment, including `ces.sessions.runSession`. Do not grant Owner, Editor, or broad Viewer access.
5. Redeploy and test `/api/chat` from the deployed site. Keep `GOOGLE_APPLICATION_CREDENTIALS_JSON` server-only and do not prefix it with `NEXT_PUBLIC_`.
6. Keep `MERALION_API_KEY` server-only and never expose it through `NEXT_PUBLIC_` variables or client-side code.

If your Vercel organization cannot issue an OIDC token accepted by Google WIF, use a dedicated intermediary on Cloud Run with an attached service account, or use a narrowly scoped secret stored only in Vercel as a temporary fallback. Never commit credentials to Git.

## Verification commands

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## API implementation notes

`app/api/chat/route.ts` runs the SEA-LION → English CX → SEA-LION pipeline in `lib/translated-chat.ts`. CX receives `preferred_language: English`, the translated question, the same session, application version and deployment resources. English selections bypass both translation calls. The browser receives only the translated answer and its language. A language-selection handshake also sets CX to English; a neutral greeting is translated into the user's language. Per-turn request IDs reuse completed English answers for ten minutes in a bounded server-memory cache, so a retry after failed output translation does not duplicate the CX question. This cache is not durable across process restarts or separate instances.

`lib/sealion.ts` uses the [official SEA-LION API](https://docs.sea-lion.ai/guides/inferencing/api) with translation-only instructions. It preserves original text in the browser, rejects truncated/empty output and changed ASCII number tokens, and fails explicitly if translation is unavailable. These checks do not prove semantic translation accuracy. Language-specific review is still required, particularly for negation, dates, names and employment guidance.

`app/api/speech/route.ts` synthesizes the translated answer using a voice allowlist, escaped SSML and the regional Azure endpoint. It returns a no-store MP3 response without exposing keys. The browser's audio player handles pause/resume, stop, cancellation, stale events and a three-entry memory-only replay cache.

`app/api/transcribe/route.ts` accepts a validated base64 audio data URL, applies the same basic rate limiting, calls the MERaLiON transcription endpoint with `MERALION_API_KEY`, and returns only the transcript. Audio is not written to disk or localStorage.

## Known limitations

- MediaRecorder formats and microphone permissions differ between iOS Safari, Android Chrome, and desktop browsers. Unsupported browsers keep normal text chat available.
- MERaLiON transcription language coverage and accuracy vary by language, accent, and code-switching. The UI does not claim coverage that has not been configured or verified.
- Azure voice availability depends on the configured service region and quota. The twelve menu languages have explicit voice mappings; arbitrary custom-language names do not fall back to English speech.
- CX, MERaLiON, SEA-LION and Azure require valid server credentials and network access. SEA-LION translation adds two provider calls per non-English chat turn and is subject to its API rate limits. Translation quality and physical microphone/speaker behavior require language and device testing.

## Browser conversation storage
Text messages, reviewed voice transcripts, drafts, per-answer languages, the selected display language and the CX session ID are stored in localStorage for 24 hours after the last activity. Audio and API keys are never stored there. Clearing chat resets local conversation data; it does not delete upstream provider records. If browser storage is blocked or full, chat continues in memory and displays a warning. Restoring a CX session ID does not extend provider retention. Original questions and CX answers pass through SEA-LION for translation; Read aloud sends the displayed answer to Azure.

## Language-first live chat
New conversations start with a multilingual language question and selectable language names. Typing and recording unlock after the English CX handshake and translated greeting succeed. The server answers CX's numbered language menu in English while retaining the worker's actual display language separately. The browser saves the confirmation, so existing conversations resume after refresh. New Chat resets onboarding. The live chat uses components/ui/chat-preview.tsx for avatar-and-name message rows, real message times, read-aloud controls, and reduced-motion-aware entrance animation.

## Live voice transcription
The Record button streams 16 kHz mono PCM16 audio through MERaLiON’s documented optional-key WebSocket at `wss://api.meralion.ai/v1/audio/stream`. Interim hypotheses replace one another in the composer; final segments accumulate. Stop flushes the last audio frame, sends EOF, and waits for final results before transcript review. No message is sent to CX until Send is pressed. The existing full recording is kept in memory as a fallback if streaming is unavailable, authentication becomes required, or the browser cannot capture the required audio format. No private API key is exposed to the browser. Audio leaves the device while recording. Cancel and page cleanup close the stream and release microphone resources.

Verified with synthetic PCM16 speech: real interim events were received before EOF, followed by the correct final transcript and a done event. Physical microphone behavior and recognition accuracy in each language still require device testing.
