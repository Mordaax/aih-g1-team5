"use client";

import {
  ArrowUpRight,
  BadgeDollarSign,
  ChevronDown,
  HeartHandshake,
  Languages,
  LifeBuoy,
  LoaderCircle,
  Menu,
  Mic,
  Pause,
  PhoneCall,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { AiMascotInput, RobotAvatar } from "@/components/ui/ai-mascot-input";
import { LanguageSelect } from "@/components/ui/language-select";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ChatPreview, ChatMessageRow } from "@/components/ui/chat-preview";
import { LANGUAGE_PROMPT, onboardingLanguages, needsLanguageSelection } from "@/lib/language-onboarding";

import { recordingToWav } from "@/lib/recording-wav";
import { startLiveTranscription, type LiveTranscription } from "@/lib/live-transcription";
import { createSpeechPlayer, type PlaybackState } from "@/lib/speech-player";
import { getSpeechLanguage } from "@/lib/speech-languages";

import type { PreferredLanguage } from "@/lib/cx-agent";
import { loadBrowserSession, saveBrowserSession, clearBrowserSession } from "@/lib/browser-session";
import { normalizeSources, type SourceLink } from "@/lib/answer-sources";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  language?: string;
  sources?: SourceLink[];
};

type ChatError = {
  message: string;
  failedText: string;
};

type TopicCard = {
  title: string;
  description: string;
  icon: LucideIcon;
  prompt: string;
};

type VoiceState = "idle" | "recording" | "transcribing" | "review";

const languageOptions: Array<{
  value: PreferredLanguage;
  label: string;
  shortLabel: string;
}> = [
  { value: "English", label: "English", shortLabel: "EN" },
  { value: "Tagalog", label: "Tagalog", shortLabel: "TL" },
  { value: "Bahasa Indonesia", label: "Bahasa Indonesia", shortLabel: "ID" },
];

const topicCards: TopicCard[] = [
  {
    title: "Salary Rights",
    description: "Pay, deductions & days off",
    icon: BadgeDollarSign,
    prompt: "I have a question about my salary or deductions.",
  },
  {
    title: "Rest Days & Well-Being",
    description: "Rest, food & living conditions",
    icon: HeartHandshake,
    prompt: "I want to ask about my rest days and well-being.",
  },
  {
    title: "Abuse & Mistreatment",
    description: "When something does not feel safe",
    icon: ShieldAlert,
    prompt: "I do not feel safe and need help understanding my options.",
  },
  {
    title: "Find Human Support",
    description: "Talk to a real person who can help",
    icon: LifeBuoy,
    prompt: "I would like help finding human support.",
  },
];

const initialMessages: ChatMessage[] = [{ id: "language-welcome", role: "assistant", content: LANGUAGE_PROMPT }];

