const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

export class UrlInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlInputError";
  }
}

/**
 * Turns loose user input ("example.com", "https://example.com/docs") into a
 * normalized http(s) URL. Client-safe: no Node APIs.
 */
export function normalizeUserUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new UrlInputError("Enter a domain to audit.");
  }

  const withScheme = SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UrlInputError("That does not look like a valid domain or URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlInputError("Only http:// and https:// addresses can be audited.");
  }

  if (!url.hostname.includes(".") && url.hostname !== "localhost") {
    throw new UrlInputError("Use a full domain, for example docs.example.com.");
  }

  url.hash = "";
  return url.toString();
}

export function prettyDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function pathLabel(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "");
  if (!clean) return "Home";

  const segments = clean.split("/").filter(Boolean);
  const last = segments.at(-1) ?? "";
  const previous = segments.at(-2) ?? "";

  const candidate =
    last.toLowerCase() === "index" || last.toLowerCase() === "readme" ? previous : last;

  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    decoded = candidate;
  }

  const label = decoded
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!label) return "Home";

  return label
    .split(" ")
    .map((word) => (word.length <= 3 && word === word.toLowerCase() ? word : capitalize(word)))
    .join(" ");
}

function capitalize(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}
