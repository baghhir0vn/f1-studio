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
    if (!input) return;
    const email = String(input.value || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        input.focus();
        showToast("Zəhmət olmasa düzgün email ünvanı daxil edin.");
        return;
    }
    const button = document.querySelector('[data-action="subscribeNewsletter"]');
    if (button) button.disabled = true;
    try {
        const result = await newsletterService.subscribe(email);
        input.value = "";
        showToast(result?.already_subscribed ? "✅ Bu email artıq abunədir." : "✅ Abunəliyiniz uğurla qəbul edildi.");
    } catch (error) {
        const code = String(error?.message || error?.code || "");
        if (code === "INVALID_NEWSLETTER_EMAIL") {
            showToast("Zəhmət olmasa düzgün email ünvanı daxil edin.");
        } else {
            showToast("Abunəlik yadda saxlanılmadı. Bir az sonra yenidən cəhd edin.");
            console.error("F1 newsletter error", error);
        }
    } finally {
        if (button) button.disabled = false;
    }
}

const THEME_KEY = "f1ThemeV2";
export function initTheme() {
    // V2 deliberately ignores legacy theme keys so old deployments cannot force dark mode.
    const saved = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", saved);
    updateThemeIcon(saved);
}
export function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeIcon(next);
}
export function updateThemeIcon(theme) {
    const btn = document.getElementById("themeToggleBtn");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

export function toggleMobileMenu() {
    const nav = document.getElementById("mobileNav");
    const btn = document.getElementById("mobileMenuBtn");
    if (!nav) return;
    const open = !nav.classList.contains("open");
    nav.classList.toggle("open", open);
    if (btn) {
        btn.setAttribute("aria-expanded", String(open));
        btn.setAttribute("aria-label", open ? "Menyunu bağla" : "Menyunu aç");
        btn.textContent = open ? "×" : "☰";
    }
}
export function closeMobileMenu() {
    const nav = document.getElementById("mobileNav");
    const btn = document.getElementById("mobileMenuBtn");
    nav?.classList.remove("open");
    if (btn) {
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-label", "Menyunu aç");
        btn.textContent = "☰";
    }
}
export function reveal() {
    document.querySelectorAll(".reveal").forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight - 50) el.classList.add("active");
    });
}
export function initUiGlobalEvents() {
    window.addEventListener("scroll", reveal, { passive: true });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeMobileMenu();
    });
    document.addEventListener("click", event => {
        const nav = document.getElementById("mobileNav");
        const btn = document.getElementById("mobileMenuBtn");
        if (!nav?.classList.contains("open")) return;
        if (nav.contains(event.target) || btn?.contains(event.target)) return;
        closeMobileMenu();
    });
    reveal();
}
