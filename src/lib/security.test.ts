import { describe, expect, it } from "vitest";

import { assertSafeUrl, isBlockedHostname, isPrivateIp } from "./security";
import { UrlInputError, normalizeUserUrl } from "./url";

describe("normalizeUserUrl", () => {
  it("adds https to bare domains", () => {
    expect(normalizeUserUrl("example.com")).toBe("https://example.com/");
    expect(normalizeUserUrl("  docs.example.com/start  ")).toBe("https://docs.example.com/start");
  });

  it("keeps http and strips fragments", () => {
    expect(normalizeUserUrl("http://example.com/a#section")).toBe("http://example.com/a");
  });

  it("rejects unsupported protocols and junk", () => {
    expect(() => normalizeUserUrl("ftp://example.com")).toThrow(UrlInputError);
    expect(() => normalizeUserUrl("")).toThrow(UrlInputError);
    expect(() => normalizeUserUrl("not a domain")).toThrow(UrlInputError);
  });
});

describe("isPrivateIp", () => {
  it("flags private and reserved IPv4 ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
    ]) {
      expect(isPrivateIp(address), address).toBe(true);
    }
  });

  it("allows public IPv4 ranges", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.1.1"]) {
      expect(isPrivateIp(address), address).toBe(false);
    }
  });

  it("flags private IPv6 ranges", () => {
    for (const address of ["::1", "::ffff:127.0.0.1", "fe80::1", "fc00::1", "2001:db8::1"]) {
      expect(isPrivateIp(address), address).toBe(true);
    }
    expect(isPrivateIp("2606:4700::1111")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("blocks local and internal names", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("api.internal")).toBe(true);
    expect(isBlockedHostname("printer.local")).toBe(true);
    expect(isBlockedHostname("intranet")).toBe(true);
    expect(isBlockedHostname("127.0.0.1")).toBe(true);
  });

  it("allows public domains", () => {
    expect(isBlockedHostname("example.com")).toBe(false);
    expect(isBlockedHostname("docs.python.org")).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it("rejects private literal addresses without DNS lookups", async () => {
    await expect(assertSafeUrl("http://127.0.0.1")).rejects.toThrow();
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(assertSafeUrl("http://[::1]:443")).rejects.toThrow();
  });

  it("rejects credentialed and non-standard ports", async () => {
    await expect(assertSafeUrl("http://user:pass@example.com")).rejects.toThrow();
    await expect(assertSafeUrl("http://example.com:8080")).rejects.toThrow();
  });

  it("accepts public literal addresses", async () => {
    const url = await assertSafeUrl("https://8.8.8.8/");
    expect(url.hostname).toBe("8.8.8.8");
  });
});
