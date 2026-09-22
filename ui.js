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
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
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

export function toggleMobileMenu() { document.getElementById("mobileNav")?.classList.toggle("open"); }
export function closeMobileMenu() { document.getElementById("mobileNav")?.classList.remove("open"); }
export function reveal() {
    document.querySelectorAll(".reveal").forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight - 50) el.classList.add("active");
    });
}
export function initUiGlobalEvents() {
    window.addEventListener("scroll", reveal, { passive: true });
    reveal();
}
