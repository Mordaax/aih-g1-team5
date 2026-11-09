export type SpeechVoice = { id: string; label: string };
export type SpeechLanguage = { language: string; locale: string; aliases: string[]; voices: SpeechVoice[] };

function language(language: string, locale: string, female: string, male: string, aliases: string[] = []): SpeechLanguage {
  return {language, locale, aliases, voices: [
    {id: `${locale}-${female}Neural`, label: `${female} · Female`},
    {id: `${locale}-${male}Neural`, label: `${male} · Male`},
  ]};
}

export const speechLanguages: SpeechLanguage[] = [
  language("English", "en-SG", "Luna", "Wayne", ["en", "en-US", "en-GB"]),
  language("Tagalog", "fil-PH", "Blessica", "Angelo", ["Filipino", "Tagalog / Filipino", "tl", "tl-PH", "fil"]),
  language("Bahasa Indonesia", "id-ID", "Gadis", "Ardi", ["Indonesian", "id"]),
  language("Burmese", "my-MM", "Nilar", "Thiha", ["Myanmar", "my"]),
  language("Tamil", "ta-IN", "Pallavi", "Valluvar", ["ta", "தமிழ்"]),
  language("Bengali", "bn-BD", "Nabanita", "Pradeep", ["Bangla", "bn", "বাংলা"]),
  language("Sinhala", "si-LK", "Thilini", "Sameera", ["Sinhalese", "si"]),
  language("Hindi", "hi-IN", "Swara", "Madhur", ["hi", "हिन्दी"]),
  language("Khmer", "km-KH", "Sreymom", "Piseth", ["Cambodian", "km"]),
  language("Thai", "th-TH", "Premwadee", "Niwat", ["th", "ภาษาไทย"]),
  language("Malay", "ms-MY", "Yasmin", "Osman", ["Bahasa Melayu", "ms"]),
  language("Mandarin Chinese", "zh-CN", "Xiaoxiao", "Yunxi", ["Chinese", "Mandarin", "cmn-CN", "zh", "中文"]),
];

export function getSpeechLanguage(value: string): SpeechLanguage | undefined {
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  return speechLanguages.find(item => [item.language, item.locale, ...item.aliases].some(name => name.toLowerCase() === normalized));
}
