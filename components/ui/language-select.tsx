"use client";

import { useState } from "react";
import { ChevronDown, Languages, X } from "lucide-react";
import { onboardingLanguages } from "@/lib/language-onboarding";
import { cn } from "@/lib/utils";

export function LanguageSelect({ value, onChange, disabled = false, label, compact = false }: {
  value: string;
  onChange: (language: string) => void;
  disabled?: boolean;
  label: string;
  compact?: boolean;
}) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherLanguage, setOtherLanguage] = useState("");
  const customValue = value && !onboardingLanguages.some((option) => option.value === value);
  const applyOther = () => {
    const language = otherLanguage.trim();
    if (disabled || language.length < 2) return;
    onChange(language);
    setOtherOpen(false);
    setOtherLanguage("");
  };
  return <div className="min-w-0">
    <div className="relative flex min-w-0 items-center">
      <Languages aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--primary)]" />
      <select aria-label={label} value={otherOpen ? "__other__" : value} disabled={disabled}
        onChange={(event) => {
          if (event.target.value === "__other__") setOtherOpen(true);
          else { setOtherOpen(false); onChange(event.target.value); }
        }}
        className={cn("min-h-11 w-full min-w-0 appearance-none rounded-lg border border-[var(--line)] bg-[var(--surface)] pl-9 pr-8 text-sm font-medium text-[var(--primary)] outline-none hover:bg-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-60", compact && "border-transparent bg-[var(--surface-muted)] text-xs")}>
        <option value="" disabled>Choose a language</option>
        {onboardingLanguages.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        {customValue && <option value={value}>{value}</option>}
        <option value="__other__">Other language…</option>
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 h-4 w-4 text-[var(--primary)]" />
    </div>
    {otherOpen && <div className="mt-2 flex flex-wrap items-center gap-2">
      <input aria-label={`${label}: other language`} autoFocus value={otherLanguage} disabled={disabled} maxLength={64}
        onChange={(event) => setOtherLanguage(event.target.value)} placeholder="Language name"
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); applyOther(); } }}
        className="min-h-11 w-24 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" />
      <button type="button" disabled={disabled || otherLanguage.trim().length < 2} onClick={applyOther} className="min-h-11 rounded-lg bg-[var(--primary)] px-3 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50">Use</button>
      <button type="button" aria-label={`Cancel ${label.toLowerCase()} entry`} onClick={() => setOtherOpen(false)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--primary)] focus-visible:outline-2"><X aria-hidden="true" className="h-4 w-4" /></button>
    </div>}
  </div>;
}
