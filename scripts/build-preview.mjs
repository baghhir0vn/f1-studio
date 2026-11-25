import { copyFile, mkdir, readdir, readFile, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { build, transform } from "esbuild";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(root, "dist");
if (path.relative(root, dist) !== "dist") throw new Error("Unsafe dist output path.");
try {
  await lstat(dist);
  throw new Error("Refusing to overwrite an existing dist directory.");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
await mkdir(dist);

const forbiddenPath = /(?:^|\/)(?:\.env(?:\.[^/]+)?|\.git|.*\.sql|.*\.md|.*backup.*|.*secret.*|package(?:-lock)?\.json|vercel\.json|.*\.pem|.*\.key)$/i;
const rootFiles = [
  "index.html",
  "cat-1.jpg", "cat-2.jpg", "cat-3.jpg", "cat-4.jpg", "cat-5.jpg", "cat-6.jpg",
  "f1-logo.png", "hero-scene.jpg", "og-cover.png", "robot-icon.svg"
];
const cssFiles = [
  "css/about-page.css", "css/account-page.css", "css/admin-dashboard-refresh.css", "css/admin-scroll.css",
  "css/auth-redesign.css", "css/category-page.css", "css/chat-assistant.css", "css/f1-reference-alignment.css",
  "css/f1-reference-capture.css", "css/f1-reference-refresh.css", "css/hero-presentation.css",
  "css/order-delivery-info.css", "css/product-whatsapp.css", "css/styles.css"
];
const jsFiles = [
  "js/about-page.js", "js/account-page.js", "js/admin-customers.js", "js/admin-dashboard.js",
  "js/admin-orders.js", "js/admin-products.js", "js/admin-reviews.js", "js/admin-shared.js", "js/admin.js",
  "js/api.js", "js/app.js", "js/auth.js", "js/cart.js", "js/catalog.js", "js/category-page.js", "js/chat.js",
  "js/config.js", "js/customization.js", "js/design-studio.js", "js/design-templates.js", "js/events.js",
  "js/homepage-content.js", "js/legal.js", "js/modal.js", "js/motion.js", "js/product-whatsapp.js",
  "js/reference-mobile-dock.js", "js/reviews.js", "js/security.js", "js/services/auth-service.js",
  "js/services/customer-service.js", "js/services/design-file-validation.js", "js/services/newsletter-service.js",
  "js/services/order-service.js", "js/services/product-service.js", "js/services/profile-service.js",
  "js/services/query-utils.js", "js/services/realtime-service.js", "js/services/review-service.js",
  "js/services/site-settings-service.js", "js/services/storage-service.js", "js/site-settings.js",
  "js/state.js", "js/ui.js", "js/vendor/qrcode-generator-2.0.4.js"
];
const assetFiles = [
  "assets/reference/about-showcase-original.jpg", "assets/reference/auth-brand-hero.jpg",
  "assets/reference/cat-1.jpg", "assets/reference/cat-2.jpg", "assets/reference/cat-3.jpg",
  "assets/reference/cat-4.jpg", "assets/reference/cat-5.jpg", "assets/reference/cat-6.jpg",
  "assets/reference/hero-scene.jpg", "assets/reference/promo-offer-gift.jpg",
  "assets/reference/home-hero-20261024.jpg",
  "public/images/hero-warm-gift-composition.png"
];
const licenseFile = "js/vendor/QRCODE-GENERATOR-LICENSE.txt";
const optimizedImages = [
  { source: "public/images/hero-warm-gift-composition.png", target: "public/images/hero-warm-gift-composition.webp", quality: 88 },
  { source: "assets/reference/home-hero-20261024.jpg", target: "assets/reference/home-hero-20261024.webp", quality: 86 },
  { source: "assets/reference/about-showcase-original.jpg", target: "assets/reference/about-showcase-original.webp", quality: 86 }
];
const generated = new Set(optimizedImages.map(image => image.target));
const allowed = new Set([...rootFiles, ...cssFiles, ...jsFiles, ...assetFiles, ...generated, licenseFile]);
const included = new Set();

function assertInside(base, target) {
  const rel = path.relative(base, target);
  if (path.isAbsolute(rel) || rel === ".." || rel.startsWith(".." + path.sep)) {
    throw new Error("Output path escaped its allowed directory.");
  }
}

async function addFile(relative) {
  const normalized = relative.replace(/\\/g, "/");
  if (!allowed.has(normalized) || forbiddenPath.test(normalized)) {
    throw new Error("Blocked path in static manifest: " + normalized);
  }
  const source = path.resolve(root, relative);
  const target = path.resolve(dist, relative);
  assertInside(root, source);
  assertInside(dist, target);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Expected a regular file: " + normalized);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  included.add(normalized);
}

for (const file of allowed) {
  if (!generated.has(file)) await addFile(file);
}
for (const image of optimizedImages) {
  if (!included.has(image.source) || !allowed.has(image.target) || forbiddenPath.test(image.target)) {
    throw new Error("Invalid optimized image manifest.");
  }
  const source = path.resolve(dist, image.source);
  const target = path.resolve(dist, image.target);
  assertInside(dist, source);
  assertInside(dist, target);
  const original = await lstat(source);
  const metadata = await sharp(source).metadata();
  const encoded = await sharp(source).autoOrient().webp({ quality: image.quality, effort: 5 }).toBuffer();
  if (encoded.length >= original.size) throw new Error("Optimized image not smaller: " + image.source);
  await writeFile(target, encoded, { flag: "wx" });
  included.add(image.target);
  console.log("Performance image: " + image.source + " (" + metadata.width + "x" + metadata.height + "), " + original.size + " bytes -> " + encoded.length + " bytes");
}
// Add WebP sources ahead of existing originals, preserving the responsive
// selection, original markup, fallback images and all CSS.
const htmlPath = path.join(dist, "index.html");
let optimizedHtml = await readFile(htmlPath, "utf8");
const imageReplacements = [
  ['<source media="(min-width: 901px)" srcset="public/images/hero-warm-gift-composition.png">', '<source media="(min-width: 901px)" type="image/webp" srcset="public/images/hero-warm-gift-composition.webp"><source media="(min-width: 901px)" srcset="public/images/hero-warm-gift-composition.png"><source type="image/webp" srcset="assets/reference/home-hero-20261024.webp">'],
  ['<picture class="about-showcase">', '<picture class="about-showcase"><source type="image/webp" srcset="assets/reference/about-showcase-original.webp">']
];
for (const [before, after] of imageReplacements) {
  if (optimizedHtml.split(before).length !== 2) throw new Error("Unexpected image markup: " + before);
  optimizedHtml = optimizedHtml.replace(before, after);
}
await writeFile(htmlPath, optimizedHtml, "utf8");
if (included.size !== allowed.size) throw new Error("Static manifest copy is incomplete.");

// Preview-only optimization: keep the exact static allowlist and run all
// security, reference and secret checks on the final generated output.
const appOutput = path.join(dist, "js/app.js");
const bundled = await build({
  absWorkingDir: root,
  entryPoints: ["js/app.js"],
  outfile: appOutput,
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,
  keepNames: true,
  legalComments: "inline",
  sourcemap: false,
  metafile: true
});
if (bundled.outputFiles.length !== 1 || path.resolve(bundled.outputFiles[0].path) !== appOutput) {
  throw new Error("Unexpected JavaScript bundle output.");
}
const inputBytes = Object.values(bundled.metafile.inputs).reduce((sum, input) => sum + input.bytes, 0);
const inputCount = Object.keys(bundled.metafile.inputs).length;
await writeFile(appOutput, bundled.outputFiles[0].contents);
console.log("Performance JS: " + inputCount + " module inputs, " + inputBytes + " bytes -> " + bundled.outputFiles[0].contents.length + " bytes (one app entry bundle)");

let cssBefore = 0;
let cssAfter = 0;
for (const file of cssFiles) {
  const target = path.join(dist, file);
  const source = await readFile(target, "utf8");
  const result = await transform(source, {
    loader: "css",
    sourcefile: file,
    minifyWhitespace: true,
    minifySyntax: false,
    minifyIdentifiers: false,
    legalComments: "inline",
    sourcemap: false
  });
  cssBefore += Buffer.byteLength(source);
  cssAfter += Buffer.byteLength(result.code);
  await writeFile(target, result.code, "utf8");
}
console.log("Performance CSS: " + cssFiles.length + " stylesheets, " + cssBefore + " bytes -> " + cssAfter + " bytes (order and media attributes unchanged)");


const outputFiles = [];
async function collect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? prefix + "/" + entry.name : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symlink found in dist: " + relative);
    if (entry.isDirectory()) await collect(absolute, relative);
    else if (entry.isFile()) outputFiles.push(relative);
  }
}
await collect(dist);
outputFiles.sort();
const notAllowlisted = outputFiles.filter(file => !allowed.has(file));
const denied = outputFiles.filter(file => forbiddenPath.test(file));
if (notAllowlisted.length || denied.length || outputFiles.length !== allowed.size) {
  throw new Error("Static output audit failed: non-allowlisted=" + notAllowlisted.length + ", denied=" + denied.length);
}

