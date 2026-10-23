import type { AgentFetchComparison } from "./types";
import type { FetchTextOutcome } from "./fetch-page";

const GENERIC_MARKERS = [
  "verify you are human",
  "verify you are a human",
  "are you a robot",
  "checking your browser",
  "unusual traffic",
  "request blocked",
  "access denied",
  "attention required",
  "captcha",
  "bot detection",
  "bot verification",
];

/** Detects the common WAF challenge pages that robots.txt cannot describe. */
export function detectChallenge(
  headers: Record<string, string>,
  body: string,
): AgentFetchComparison["challenge"] {
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]),
  );
  const lowerBody = body.slice(0, 8_000).toLowerCase();

  if (
    lowerHeaders["cf-mitigated"]?.includes("challenge") ||
    lowerBody.includes("cf-chl") ||
    lowerBody.includes("cf-challenge") ||
    lowerBody.includes("/cdn-cgi/challenge-platform")
  ) {
    return "cloudflare";
  }

  if (
    lowerHeaders["set-cookie"]?.includes("_abck") ||
    lowerBody.includes("_abck") ||
    lowerBody.includes("akamai bot manager") ||
    (lowerBody.includes("akamai") && lowerBody.includes("access denied"))
  ) {
    return "akamai";
  }

  if (GENERIC_MARKERS.some((marker) => lowerBody.includes(marker))) {
    return "generic";
  }

  return null;
}

export function compareAgentFetch(input: {
  userAgent: string;
  baseline: Pick<FetchTextOutcome, "status" | "bytes" | "finalUrl">;
  response: FetchTextOutcome;
}): AgentFetchComparison {
  const { userAgent, baseline, response } = input;
  const challenge = detectChallenge(response.headers, response.body);
  const statusChanged = response.status !== baseline.status;
  const bodyShrunk = baseline.bytes > 0 && response.bytes < baseline.bytes * 0.2;
  const blocked = statusChanged || bodyShrunk || challenge !== null;

  const parts: string[] = [];
  parts.push(`${userAgent} returned HTTP ${response.status || "no response"}`);
  parts.push(`against the default HTTP ${baseline.status}`);
  if (challenge) parts.push(`a ${challenge} challenge page was detected`);
  else if (statusChanged) parts.push("the status differs from the default fetch");
  else if (bodyShrunk) parts.push("the response body is under 20% of the default size");

  return {
    userAgent,
    status: response.status,
    blocked,
    challenge,
    bytes: response.bytes,
    finalUrl: response.finalUrl,
    detail: `${parts.join(". ")}.`,
  };
}

/** The user-agent string a fetch should send for a named crawler. */
export function crawlerUserAgent(label: string): string {
  return `${label}/1.0 (+https://example.com/bot; automated audit)`;
}
