"use client";

import type { ReactNode } from "react";
import { ExternalLink, UserRound } from "lucide-react";
import { RobotAvatar } from "@/components/ui/ai-mascot-input";
import { cn } from "@/lib/utils";
import { extractAnswerSources, normalizeSources, type SourceLink } from "@/lib/answer-sources";

/** The supplied chat-preview layout, driven by live messages rather than demo timers. */
export function ChatPreview({ children, channel, status, className }: {
  children: ReactNode;
  channel: { name: string; description: string };
  status?: string;
  className?: string;
}) {
  return (
    <section aria-label="MDW Compass chat" className={cn(
      "relative flex w-full flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]",
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
  message: { id: string; role: "assistant" | "user"; content: string; sources?: SourceLink[] };
  children?: ReactNode;
  animate?: boolean;
}) {
  const assistant = message.role === "assistant";
  // Also supports conversations saved before sources were a separate field.
  const answer = assistant ? extractAnswerSources(message.content) : {text: message.content, sources: []};
  const sources = assistant ? normalizeSources([...(Array.isArray(message.sources) ? message.sources : []), ...answer.sources]) : [];
  const timestamp = /^\d{13}-/.test(message.id) ? Number(message.id.slice(0, 13)) : undefined;
  return (
    <article data-message-role={message.role} className={cn("flex items-start gap-3 py-2 sm:gap-4", !assistant && "flex-row-reverse", animate && "animate-message-appear")}>
      {assistant ? <RobotAvatar /> : <div aria-hidden="true" className={cn(
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9",
        "bg-[var(--surface-muted)] text-[var(--primary)]",
      )}>
        <UserRound className="h-4 w-4" />
      </div>}
      <div className={cn("min-w-0 max-w-[calc(100%_-_44px)] sm:max-w-[85%]", !assistant && "flex flex-col items-end")}>
        <div className={cn("mb-1 flex flex-wrap items-center gap-x-3 gap-y-1", !assistant && "justify-end")}>
          <span className="text-sm font-semibold text-[var(--primary)]">{assistant ? "MDW Compass" : "You"}</span>
          {timestamp && <time dateTime={new Date(timestamp).toISOString()} className="text-xs text-[var(--muted)]">{new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>}
        </div>
        {answer.text && <p className={cn("whitespace-pre-wrap break-words text-left text-base leading-7", assistant ? "text-[var(--ink)]" : "rounded-2xl rounded-tr-sm bg-[var(--primary)] px-4 py-3 text-[var(--on-primary)]")}>{answer.text}</p>}
        {sources.length > 0 && <div className="mt-3 border-t border-[var(--line)] pt-3 text-sm">
          <p className="mb-1 font-medium text-[var(--muted)]">Sources</p>
          <ul aria-label="Sources for this answer" className="space-y-1">
            {sources.map((source) => <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-sm py-2 text-[var(--primary)] underline decoration-[var(--line)] underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
                <span className="min-w-0 break-words">{source.title}</span>
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>)}
          </ul>
        </div>}
        {children}
      </div>
    </article>
  );
}
