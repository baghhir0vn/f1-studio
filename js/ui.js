import { newsletterService } from './services/newsletter-service.js';

export function loadJSON(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch (_) { return fallback; }
}
export function persist(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) { showToast("Brauzer yaddaşına yazmaq alınmadı."); }
}
export function persistSession(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); }
    catch (_) { showToast("Sessiya yaddaşına yazmaq alınmadı."); }
}
export function loadSessionJSON(key, fallback) {
    try { const value = JSON.parse(sessionStorage.getItem(key)); return value ?? fallback; }
    catch (_) { return fallback; }
}
export function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
export function money(value) { return Number(value || 0).toFixed(2) + " ₼"; }
export function normalizeText(text) { return String(text || "").toLocaleLowerCase("az-AZ").trim(); }
export function phoneDigits(v) { return String(v || "").replace(/\D/g, ""); }
export function isValidPhone(v) { const d = phoneDigits(v); return d.length >= 9 && d.length <= 15; }
export function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    const text = String(msg ?? "");
    const isError = /❌|⚠️|alınmadı|alınmadı|səhv|xəta|tapılmadı|mümkün deyil|düzgün deyil|bloklandı|stokda yoxdur|icatə/i.test(text);
    const isSuccess = /✅|uğurla|əlavə olundu|yadda saxlanıldı|yeniləndi|göndərildi|açıldı|çıxıldı|təsdiqləndi/i.test(text);
    toast.classList.remove("toast-success", "toast-error", "toast-info", "show");
    toast.textContent = text;
    toast.classList.add(isError ? "toast-error" : isSuccess ? "toast-success" : "toast-info");
    requestAnimationFrame(() => toast.classList.add("show"));
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}
export async function subscribeNewsletter() {
    const input = document.getElementById("newsletterEmail");
    const button = document.getElementById("newsletterButton");
    if (!input || !button || button.disabled) return;
    const email = String(input.value || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        input.setAttribute("aria-invalid", "true");
        input.focus();
        showToast("❌ Zəhmət olmasa düzgün email ünvanı daxil edin.");
        return;
    }
    input.removeAttribute("aria-invalid");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
        const result = await newsletterService.subscribe(email);
        input.value = "";
        showToast(result?.already_subscribed || result?.alreadySubscribed
            ? "✅ Bu email artıq abunədir."
            : "✅ Abunəliyiniz uğurla qəbul edildi.");
    } catch (error) {
        const code = String(error?.code || "");
        const message = String(error?.message || "");
        if (code === "INVALID_NEWSLETTER_EMAIL") {
            input.setAttribute("aria-invalid", "true");
            showToast("❌ Zəhmət olmasa düzgün email ünvanı daxil edin.");
        } else if (code === "23505" || /already subscribed|already exists|duplicate key/i.test(message)) {
            showToast("✅ Bu email artıq abunədir.");
        } else {
            showToast("⚠️ Abunəlik hazırda yadda saxlanılmadı. Bir az sonra yenidən cəhd edin.");
            console.error("F1 newsletter error", error);
        }
    } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
    }
}
export function initTheme() {
    const saved = localStorage.getItem("f1Theme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", saved);
    updateThemeIcon(saved);
}
export function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("f1Theme", next);
    updateThemeIcon(next);
}
export function updateThemeIcon(theme) {
    const btn = document.getElementById("themeToggleBtn");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}
function syncMobileMenuButton(open) {
    const button = document.getElementById("mobileMenuBtn");
    if (!button) return;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Menyunu bağla" : "Menyunu aç");
}
export function toggleMobileMenu() {
    const nav = document.getElementById("mobileNav");
    if (!nav) return;
    syncMobileMenuButton(nav.classList.toggle("open"));
}
export function closeMobileMenu() {
    document.getElementById("mobileNav")?.classList.remove("open");
    syncMobileMenuButton(false);
}
export function reveal() {
    document.querySelectorAll(".reveal").forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight - 50) el.classList.add("active");
    });
}
export function initUiGlobalEvents() {
    window.addEventListener("scroll", reveal, { passive: true });
    reveal();
}
