"use client";

import { useEffect, useState } from "react";
import type { FormEventHandler, KeyboardEventHandler, RefObject } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Compass, LoaderCircle, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export type RobotEmotion = "reading" | "thinking";

export function RobotBeta({ emotion, textLength = 0, isListening = false }: {
  emotion: RobotEmotion; textLength?: number; isListening?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [blinking, setBlinking] = useState(false);
  useEffect(() => {
    if (reducedMotion || emotion === "thinking") return;
    let blinkTimeout: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setBlinking(true);
      blinkTimeout = setTimeout(() => setBlinking(false), 140);
    }, 4200);
    return () => { clearInterval(interval); clearTimeout(blinkTimeout); };
  }, [reducedMotion, emotion]);
  const thinking = emotion === "thinking";
  const eyeOffset = reducedMotion ? 0 : Math.sin(textLength * 0.45) * 5;
  const ear = isListening ? "bg-red-500" : thinking ? "bg-amber-400" : "bg-emerald-400";
  return (
    <motion.div aria-hidden="true" className="relative flex select-none flex-col items-center px-2.5 pt-2"
      animate={reducedMotion ? { y: 0 } : { y: thinking ? [0, -4, 0] : [0, -2, 0] }}
      transition={{ duration: 2.2, repeat: reducedMotion ? 0 : Infinity, ease: "easeInOut" }}>
      <div className="relative -mb-2 flex w-20 justify-between px-2">
        <div className="h-4 w-3.5 rounded-tl-xl border-2 border-black/10 bg-zinc-300" />
        <div className="h-4 w-3.5 rounded-tr-xl border-2 border-black/10 bg-zinc-300" />
      </div>
      <div className="relative flex items-center justify-center">
        <div className={cn("absolute -left-1.5 h-5 w-1 rounded-l-sm transition-colors", ear)} />
        <div className={cn("absolute -right-1.5 h-5 w-1 rounded-r-sm transition-colors", ear)} />
        <div className="z-10 flex h-[60px] w-[88px] items-center justify-center rounded-xl border-2 border-black/10 bg-zinc-100 p-1.5 shadow-[0_3px_10px_rgba(0,0,0,0.08)]">
          <div className="relative flex h-full w-full items-center justify-center gap-3.5 overflow-hidden rounded-lg bg-[#050505] shadow-[inset_0_2px_5px_rgba(0,0,0,0.95)]">
            {[0, 1].map((eye) => <motion.div key={eye}
              className={cn("h-[18px] w-2.5 rounded-sm", thinking ? "bg-amber-300 shadow-[0_0_10px_#facc15]" : "bg-emerald-400 shadow-[0_0_12px_#34d399]")}
              animate={{ x: thinking ? 0 : eyeOffset, scaleY: blinking && !thinking ? 0.12 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }} />)}
            <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(transparent 50%, rgba(0,0,0,0.55) 50%)", backgroundSize: "100% 4px" }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function RobotAvatar({ thinking = false }: { thinking?: boolean }) {
  return <div aria-hidden="true" className="relative mt-0.5 h-9 w-9 shrink-0">
    <div className="absolute left-1/2 top-0 w-[108px] origin-top scale-[0.333] -translate-x-1/2">
      <RobotBeta emotion={thinking ? "thinking" : "reading"} />
    </div>
  </div>;
}

export interface AiMascotInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onRecord: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  isProcessing?: boolean;
  isListening?: boolean;
  language?: string;
  placeholder?: string;
  label?: string;
  showMascot?: boolean;
  className?: string;
}

/** The supplied mascot composer, controlled by the real CX/MERaLiON chat flow. */
export function AiMascotInput({ value, onChange, onSubmit, onKeyDown, onRecord, textareaRef,
  disabled = false, isProcessing = false, isListening = false, language = "English",
  placeholder = "Type your question or record a message…", label = "Write your message",
  showMascot = true, className,
}: AiMascotInputProps) {
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(54, Math.min(textarea.scrollHeight, 144))}px`;
  }, [value, textareaRef]);
  const busy = isProcessing || isListening;
  return (
    <div className={cn("relative w-full", showMascot && "pt-12", className)}>
      {showMascot && <div className="pointer-events-none absolute -top-5 right-3 z-10 sm:right-5">
        <RobotBeta emotion={isProcessing ? "thinking" : "reading"} textLength={value.length} isListening={isListening} />
      </div>}
      <form onSubmit={onSubmit} className={cn("relative z-20 rounded-3xl border border-zinc-200 bg-white p-3 shadow-[0_8px_24px_rgba(20,42,50,0.05)] transition-colors focus-within:border-[var(--teal)] sm:p-4", disabled && "bg-zinc-50")}>
        <label htmlFor="chat-input" className="sr-only">{label}</label>
        <textarea ref={textareaRef} id="chat-input" value={value} onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown} disabled={disabled || busy} rows={2} maxLength={4000}
          placeholder={isListening ? "Recording… stop to review your words" : isProcessing ? "Waiting for your response…" : placeholder}
          className="block max-h-36 min-h-[54px] w-full resize-none overflow-y-auto bg-transparent px-1 pb-2 text-base leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted)] disabled:opacity-70" />
        <div className="mt-1 flex min-w-0 items-center justify-between gap-2 border-t border-zinc-100 pt-2">
          <div className="flex min-w-0 items-center gap-1.5 rounded-xl bg-zinc-100 px-2.5 py-2 text-xs font-medium text-zinc-700">
            <Compass aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--teal)]" />
            <span className="truncate">{language}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onRecord} disabled={disabled || busy} aria-label="Record a voice message" title="Record voice"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--teal-deep)] transition hover:bg-[var(--mint)] disabled:text-zinc-400">
              <Mic aria-hidden="true" className="h-5 w-5" />
            </button>
            <button type="submit" disabled={disabled || busy || !value.trim()} aria-label={label === "Edit the voice transcript" ? "Send transcript" : "Send message"}
              className={cn("inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-zinc-950 text-white transition hover:bg-[var(--teal-deep)] disabled:bg-zinc-200 disabled:text-zinc-400", isProcessing && "disabled:bg-amber-100 disabled:text-amber-700")}>
              {isProcessing ? <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" /> : <ArrowUp aria-hidden="true" className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default AiMascotInput;
