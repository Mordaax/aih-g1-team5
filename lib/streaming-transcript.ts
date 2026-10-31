export type StreamingTranscript = { final: string; interim: string };

export function updateTranscript(state: StreamingTranscript, message: { type?: unknown; text?: unknown }): StreamingTranscript {
  if (typeof message.text !== "string" || !message.text.trim()) return state;
  if (message.type === "interim") return { ...state, interim: message.text.trim() };
  if (message.type === "final") return { final: [state.final, message.text.trim()].filter(Boolean).join(" "), interim: "" };
  return state;
}
