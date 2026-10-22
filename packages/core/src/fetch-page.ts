import { assertSafeUrl, UnsafeUrlError } from "./security";

export const AUDIT_USER_AGENT =
  "LLMReadyBot/0.1 (+https://github.com/ABradwell/llm-seo-toolbox; automated LLM-readiness audit)";

export interface FetchTextOptions {
  accept?: string;
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
}

export interface FetchTextOutcome {
  ok: boolean;
  status: number;
  finalUrl: string;
  contentType: string;
  /** Lower-cased response headers, so directive headers can be audited. */
  headers: Record<string, string>;
  bytes: number;
  body: string;
  truncated: boolean;
  error: string | null;
  unsafe: boolean;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function failure(url: string, error: string, options?: { status?: number; unsafe?: boolean }) {
  return {
    ok: false,
    status: options?.status ?? 0,
    finalUrl: url,
    contentType: "",
    headers: {},
    bytes: 0,
    body: "",
    truncated: false,
    error,
    unsafe: options?.unsafe ?? false,
  } satisfies FetchTextOutcome;
}

async function readWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ body: string; bytes: number; truncated: boolean }> {
  const reader = response.body?.getReader();

  if (!reader) {
    const body = await response.text();
    return { body, bytes: Buffer.byteLength(body, "utf8"), truncated: false };
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let body = "";
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    received += value.byteLength;

    if (received > maxBytes) {
      const overflow = received - maxBytes;
      const keep = value.subarray(0, Math.max(0, value.byteLength - overflow));
      body += decoder.decode(keep, { stream: true });
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }

    body += decoder.decode(value, { stream: true });
  }

  body += decoder.decode();
  return { body, bytes: Math.min(received, maxBytes), truncated };
}

/**
 * Fetches text over http(s) with SSRF-safe redirect handling, a per-request
 * timeout and a hard byte ceiling.
 */
export async function fetchText(
  input: string | URL,
  options: FetchTextOptions = {},
): Promise<FetchTextOutcome> {
  let current: URL;

  try {
    current = await assertSafeUrl(input);
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return failure(String(input), error.message, { unsafe: true });
    }
    return failure(String(input), "The URL could not be validated.", { unsafe: true });
  }

  const maxBytes = options.maxBytes ?? 1_500_000;
  const timeoutMs = options.timeoutMs ?? 7_000;
  const accept =
    options.accept ??
    "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5";

  for (let hop = 0; hop < 5; hop += 1) {
    let response: Response;

    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent": options.userAgent ?? AUDIT_USER_AGENT,
          accept,
          "accept-language": "en-US,en;q=0.9",
        },
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const message =
        name === "TimeoutError"
          ? `Request timed out after ${Math.round(timeoutMs / 1000)}s.`
          : "The request failed before a response was received.";
      return failure(current.toString(), message);
    }

    if (REDIRECT_STATUS.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        return failure(current.toString(), "The server returned a redirect without a location.");
      }

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return failure(current.toString(), "The server returned an invalid redirect target.");
      }

      try {
        current = await assertSafeUrl(next);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unsafe redirect target.";
        return failure(next.toString(), message, { unsafe: true });
      }

      continue;
    }

    try {
      const { body, bytes, truncated } = await readWithLimit(response, maxBytes);
      const headers: Record<string, string> = {};
      for (const [key, value] of response.headers.entries()) {
        headers[key.toLowerCase()] = value;
      }

      return {
        ok: response.ok,
        status: response.status,
        finalUrl: current.toString(),
        contentType: headers["content-type"] ?? "",
        headers,
        bytes,
        body,
        truncated,
        error: null,
        unsafe: false,
      };
    } catch {
      return failure(current.toString(), "The response body could not be read.");
    }
  }

  return failure(current.toString(), "Too many redirects (limit: 5).");
}
