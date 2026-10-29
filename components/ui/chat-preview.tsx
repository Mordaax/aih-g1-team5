"use client";

import type { ReactNode } from "react";
import { UserRound } from "lucide-react";
import { RobotAvatar } from "@/components/ui/ai-mascot-input";
import { cn } from "@/lib/utils";

/** The supplied chat-preview layout, driven by live messages rather than demo timers. */
export function ChatPreview({ children, channel, status, className }: {
  children: ReactNode;
  channel: { name: string; description: string };
  status?: string;
  className?: string;
}) {
  return (
    <section aria-label="MDW Compass chat" className={cn(
      "relative flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-white/95 shadow-[0_12px_40px_rgba(20,42,50,0.07)] backdrop-blur-xl",
      className,
    )}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <h2 className="shrink-0 font-semibold text-[var(--ink)]">#{channel.name}</h2>
          <span aria-hidden="true" className="text-[var(--muted)]">|</span>
          <p className="truncate text-[var(--muted)]">{channel.description}</p>
        </div>
        <span className="hidden shrink-0 text-xs text-[var(--muted)] xl:block">{status}</span>
      </header>
      {children}
    </section>
  );
}

export function ChatMessageRow({ message, children, animate = false }: {
  message: { id: string; role: "assistant" | "user"; content: string };
  children?: ReactNode;
  animate?: boolean;
}) {
  const assistant = message.role === "assistant";
  const timestamp = /^\d{13}-/.test(message.id) ? Number(message.id.slice(0, 13)) : undefined;
  return (
    <article data-message-role={message.role} className={cn("flex items-start gap-3 py-2 sm:gap-4", !assistant && "flex-row-reverse", animate && "animate-message-appear")}>
      {assistant ? <RobotAvatar /> : <div aria-hidden="true" className={cn(
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9",
        assistant ? "bg-[var(--mint)] text-[var(--teal-deep)]" : "bg-violet-100 text-violet-800",
      )}>
        <UserRound className="h-4 w-4" />
      </div>}
      <div className={cn("min-w-0 max-w-[calc(100%_-_44px)] sm:max-w-[85%]", !assistant && "flex flex-col items-end")}>
        <div className={cn("mb-1 flex flex-wrap items-center gap-x-3 gap-y-1", !assistant && "justify-end")}>
          <span className={cn("text-sm font-semibold", assistant ? "text-[var(--teal-deep)]" : "text-violet-800")}>{assistant ? "MDW Compass" : "You"}</span>
          {timestamp && <time dateTime={new Date(timestamp).toISOString()} className="text-xs text-[var(--muted)]">{new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>}
        </div>
        <p className={cn("whitespace-pre-wrap break-words text-left text-base leading-7", assistant ? "text-[var(--ink)]" : "rounded-2xl rounded-tr-sm bg-[var(--teal)] px-4 py-3 text-white")}>{message.content}</p>
        {children}
      </div>
    </article>
  );
}
