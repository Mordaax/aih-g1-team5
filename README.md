# MDW Compass

MDW Compass is a mobile-first Next.js chatbot frontend for migrant domestic workers in Singapore. It sends every conversation turn to the existing Google CX Agent Studio API access deployment for the MDW Compass Root Agent. The frontend does not recreate or route between the specialist agents.

## Included

- English, Tagalog, and Bahasa Indonesia language selection.
- An "Other languages" entry that lets a worker pass an explicit language name to the CX session without inventing frontend translations.
- Quick-start prompts for salary rights, welfare and well-being, abuse and mistreatment, and human support.
- Browser-saved CX session IDs, selected language, messages, and unsent drafts survive refresh. New Chat and Clear chat reset the saved conversation and start a fresh CX session.
- Server-only Google authentication through `google-auth-library`.
- Mobile-first responsive layout with safe-area support, expandable topic navigation, accessible emergency links, and 44px touch targets.
- Voice recording with browser `MediaRecorder`, format detection, a 90-second/8MB limit, microphone permission handling, transcription review, editing, re-record, cancel, and send confirmation.
- Browser `speechSynthesis` controls beside assistant messages with language-aware voice lookup, pause/resume, stop, and text fallback when a voice is unavailable.
- Server-only MERaLiON transcription proxy at `/api/transcribe`; recordings are held in memory only for the request and are not stored by this app.
- Input validation, a basic in-memory per-IP rate limit, request timeouts, and browser conversation persistence with a 24-hour inactivity expiry.
- Responsive accessible UI with loading, retry, emergency information, and human-support prompts.

## Install and run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The provided `.env.local` already contains the MDW Compass project, region, application, deployment, and application version IDs. If you recreate it from `.env.example`, keep these values aligned with the active API access deployment and add a real `MERALION_API_KEY` only to the server environment.

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
2. Add `GCP_PROJECT_ID`, `GCP_REGION_ID`, `CX_APPLICATION_ID`, `CX_DEPLOYMENT_ID`, `CX_APPLICATION_VERSION_ID`, and `MERALION_API_KEY` as server-side Vercel environment variables for the required environments.
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

`app/api/chat/route.ts` calls the CX Agent Studio `runSession` REST endpoint at `https://ces.googleapis.com/v1beta/...:runSession`. It sends the application version resource, deployment resource, and a `variables` input containing `preferred_language`, followed by the user text input. It extracts text from the returned `outputs[]` array and returns only the assistant message to the browser.

`app/api/transcribe/route.ts` accepts a validated base64 audio data URL, applies the same basic rate limiting, calls the MERaLiON transcription endpoint with `MERALION_API_KEY`, and returns only the transcript. Audio is not written to disk or localStorage.

## Known limitations

- MediaRecorder formats and microphone permissions differ between iOS Safari, Android Chrome, and desktop browsers. Unsupported browsers keep normal text chat available.
- MERaLiON transcription language coverage and accuracy vary by language, accent, and code-switching. The UI does not claim coverage that has not been configured or verified.
- Browser TTS voice coverage is device-dependent. If a matching English, Tagalog, Bahasa Indonesia, or custom-language voice is unavailable, the text response remains available.
- The CX API and MERaLiON API still require valid server credentials and network access; no live integration is claimed without a successful authenticated test.

## Browser conversation storage
Text messages, reviewed voice transcripts, drafts, language, and the CX session ID are stored in localStorage for 24 hours after the last activity. Audio and API keys are never stored there. Clearing chat resets local conversation data; it does not delete upstream provider records. If browser storage is blocked or full, chat continues in memory and displays a warning. Restoring a CX session ID does not extend the provider's session retention. SEA-LION translation is not added: typed messages and reviewed MERaLiON transcripts both go directly to CX in the user's selected language.

## Language-first live chat
New conversations start with a multilingual language question and selectable language names. Typing and recording unlock after CX confirms the selection. The server forwards the chosen language by name; if the deployed root agent returns its initial numbered language menu, it answers that menu once in the same CX session. The browser saves the confirmation, so existing conversations resume after refresh. New Chat resets onboarding. The live chat uses components/ui/chat-preview.tsx for avatar-and-name message rows, real message times, read-aloud controls, and reduced-motion-aware entrance animation. Cloud effects have been removed.
