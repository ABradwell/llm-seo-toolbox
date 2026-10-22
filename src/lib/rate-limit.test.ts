import { describe, expect, it } from "vitest";

import { rateLimit } from "./rate-limit";

function key(): string {
  return `test-${Math.random().toString(36).slice(2)}`;
}

describe("rateLimit", () => {
  it("charges the weighted cost and reports the remaining budget", () => {
    const bucket = key();
    expect(rateLimit(bucket, 3)).toMatchObject({ ok: true, remaining: 27 });
    expect(rateLimit(bucket, 3)).toMatchObject({ ok: true, remaining: 24 });
    expect(rateLimit(bucket)).toMatchObject({ ok: true, remaining: 23 });
  });

  it("rejects a request that would exceed the window without consuming budget", () => {
    const bucket = key();
    rateLimit(bucket, 30);
    expect(rateLimit(bucket, 3)).toMatchObject({ ok: false, remaining: 0 });
    expect(rateLimit(bucket, 1)).toMatchObject({ ok: false, remaining: 0 });
  });
});