for (const required of [
  "index.html", "css/hero-presentation.css", "public/images/hero-warm-gift-composition.png",
  "assets/reference/home-hero-20261024.jpg"
]) {
  if (!included.has(required)) throw new Error("Required public file missing: " + required);
}
const html = await readFile(path.join(dist, "index.html"), "utf8");
if (!html.includes("Created by Ba\u011f\u0131rov") || !html.includes("https://www.instagram.com/baghir0v.n/")) {
  throw new Error("Footer credit or Instagram link is missing.");
}
if (!html.includes("public/images/hero-warm-gift-composition.png") || !html.includes("assets/reference/home-hero-20261024.jpg")) {
  throw new Error("Responsive Preview hero image references are missing.");
}

function resolveReference(fromFile, reference) {
  const value = reference.split(/[?#]/)[0].trim();
  if (!value || value.startsWith("#") || /^(?:https?:|data:|blob:|mailto:|tel:|javascript:|\/\/)/i.test(value)) return null;
  const clean = value.startsWith("/") ? value.slice(1) : path.posix.join(path.posix.dirname(fromFile), value);
  const parts = [];
  for (const part of clean.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const resolved = resolveReference("index.html", match[1]);
  if (!resolved) continue;
  const target = path.resolve(dist, resolved);
  assertInside(dist, target);
  await lstat(target).catch(() => { throw new Error("Broken HTML asset reference: " + resolved); });
}

for (const match of html.matchAll(/srcset=["']([^"']+)["']/g)) {
  for (const candidate of match[1].split(",")) {
    const reference = candidate.trim().split(/\s+/)[0];
    const resolved = resolveReference("index.html", reference);
    if (!resolved) continue;
    const target = path.resolve(dist, resolved);
    assertInside(dist, target);
    await lstat(target).catch(() => { throw new Error("Broken HTML srcset reference: " + resolved); });
  }
}

for (const file of outputFiles.filter(file => /\.(?:css|js)$/i.test(file))) {
  const source = await readFile(path.join(dist, file), "utf8");
  const expression = file.endsWith(".css")
    ? /url\(\s*["']?([^"')]+)["']?\s*\)/gi
    : /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(expression)) {
    const reference = match[1].trim();
    if (file.endsWith(".js") && !reference.startsWith(".")) continue;
    const resolved = resolveReference(file, reference);
    if (!resolved) continue;
    const target = path.resolve(dist, resolved);
    assertInside(dist, target);
    await lstat(target).catch(() => { throw new Error("Broken local dependency in " + file + ": " + resolved); });
  }
}

const textFiles = outputFiles.filter(file => /\.(?:html|js|css|svg|txt)$/i.test(file));
const secretPatterns = [
  ["private key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i],
  ["service-role secret", /(?:SUPABASE_SERVICE_ROLE_KEY|service_role|service-role)\s*[:=]\s*["']\s*(?:eyJ|sb_secret_|[A-Za-z0-9_-]{24,})/i],
  ["provider secret", /(?:VERCEL_TOKEN|VERCEL_AUTOMATION_BYPASS_SECRET|TURNSTILE_SECRET_KEY|CLOUDFLARE_API_TOKEN|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["'][^"']{8,}["']/i],
  ["JWT-like credential", /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}/]
];
const findings = [];
for (const file of textFiles) {
  const source = await readFile(path.join(dist, file), "utf8");
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(source)) findings.push({ file, label });
  }
}
if (findings.length) {
  throw new Error("Secret-pattern scan failed: " + findings.map(item => item.file + " (" + item.label + ")").join(", "));
}

console.log("Static output audit: PASS");
console.log("Secret-pattern scan: PASS (" + textFiles.length + " text files scanned; no credential markers found)");
console.log("Static dependency manifest: PASS (" + allowed.size + " exact files)");
console.log("Public files (" + outputFiles.length + "):");
for (const file of outputFiles) console.log("  " + file);

