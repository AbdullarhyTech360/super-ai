import puppeteer from "puppeteer-core";
import { writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const logoUrl = `file://${join(root, "public", "app-logo.svg")}`;

const SIZES = [16, 32, 48, 64];

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

const executablePath = CHROME_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  throw new Error("No Chrome/Edge found. Set CHROME_PATH env var to a chrome/edge binary.");
}

const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
};

const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
};

const buildIco = (pngs) => {
  const count = pngs.length;
  const headerSize = 6 + 16 * count;
  const header = Buffer.concat([
    u16(0),
    u16(1),
    u16(count),
    ...pngs.map(({ size, data }, i) =>
      Buffer.concat([
        Buffer.from([size === 256 ? 0 : size, size === 256 ? 0 : size, 0, 0]),
        u16(1),
        u16(32),
        u32(data.length),
        u32(headerSize + pngs.slice(0, i).reduce((n, p) => n + p.data.length, 0)),
      ])
    ),
  ]);
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
};

const browser = await puppeteer.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  const page = await browser.newPage();
  const pngs = [];
  for (const size of SIZES) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.goto(logoUrl, { waitUntil: "domcontentloaded" });
    const data = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: size, height: size } });
    pngs.push({ size, data });
    console.log(`rendered ${size}x${size} (${data.length} bytes)`);
  }

  writeFileSync(join(root, "public", "favicon.ico"), buildIco(pngs));
  writeFileSync(join(root, "public", "favicon.png"), pngs.filter((p) => p.size === 64)[0].data);
  console.log("wrote public/favicon.ico (multi-size ICO)");
  console.log("wrote public/favicon.png (64x64)");
} finally {
  await browser.close();
}