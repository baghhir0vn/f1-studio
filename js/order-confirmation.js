import { state, ctx } from './state.js';
import { safeResourceUrl, safeHttpUrl } from './security.js';

const ORDER_STEPS = [
    ['pending_confirmation', 'Sifariş qəbul edildi'],
    ['confirmed', 'Təsdiqləndi'],
    ['preparing', 'Hazırlanır'],
    ['ready', 'Çatdırılmağa hazırdır'],
    ['shipped', 'Yola çıxıb'],
    ['completed', 'Təslim edildi']
];
const STATUS_LABELS = {
    pending_confirmation: 'Təsdiq gözləyir',
    confirmed: 'Təsdiqləndi',
    preparing: 'Hazırlanır',
    ready: 'Hazırdır',
    shipped: 'Göndərildi',
    completed: 'Çatdırıldı',
    cancelled: 'Ləğv edildi'
};
let currentOrderCode = '';
let currentWhatsAppUrl = '';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}
function money(cents) {
    const amount = Number(cents);
    if (!Number.isFinite(amount)) return '—';
    return amount.toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₼';
}
function formatOrderDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('az-AZ', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date);
}
function deliveryLabel(value) {
    return ({
        pickup: 'Mağazadan götürmə',
        ganja: 'Gəncə daxili çatdırılma',
        region: 'Rayonlara poçtla göndəriş'
    })[value] || 'Çatdırılma məlumatı sifarişdə dəqiqləşdirilir';
}
function itemCustomization(item) {
    const customization = item?.customization;
    if (!customization || typeof customization !== 'object') return '';
    const values = [
        customization.color && 'Rəng: ' + customization.color,
        customization.size && 'Ölçü: ' + customization.size + (customization.sizeValue ? ' (' + customization.sizeValue + ')' : ''),
        customization.text && 'Yazı: ' + customization.text
    ].filter(Boolean);
    return values.length
        ? '<small class="ocs-item-custom">' + values.map(escapeHtml).join(' · ') + '</small>'
        : '';
}
function renderItems(items) {
    if (!items.length) {
        return '<p class="ocs-empty-items">Məhsul detalları bu sessiyada göstərilə bilmir. Sifariş cəmi server tərəfindən təsdiqlənib.</p>';
    }
    return items.map(item => {
        const productName = escapeHtml(item.name || 'Fərdi məhsul');
        const quantity = Math.max(1, Math.floor(Number(item.qty) || 1));
        const lineCents = Math.max(0, Number(item.priceCents) || 0) * quantity;
        const imageUrl = safeResourceUrl(item.image, { allowRelative: true, allowData: false, allowBlob: false, maxLength: 2048 });
        const image = imageUrl
            ? '<img src="' + escapeHtml(imageUrl) + '" alt="" loading="lazy" decoding="async">'
            : '<span class="ocs-item-fallback" aria-hidden="true">F1</span>';
        return '<article class="ocs-item">' +
            '<span class="ocs-item-image">' + image + '</span>' +
            '<span class="ocs-item-copy"><b>' + productName + '</b>' +
            itemCustomization(item) +
            '<small>Miqdar: ' + quantity + '</small></span>' +
            '<b class="ocs-item-price">' + money(lineCents) + '</b>' +
            '</article>';
    }).join('');
}
function renderTimeline(status, createdAt) {
    if (status === 'cancelled') {
        return '<div class="ocs-cancelled" role="status"><span aria-hidden="true">!</span><div><b>Sifariş ləğv edilib</b><small>Ətraflı məlumat üçün dəstək ilə əlaqə saxlayın.</small></div></div>';
    }
    const currentIndex = ORDER_STEPS.findIndex(([key]) => key === status);
    const activeIndex = currentIndex < 0 ? 0 : currentIndex;
    const date = formatOrderDate(createdAt);
    return '<ol class="ocs-timeline">' + ORDER_STEPS.map(([key, label], index) => {
        const stateClass = index < activeIndex ? 'is-complete' : index === activeIndex ? 'is-current' : 'is-upcoming';
        const marker = index < activeIndex ? '✓' : index === activeIndex ? String(index + 1) : '•';
        const note = index === 0 && date ? date : index === activeIndex ? 'Cari mərhələ' : index < activeIndex ? 'Mərhələ tamamlanıb' : 'Növbəti mərhələ';
        return '<li class="ocs-step ' + stateClass + '"><span class="ocs-step-marker" aria-hidden="true">' + marker + '</span><span class="ocs-step-copy"><b>' + label + '</b><small>' + escapeHtml(note) + '</small></span></li>';
    }).join('') + '</ol>';
}
function renderOrderConfirmation(order, items, whatsappUrl) {
    const page = document.getElementById('orderConfirmationPage');
    const content = document.getElementById('orderConfirmationContent');
    if (!page || !content) return;
    const orderCode = String(order?.orderCode || '').trim();
    if (!orderCode) return;
    currentOrderCode = orderCode;
    currentWhatsAppUrl = safeHttpUrl(whatsappUrl);
    const status = String(order?.status || 'pending_confirmation');
    const statusLabel = STATUS_LABELS[status] || 'Status yenilənir';
    const totalCents = Number.isFinite(Number(order?.total_cents))
        ? Math.max(0, Number(order.total_cents))
        : Number.isFinite(Number(order?.total)) ? Math.max(0, Math.round(Number(order.total) * 100)) : NaN;
    const createdAt = order?.createdAt || '';
    const orderDate = formatOrderDate(createdAt);
    const itemList = Array.isArray(items) ? items.slice(0, 50) : [];
    const subtotal = itemList.reduce((sum, item) => sum + Math.max(0, Number(item.priceCents) || 0) * Math.max(1, Math.floor(Number(item.qty) || 1)), 0);
    const extra = Number.isFinite(totalCents) ? totalCents - subtotal : NaN;
    const showBreakdown = Number.isFinite(totalCents) && extra >= 0;
    const signedIn = !!state.authUser;
    const historyHref = signedIn ? '#account' : '#products';
    const historyLabel = signedIn ? 'Sifarişlərimə keç' : 'Mağazaya bax';
    const code = escapeHtml(orderCode);
    const waButton = currentWhatsAppUrl
        ? '<button type="button" class="ocs-button ocs-whatsapp-button" data-action="openOrderWhatsApp"><span aria-hidden="true">◉</span> WhatsApp-a yaz</button>'
        : '<span class="ocs-contact-unavailable">WhatsApp keçidi bu sifariş üçün mövcud deyil.</span>';

    content.innerHTML = '<div class="ocs-shell">' +
        '<div class="ocs-main-grid">' +
          '<section class="ocs-card ocs-success-card" aria-labelledby="ocsTitle">' +
            '<div class="ocs-success-heading">' +
              '<span class="ocs-success-mark" aria-hidden="true"><span>✓</span><i class="ocs-confetti c1"></i><i class="ocs-confetti c2"></i><i class="ocs-confetti c3"></i><i class="ocs-confetti c4"></i></span>' +
              '<div><p class="ocs-eyebrow">F1 STUDIO · SİFARİŞ TƏSDİQİ</p><h1 id="ocsTitle">Sifarişiniz qəbul edildi!</h1><p class="ocs-intro">Təşəkkür edirik. Sifarişiniz uğurla qeydə alındı və emal üçün növbəyə əlavə olundu.</p></div>' +
            '</div>' +
            '<div class="ocs-divider"></div>' +
            '<div class="ocs-code-block"><div><small>Sifariş nömrəniz</small><div class="ocs-code-line"><strong>' + code + '</strong><button type="button" class="ocs-copy" data-action="copyOrderCode" aria-label="Sifariş nömrəsini köçür" title="Köçür"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg></button></div></div><span id="ocsCopyStatus" class="ocs-copy-status" role="status" aria-live="polite"></span></div>' +
            (orderDate ? '<p class="ocs-order-date">Sifariş tarixi: ' + escapeHtml(orderDate) + '</p>' : '') +
            '<div class="ocs-preparation"><span class="ocs-preparation-icon" aria-hidden="true">◷</span><p>Sifarişiniz qeydə alındı. Hazırlanma və çatdırılma detallarını WhatsApp vasitəsilə sizinlə dəqiqləşdirəcəyik.</p></div>' +
            '<div class="ocs-actions"><a class="ocs-button ocs-primary" href="' + historyHref + '" data-action="closeOrderConfirmation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM8 7V4h8v3M8 12h8"></path></svg>' + historyLabel + '</a><a class="ocs-button ocs-secondary" href="#home" data-action="closeOrderConfirmation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6"></path></svg>Ana səhifəyə qayıt</a></div>' +
          '</section>' +
          '<aside class="ocs-card ocs-summary-card" aria-labelledby="ocsSummaryTitle"><div class="ocs-card-heading"><h2 id="ocsSummaryTitle">Sifariş xülasəsi</h2><span class="ocs-status-pill">' + escapeHtml(statusLabel) + '</span></div><div class="ocs-items">' + renderItems(itemList) + '</div>' +
            (showBreakdown ? '<div class="ocs-totals"><div><span>Ara məbləğ</span><b>' + money(subtotal) + '</b></div><div><span>Çatdırılma və əlavə seçimlər</span><b>' + money(extra) + '</b></div></div>' : '<p class="ocs-total-note">Yekun məbləğ serverdə hesablanıb.</p>') +
            '<div class="ocs-grand-total"><b>Ümumi məbləğ</b><strong>' + money(totalCents) + '</strong></div>' +
            '<dl class="ocs-order-details"><div><dt>Sifariş statusu</dt><dd>' + escapeHtml(statusLabel) + '</dd></div><div><dt>Çatdırılma</dt><dd>' + escapeHtml(deliveryLabel(order?.delivery)) + '</dd></div><div><dt>Hədiyyə qablaşdırması</dt><dd>' + (order?.giftWrap ? 'Var' : 'Yoxdur') + '</dd></div><div><dt>Ödəniş</dt><dd>WhatsApp-da dəqiqləşdiriləcək</dd></div></dl>' +
          '</aside>' +
        '</div>' +
        '<div class="ocs-contact-grid"><article class="ocs-card ocs-contact-card"><span class="ocs-contact-icon is-whatsapp" aria-hidden="true">◉</span><div><h2>WhatsApp ilə əlaqə</h2><p>Sifarişiniz barədə sualınız varsa, bizə WhatsApp vasitəsilə yazın.</p>' + waButton + '</div></article><article class="ocs-card ocs-contact-card"><span class="ocs-contact-icon is-support" aria-hidden="true">⌕</span><div><h2>Yardıma ehtiyacınız var?</h2><p>Müştəri dəstəyimiz sizə kömək etməyə hazırdır.</p><a class="ocs-button ocs-support-button" href="#about-contact" data-action="closeOrderConfirmation">Dəstəyə yaz</a></div></article></div>' +
        '<section class="ocs-card ocs-timeline-card" aria-labelledby="ocsTimelineTitle"><div class="ocs-card-heading"><div><p class="ocs-eyebrow">SİFARİŞİNİ İZLƏ</p><h2 id="ocsTimelineTitle">Sifarişinizin statusu</h2></div><span class="ocs-current-status">' + escapeHtml(statusLabel) + '</span></div>' + renderTimeline(status, createdAt) + '</section>' +
        '<section class="ocs-benefits" aria-label="F1 Studio üstünlükləri"><div><span class="ocs-benefit-icon" aria-hidden="true">◇</span><span><b>Təhlükəsiz sifariş</b><small>Məlumatlarınız qorunur</small></span></div><div><span class="ocs-benefit-icon" aria-hidden="true">↗</span><span><b>Rahat çatdırılma</b><small>Seçdiyiniz üsulla</small></span></div><div><span class="ocs-benefit-icon" aria-hidden="true">♡</span><span><b>Fərdi hədiyyələr</b><small>Sizə özəl hazırlanır</small></span></div><div><span class="ocs-benefit-icon" aria-hidden="true">⌕</span><span><b>Müştəri dəstəyi</b><small>Hər zaman yanınızdayıq</small></span></div></section>' +
      '</div>';
    page.hidden = false;
    document.body.classList.add('order-confirmation-active');
    if (window.location.hash !== '#order-success') window.location.hash = '#order-success';
    window.scrollTo({ top: 0, behavior: 'instant' });
}
function closeOrderConfirmation() {
    const page = document.getElementById('orderConfirmationPage');
    if (page) page.hidden = true;
    document.body.classList.remove('order-confirmation-active');
    currentOrderCode = '';
    currentWhatsAppUrl = '';
}
async function copyOrderCode() {
    if (!currentOrderCode) return;
    const status = document.getElementById('ocsCopyStatus');
    let copied = false;
    try {
        await navigator.clipboard.writeText(currentOrderCode);
        copied = true;
    } catch (_) {
        const input = document.createElement('textarea');
        input.value = currentOrderCode;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        try { copied = document.execCommand('copy'); } catch (_) {}
        input.remove();
    }
    if (status) status.textContent = copied ? 'Sifariş nömrəsi köçürüldü.' : 'Kopyalama alınmadı; nömrəni seçib köçürə bilərsiniz.';
}
function openOrderWhatsApp() {
    if (!currentWhatsAppUrl) return;
    window.open(currentWhatsAppUrl, '_blank', 'noopener,noreferrer');
}

export function initOrderConfirmation() {
    Object.assign(ctx, { showOrderConfirmation: renderOrderConfirmation, closeOrderConfirmation, copyOrderCode, openOrderWhatsApp });
    window.addEventListener('hashchange', () => {
        if (document.body.classList.contains('order-confirmation-active') && window.location.hash !== '#order-success') {
            closeOrderConfirmation();
        }
    });
    const page = document.getElementById('orderConfirmationPage');
    if (window.location.hash === '#order-success' && page) {
        window.location.hash = '#home';
    }
}
