import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = 9333;
const appUrl = "http://127.0.0.1:5173/";
const outputDir = join(process.cwd(), "screenshots");
let browser = null;

async function main() {
  await mkdir(outputDir, { recursive: true });

  const profileDir = join(tmpdir(), `orbit-escape-chrome-${Date.now()}`);
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--enable-unsafe-swiftshader",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], {
    stdio: "ignore",
  });
  const chromeExit = new Promise((resolve) => {
    chrome.once("exit", resolve);
  });

  try {
    const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    browser = new Cdp(version.webSocketDebuggerUrl);
    await browser.open();

    const results = [];
    results.push(await runViewport("desktop", { width: 1440, height: 900, mobile: false, deviceScaleFactor: 1 }));
    results.push(await runViewport("mobile", { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 }));

    console.log(JSON.stringify(results, null, 2));
  } finally {
    browser?.close();
    chrome.kill();
    await Promise.race([chromeExit, delay(1600)]);
    await cleanupProfile(profileDir);
  }
}

async function runViewport(name, metrics) {
  const target = await waitForJson(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(appUrl)}`, {
    method: "PUT",
  });
  const tab = new Cdp(target.webSocketDebuggerUrl);
  await tab.open();
  await tab.send("Page.enable");
  await tab.send("Runtime.enable");
  await tab.send("Emulation.setDeviceMetricsOverride", metrics);
  await tab.send("Page.navigate", { url: appUrl });
  await tab.waitFor("Page.loadEventFired", 8000);
  await tab.evaluate(`document.querySelector("#solarStart").click()`);
  await delay(2600);

  const diagnostics = await tab.evaluate(`(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    };
    const overflowX = Math.max(
      0,
      document.documentElement.scrollWidth - window.innerWidth,
      document.body.scrollWidth - window.innerWidth,
    );
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      render: window.__ORBIT_ESCAPE_RENDER__ ?? null,
      overflowX,
      nav: rect(".hud--right"),
      launch: rect("#solarMenu"),
      flight: rect(".hud--left"),
      pad: rect(".mobile-pad"),
    };
  })()`);

  const screenshot = await tab.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const file = join(outputDir, `${name}-cdp.png`);
  await writeFile(file, Buffer.from(screenshot.data, "base64"));
  await tab.send("Page.close");
  tab.close();

  return {
    name,
    file,
    diagnostics,
    ok:
      diagnostics.render?.ok === true &&
      diagnostics.overflowX === 0 &&
      diagnostics.nav.left >= 0 &&
      diagnostics.nav.right <= diagnostics.innerWidth &&
      diagnostics.launch.left >= 0 &&
      diagnostics.launch.right <= diagnostics.innerWidth,
  };
}

async function waitForJson(url, options, timeout = 8000) {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response.json();
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(120);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function cleanupProfile(path) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error.code !== "EBUSY" || attempt === 3) {
        return;
      }
      await delay(250);
    }
  }
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  open() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
      this.socket.addEventListener("message", (event) => this.handleMessage(event));
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  evaluate(expression) {
    return this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }).then((result) => result.result.value);
  }

  waitFor(method, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeout);

      const queue = this.listeners.get(method) ?? [];
      queue.push((params) => {
        clearTimeout(timer);
        resolve(params);
      });
      this.listeners.set(method, queue);
    });
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);

    if (message.id && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(message.error.message));
      } else {
        entry.resolve(message.result);
      }
      return;
    }

    if (message.method && this.listeners.has(message.method)) {
      const queue = this.listeners.get(message.method);
      const listener = queue.shift();
      if (queue.length === 0) {
        this.listeners.delete(message.method);
      }
      listener?.(message.params);
    }
  }

  close() {
    this.socket?.close();
  }
}

await main();
