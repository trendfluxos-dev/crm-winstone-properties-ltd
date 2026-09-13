/** Client-safe copy of the per-call credit estimates (server file must not be imported by routes). */
export const AI_USAGE_RATES = {
  command_agent: 0.25,
  transcription: 0.02,
  analysis: 0.03,
  doc_summary: 0.03,
  other: 0.01,
} as const;
