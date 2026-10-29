"use client";

import {
  ArrowUpRight,
  BadgeDollarSign,
  Check,
  ChevronDown,
  Compass,
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
import { ChatPreview, ChatMessageRow } from "@/components/ui/chat-preview";
import { LANGUAGE_PROMPT, onboardingLanguages, needsLanguageSelection } from "@/lib/language-onboarding";

import type { PreferredLanguage } from "@/lib/cx-agent";
import { loadBrowserSession, saveBrowserSession, clearBrowserSession } from "@/lib/browser-session";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
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

const ttsLocales: Record<string, string> = {
  English: "en-SG",
  Tagalog: "fil-PH",
  "Bahasa Indonesia": "id-ID",
};

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

function waitForSpeechVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve<SpeechSynthesisVoice[]>([]);
  }

  const existingVoices = window.speechSynthesis.getVoices();
  if (existingVoices.length) return Promise.resolve(existingVoices);

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };

    window.speechSynthesis.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, 1_200);
  });
}

async function requestChat({
  message,
  sessionId,
  language,
  selectLanguage = false,
}: {
  message: string;
  sessionId: string;
  language: PreferredLanguage;
  selectLanguage?: boolean;
}) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId, language, selectLanguage }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    message?: unknown;
    error?: unknown;
  };

  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "We could not reach MDW Compass right now.",
    );
  }

  return typeof data.message === "string" ? data.message : "";
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
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [speechPaused, setSpeechPaused] = useState(false);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const preVoiceInputRef = useRef("");
  const speechRequestRef = useRef(0);
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
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopSpeech = () => {
    speechRequestRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
    setSpeechPaused(false);
  };

  const speakMessage = async (message: ChatMessage) => {
    if (!("speechSynthesis" in window)) {
      setVoiceError("Read-aloud is not available in this browser. The text response is still available.");
      return;
    }

    if (speakingMessageId === message.id) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setSpeechPaused(false);
      } else if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        setSpeechPaused(true);
      }
      return;
    }

    stopSpeech();
    const speechRequestId = speechRequestRef.current;
    const locale = ttsLocales[language] || "en-SG";
    const voices = await waitForSpeechVoices();
    if (speechRequestId !== speechRequestRef.current) return;
    const baseLocale = locale.split("-")[0].toLowerCase();
    const voice = voices.find((item) => item.lang.toLowerCase() === locale.toLowerCase()) ||
      voices.find((item) => item.lang.toLowerCase().startsWith(baseLocale));

    if (!voice) {
      setVoiceError(`A ${language} read-aloud voice is not available on this device. The text response is still available.`);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.onend = () => {
      setSpeakingMessageId(null);
      setSpeechPaused(false);
    };
    utterance.onerror = () => {
      setSpeakingMessageId(null);
      setSpeechPaused(false);
      setVoiceError("Read-aloud could not start on this device. The text response is still available.");
    };

    setVoiceError("");
    setSpeakingMessageId(message.id);
    setSpeechPaused(false);
    window.speechSynthesis.speak(utterance);
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

    const activeSessionId = sessionId || createSessionId();
    if (!sessionId) setSessionId(activeSessionId);

    setError(null);
    setVoiceError("");
    setMenuOpen(false);

    if (!isRetry) {
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: "user", content: trimmedText },
      ]);
    }

    setIsLoading(true);

    try {
      const responseText = await requestChat({
        message: trimmedText,
        sessionId: activeSessionId,
        language,
      });

      if (generation !== requestGenerationRef.current) return;

      setInput("");
      setVoiceState("idle");
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-assistant`, role: "assistant", content: responseText },
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
      const responseText = await requestChat({ message: nextLanguage, sessionId: activeSessionId, language: nextLanguage, selectLanguage: true });
      if (generation !== requestGenerationRef.current) return;
      setLanguageConfirmed(true);
      if (responseText) {
        setMessages((current) => [
          ...current,
          { id: `${Date.now()}-language-choice`, role: "user", content: nextLanguage },
          { id: `${Date.now()}-language-sync`, role: "assistant", content: responseText },
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
    setLanguage(nextLanguage);
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
      const audioUrl = await blobToDataUrl(blob);
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
        void transcribeRecording(blob);
      };
      recorder.start(250);
      setRecordingSeconds(0);
      setVoiceState("recording");
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

  return (
    <main className="min-h-[100dvh] overflow-x-hidden pb-[env(safe-area-inset-bottom)] text-[var(--ink)]">
      <div className="mx-auto max-w-[1320px] lg:px-8 lg:pt-6">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-3 border-b border-[#e4edeb]/80 bg-[var(--paper)] px-4 py-3 sm:px-6 sm:py-4 lg:static lg:border-0 lg:bg-transparent lg:px-1 lg:py-0 lg:pb-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3"><div className="flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--teal-deep)] text-white"><Compass aria-hidden="true" className="h-6 w-6" strokeWidth={2.2} /></div><div className="min-w-0"><p className="truncate text-[15px] sm:text-[17px] font-bold tracking-[-0.02em]">MDW Compass</p><p className="hidden text-xs font-medium text-[var(--muted)] sm:block">Your support companion in Singapore</p></div></div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="support-menu" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white px-2 sm:px-3 text-sm font-bold text-[var(--teal-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)] lg:hidden"><Languages aria-hidden="true" className="h-4 w-4" /><span className="max-w-[90px] truncate">{languageLabel}</span></button>
            <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "Close support menu" : "Open support menu"} aria-expanded={menuOpen} aria-controls="support-menu" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--mint)] text-[var(--teal-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)] lg:hidden">{menuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}</button>
            <button type="button" onClick={startNewChat} className="hidden min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--teal-deep)] transition hover:border-[#afd5ca] hover:bg-[#f7fcfa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)] lg:inline-flex"><Plus aria-hidden="true" className="h-4 w-4" />New chat</button>
          </div>
        </header>

        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] lg:gap-10 lg:px-1">
          <aside id="support-menu" className={`${menuOpen ? "block" : "hidden"} space-y-0 px-5 sm:px-6 lg:block lg:px-0`}>
            <section className="support-intro pb-7 pt-5 lg:pt-2">
              <h1 className="max-w-[290px] text-[32px] leading-[1.14] tracking-[-0.025em] text-[var(--teal-deep)]">Know your rights. Find the support you need.</h1>
              <p className="mt-4 max-w-[295px] text-sm leading-6 text-[var(--muted)]">Ask a question in your own words. MDW Compass gives clear information and helps you find the right human support when you need it.</p>
            </section>

            <section className="border-t border-[var(--line)] py-6"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-bold">Choose your language</p></div></div><div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--line)] p-1">{languageOptions.map((option) => { const selected = languageConfirmed && language === option.value; return <button key={option.value} type="button" aria-pressed={selected} disabled={isBusy} onClick={() => handleLanguageChange(option.value)} className={`min-h-11 rounded-xl px-1 py-2.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--teal)] ${selected ? "bg-[var(--mint)] text-[var(--teal-deep)]" : "text-[var(--muted)] hover:text-[var(--teal-deep)]"}`}><span>{option.label}</span>{selected && <Check aria-hidden="true" className="ml-1 inline h-3 w-3" />}</button>; })}</div><button type="button" onClick={() => setOtherLanguageOpen((open) => !open)} className="mt-3 inline-flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 text-left text-sm font-semibold text-[var(--teal-deep)] hover:bg-[#f7fcfa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)]"><span>Other languages</span>{otherLanguageOpen ? <X aria-hidden="true" className="h-4 w-4" /> : <ArrowUpRight aria-hidden="true" className="h-4 w-4" />}</button>{otherLanguageOpen && languageConfirmed && <form onSubmit={handleOtherLanguageSubmit} className="mt-3 space-y-2"><label htmlFor="other-language" className="text-xs text-[var(--muted)]">Type the language you would like to use</label><div className="flex gap-2"><input id="other-language" value={otherLanguage} onChange={(event) => setOtherLanguage(event.target.value)} placeholder="For example: Malay" maxLength={64} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--line)] px-3 text-sm outline-none focus:border-[#8cc8bc] focus:ring-4 focus:ring-[#e2f3ef]" /><button type="submit" disabled={isBusy || !otherLanguage.trim()} className="min-h-11 rounded-xl bg-[var(--teal)] px-3 text-sm font-bold text-white disabled:bg-[#d5e2df]">Use</button></div></form>}</section>

            <section aria-labelledby="quick-start-title" className="border-t border-[var(--line)] py-6"><div className="mb-3.5 flex items-end justify-between gap-3"><div><p id="quick-start-title" className="text-sm font-bold">What can I help with?</p><p className="mt-0.5 text-xs text-[var(--muted)]">Start with a topic or ask anything</p></div></div><div className="grid gap-2">{topicCards.map((topic) => { const Icon = topic.icon; return <button key={topic.title} type="button" onClick={() => void sendMessage(topic.prompt)} aria-pressed={!languageConfirmed && input === topic.prompt} disabled={isBusy || !sessionReady} className="group flex min-h-16 items-center gap-3 aria-pressed:bg-[var(--mint)] border-b border-[var(--line)] py-3 text-left transition hover:bg-[var(--mint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)] disabled:opacity-60"><span className={`flex h-8 w-7 shrink-0 items-center justify-center text-[var(--teal)]`}><Icon aria-hidden="true" className="h-[19px] w-[19px]" strokeWidth={2} /></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-bold text-[var(--ink)]">{topic.title}</span><span className="mt-0.5 block text-xs text-[var(--muted)]">{topic.description}</span></span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#bdcbca] transition group-hover:text-[var(--teal)]" /></button>; })}</div><button type="button" onClick={() => void sendMessage("I would like help finding human support.")} disabled={isBusy || !sessionReady} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#eaf4f0] text-sm font-bold text-[var(--teal-deep)] hover:bg-[#dff0ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)]"><PhoneCall aria-hidden="true" className="h-4 w-4" />Talk to a real person</button></section>

            <section className="border-t border-[var(--line)] py-6"><div className="flex gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-[#80521b]"><TriangleAlert aria-hidden="true" className="h-4 w-4" /></div><div className="min-w-0"><p className="text-sm font-bold text-[#80521b]">If you are in immediate danger</p><div className="mt-2 flex flex-wrap gap-2 text-xs font-bold"><a href="tel:999" className="inline-flex min-h-11 items-center rounded-md bg-[#fff0d5] px-2.5 py-2 text-[#80521b] underline underline-offset-2">Police 999</a><a href="tel:995" className="inline-flex min-h-11 items-center rounded-md bg-[#fff0d5] px-2.5 py-2 text-[#80521b] underline underline-offset-2">Ambulance / Fire 995</a><a href="sms:70999" className="inline-flex min-h-11 items-center rounded-md bg-[#fff0d5] px-2.5 py-2 text-[#80521b] underline underline-offset-2">Emergency SMS 70999</a></div><p className="mt-2 text-xs leading-5 text-[#916b3e]">Use SMS when speaking is unsafe or impossible.</p></div></div></section>

            <details className="group border-t border-[var(--line)] py-4 text-xs leading-5 text-[var(--muted)]"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-bold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--teal)] [&::-webkit-details-marker]:hidden">Privacy reminder<ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" /></summary><p className="mt-1">Microphone access starts only when you tap record. Your conversation, language, and draft are saved on this browser for 24 hours after your last activity. Audio recordings are not saved. Use Clear chat on a shared device. Clearing this screen starts a fresh CX session; it does not necessarily delete records held by connected services.</p><button type="button" onClick={startNewChat} className="mt-3 inline-flex min-h-11 items-center gap-2 font-bold text-[var(--teal-deep)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)]"><Trash2 aria-hidden="true" className="h-4 w-4" />Clear chat</button></details>
          </aside>

          <ChatPreview
            channel={{ name: "mdw-compass", description: languageConfirmed ? language : "Choose your language" }}
            status={storageUnavailable ? "Not saved on this browser" : "Saved on this browser · 24 hours"}
            className="h-[calc(100dvh-5.5rem)] min-h-0 rounded-none sm:h-[calc(100dvh-6.5rem)] sm:rounded-2xl lg:sticky lg:top-6 lg:h-[calc(100dvh-9rem)] lg:min-h-[640px]"
          >

            <div className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-7" ref={messagesViewportRef} aria-live="polite"><div className="mx-auto max-w-3xl space-y-5"><div className="mb-6 flex items-center gap-3 text-xs text-[var(--muted)]"><span className="h-px flex-1 bg-[#edf2f0]" /><span>Today</span><span className="h-px flex-1 bg-[#edf2f0]" /></div>

              {messages.map((message, index) => {
                const isSpeaking = speakingMessageId === message.id;
                return <ChatMessageRow key={message.id} message={message} animate={sessionReady && index === messages.length - 1}>
                  {message.role === "assistant" && message.id !== "language-welcome" && <div className="mt-1 flex items-center gap-1">
                    <button type="button" onClick={() => void speakMessage(message)} aria-label={isSpeaking ? (speechPaused ? "Resume response" : "Pause response") : "Listen to response"} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-[var(--teal-deep)] hover:bg-[var(--mint)]">
                      {isSpeaking ? (speechPaused ? <Play aria-hidden="true" className="h-4 w-4" /> : <Pause aria-hidden="true" className="h-4 w-4" />) : <Volume2 aria-hidden="true" className="h-4 w-4" />}<span>{isSpeaking ? (speechPaused ? "Resume" : "Pause") : "Listen"}</span>
                    </button>
                    {isSpeaking && <button type="button" onClick={stopSpeech} aria-label="Stop response" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--teal-deep)] hover:bg-[var(--mint)]"><VolumeX aria-hidden="true" className="h-4 w-4" /></button>}
                  </div>}
                </ChatMessageRow>;
              })}
              {!languageConfirmed && <div className="ml-11 space-y-3 sm:ml-[52px]">
                {input.trim() && <p role="status" className="rounded-lg bg-[var(--mint)] px-3 py-2 text-sm leading-6 text-[var(--teal-deep)]">Selected question: {input} Choose your language below, then send your question when you’re ready.</p>}
                <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                  {onboardingLanguages.map((option) => <button key={option.value} type="button" disabled={isBusy} onClick={() => handleLanguageChange(option.value)} className="min-h-11 rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-left text-sm font-medium text-[var(--teal-deep)] transition hover:border-[var(--teal)] hover:bg-[var(--mint)] disabled:opacity-60">{option.label}</button>)}
                </div>
                <button type="button" disabled={isBusy} onClick={() => setOtherLanguageOpen((open) => !open)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--teal-deep)] underline underline-offset-4"><Languages aria-hidden="true" className="h-4 w-4" />Other language</button>
                {otherLanguageOpen && <form onSubmit={handleOtherLanguageSubmit} className="space-y-2">
                  <label htmlFor="onboarding-language" className="block text-sm text-[var(--muted)]">Type your language name</label>
                  <div className="flex gap-2"><input id="onboarding-language" value={otherLanguage} onChange={(event) => setOtherLanguage(event.target.value)} maxLength={64} disabled={isBusy} className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white px-3 text-sm" /><button type="submit" disabled={isBusy || otherLanguage.trim().length < 2} className="min-h-11 rounded-lg bg-[var(--teal)] px-3 text-sm font-semibold text-white disabled:opacity-50">Use</button></div>
                </form>}
                <p className="text-xs leading-5 text-[var(--muted)]">Choose a language to start. You can change it later.</p>
              </div>}

              {isLoading && <div className="flex items-start gap-2.5 sm:gap-3"><RobotAvatar thinking /><div className="rounded-xl rounded-tl-md border border-[#e4edeb] bg-[#f8fbfa] px-5 py-4"><div className="flex items-center gap-1.5" aria-label="MDW Compass is typing"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#68aaa1]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#68aaa1] [animation-delay:150ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#68aaa1] [animation-delay:300ms]" /></div></div></div>}
              {error && <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#f0c9c4] bg-[#fff5f3] p-3.5 text-sm text-[#934d47]"><TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><p className="leading-5">{error.message}</p>{error.failedText && <button type="button" onClick={() => void sendMessage(error.failedText, true)} disabled={isBusy || !sessionReady} className="mt-2 inline-flex min-h-9 items-center gap-1.5 font-bold text-[#8b403d] underline decoration-[#dca09a] underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#934d47]"><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />Try again</button>}</div></div>}
              {voiceError && <div role="alert" className="flex items-start gap-3 rounded-lg border border-[#f0d7a8] bg-[#fffaf0] p-3.5 text-sm text-[#80521b]"><TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><p className="leading-5">{voiceError}</p></div>}
              </div></div>

              <div className="safe-bottom border-t border-[#edf2f0] bg-[#fcfefd] px-4 pb-4 pt-3 sm:px-7 sm:pt-4"><div className="mx-auto max-w-3xl">
                {voiceState === "recording" && <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e6b5b7] bg-[#fff5f5] px-3.5 py-3 text-sm text-[#934d47]" role="status"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#c9555c]" /><span className="font-bold">Recording {formatElapsed(recordingSeconds)}</span><span className="text-xs">Speak clearly, then review the words.</span></div><div className="flex gap-2"><button type="button" onClick={() => stopRecording(false)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#c9555c] px-3 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#934d47]"><Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" />Stop</button><button type="button" onClick={cancelVoice} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#edc7c7] px-3 text-xs font-bold text-[#934d47] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#934d47]"><X aria-hidden="true" className="h-3.5 w-3.5" />Cancel</button></div></div>}
                {voiceState === "transcribing" && <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#dbe8e4] bg-[#f5fbf8] px-3.5 py-3 text-sm text-[var(--teal-deep)]" role="status"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />Transcribing your recording. You can review it before sending.</div>}
                {voiceState === "review" && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#bfe0d5] bg-[#eef8f4] px-3.5 py-3 text-sm text-[var(--teal-deep)]" role="status"><span className="font-bold">Review your transcript before sending.</span><div className="flex gap-2"><button type="button" onClick={() => void startRecording()} disabled={isBusy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#a8d3c5] px-3 text-xs font-bold"><Mic aria-hidden="true" className="h-3.5 w-3.5" />Re-record</button><button type="button" onClick={cancelVoice} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold"><X aria-hidden="true" className="h-3.5 w-3.5" />Cancel</button></div></div>}
                {storageUnavailable && <p role="status" className="mb-3 text-sm text-[#80521b]">Browser storage is unavailable or full. You can still chat, but refreshing may lose this conversation.</p>}<AiMascotInput
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
                  language={languageConfirmed ? language : "Choose a language"}
                  label={voiceState === "review" ? "Edit the voice transcript" : "Write your message"}
                  placeholder={!languageConfirmed ? "Choose your language above to begin" : voiceState === "review" ? "Edit the transcript before sending…" : "Type your question or record a message…"}
                />
                <div className="mt-2 flex items-center justify-between gap-3 px-1 text-xs text-[#607378]"><span>Enter sends · Shift + Enter adds a line</span><span className="hidden sm:inline">{input.length}/4000</span></div>
                <div className="mt-3 flex flex-col gap-1 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--teal)]" /><span>Need a person? We can help you find human support.</span></div><button type="button" onClick={() => void sendMessage("I would like help finding human support.")} disabled={isBusy || !sessionReady} className="inline-flex min-h-10 items-center gap-1.5 self-start font-bold text-[var(--teal-deep)] underline decoration-[#96c5b9] underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)] sm:self-auto">Find support<PhoneCall aria-hidden="true" className="h-3.5 w-3.5" /></button></div>
                <p className="mt-3 text-center text-xs leading-4 text-[#607378]">MDW Compass is an AI information assistant, not a replacement for a lawyer, agency, or human support worker. If you are in immediate danger, call 999 or 995.</p>
              </div></div>
            </div>
          </ChatPreview>
        </div>

        <footer className="hidden px-1 py-5 text-[11px] text-[#607378] lg:flex lg:items-center lg:justify-between"><p>Built to make trusted information easier to reach.</p><p className="inline-flex items-center gap-1.5"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />Do not share passwords or banking details.</p></footer>
      </div>
    </main>
  );
}