const RECORDING_LIMIT_SECONDS = 90;
const RECORDING_LIMIT_BYTES = 8_000_000;
const audioMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg;codecs=opus",
];

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `mdw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  return audioMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read the audio recording"));
    reader.onerror = () => reject(new Error("Could not read the audio recording"));
    reader.readAsDataURL(blob);
  });
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

async function requestChat({
  message,
  sessionId,
  language,
  selectLanguage = false,
  requestId,
}: {
  message: string;
  sessionId: string;
  language: PreferredLanguage;
  selectLanguage?: boolean;
  requestId: string;
}) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId, language, selectLanguage, requestId }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    message?: unknown;
    error?: unknown;
    language?: unknown;
    sources?: unknown;
  };

  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "We could not reach MDW Compass right now.",
    );
  }

  return {message: typeof data.message === "string" ? data.message : "", language: typeof data.language === "string" ? data.language : language, sources: normalizeSources(data.sources)};
}

export function MdwCompassChat() {
  const [sessionId, setSessionId] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [languageConfirmed, setLanguageConfirmed] = useState(false);
  const [language, setLanguage] = useState<PreferredLanguage>("English");
  const [otherLanguage, setOtherLanguage] = useState("");
  const [otherLanguageOpen, setOtherLanguageOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "fallback">("connecting");
  const liveTranscriptionRef = useRef<LiveTranscription | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playback, setPlayback] = useState<PlaybackState>({messageId: null, status: "idle"});
  const [readingVoice, setReadingVoice] = useState(0);
  const [readingRate, setReadingRate] = useState(0.9);
  const speechPlayerRef = useRef<ReturnType<typeof createSpeechPlayer> | null>(null);
  const retryRequestIdRef = useRef("");
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const preVoiceInputRef = useRef("");
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    // Browser storage is external state; restore after hydration, before enabling sends.
    let saved = null;
    try { saved = loadBrowserSession(window.localStorage); } catch { /* Storage may be disabled. */ }
    /* eslint-disable react-hooks/set-state-in-effect -- Synchronize external browser storage after server hydration. */
    setSessionId(saved?.sessionId || createSessionId());
    if (saved) {
      setLanguage(saved.language);
      setMessages(needsLanguageSelection(saved) && !saved.messages.some((message) => message.role === "user") ? initialMessages : saved.messages.length ? saved.messages : initialMessages);
      setLanguageConfirmed(!needsLanguageSelection(saved));
      setInput(needsLanguageSelection(saved) ? "" : saved.draft);
      setVoiceState(saved.reviewTranscript ? "review" : "idle");
    }
    setSessionReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    let saved = false;
    try {
      saved = saveBrowserSession(window.localStorage, {
        sessionId, language, languageConfirmed, messages, draft: input, reviewTranscript: voiceState === "review",
      });
    } catch { /* Chat remains usable when browser storage is disabled. */ }
    // Expose persistence failures rather than promising that refresh will retain this chat.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorageUnavailable(!saved);
  }, [sessionReady, sessionId, language, languageConfirmed, messages, input, voiceState]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const hasConversation = languageConfirmed && (messages.length > 0 || isLoading || error || voiceError);
    viewport.scrollTo({
      top: hasConversation ? viewport.scrollHeight : 0,
      behavior: hasConversation ? "smooth" : "instant",
    });
  }, [messages, isLoading, error, voiceError, languageConfirmed]);

  useEffect(() => {
    if (voiceState !== "recording") return;
    const recordingStartedAt = Date.now();

    const interval = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt) / 1000));
    }, 250);
    const timeout = window.setTimeout(() => {
      mediaRecorderRef.current?.stop();
    }, RECORDING_LIMIT_SECONDS * 1_000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [voiceState]);

  useEffect(() => {
    let mounted = true;
    const player = createSpeechPlayer({
      onState: (state) => { if (mounted) setPlayback(state); },
      onError: (message) => { if (mounted) setVoiceError(message); },
    });
    speechPlayerRef.current = player;
    return () => { mounted = false; player.dispose(); speechPlayerRef.current = null; };
  }, []);

  useEffect(() => {
    return () => {
      discardRecordingRef.current = true;
      liveTranscriptionRef.current?.cancel();
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopSpeech = () => {
    speechPlayerRef.current?.stop();
  };

  const speakMessage = async (message: ChatMessage) => {
    const player = speechPlayerRef.current;
    if (!player) return;
    if (playback.messageId === message.id) {
      if (playback.status === "paused") await player.resume();
      else if (playback.status === "playing") player.pause();
      return;
    }
    setVoiceError("");
    const answerLanguage = message.language || language;
    await player.play({messageId: message.id, text: message.content, language: answerLanguage, voice: getSpeechLanguage(answerLanguage)?.voices[readingVoice]?.id, rate: readingRate});
  };

  const sendMessage = async (text: string, isRetry = false) => {
    const trimmedText = text.trim();
    if (!trimmedText || !sessionReady || isLoading || voiceState === "transcribing" || voiceState === "recording") return;
    if (!languageConfirmed) {
      setInput((current) => current === trimmedText ? "" : trimmedText);
      setMenuOpen(false);
      return;
    }
    const generation = requestGenerationRef.current;
    const requestId = isRetry && retryRequestIdRef.current ? retryRequestIdRef.current : createSessionId();
    retryRequestIdRef.current = requestId;

    const activeSessionId = sessionId || createSessionId();
    if (!sessionId) setSessionId(activeSessionId);

    setError(null);
    setVoiceError("");
    setMenuOpen(false);

    if (!isRetry) {
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: "user", content: trimmedText, language },
      ]);
    }

    setIsLoading(true);

    try {
      const response = await requestChat({
        message: trimmedText,
        sessionId: activeSessionId,
        language,
        requestId,
      });

      if (generation !== requestGenerationRef.current) return;

      setInput("");
      setVoiceState("idle");
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-assistant`, role: "assistant", content: response.message, language: response.language, sources: response.sources },
      ]);
    } catch (requestError) {
      if (generation !== requestGenerationRef.current) return;
      setError({
        message:
          requestError instanceof Error
            ? requestError.message
            : "We could not reach MDW Compass right now.",
        failedText: trimmedText,
      });
    } finally {
      if (generation === requestGenerationRef.current) setIsLoading(false);
    }
  };

  const syncLanguage = async (nextLanguage: PreferredLanguage) => {
    const generation = requestGenerationRef.current;
    const activeSessionId = sessionId || createSessionId();
    if (!sessionId) setSessionId(activeSessionId);

    setIsLoading(true);
    setError(null);

    try {
      const response = await requestChat({ message: nextLanguage, sessionId: activeSessionId, language: nextLanguage, selectLanguage: true, requestId: createSessionId() });
      if (generation !== requestGenerationRef.current) return;
      setLanguage(nextLanguage);
      setLanguageConfirmed(true);
      if (response.message) {
        setMessages((current) => [
          ...current,
          { id: `${Date.now()}-language-choice`, role: "user", content: nextLanguage, language: nextLanguage },
          { id: `${Date.now()}-language-sync`, role: "assistant", content: response.message, language: response.language, sources: response.sources },
        ]);
      }
    } catch (requestError) {
      if (generation !== requestGenerationRef.current) return;
      setError({
        message: requestError instanceof Error ? requestError.message : "We could not update the language right now.",
        failedText: "",
      });
    } finally {
      if (generation === requestGenerationRef.current) setIsLoading(false);
    }
  };

  const handleLanguageChange = (nextLanguage: PreferredLanguage) => {
    if ((nextLanguage === language && languageConfirmed) || isBusy) return;
    stopSpeech();
    setOtherLanguageOpen(false);
    setMenuOpen(false);
    void syncLanguage(nextLanguage);
  };

  const handleOtherLanguageSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedLanguage = otherLanguage.trim();
    if (trimmedLanguage.length < 2) {
      setVoiceError("Please enter the language you would like to use.");
      return;
    }
    setVoiceError("");
    setOtherLanguage("");
    handleLanguageChange(trimmedLanguage);
  };

  const transcribeRecording = async (blob: Blob) => {
    const generation = requestGenerationRef.current;
    setVoiceState("transcribing");
    setVoiceError("");

    try {
      const audioUrl = await blobToDataUrl(await recordingToWav(blob));
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl }),
      });
      const data = (await response.json().catch(() => ({}))) as { transcript?: unknown; error?: unknown };
      if (generation !== requestGenerationRef.current) return;
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "We could not transcribe that recording.");
      }

      const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
      if (!transcript) throw new Error("No words were recognized. Please try again.");
      setInput(transcript);
      setVoiceState("review");
    } catch (requestError) {
      if (generation !== requestGenerationRef.current) return;
      setVoiceState("idle");
      setVoiceError(requestError instanceof Error ? requestError.message : "We could not transcribe that recording. Please type your message instead.");
    }
  };

  const stopRecording = (discard: boolean) => {
    discardRecordingRef.current = discard;
    if (discard) { liveTranscriptionRef.current?.cancel(); liveTranscriptionRef.current = null; }
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setVoiceState("idle");
      return;
    }

    recorder.stop();
  };

  const startRecording = async () => {
    if (!languageConfirmed || isLoading || voiceState === "recording" || voiceState === "transcribing") return;
    stopSpeech();
    if (voiceState === "idle") preVoiceInputRef.current = input;
    setVoiceError("");

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Voice recording is not supported in this browser. You can still type your message.");
      return;
    }

    const mimeType = getSupportedAudioMimeType();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      liveTranscriptionRef.current?.cancel();
      liveTranscriptionRef.current = null;
      setLiveStatus("connecting");
      const generation = requestGenerationRef.current;
      discardRecordingRef.current = false;
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordedChunksRef.current.push(event.data);
        const size = recordedChunksRef.current.reduce((total, item) => total + item.size, 0);
        if (size > RECORDING_LIMIT_BYTES) {
          setVoiceError("This recording is too large. Please try a shorter recording.");
          stopRecording(true);
        }
      };
      recorder.onstop = () => {
        const wasDiscarded = discardRecordingRef.current;
        const live = liveTranscriptionRef.current;
        liveTranscriptionRef.current = null;
        const liveResult = !wasDiscarded && live ? live.stop() : null;
        const recordedType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(recordedChunksRef.current, { type: recordedType });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
        setRecordingSeconds(0);

        if (wasDiscarded) {
          setVoiceState("idle");
          return;
        }
        if (!blob.size) {
          setVoiceState("idle");
          setVoiceError("No audio was captured. Please try again or type your message.");
          return;
        }
        if (liveResult) {
          setVoiceState("transcribing");
          void liveResult.then((transcript) => {
            if (generation !== requestGenerationRef.current) return;
            if (!transcript.trim()) throw new Error("Empty live transcript");
            setInput(transcript);
            setVoiceState("review");
          }).catch(() => {
            if (generation === requestGenerationRef.current) void transcribeRecording(blob);
          });
        } else void transcribeRecording(blob);
      };
      recorder.start(250);
      setRecordingSeconds(0);
      setVoiceState("recording");
      void startLiveTranscription(stream, (text) => {
        if (generation === requestGenerationRef.current && recorder.state === "recording") setInput(text);
      }, () => {
        if (generation === requestGenerationRef.current && recorder.state === "recording") setLiveStatus("fallback");
      }).then((live) => {
        if (generation !== requestGenerationRef.current || recorder.state !== "recording") { live.cancel(); return; }
        liveTranscriptionRef.current = live;
        setLiveStatus("live");
      }).catch(() => {
        if (generation === requestGenerationRef.current && recorder.state === "recording") setLiveStatus("fallback");
      });
    } catch (requestError) {
      setVoiceState("idle");
      setVoiceError(
        requestError instanceof DOMException && requestError.name === "NotAllowedError"
          ? "Microphone access was not allowed. You can still type your message."
          : "We could not start the microphone. Please check your browser permissions or type your message.",
      );
    }
  };

  const cancelVoice = () => {
    if (voiceState === "recording") stopRecording(true);
    setInput(preVoiceInputRef.current);
    setVoiceState("idle");
    setVoiceError("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  const startNewChat = () => {
    requestGenerationRef.current += 1;
    try { clearBrowserSession(window.localStorage); } catch { /* Storage may be disabled. */ }
    stopSpeech();
    retryRequestIdRef.current = "";
    if (voiceState === "recording") stopRecording(true);
    setSessionId(createSessionId());
    setMessages(initialMessages);
    setLanguageConfirmed(false);
    setInput("");
    setError(null);
    setVoiceError("");
    setVoiceState("idle");
    setMenuOpen(false);
    setIsLoading(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const languageLabel = languageConfirmed ? (languageOptions.find((option) => option.value === language)?.label || language) : "Language";
  const isBusy = !sessionReady || isLoading || voiceState === "transcribing";
  const readingLanguage = getSpeechLanguage(language);

  return (
    <main className={`chat-app ${!languageConfirmed ? "mobile-onboarding" : ""} min-h-[100dvh] overflow-x-hidden pb-[env(safe-area-inset-bottom)] text-[var(--ink)]`}>
      <div className="mx-auto max-w-[1320px] lg:px-8 lg:pt-6">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-3 border-b border-[var(--line)] bg-[var(--paper)] px-4 py-3 sm:px-6 sm:py-4 lg:static lg:border-0 lg:bg-transparent lg:px-1 lg:py-0 lg:pb-6">
          <div className="min-w-0"><p className="truncate text-[15px] sm:text-[17px] font-bold tracking-[-0.02em]">MDW Compass</p><p className="hidden text-xs font-medium text-[var(--muted)] sm:block">Your support companion in Singapore</p></div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Choose language" title="Choose language" aria-expanded={menuOpen} aria-controls="support-menu" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 sm:px-3 text-sm font-bold text-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] lg:hidden"><Languages aria-hidden="true" className="h-4 w-4" /><span className="hidden max-w-[90px] truncate min-[420px]:inline">{languageLabel}</span></button>
            <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "Close support menu" : "Open support menu"} aria-expanded={menuOpen} aria-controls="support-menu" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--accent)] text-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] lg:hidden">{menuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}</button>
            <button type="button" onClick={startNewChat} className="hidden min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--line)] hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] lg:inline-flex"><Plus aria-hidden="true" className="h-4 w-4" />New chat</button>
          </div>
        </header>

        <div className="chat-workspace grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] lg:gap-10 lg:px-1">
          <aside id="support-menu" className={`${menuOpen ? "block" : "hidden"} space-y-0 px-5 sm:px-6 lg:block lg:px-0`}>
            <section className="support-intro pb-7 pt-5 lg:pt-2">
              <h1 className="max-w-[290px] text-[32px] leading-[1.14] tracking-[-0.025em] text-[var(--primary)]">Know your rights. Find the support you need.</h1>
              <p className="mt-4 max-w-[295px] text-sm leading-6 text-[var(--muted)]">Ask a question in your own words. MDW Compass gives clear information and helps you find the right human support when you need it.</p>
            </section>

            <section className="border-t border-[var(--line)] py-6"><p className="mb-3 text-sm font-bold">Choose your language</p><LanguageSelect value={languageConfirmed ? language : ""} onChange={handleLanguageChange} disabled={isBusy || voiceState === "recording"} label="Menu language" /></section>

            <section aria-labelledby="quick-start-title" className="border-t border-[var(--line)] py-6"><div className="mb-3.5 flex items-end justify-between gap-3"><div><p id="quick-start-title" className="text-sm font-bold">What can I help with?</p><p className="mt-0.5 text-xs text-[var(--muted)]">Start with a topic or ask anything</p></div></div><div className="grid gap-2">{topicCards.map((topic) => { const Icon = topic.icon; return <button key={topic.title} type="button" onClick={() => void sendMessage(topic.prompt)} aria-pressed={!languageConfirmed && input === topic.prompt} disabled={isBusy || !sessionReady} className="group flex min-h-16 items-center gap-3 aria-pressed:bg-[var(--accent)] border-b border-[var(--line)] py-3 text-left transition hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-60"><span className={`flex h-8 w-7 shrink-0 items-center justify-center text-[var(--primary)]`}><Icon aria-hidden="true" className="h-[19px] w-[19px]" strokeWidth={2} /></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-bold text-[var(--ink)]">{topic.title}</span><span className="mt-0.5 block text-xs text-[var(--muted)]">{topic.description}</span></span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:text-[var(--primary)]" /></button>; })}</div><button type="button" onClick={() => void sendMessage("I would like help finding human support.")} disabled={isBusy || !sessionReady} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--surface-muted)] text-sm font-bold text-[var(--primary)] hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"><PhoneCall aria-hidden="true" className="h-4 w-4" />Talk to a real person</button></section>

            <section className="border-t border-[var(--line)] py-6"><div className="flex gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-[var(--warning)]"><TriangleAlert aria-hidden="true" className="h-4 w-4" /></div><div className="min-w-0"><p className="text-sm font-bold text-[var(--warning)]">If you are in immediate danger</p><div className="mt-2 flex flex-wrap gap-2 text-xs font-bold"><a href="tel:999" className="inline-flex min-h-11 items-center rounded-md bg-[var(--warning-surface)] px-2.5 py-2 text-[var(--warning)] underline underline-offset-2">Police 999</a><a href="tel:995" className="inline-flex min-h-11 items-center rounded-md bg-[var(--warning-surface)] px-2.5 py-2 text-[var(--warning)] underline underline-offset-2">Ambulance / Fire 995</a><a href="sms:70999" className="inline-flex min-h-11 items-center rounded-md bg-[var(--warning-surface)] px-2.5 py-2 text-[var(--warning)] underline underline-offset-2">Emergency SMS 70999</a></div><p className="mt-2 text-xs leading-5 text-[var(--warning)]">Use SMS when speaking is unsafe or impossible.</p></div></div></section>

            <details className="group border-t border-[var(--line)] py-4 text-xs leading-5 text-[var(--muted)]"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-bold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] [&::-webkit-details-marker]:hidden">Privacy reminder<ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" /></summary><p className="mt-1">Microphone access starts only when you tap record. Your conversation, language, and draft are saved on this browser for 24 hours after your last activity. Audio recordings are not saved. Use Clear chat on a shared device. Clearing this screen starts a fresh CX session; it does not necessarily delete records held by connected services.</p><button type="button" onClick={startNewChat} className="mt-3 inline-flex min-h-11 items-center gap-2 font-bold text-[var(--primary)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"><Trash2 aria-hidden="true" className="h-4 w-4" />Clear chat</button></details>
          </aside>

          <ChatPreview
            channel={{ name: "mdw-compass", description: languageConfirmed ? language : "Choose your language" }}
            status={storageUnavailable ? "Not saved on this browser" : "Saved on this browser · 24 hours"}
            className="chat-panel h-[calc(100dvh-5.5rem)] min-h-0 rounded-none sm:h-[calc(100dvh-6.5rem)] sm:rounded-lg lg:sticky lg:top-6 lg:h-[calc(100dvh-9rem)] lg:min-h-[640px]"
          >

            <div className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-7" ref={messagesViewportRef} aria-live="polite"><div className="mx-auto max-w-3xl space-y-5"><div className="chat-history"><div className="mb-6 flex items-center gap-3 text-xs text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--line)]" /><span>Today</span><span className="h-px flex-1 bg-[var(--line)]" /></div>

              {messages.map((message, index) => {
                const isSpeaking = playback.messageId === message.id;
                const speechPaused = playback.status === "paused";
                const speechLoading = isSpeaking && playback.status === "loading";
                return <ChatMessageRow key={message.id} message={message} animate={sessionReady && index === messages.length - 1}>
                  {message.role === "assistant" && message.id !== "language-welcome" && <div className="mt-1 flex items-center gap-1">
                    <button type="button" onClick={() => void speakMessage(message)} disabled={speechLoading || voiceState === "recording"} aria-label={speechLoading ? "Loading audio" : isSpeaking ? (speechPaused ? "Resume response" : "Pause response") : "Listen to response"} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-[var(--primary)] hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-60">
                      {speechLoading ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : isSpeaking ? (speechPaused ? <Play aria-hidden="true" className="h-4 w-4" /> : <Pause aria-hidden="true" className="h-4 w-4" />) : <Volume2 aria-hidden="true" className="h-4 w-4" />}<span>{speechLoading ? "Loading audio…" : isSpeaking ? (speechPaused ? "Resume" : "Pause") : "Listen"}</span>
                    </button>
                    {isSpeaking && <button type="button" onClick={stopSpeech} aria-label="Stop response" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--primary)] hover:bg-[var(--accent)]"><VolumeX aria-hidden="true" className="h-4 w-4" /></button>}
                  </div>}
                </ChatMessageRow>;
              })}
              </div>
              {!languageConfirmed && <div className="onboarding-options ml-11 space-y-3 sm:ml-[52px]">
                <div className="space-y-2 lg:hidden"><h2 className="text-2xl font-semibold tracking-tight text-[var(--primary)]">Choose your language</h2><p className="text-sm leading-6 text-[var(--muted)]">Select the language you’re most comfortable with. You can change it anytime.</p></div>
                {input.trim() && <p role="status" className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm leading-6 text-[var(--primary)]">Selected question: {input} Choose your language below, then send your question when you’re ready.</p>}
                <div className="grid grid-cols-2 gap-2">
                  {onboardingLanguages.map((option) => <button key={option.value} type="button" disabled={isBusy} onClick={() => handleLanguageChange(option.value)} className="min-h-11 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-left text-sm font-medium text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--accent)] disabled:opacity-60">{option.label}</button>)}
                </div>
                <button type="button" disabled={isBusy} onClick={() => setOtherLanguageOpen((open) => !open)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--primary)] underline underline-offset-4"><Languages aria-hidden="true" className="h-4 w-4" />Other language</button>
                {otherLanguageOpen && <form onSubmit={handleOtherLanguageSubmit} className="space-y-2">
                  <label htmlFor="onboarding-language" className="block text-sm text-[var(--muted)]">Type your language name</label>
                  <div className="flex gap-2"><input id="onboarding-language" value={otherLanguage} onChange={(event) => setOtherLanguage(event.target.value)} maxLength={64} disabled={isBusy} className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm" /><button type="submit" disabled={isBusy || otherLanguage.trim().length < 2} className="min-h-11 rounded-lg bg-[var(--primary)] px-3 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50">Use</button></div>
                </form>}
                <p className="text-xs leading-5 text-[var(--muted)]">Choose a language to start. You can change it later.</p>
              </div>}

              {isLoading && <div className="flex items-start gap-2.5 sm:gap-3"><RobotAvatar thinking /><div className="rounded-xl rounded-tl-md border border-[var(--line)] bg-[var(--surface-muted)] px-5 py-4"><div className="flex items-center gap-1.5" aria-label="MDW Compass is typing"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--primary)]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--primary)] [animation-delay:150ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--primary)] [animation-delay:300ms]" /></div></div></div>}
              {error && <div role="alert" className="flex items-start gap-3 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3.5 text-sm text-[var(--danger)]"><TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><p className="leading-5">{error.message}</p>{error.failedText && <button type="button" onClick={() => void sendMessage(error.failedText, true)} disabled={isBusy || !sessionReady} className="mt-2 inline-flex min-h-9 items-center gap-1.5 font-bold text-[var(--danger)] underline decoration-[var(--danger-line)] underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--danger)]"><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />Try again</button>}</div></div>}
              {voiceError && <div role="alert" className="flex items-start gap-3 rounded-lg border border-[var(--warning-line)] bg-[var(--warning-surface)] p-3.5 text-sm text-[var(--warning)]"><TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><p className="leading-5">{voiceError}</p></div>}
              </div></div>

              <div className="chat-composer safe-bottom border-t border-[var(--line)] bg-[var(--surface)] px-4 pb-4 pt-3 sm:px-7 sm:pt-4"><div className="mx-auto max-w-3xl">
                {languageConfirmed && <details className="mb-2 text-sm text-[var(--muted)]">
                  <summary className="min-h-11 cursor-pointer py-3 font-medium text-[var(--primary)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]">Read-aloud settings</summary>
                  <div className="flex flex-wrap gap-3 pb-3">
                    <label className="min-w-0 flex-1"><span className="mb-1 block text-xs">Reading voice</span><select aria-label="Reading voice" value={readingVoice} disabled={!readingLanguage} onChange={event => { stopSpeech(); setReadingVoice(Number(event.target.value)); }} className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]">{readingLanguage ? readingLanguage.voices.map((voice,index) => <option key={voice.id} value={index}>{voice.label}</option>) : <option value={0}>Voice unavailable</option>}</select></label>
                    <label className="min-w-0 flex-1"><span className="mb-1 block text-xs">Reading speed</span><select aria-label="Reading speed" value={readingRate} onChange={event => { stopSpeech(); setReadingRate(Number(event.target.value)); }} className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]"><option value={0.8}>Slower · 0.8×</option><option value={0.9}>Gentle pace · 0.9×</option><option value={1}>Normal · 1×</option><option value={1.1}>Faster · 1.1×</option></select></label>
                  </div>
                </details>}
                {voiceState === "recording" && <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] px-3.5 py-3 text-sm text-[var(--danger)]" role="status"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--danger-solid)]" /><span className="font-bold">Recording {formatElapsed(recordingSeconds)}</span><span className="text-xs">{liveStatus === "live" ? "Live words appear below. Stop to review." : liveStatus === "connecting" ? "Connecting live transcription…" : "Live unavailable. Transcription starts when you stop."}</span></div><div className="flex gap-2"><button type="button" onClick={() => stopRecording(false)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[var(--danger-solid)] px-3 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--danger)]"><Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" />Stop</button><button type="button" onClick={cancelVoice} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--danger-line)] px-3 text-xs font-bold text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--danger)]"><X aria-hidden="true" className="h-3.5 w-3.5" />Cancel</button></div></div>}
                {voiceState === "transcribing" && <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3.5 py-3 text-sm text-[var(--primary)]" role="status"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />Finishing your transcript. You can review it before sending.</div>}
                {voiceState === "review" && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3.5 py-3 text-sm text-[var(--primary)]" role="status"><span className="font-bold">Review your transcript before sending.</span><div className="flex gap-2"><button type="button" onClick={() => void startRecording()} disabled={isBusy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-xs font-bold"><Mic aria-hidden="true" className="h-3.5 w-3.5" />Re-record</button><button type="button" onClick={cancelVoice} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold"><X aria-hidden="true" className="h-3.5 w-3.5" />Cancel</button></div></div>}
                {storageUnavailable && <p role="status" className="mb-3 text-sm text-[var(--warning)]">Browser storage is unavailable or full. You can still chat, but refreshing may lose this conversation.</p>}<AiMascotInput
                  showMascot={false}
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSubmit}
                  onKeyDown={handleInputKeyDown}
                  onRecord={() => void startRecording()}
                  textareaRef={inputRef}
                  disabled={!sessionReady || !languageConfirmed || voiceState === "recording"}
                  isProcessing={isBusy}
                  isListening={voiceState === "recording"}
                  language={languageConfirmed ? language : ""}
                  onLanguageChange={handleLanguageChange}
                  languageDisabled={isBusy || voiceState === "recording"}
                  label={voiceState === "review" ? "Edit the voice transcript" : "Write your message"}
                  placeholder={!languageConfirmed ? "Choose your language above to begin" : voiceState === "review" ? "Edit the transcript before sending…" : "Type your question or record a message…"}
                />
                <div className="mt-2 flex items-center justify-between gap-3 px-1 text-xs text-[var(--muted)]"><span>Enter sends · Shift + Enter adds a line</span><span className="hidden sm:inline">{input.length}/4000</span></div>
                <div className="mt-3 flex flex-col gap-1 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--primary)]" /><span>Need a person? We can help you find human support.</span></div><button type="button" onClick={() => void sendMessage("I would like help finding human support.")} disabled={isBusy || !sessionReady} className="inline-flex min-h-10 items-center gap-1.5 self-start font-bold text-[var(--primary)] underline decoration-[var(--line)] underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] sm:self-auto">Find support<PhoneCall aria-hidden="true" className="h-3.5 w-3.5" /></button></div>
                <p className="mt-3 text-center text-xs leading-4 text-[var(--muted)]">MDW Compass is an AI information assistant, not a replacement for a lawyer, agency, or human support worker. If you are in immediate danger, call 999 or 995.</p>
              </div></div>
            </div>
          </ChatPreview>
        </div>

        <footer className="hidden px-1 py-5 text-[11px] text-[var(--muted)] lg:flex lg:items-center lg:justify-between"><p>Built to make trusted information easier to reach.</p><p className="inline-flex items-center gap-1.5"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />Do not share passwords or banking details.</p></footer>
      </div>
    </main>
  );
}
