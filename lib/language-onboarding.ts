export const LANGUAGE_PROMPT = "Hello, I’m MDW Compass. I can help with questions about salary rights, pay, deductions, rest days, and finding support. Which language would you like to use?\n\nAnong wika ang gusto mong gamitin?\nBahasa apa yang ingin Anda gunakan?\n\nYou can also choose Salary Rights or another topic from the menu. Choose your language before sending your question.";

export const onboardingLanguages = [
  { value: "English", label: "English" },
  { value: "Tagalog", label: "Tagalog / Filipino" },
  { value: "Bahasa Indonesia", label: "Bahasa Indonesia" },
  { value: "Burmese", label: "မြန်မာဘာသာ · Burmese" },
  { value: "Tamil", label: "தமிழ் · Tamil" },
  { value: "Bengali", label: "বাংলা · Bengali" },
  { value: "Sinhala", label: "සිංහල · Sinhala" },
  { value: "Hindi", label: "हिन्दी · Hindi" },
  { value: "Khmer", label: "ភាសាខ្មែរ · Khmer" },
  { value: "Thai", label: "ภาษาไทย · Thai" },
  { value: "Malay", label: "Bahasa Melayu" },
  { value: "Mandarin Chinese", label: "中文 · Mandarin" },
];

export function needsLanguageSelection(saved: {
  languageConfirmed?: boolean;
  messages: { role: string }[];
} | null): boolean {
  if (!saved) return true;
  if (typeof saved.languageConfirmed === "boolean") return !saved.languageConfirmed;
  // Existing conversations predate the explicit onboarding flag.
  return !saved.messages.some((message) => message.role === "user");
}

type SessionInput = { message: string; sessionId: string; language: string };
type SessionResult = { message: string; outputCount: number };

export async function selectCxLanguage(
  run: (input: SessionInput) => Promise<SessionResult>,
  selection: Omit<SessionInput, "message">,
): Promise<SessionResult> {
  const input = { ...selection, message: selection.language };
  const result = await run(input);
  // The deployed root agent sends this menu on its first text turn. Answer it
  // with the user's actual selection, in the same session, before showing its reply.
  const isLanguageMenu = /(?:which language|language name|comfortable.*language)/i.test(result.message)
    && /1[.)]\s*English/i.test(result.message)
    && /Tagalog/i.test(result.message) && /Bahasa Indonesia/i.test(result.message);
  return isLanguageMenu ? run(input) : result;
}
