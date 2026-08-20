// Minimal Chrome DevTools Protocol client.
//
// Investigation tooling for the mobile interaction audit — NOT application code
// and NOT part of the build or the test suite. Node 22 ships a global WebSocket,
// so this needs no dependencies.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJson(url, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (err) {
      last = err;
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}: ${last?.message ?? "no response"}`);
}

export async function launchChrome({ port = 9222 } = {}) {
  const bin = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!bin) throw new Error("No Chrome/Edge binary found");
  const profile = mkdtempSync(join(tmpdir(), "rh-audit-"));
  const child = spawn(
    bin,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  return {
    port,
    async close() {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      await sleep(300);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* best effort — a locked profile dir is harmless in tmp */
      }
    },
  };
}

/** One CDP session against the first page target. */
export class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? "")})`));
        else p.resolve(msg.result);
        return;
      }
      const handlers = this.listeners.get(msg.method);
      if (handlers) for (const h of handlers) h(msg.params);
    });
  }

  static async attach(port) {
    const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
    const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (!page) throw new Error("No page target");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("CDP socket error")), { once: true });
    });
    return new Session(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Subscribe to a CDP event. Returns a disposer so probes can scope listeners. */
  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    const arr = this.listeners.get(method);
    arr.push(handler);
    return () => {
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }

  /** Evaluate in the page and return the value (must be JSON-serialisable). */
  async eval(fnOrExpr, ...args) {
    const expression =
      typeof fnOrExpr === "function"
        ? `(${fnOrExpr.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`
        : fnOrExpr;
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        `Page exception: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`
      );
    }
    return res.result.value;
  }

  /** Navigate and wait for the network to settle. */
  async goto(url, { settleMs = 900 } = {}) {
    const loaded = new Promise((resolve) => {
      const done = () => resolve();
      this.on("Page.loadEventFired", done);
      setTimeout(done, 15000);
    });
    await this.send("Page.navigate", { url });
    await loaded;
    await sleep(settleMs);
  }

  /**
   * Emulate a device. `mobile: true` makes Chrome apply the page's meta viewport
   * exactly as a phone would — which is what makes a MISSING meta viewport
   * visible here, unlike DevTools' "Responsive" width slider.
   */
  async emulate({ width, height, dpr = 1, mobile = false, touch = false, ua = null }) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    await this.send("Emulation.setTouchEmulationEnabled", {
      enabled: touch,
      maxTouchPoints: touch ? 5 : 1,
    });
    await this.send("Emulation.setEmulatedMedia", {
      features: touch
        ? [
            { name: "hover", value: "none" },
            { name: "any-hover", value: "none" },
            { name: "pointer", value: "coarse" },
            { name: "any-pointer", value: "coarse" },
          ]
        : [],
    });
    if (ua) {
      await this.send("Emulation.setUserAgentOverride", {
        userAgent: ua,
        platform: mobile ? "Android" : "Win32",
        userAgentMetadata: {
          brands: [{ brand: "Chromium", version: "140" }],
          fullVersion: "140.0.0.0",
          platform: mobile ? "Android" : "Windows",
          platformVersion: mobile ? "13" : "10",
          architecture: "",
          model: mobile ? "Pixel 7" : "",
          mobile,
        },
      });
    }
  }

  /** A real single-finger tap at viewport coordinates. */
  async tap(x, y) {
    const point = { x, y, radiusX: 12, radiusY: 12, force: 1, id: 1 };
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await sleep(40);
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(160);
  }

  /**
   * Move the pointer without pressing — wakes hover/idle-timeout UI (the native
   * player hides its controls on a timer and re-shows them on mousemove).
   */
  async nudge(x, y) {
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      clickCount: 0,
    });
    await sleep(120);
  }

  /**
   * Insert text into the focused element the way a soft keyboard does — one
   * composed insertion rather than synthetic per-character key events, which is
   * what an Android IME actually produces.
   */
  async type(text) {
    await this.send("Input.insertText", { text });
    await sleep(120);
  }

  /** Press a named key (Enter/Escape/Tab) with the codes Chrome expects. */
  async pressKey(key) {
    const keys = {
      Enter: { code: "Enter", vk: 13, text: "\r" },
      Escape: { code: "Escape", vk: 27 },
      Tab: { code: "Tab", vk: 9 },
    };
    const k = keys[key];
    if (!k) throw new Error(`pressKey: unmapped key ${key}`);
    const base = {
      key,
      code: k.code,
      windowsVirtualKeyCode: k.vk,
      nativeVirtualKeyCode: k.vk,
    };
    await this.send("Input.dispatchKeyEvent", {
      type: k.text ? "keyDown" : "rawKeyDown",
      ...base,
      ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}),
    });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(160);
  }

  /** A long-press, i.e. what "tap and hold" actually dispatches. */
  async longPress(x, y, holdMs = 700) {
    const point = { x, y, radiusX: 12, radiusY: 12, force: 1, id: 1 };
    await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await sleep(holdMs);
    await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(160);
  }
}

export const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
