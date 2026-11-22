import { copyFile, mkdir, readdir, readFile, lstat } from "node:fs/promises";
import path from "node:path";
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
  "public/images/hero-warm-gift-composition.png"
];
const licenseFile = "js/vendor/QRCODE-GENERATOR-LICENSE.txt";
const allowed = new Set([...rootFiles, ...cssFiles, ...jsFiles, ...assetFiles, licenseFile]);
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

for (const file of allowed) await addFile(file);
if (included.size !== allowed.size) throw new Error("Static manifest copy is incomplete.");

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
  "index.html", "css/hero-presentation.css", "public/images/hero-warm-gift-composition.png"
]) {
  if (!included.has(required)) throw new Error("Required public file missing: " + required);
}
const html = await readFile(path.join(dist, "index.html"), "utf8");
if (!html.includes("Created by Ba\u011f\u0131rov") || !html.includes("https://www.instagram.com/baghir0v.n/")) {
  throw new Error("Footer credit or Instagram link is missing.");
}
if (!html.includes("public/images/hero-warm-gift-composition.png")) {
  throw new Error("Preview hero image reference is missing.");
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

