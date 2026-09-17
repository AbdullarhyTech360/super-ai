import { preview } from "vite";
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = join(root, "dist");
const PORT = 4174;
const APP_URL = `http://127.0.0.1:${PORT}`;

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env.CHROME_PATH,
].filter(Boolean);

const resolveExecutablePath = () =>
  CHROME_PATHS.find((p) => existsSync(p));

const routes = [
  { path: "/", file: join(dist, "index.html") },
  { path: "/login", file: join(dist, "login", "index.html") },
  { path: "/signup", file: join(dist, "signup", "index.html") },
  { path: "/forgot-password", file: join(dist, "forgot-password", "index.html") },
  { path: "/reset-password", file: join(dist, "reset-password", "index.html") },
  { path: "/verify-email", file: join(dist, "verify-email", "index.html") },
];

const ogSource = join(root, "public", "og-image.svg");
const ogOutput = join(dist, "og-image.png");
const DEFAULT_TITLE = "Super AI";

async function main() {
  const baseHtml = readFileSync(join(dist, "index.html"), "utf8");
  writeFileSync(join(dist, "404.html"), baseHtml, "utf8");
  console.log("wrote dist/404.html");

  const server = await preview({
    root,
    preview: { port: PORT, strictPort: true },
  });

  const executablePath = resolveExecutablePath();
  if (!executablePath) {
    throw new Error(
      "No Chrome/Edge found. Set CHROME_PATH env var to a chrome/edge binary."
    );
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    for (const route of routes) {
      await page.goto(`${APP_URL}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForFunction(
        () => document.querySelectorAll("#root > *").length > 0,
        { timeout: 30000 }
      );
      await new Promise((r) => setTimeout(r, 1000));

      const title = await page.title();
      if (title === DEFAULT_TITLE && route.path !== "/") {
        console.warn(`  [!] ${route.path} title did not update (got "${title}")`);
      }

      const html = await page.evaluate(() => document.documentElement.outerHTML);
      mkdirSync(dirname(route.file), { recursive: true });
      writeFileSync(route.file, html, "utf8");
      console.log(`prerendered ${route.path} -> ${route.file} [${title}]`);
    }

    await page.setViewport({ width: 1200, height: 630 });
    await page.goto(`file://${ogSource}`, { waitUntil: "networkidle0" });
    await page.screenshot({ path: ogOutput });
    console.log(`wrote ${ogOutput}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});