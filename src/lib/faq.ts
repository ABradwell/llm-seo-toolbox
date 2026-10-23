export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Shared by the visible FAQ and the FAQPage JSON-LD. Keep the answer text in
 * one place so the structured data always matches what a reader can see.
 */
export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "What does LLMReady check?",
    answer:
      "LLMReady runs 49 checks across discovery manifests, RFC 9309 crawler access, static HTML parseability and schema.org structured data. It samples up to eight pages, keeps site scores origin-stable and returns the exact line and code that fixes each miss.",
  },
  {
    question: "Does LLMReady need a browser or an account?",
    answer:
      "No. The audit fetches static HTML and the standard discovery files with plain HTTP, so it sees what an AI crawler sees in the first response. There is no headless browser, no signup, no cookie wall and no database of your content.",
  },
  {
    question: "How is the score calculated?",
    answer:
      "Every scored check returns pass, warn or fail, worth 100, 50 or 0 points. Pillars are weighted averages, the overall score is the mean of the four pillars, and informational checks or zero-weight crawler rows never change the result.",
  },
] as const;
