import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { UrlInputError, normalizeUserUrl } from "./url";

const BLOCKED_TLDS = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".test",
  ".invalid",
  ".onion",
];
const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "0.0.0.0"]);
const ALLOWED_PORTS = new Set(["", "80", "443"]);

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export function isPrivateIp(address: string): boolean {
  const version = isIP(address);

  if (version === 4) {
    const octets = address.split(".").map(Number);
    if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) return true;
    const [a, b] = octets;

    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51) return true;
    if (a === 203 && b === 0) return true;
    if (a >= 224) return true;
    return false;
  }

  if (version === 6) {
    const lower = address.toLowerCase().split("%")[0];

    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 link local
    if (/^ff[0-9a-f]{2}:/.test(lower)) return true; // ff00::/8 multicast
    if (lower.startsWith("2001:db8")) return true; // documentation range
    if (lower.startsWith("2002:")) return true; // 6to4 can wrap private v4
    return false;
  }

  // Not a valid IP address.
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (BLOCKED_HOSTS.has(host)) return true;
  if (!host.includes(".")) return true;
  if (BLOCKED_TLDS.some((tld) => host.endsWith(tld))) return true;
  if (isIP(host) && isPrivateIp(host)) return true;

  return false;
}

const dnsCache = new Map<string, { addresses: string[]; expires: number }>();
const DNS_TTL_MS = 60_000;

async function resolveHost(hostname: string): Promise<string[]> {
  const cached = dnsCache.get(hostname);
  if (cached && cached.expires > Date.now()) return cached.addresses;

  const results = await lookup(hostname, { all: true, verbatim: true });
  const addresses = results.map((entry) => entry.address);

  if (addresses.length > 0) {
    dnsCache.set(hostname, { addresses, expires: Date.now() + DNS_TTL_MS });
  }

  return addresses;
}

/**
 * Validates a user-supplied URL and every hostname it resolves to. Guards the
 * audit endpoint against SSRF against localhost, private ranges and metadata
 * services. DNS is re-checked on every redirect hop.
 */
export async function assertSafeUrl(input: string | URL): Promise<URL> {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(normalizeUserUrl(input)) : input;
  } catch (error) {
    if (error instanceof UrlInputError) throw new UnsafeUrlError(error.message);
    throw new UnsafeUrlError("That does not look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http:// and https:// addresses can be audited.");
  }

  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not supported.");
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeUrlError("Only ports 80 and 443 can be audited.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (isBlockedHostname(hostname)) {
    throw new UnsafeUrlError("Private, local, and reserved addresses cannot be audited.");
  }

  const addresses = isIP(hostname) ? [hostname] : await resolveHost(hostname).catch(() => []);

  if (addresses.length === 0) {
    throw new UnsafeUrlError(`Could not resolve ${hostname}.`);
  }

  if (addresses.some((address) => isPrivateIp(address))) {
    throw new UnsafeUrlError("That hostname resolves to a private address, which is not allowed.");
  }

  return url;
}
