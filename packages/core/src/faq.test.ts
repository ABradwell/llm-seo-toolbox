import { describe, expect, it } from "vitest";

import { detectFaqPairs } from "./faq";

const ANSWER =
  "This is a complete answer that runs well past forty characters so it counts as prose.";

describe("detectFaqPairs", () => {
  it("finds question headings followed by an answer", () => {
    const result = detectFaqPairs(`<html><body><main>
      <h2>What is LLMReady?</h2>
      <p>${ANSWER}</p>
      <h2>How does it work?</h2>
      <p>${ANSWER}</p>
    </main></body></html>`);

    expect(result.pairs).toHaveLength(2);
    expect(result.pairs[0].question).toBe("What is LLMReady?");
    expect(result.pairs[0].answer).toBe(ANSWER);
    expect(result.pairs[0].line).toBe(2);
    expect(result.firstLine).toBe(2);
  });

  it("stops the answer at the next heading of the same or a higher level", () => {
    const result = detectFaqPairs(`<html><body><main>
      <h3>Why use it?</h3>
      <p>${ANSWER}</p>
      <h3>Next question?</h3>
      <p>${ANSWER}</p>
    </main></body></html>`);

    expect(result.pairs[0].answer).toBe(ANSWER);
  });

  it("includes deeper headings inside an answer", () => {
    const result = detectFaqPairs(`<html><body><main>
      <h2>How do I install it?</h2>
      <p>${ANSWER}</p>
      <h3>Requirements</h3>
      <p>Node 20 or newer is required.</p>
    </main></body></html>`);

    expect(result.pairs[0].answer).toContain("Node 20 or newer");
  });

  it("reads definition lists", () => {
    const result = detectFaqPairs(`<html><body><main><dl>
      <dt>What is a manifest?</dt>
      <dd>${ANSWER}</dd>
    </dl></main></body></html>`);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].question).toBe("What is a manifest?");
  });

  it("reads details and summary pairs", () => {
    const result = detectFaqPairs(`<html><body><main>
      <details><summary>Can I self-host it?</summary><p>${ANSWER}</p></details>
    </main></body></html>`);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].answer).toBe(ANSWER);
  });

  it("requires an interrogative heading or a question mark", () => {
    const result = detectFaqPairs(`<html><body><main>
      <h2>Pricing</h2>
      <p>${ANSWER}</p>
      <h2>Is there a free tier?</h2>
      <p>${ANSWER}</p>
    </main></body></html>`);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].question).toBe("Is there a free tier?");
  });

  it("skips answers shorter than 40 characters", () => {
    const result = detectFaqPairs(
      "<html><body><main><h2>What is it?</h2><p>Short.</p></main></body></html>",
    );

    expect(result.pairs).toEqual([]);
    expect(result.firstLine).toBeNull();
  });

  it("deduplicates repeated questions", () => {
    const result = detectFaqPairs(`<html><body><main>
      <h2>What is it?</h2><p>${ANSWER}</p>
      <h2>What is it?</h2><p>${ANSWER}</p>
    </main></body></html>`);

    expect(result.pairs).toHaveLength(1);
  });

  it("ignores navigation, header, footer and aside content", () => {
    const result = detectFaqPairs(`<html><body>
      <nav><h2>What is in the nav?</h2><p>${ANSWER}</p></nav>
      <header><h2>What is in the header?</h2><p>${ANSWER}</p></header>
      <main><h2>What is real?</h2><p>${ANSWER}</p></main>
      <footer><h2>What is in the footer?</h2><p>${ANSWER}</p></footer>
    </body></html>`);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].question).toBe("What is real?");
  });

  it("falls back to the body when there is no main or article scope", () => {
    const result = detectFaqPairs(
      `<html><body><div><h2>What is it?</h2><p>${ANSWER}</p></div></body></html>`,
    );

    expect(result.pairs).toHaveLength(1);
  });
});
