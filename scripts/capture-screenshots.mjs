#!/usr/bin/env node
/**
 * Capture app screenshots with a locally installed Chrome and the DevTools Protocol.
 *
 * Usage:
 *   pnpm screenshots --out "$TMPDIR/llm-ready-screenshots"
 *   pnpm screenshots --base-url http://localhost:3000 --audit-url https://nextjs.org/docs
 *   pnpm screenshots --config ./screenshots.json
 *
 * Chrome is found via CHROME_PATH or the common macOS, Linux and Windows paths.
 * If the app runs on another port, pass --base-url.
 *
 * A config file contains either an array of jobs or { "jobs": [...] }.
 * Job fields:
 *   name (required), path, width, height, mobile, deviceScaleFactor,
 *   fullPage, scrollTo, waitForText, waitForSelector, settleMs, timeoutMs.
 *
 * Default jobs capture the landing page and pipeline at 1440x900 and 390x844,
 * then the workspace in the plain-language and technical views and with a portfolio override.
 * Screenshots are saved outside the repository by default.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const HELP = `Capture app screenshots with headless Chrome.

Options:
  --base-url <url>     App origin (default: http://localhost:3000)
  --out <dir>          Output directory (default: $TMPDIR/llm-ready-screenshots)
  --config <file>      JSON file with custom jobs (array or { "jobs": [...] })
  --audit-url <url>    Target used by the default workspace jobs
  --chrome <path>      Chrome/Chromium binary (or CHROME_PATH)
  --port <port>        DevTools protocol port (default: 9333)
  --scale <number>     Device scale factor for default jobs (default: 2)
  --help               Show this help

Screenshot names are prefixed with the output directory and printed as absolute paths.
Start the app first, for example: pnpm dev`;

function option(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for --${name}`);
  }
  return value;
}

function findChrome(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("Chrome or Chromium was not found. Set CHROME_PATH or pass --chrome.");
  }
  return found;
}

function defaultJobs({ auditUrl, scale }) {
  const workspace = `/app?url=${encodeURIComponent(auditUrl)}`;

  return [
    { name: "home-desktop", path: "/", width: 1440, height: 900, deviceScaleFactor: scale },
    {
      name: "home-desktop-full",
      path: "/",
      width: 1440,
      height: 900,
      deviceScaleFactor: scale,
      fullPage: true,
    },
    {
      name: "home-mobile",
      path: "/",
      width: 390,
      height: 844,
      mobile: true,
      deviceScaleFactor: scale,
    },
    {
      name: "home-mobile-full",
      path: "/",
      width: 390,
      height: 844,
      mobile: true,
      deviceScaleFactor: scale,
      fullPage: true,
    },
    {
      name: "home-desktop-pipeline",
      path: "/",
      width: 1440,
      height: 900,
      deviceScaleFactor: scale,
      scrollTo: "#pipeline",
    },
    {
      name: "home-mobile-pipeline",
      path: "/",
      width: 390,
      height: 844,
      mobile: true,
      deviceScaleFactor: scale,
      scrollTo: "#pipeline",
    },
    {
      name: "workspace-desktop",
      path: workspace,
      width: 1440,
      height: 900,
      deviceScaleFactor: scale,
      settleMs: 3000,
      waitForText: "change requests",
    },
    {
      name: "workspace-mobile",
      path: workspace,
      width: 390,
      height: 844,
      mobile: true,
      deviceScaleFactor: scale,
      settleMs: 3000,
      waitForText: "change requests",
    },
    {
      name: "workspace-desktop-technical",
      path: `${workspace}&view=technical`,
      width: 1440,
      height: 900,
      deviceScaleFactor: scale,
      settleMs: 3000,
      waitForText: "audit matrix",
    },
    {
      name: "workspace-mobile-technical",
      path: `${workspace}&view=technical`,
      width: 390,
      height: 844,
      mobile: true,
      deviceScaleFactor: scale,
      settleMs: 3000,
      waitForText: "audit matrix",
    },
    {
      name: "workspace-desktop-override",
      path: `${workspace}&type=portfolio`,
      width: 1440,
      height: 900,
      deviceScaleFactor: scale,
      settleMs: 3000,
      waitForText: "manual override",
    },
  ];
}

function loadJobs(path, defaults) {
  if (!path) return defaults;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const jobs = Array.isArray(raw) ? raw : raw.jobs;
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new Error(`No jobs found in ${path}. Expected an array or { "jobs": [...] }.`);
  }
  return jobs;
}

async function waitForChrome(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  throw new Error("Chrome did not start. Check the DevTools port and CHROME_PATH.");
}

function isPortOpen(port) {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePort(open);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function stopChrome(chrome) {
  if (chrome.exitCode !== null) return;
  const exited = new Promise((resolveExit) => chrome.once("exit", resolveExit));
  chrome.kill("SIGTERM");
  await Promise.race([exited, sleep(2_000)]);
}

async function connect(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: "PUT",
  });
  if (!response.ok)
    throw new Error(`Could not create a DevTools target (HTTP ${response.status}).`);
  const target = await response.json();

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveSocket, reject) => {
    socket.addEventListener("open", resolveSocket, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });

  function send(method, params = {}) {
    const id = (nextId += 1);
    return new Promise((resolveSend, reject) => {
      pending.set(id, { resolve: resolveSend, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  return { socket, send };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  const baseUrl = option(args, "base-url", "http://localhost:3000").replace(/\/$/, "");
  const outDir = resolve(option(args, "out", `${tmpdir()}/llm-ready-screenshots`));
  const port = Number(option(args, "port", "9333"));
  const scale = Number(option(args, "scale", "2"));
  const auditUrl = option(args, "audit-url", "https://docs.python.org/3/");
  const configPath = option(args, "config", null);
  const chromePath = findChrome(option(args, "chrome", null));
  const jobs = loadJobs(configPath, defaultJobs({ auditUrl, scale }));

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port must be a whole number between 1 and 65535.");
  }
  if (await isPortOpen(port)) {
    throw new Error(
      `DevTools port ${port} is already in use. Close that Chrome instance or pass --port.`,
    );
  }

  mkdirSync(outDir, { recursive: true });
  const userDataDir = `${tmpdir()}/llm-ready-chrome-${Date.now()}`;
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let connection;
  try {
    await waitForChrome(port);
    connection = await connect(port);
    const { send } = connection;

    await send("Page.enable");
    await send("Runtime.enable");

    for (const job of jobs) {
      if (!job.name) throw new Error("Every screenshot job needs a name.");
      const width = Number(job.width ?? 1440);
      const height = Number(job.height ?? 900);
      const timeoutMs = Number(job.timeoutMs ?? 20_000);

      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: Number(job.deviceScaleFactor ?? scale),
        mobile: Boolean(job.mobile),
      });
      await send("Emulation.setTouchEmulationEnabled", {
        enabled: Boolean(job.mobile),
        maxTouchPoints: job.mobile ? 5 : 1,
      });

      await send("Page.navigate", { url: `${baseUrl}${job.path ?? "/"}` });
      await sleep(Number(job.settleMs ?? 1200));

      if (job.waitForText) {
        const started = Date.now();
        let found = false;
        while (Date.now() - started < timeoutMs) {
          const result = await send("Runtime.evaluate", {
            expression: `document.body ? document.body.innerText.toLowerCase().includes(${JSON.stringify(
              String(job.waitForText).toLowerCase(),
            )}) : false`,
            returnByValue: true,
          });
          if (result.result.value) {
            found = true;
            break;
          }
          await sleep(300);
        }
        if (!found) throw new Error(`${job.name}: timed out waiting for text “${job.waitForText}”`);
      }

      if (job.waitForSelector) {
        const started = Date.now();
        let found = false;
        while (Date.now() - started < timeoutMs) {
          const result = await send("Runtime.evaluate", {
            expression: `Boolean(document.querySelector(${JSON.stringify(job.waitForSelector)}))`,
            returnByValue: true,
          });
          if (result.result.value) {
            found = true;
            break;
          }
          await sleep(300);
        }
        if (!found) {
          throw new Error(`${job.name}: timed out waiting for selector “${job.waitForSelector}”`);
        }
      }

      if (job.scrollTo) {
        await send("Runtime.evaluate", {
          expression: `document.querySelector(${JSON.stringify(job.scrollTo)})?.scrollIntoView({ block: "start", behavior: "instant" })`,
        });
        await sleep(500);
      } else {
        await send("Runtime.evaluate", {
          expression: "window.scrollTo({ top: 0, behavior: 'instant' })",
        });
        await sleep(150);
      }

      let params = { format: "png", fromSurface: true };
      if (job.fullPage) {
        const metrics = await send("Page.getLayoutMetrics");
        const size = metrics.cssContentSize ?? metrics.contentSize;
        params = {
          ...params,
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
        };
      }

      const screenshot = await send("Page.captureScreenshot", params);
      const file = `${outDir}/${job.name}.png`;
      writeFileSync(file, Buffer.from(screenshot.data, "base64"));
      console.log(file);
    }
  } finally {
    connection?.socket.close();
    await stopChrome(chrome);
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    } catch {
      // Chrome may still be releasing its profile directory; it lives in the OS temp dir.
    }
  }
}

main().catch((error) => {
  console.error(`Screenshot capture failed: ${error.message}`);
  process.exitCode = 1;
});
