export type SourceLink = { title: string; url: string };

function webUrl(value: unknown): URL | null {
  if (typeof value !== "string" || /[\s\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return /^(https?:)$/.test(url.protocol) && !url.username && !url.password ? url : null;
  } catch { return null; }
}

/** Validate API and saved-chat metadata before turning it into clickable links. */
export function normalizeSources(value: unknown): SourceLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    const url = webUrl(source.url);
    if (!url || typeof source.title !== "string" || seen.has(url.href)) return [];
    seen.add(url.href);
    return [{ title: source.title.trim().slice(0, 300) || url.hostname.replace(/^www\./, ""), url: source.url as string }];
  });
}

function trimUrlPunctuation(value: string): string {
  let url = value.replace(/[.,;:!?。。，；！？」』]+$/u, "");
  while (url.endsWith(")") && (url.match(/\)/g)?.length || 0) > (url.match(/\(/g)?.length || 0)) url = url.slice(0, -1);
  return url;
}

/** Separate actual agent-provided URLs from answer text; never invent sources. */
export function extractAnswerSources(answer: string): { text: string; sources: SourceLink[] } {
  const sources: SourceLink[] = [];
  let inSources = false;
  const lines = answer.split(/\r?\n/).map((original) => {
    const heading = /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:sources?|references?)(?:\*\*)?\s*(?::\s*|$)/i;
    const isHeading = heading.test(original);
    if (isHeading) inSources = true;
    const line = isHeading ? original.replace(heading, "") : original;
    let found = false;
    // The inner pair permits common Wikipedia-style parentheses in link paths.
    const markdown = /\[([^\]\n]+)\]\((https?:\/\/(?:[^()\s<>"']|\([^()\s<>]*\))+)(?:[ \t]+"[^"]*")?\)/gi;
    const bare = /https?:\/\/[^\s<>"'`*\]。。，；！？]+/gi;
    const add = (raw: string, title?: string) => {
      const url = webUrl(raw);
      if (!url) return;
      found = true;
      sources.push({title: title || url.hostname.replace(/^www\./, ""), url: raw});
    };
    const text = line.replace(markdown, (_match, title: string, url: string) => {
      add(url, title);
      return title;
    }).replace(bare, (raw) => {
      const url = trimUrlPunctuation(raw);
      add(url);
      return raw.slice(url.length);
    });
    const remainder = line.replace(markdown, "").replace(bare, "");
    const sourceOnly = found && /^[\s\d*`#).:\[\]<>;,—-]*$/.test(remainder);
    if (isHeading || (inSources && found) || sourceOnly) return "";
    if (line.trim() && !found) inSources = false;
    return text.replace(/[ \t]+([.,;!?])/g, "$1").trimEnd();
  });
  return {text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), sources: normalizeSources(sources)};
}
