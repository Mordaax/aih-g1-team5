"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const storageKey = "mdw-compass.theme";

function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe,
    () => document.documentElement.dataset.theme === "dark", () => false);
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  function toggle() {
    const theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(storageKey, theme); } catch { /* Still works when storage is unavailable. */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme === "dark" ? "#131313" : "#e8e4d9");
  }

  return <button type="button" onClick={toggle} aria-label={label} title={label}
    aria-pressed={dark}
    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:bg-[var(--accent)]">
    {dark ? <Sun aria-hidden="true" className="h-4 w-4" /> : <Moon aria-hidden="true" className="h-4 w-4" />}
  </button>;
}
