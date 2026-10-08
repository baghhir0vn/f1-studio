import { escapeHTML, money, showToast } from './ui.js';
import { state as s, ctx } from './state.js';
import { isCustomerDesignPathOwnedBy, isSafeCustomerAvatarPath, safeResourceUrl } from './security.js';
import { authService } from './services/auth-service.js';
import { storageService } from './services/storage-service.js';
import { CONFIG } from './config.js';

const icons = {
    user: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.8-3.5 3-5.3 6.5-5.3s5.7 1.8 6.5 5.3"/>',
    orders: '<path d="M5 4h14l1 17H4L5 4Z"/><path d="M9 8a3 3 0 0 0 6 0M8 12h8"/>',
    heart: '<path d="M20.8 8.7c0 5-8.8 10-8.8 10s-8.8-5-8.8-10A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"/>',
    pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    cart: '<path d="M3 4h2l2 11h10l3-8H6"/><circle cx="9" cy="19" r="1"/><circle cx="17" cy="19" r="1"/>',
    coupon: '<path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6V5Z"/><path d="M13 8v2m0 4v2"/>',
    design: '<path d="m4 16 9-9 4 4-9 9H4zM14 6l2-2 4 4-2 2"/>',
    bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v3"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M21 4v16"/>',
    box: '<path d="m12 3 9 4.8v8.4L12 21l-9-4.8V7.8L12 3Z"/><path d="m3.5 7.8 8.5 4.7 8.5-4.7M12 12.5V21"/>',
    support: '<path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13H3a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h3v-7H4zm16 0h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3v-7h2zm-4 8c-.7 1-2 1-4 1"/>',
    shield: '<path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7z"/><path d="m9 12 2 2 4-4"/>',
    truck: '<path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7.5" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    gift: '<path d="M20 12v8H4v-8M2 7h20v5H2zM12 7v13M12 7H8a2 2 0 1 1 2-2c0 1.1 2 2 2 2Zm0 0h4a2 2 0 1 0-2-2c0 1.1-2 2-2 2Z"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    camera: '<path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="12.5" r="3.2"/>'
};

function icon(name, extra = '') {
    return `<svg class="${extra}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.box}</svg>`;
}

const AVATAR_TEMPLATES = [
    { id: 'portrait-1', label: 'Meşə', bg: '#dce9df', skin: '#c88e70', hair: '#26352f', shirt: '#476b5d', hairPath: 'M19 35c0-13 8-21 21-21 15 0 22 8 22 22v5c-5-7-11-10-21-10-8 0-15 3-22 9z', detail: '' },
    { id: 'portrait-2', label: 'Səma', bg: '#dce8f6', skin: '#d19a7b', hair: '#3c4655', shirt: '#557b9c', hairPath: 'M18 36c0-16 9-23 22-23 14 0 22 8 22 23v5H18z', detail: '<path d="M21 28h38v7H21z" fill="#3c4655"/>' },
    { id: 'portrait-3', label: 'Günəş', bg: '#f3e3cf', skin: '#b8795e', hair: '#46352d', shirt: '#a56b46', hairPath: 'M18 38c-2-15 8-26 22-26 15 0 25 11 22 27l-5-5-4 5-5-6-5 6-5-6-5 6-5-6z', detail: '' },
    { id: 'portrait-4', label: 'Lavanda', bg: '#ece3f5', skin: '#d5a486', hair: '#292b39', shirt: '#66527e', hairPath: 'M19 37c0-16 8-24 22-24s22 9 22 24v6H19z', detail: '<circle cx="32" cy="42" r="4" fill="none" stroke="#313447" stroke-width="2"/><circle cx="48" cy="42" r="4" fill="none" stroke="#313447" stroke-width="2"/><path d="M36 42h8" stroke="#313447" stroke-width="2"/>' },
    { id: 'portrait-5', label: 'Dəniz', bg: '#d8eeec', skin: '#d29b7d', hair: '#313b43', shirt: '#2e7777', hairPath: 'M19 35c0-14 8-22 22-22 15 0 23 9 22 24-6-7-13-10-22-10-8 0-15 3-22 8z', detail: '<path d="M14 39a27 27 0 0 1 54 0" fill="none" stroke="#273a42" stroke-width="3"/>' },
    { id: 'portrait-6', label: 'Qrafit', bg: '#e2e4e8', skin: '#bd8468', hair: '#24272d', shirt: '#555b66', hairPath: 'M18 38c0-16 8-25 23-25s23 9 23 25H18z', detail: '<path d="M20 31c4-11 11-16 21-16 11 0 18 5 22 16" fill="none" stroke="#39404a" stroke-width="4"/>' }
];
const AVATAR_TEMPLATE_IDS = new Set(AVATAR_TEMPLATES.map(item => item.id));
let avatarPickerOpen = false;
let avatarUpdateInProgress = false;
let avatarSignedUrlCache = { path: '', userId: '', url: '', expiresAt: 0 };

function avatarTemplateSvg(id = AVATAR_TEMPLATES[0].id, className = '') {
    const item = AVATAR_TEMPLATES.find(template => template.id === id) || AVATAR_TEMPLATES[0];
    return `<svg class="${className}" viewBox="0 0 80 80" role="img" aria-label="${item.label} profil şablonu" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="${item.bg}"/>
      <path d="M9 82c2-17 13-26 31-26s29 9 31 26" fill="${item.shirt}"/>
      <path d="M32 52h16v12H32z" fill="${item.skin}"/>
      <ellipse cx="40" cy="39" rx="20" ry="23" fill="${item.skin}"/>
      <path d="${item.hairPath}" fill="${item.hair}"/>
      ${item.detail}
      <circle cx="33" cy="42" r="1.6" fill="#282b2e"/><circle cx="47" cy="42" r="1.6" fill="#282b2e"/>
      <path d="M36 50q4 3 8 0" fill="none" stroke="#754d42" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
}

function accountAvatarMarkup(user) {
    const templateId = AVATAR_TEMPLATE_IDS.has(user.avatar_template) ? user.avatar_template : AVATAR_TEMPLATES[0].id;
    const safePath = isSafeCustomerAvatarPath(user.avatar_path, user.id) ? user.avatar_path : '';
    const alt = escapeHTML(user.name || 'Profil şəkli');
    return `<div class="ac-avatar-editor">
      <div class="ac-avatar-shell">
        <span class="ac-avatar-fallback" data-avatar-fallback>${avatarTemplateSvg(templateId)}</span>
        <img class="ac-avatar-uploaded" data-account-avatar-image data-avatar-path="${escapeHTML(safePath)}" alt="${alt}" hidden>
        <button type="button" class="ac-avatar-edit" data-action="toggleAvatarPicker" aria-label="Profil şəklini dəyiş" aria-expanded="${avatarPickerOpen ? 'true' : 'false'}" title="Profil şəklini dəyiş">${icon('camera')}</button>
      </div>
      <div class="ac-avatar-picker" data-avatar-picker ${avatarPickerOpen ? '' : 'hidden'}>
        <div class="ac-avatar-picker-head"><div><b>Profil şəklini seç</b><small>Öz şəklini yüklə və ya şablon seç</small></div><button type="button" data-action="toggleAvatarPicker" aria-label="Bağla">×</button></div>
        <button type="button" class="ac-avatar-upload-button" data-action="chooseAccountAvatarFile" ${avatarUpdateInProgress ? 'disabled' : ''}>${icon('image')} Şəkil yüklə</button>
        <input id="accountAvatarFile" class="ac-avatar-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Profil şəkli seç" hidden>
        <div class="ac-avatar-template-grid" role="group" aria-label="Unisex profil şablonları">
          ${AVATAR_TEMPLATES.map(item => `<button type="button" class="ac-avatar-template ${item.id === templateId && !safePath ? 'is-selected' : ''}" data-action="selectAccountAvatarTemplate" data-action-args='["${item.id}"]' aria-pressed="${item.id === templateId && !safePath ? 'true' : 'false'}" title="${item.label}" ${avatarUpdateInProgress ? 'disabled' : ''}>${avatarTemplateSvg(item.id)}<span>${item.label}</span></button>`).join('')}
        </div>
        <p class="ac-avatar-file-note">JPG, PNG və ya WebP · maksimum 5 MB</p>
      </div>
    </div>`;
}

function createAvatarUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function prepareAvatarImage(file) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!file || !allowed.has(String(file.type || '').toLowerCase())) throw new Error('AVATAR_FILE_TYPE');
    if (Number(file.size) > 5 * 1024 * 1024) throw new Error('AVATAR_FILE_SIZE');
    if (typeof createImageBitmap !== 'function') throw new Error('AVATAR_IMAGE_UNSUPPORTED');
    const bitmap = await createImageBitmap(file);
    try {
        if (!bitmap.width || !bitmap.height || bitmap.width > 12000 || bitmap.height > 12000) throw new Error('AVATAR_DIMENSIONS');
        for (const size of [512, 384, 256]) {
            const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
            const width = Math.max(1, Math.round(bitmap.width * scale));
            const height = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { alpha: false });
            if (!context) throw new Error('AVATAR_CANVAS');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, width, height);
            context.drawImage(bitmap, 0, 0, width, height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', size === 512 ? 0.8 : 0.72));
            if (blob && blob.type === 'image/webp' && blob.size <= 512 * 1024) {
                return new File([blob], 'profile-avatar.webp', { type: 'image/webp', lastModified: Date.now() });
            }
        }
        throw new Error('AVATAR_FILE_TOO_LARGE');
    } finally {
        bitmap.close?.();
    }
}

async function renderUploadedAvatar(user) {
    const path = user?.avatar_path;
    if (!isSafeCustomerAvatarPath(path, user?.id)) return;
    const image = document.querySelector('#accountPage [data-account-avatar-image]');
    if (!image || image.dataset.avatarPath !== path) return;
    try {
        const cached = avatarSignedUrlCache;
        const signedUrl = cached.path === path && cached.userId === user.id && cached.expiresAt > Date.now() + 60000
            ? cached.url
            : await storageService.createCustomerAvatarSignedUrl(path, user.id, 3600);
        if (!image.isConnected || image.dataset.avatarPath !== path || !signedUrl) return;
        avatarSignedUrlCache = { path, userId: user.id, url: signedUrl, expiresAt: Date.now() + 3500000 };
        image.src = signedUrl;
        image.hidden = false;
        const fallback = image.parentElement?.querySelector('[data-avatar-fallback]');
        if (fallback) fallback.hidden = true;
    } catch (_) {
        image.hidden = true;
    }
}

function orderStatus(status) {
    const labels = {
        pending_confirmation: 'Təsdiq gözləyir', confirmed: 'Təsdiqləndi', preparing: 'Hazırlanır',
        ready: 'Hazırdır', shipped: 'Göndərildi', completed: 'Çatdırıldı', cancelled: 'Ləğv edildi'
    };
    const classes = {
        pending_confirmation: 'pending', confirmed: 'confirmed', preparing: 'preparing',
        ready: 'ready', shipped: 'shipped', completed: 'completed', cancelled: 'cancelled'
    };
    return { label: labels[status] || 'Status yenilənir', className: classes[status] || 'pending' };
}

function productForOrderItem(item) {
    const id = Number(item?.productId);
    return (Array.isArray(s.products) ? s.products : []).find(product => Number(product?.id) === id) || null;
}

function imageForOrderItem(item) {
    const product = productForOrderItem(item);
    const source = safeResourceUrl(product?.image || product?.image_url || product?.imageUrl || '');
    if (!source) return `<span class="ac-order-thumb-empty">${icon('image')}</span>`;
    return `<span class="ac-order-thumb-empty" hidden>${icon('image')}</span><img class="ac-order-thumb" src="${escapeHTML(source)}" alt="${escapeHTML(item?.name || product?.name || 'Məhsul')}" loading="lazy" decoding="async">`;
}

function customDetails(item) {
    const custom = item?.customization;
    if (!custom || typeof custom !== 'object') return '';
    const values = [custom.text && `Yazı: ${custom.text}`, custom.color && `Rəng: ${custom.color}`, custom.size && `Ölçü: ${custom.sizeValue ? `${custom.size} (${custom.sizeValue})` : custom.size}`, custom.font && `Şrift: ${custom.font}`, custom.note && `Qeyd: ${custom.note}`].filter(Boolean);
    return values.length ? `<small class="ac-order-custom">${values.map(escapeHTML).join(' · ')}</small>` : '';
}

function renderOrderRows() {
    if (!s.authUser) return '<div class="ac-empty"><b>Sifariş tarixçəsi üçün hesaba daxil olun.</b><button class="ac-text-link" type="button" data-action="openLogin">Giriş et</button></div>';
    if (!s.accountOrdersFetched) return '<div class="ac-order-skeletons" aria-label="Sifarişlər yüklənir"><i></i><i></i><i></i></div>';
    if (s.accountOrdersLoadError) return '<div class="ac-empty"><b>Sifarişlər yüklənmədi.</b><span>Bağlantını yoxlayıb yenidən cəhd edin.</span><button class="ac-text-link" type="button" data-action="refreshAccountOrders">Yenidən yoxla</button></div>';
    const allOrders = Array.isArray(s.orders) ? s.orders : [];
    const orders = s.accountShowAllOrders ? allOrders : allOrders.slice(0, 3);
    if (!orders.length) return '<div class="ac-empty"><b>Sifarişiniz yoxdur</b><span>İlk hədiyyənizi seçmək üçün mağazaya baxın.</span><button class="ac-text-link" type="button" data-action="accountStartCustomization">Mağazaya bax</button></div>';
    const rows = orders.map(order => {
        const code = escapeHTML(order.orderCode || order.order_code || '');
        const created = order.createdAt ? new Date(order.createdAt) : null;
        const date = created && Number.isFinite(created.getTime()) ? escapeHTML(created.toLocaleString('az-AZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })) : 'Tarix yoxdur';
        const items = Array.isArray(order.items) ? order.items : [];
        const qty = items.reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0);
        const status = orderStatus(order.status);
        const itemRows = items.map(item => `<div class="ac-order-product">${imageForOrderItem(item)}<span class="ac-order-product-copy"><b>${escapeHTML(item.name || 'Məhsul')}</b><small>${Math.max(1, Number(item.qty) || 1)} məhsul</small>${customDetails(item)}</span><span class="ac-order-product-price">${money(Number(item.price) * Math.max(1, Number(item.qty) || 1))}</span></div>`).join('');
        const designs = items.flatMap(item => item.customization?.imagePath && isCustomerDesignPathOwnedBy(item.customization.imagePath, s.authUser?.id)
            ? [`<button type="button" class="ac-text-link" data-action="openCustomerDesign" data-action-args='${escapeHTML(JSON.stringify([item.customization.imagePath]))}'>Dizayn faylına bax</button>`] : []).join('');
        return `<details class="ac-order-row"><summary><span class="ac-order-leading">${imageForOrderItem(items[0] || {})}<span><b>Sifariş #${code}</b><small>${date} · ${qty} məhsul</small></span></span><span class="ac-order-status ac-status-${status.className}">${escapeHTML(status.label)}</span><b class="ac-order-total">${money((Number(order.total_cents) || 0) / 100)}</b>${icon('chevron', 'ac-order-chevron')}</summary><div class="ac-order-detail">${itemRows || '<span class="ac-muted">Məhsul məlumatı yoxdur.</span>'}<div class="ac-order-detail-footer">${designs}<button type="button" class="ac-text-link" data-action="openOrderWhatsApp" data-action-args='${escapeHTML(JSON.stringify([order.orderCode || order.order_code || '']))}'>Sifariş barədə soruş</button></div></div></details>`;
    }).join('');
    return rows;
}

function renderAccountDashboard() {
    const page = document.getElementById('accountPage');
    if (!page || page.hidden) return;
    const user = s.authUser;
    if (!user && !s.accountAuthResolved) {
        page.innerHTML = '<div class="ac-guest-card" role="status" aria-busy="true"><span class="ac-guest-icon">' + icon('user') + '</span><h1>Hesab yüklənir</h1><p>Hesab məlumatları yoxlanılır.</p></div>';
        return;
    }
    if (!user) {
        page.innerHTML = `<div class="ac-guest-card"><span class="ac-guest-icon">${icon('user')}</span><h1>Hesabınıza daxil olun</h1><p>Sifarişlərinizi və hesab məlumatlarınızı görmək üçün giriş edin.</p><button class="ac-primary-button" type="button" data-action="openLogin">Giriş et ${icon('arrow')}</button></div>`;
        return;
    }

    const name = String(user.name || '').trim() || 'İstifadəçi';
    const email = String(user.email || '').trim();
    const phone = String(user.phone || '').trim();
    const initials = name.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toLocaleUpperCase('az-AZ') || 'F1';
    const orders = Array.isArray(s.orders) ? s.orders : [];
    const favoriteCount = new Set((Array.isArray(s.favs) ? s.favs : []).map(String)).size;
    const customizationCount = orders.reduce((sum, order) => sum + (Array.isArray(order.items) ? order.items.filter(item => item.customization && typeof item.customization === 'object' && Object.values(item.customization).some(value => value != null && String(value).trim() !== '')).length : 0), 0);
    const latestAddressOrder = orders.find(order => String(order.address || '').trim() && !order.addressUnknown);
    const latestDeliveryOrder = orders.find(order => String(order.delivery || '').trim()) || orders[0] || null;
    const addressValue = String(latestAddressOrder?.address || '').trim();
    const addressSummary = !s.accountOrdersFetched
        ? 'Sifariş ünvanları yüklənir.'
        : s.accountOrdersLoadError
            ? 'Ünvan məlumatı yüklənmədi.'
            : addressValue || 'Son sifarişdə ayrıca ünvan saxlanılmayıb';
    const lastDeliveryLabel = latestDeliveryOrder?.delivery === 'region' ? 'Rayonlar / poçt' : latestDeliveryOrder?.delivery === 'ganja' ? 'Gəncə daxili çatdırılma' : latestDeliveryOrder?.delivery === 'pickup' ? 'Mağazadan götürmə' : latestDeliveryOrder ? 'Çatdırılma məlumatı' : 'Məlumat yoxdur';
    const orderCount = s.accountOrdersLoadError ? '—' : s.accountOrdersFetched ? String(orders.length) : '—';
    const customCount = s.accountOrdersLoadError ? '—' : s.accountOrdersFetched ? String(customizationCount) : '—';
    const cartCount = Array.isArray(s.cart) ? s.cart.reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0) : 0;
    const notificationMarkup = !s.accountOrdersFetched
        ? '<div class="ac-empty" role="status"><b>Sifariş məlumatları yüklənir.</b><span>Bir az gözləyin.</span></div>'
        : s.accountOrdersLoadError
            ? '<div class="ac-empty" role="status"><b>Sifariş yenilikləri yüklənmədi.</b><span>Bağlantını yoxlayıb yenidən cəhd edin.</span><button class="ac-text-link" type="button" data-action="refreshAccountOrders">Yenidən yoxla</button></div>'
            : !orders.length
                ? '<div class="ac-empty"><b>Hələ bildiriş yoxdur.</b><span>Sifarişlərinizin status yenilikləri burada görünəcək.</span></div>'
                : orders.slice(0, 5).map(order => {
                    const code = escapeHTML(order.orderCode || order.order_code || 'Sifariş');
                    const status = orderStatus(order.status);
                    const created = order.createdAt ? new Date(order.createdAt) : null;
                    const date = created && Number.isFinite(created.getTime())
                        ? created.toLocaleString('az-AZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : 'Tarix yoxdur';
                    return '<article class="ac-notification-row"><span class="ac-notification-icon">' + icon('bell') + '</span><span class="ac-notification-copy"><b>Sifariş #' + code + '</b><small>' + escapeHTML(date) + '</small></span><span class="ac-order-status ac-status-' + status.className + '">' + escapeHTML(status.label) + '</span></article>';
                }).join('');
    const supportText = 'Müştəri dəstəyimiz hər zaman yanınızdadır.';

    page.innerHTML = `
      <div class="account-shell">
        <aside class="ac-sidebar" aria-label="Hesab menyusu">
          <section class="ac-profile-card" aria-label="Profil məlumatları">
            ${accountAvatarMarkup(user)}
            <div class="ac-profile-copy"><b>${escapeHTML(name)}</b><span>${escapeHTML(email || 'E-poçt əlavə edilməyib')}</span></div>
          </section>
          <button class="ac-menu-toggle" type="button" data-action="toggleAccountMenu" aria-expanded="false" aria-controls="accountNavigation">Hesab menyusu ${icon('chevron')}</button>
          <nav class="ac-navigation" id="accountNavigation" aria-label="Hesab bölmələri">
            <button class="is-active" type="button" data-action="scrollAccountSection" data-action-args='["accountWelcome"]'>${icon('user')}<span>Ümumi məlumat</span></button>
            <button type="button" data-action="scrollAccountSection" data-action-args='["accountOrders"]'>${icon('orders')}<span>Sifarişlərim</span></button>
            <button type="button" data-action="accountOpenFavorites">${icon('heart')}<span>Favorilərim</span></button>
            <button type="button" data-action="scrollAccountSection" data-action-args='["accountAddresses"]'>${icon('pin')}<span>Ünvanlarım</span></button>
            <button type="button" data-action="scrollAccountSection" data-action-args='["accountOrders"]'>${icon('design')}<span>Fərdiləşdirmələrim</span></button>
            <button type="button" data-action="scrollAccountSection" data-action-args='["accountInformation"]'>${icon('user')}<span>Hesab məlumatları</span></button>
            <button type="button" data-action="accountChangePassword">${icon('lock')}<span>Şifrəni dəyiş</span></button>
            <button type="button" data-action="scrollAccountSection" data-action-args='["accountNotifications"]'>${icon('bell')}<span>Bildirişlər</span></button>
            <button class="ac-logout-link" type="button" data-action="logoutProfile">${icon('logout')}<span>Çıxış et</span></button>
          </nav>
        </aside>

        <div class="ac-main-column">
          <section class="ac-welcome" id="accountWelcome">
            <div><span class="ac-eyebrow">HESABIM</span><h1>Xoş gəlmisiniz, ${escapeHTML(name.split(/\s+/)[0])}!</h1><p>Hesabınızdan sifarişlərinizi izləyin, ünvanlarınızı idarə edin və fərdiləşdirmələrinizi görün.</p></div>
            <span class="ac-welcome-mark">F1</span>
          </section>
          <section class="ac-stats" aria-label="Hesab statistikası">
            <button class="ac-stat-card ac-stat-red" type="button" data-action="scrollAccountSection" data-action-args='["accountOrders"]'><span class="ac-stat-icon">${icon('orders')}</span><span><small>Sifarişlər</small><b>${orderCount}</b><em>Hamısına bax ${icon('arrow')}</em></span></button>
            <button class="ac-stat-card ac-stat-pink" type="button" data-action="accountOpenFavorites"><span class="ac-stat-icon">${icon('heart')}</span><span><small>Favorilər</small><b>${favoriteCount}</b><em>Hamısına bax ${icon('arrow')}</em></span></button>
            <button class="ac-stat-card ac-stat-purple" type="button" data-action="scrollAccountSection" data-action-args='["accountOrders"]'><span class="ac-stat-icon">${icon('design')}</span><span><small>Fərdiləşdirmə</small><b>${customCount}</b><em>Sifarişlərdə saxlanıb</em></span></button>
            <button class="ac-stat-card ac-stat-green" type="button" data-action="openCart"><span class="ac-stat-icon">${icon('cart')}</span><span><small>Səbətdə</small><b>${cartCount}</b><em>Səbətə bax ${icon('arrow')}</em></span></button>
          </section>

          <section class="ac-card ac-orders-card" id="accountOrders" aria-labelledby="accountOrdersTitle">
            <div class="ac-section-head"><div><span class="ac-eyebrow">SİFARİŞ TARİXÇƏSİ</span><h2 id="accountOrdersTitle">Son sifarişlərim</h2></div><button type="button" class="ac-text-link" data-action="toggleAllAccountOrders">${s.accountShowAllOrders ? 'Son 3 sifarişi göstər' : 'Hamısına bax'} ${icon('arrow')}</button></div>
            <div class="ac-order-list">${renderOrderRows()}</div>
            <div class="ac-order-delivery" id="accountDelivery" aria-label="Son sifarişin çatdırılma məlumatı"><span class="ac-order-delivery-icon">${icon('truck')}</span><span><small>Son sifarişin çatdırılma üsulu</small><b>${escapeHTML(s.accountOrdersFetched && !s.accountOrdersLoadError ? lastDeliveryLabel : s.accountOrdersLoadError ? 'Məlumat yüklənmədi' : 'Sifariş məlumatları yüklənir')}</b></span></div>
          </section>

          <div class="ac-account-data-grid">
            <section class="ac-card ac-information-card" id="accountInformation" aria-labelledby="accountInformationTitle">
              <div class="ac-section-head"><div><span class="ac-eyebrow">ŞƏXSİ MƏLUMATLAR</span><h2 id="accountInformationTitle">Hesab məlumatları</h2></div><button class="ac-edit-button" type="button" disabled title="Profil redaktəsi üçün mövcud backend funksiyası yoxdur">Redaktə et</button></div>
              <div class="ac-info-row">${icon('user')}<span><small>Ad Soyad</small><b>${escapeHTML(name)}</b></span></div>
              <div class="ac-info-row">${icon('card')}<span><small>E-poçt</small><b>${escapeHTML(email || 'Məlumat əlavə edilməyib')}</b></span></div>
              <div class="ac-info-row">${icon('support')}<span><small>Telefon</small><b>${escapeHTML(phone || 'Məlumat əlavə edilməyib')}</b></span></div>
              <p class="ac-capability-note">Məlumatlar profilinizdən oxunur.</p>
            </section>

            <section class="ac-card ac-address-card" id="accountAddresses" aria-labelledby="accountAddressesTitle">
              <div class="ac-section-head"><div><span class="ac-eyebrow">ÇATDIRILMA ÜNVANLARI</span><h2 id="accountAddressesTitle">Ünvanlarım</h2></div></div>
              <div class="ac-info-row">${icon('pin')}<span><small>Son sifarişdəki ünvan</small><b>${escapeHTML(addressSummary)}</b></span></div>
              <p class="ac-capability-note">Ünvanlar ayrıca saxlanılmır; bu məlumat son sifarişdən götürülür.</p>
            </section>
          </div>

          <section class="ac-card ac-notifications-card" id="accountNotifications" aria-labelledby="accountNotificationsTitle">
            <div class="ac-section-head"><div><span class="ac-eyebrow">SİFARİŞ YENİLİKLƏRİ</span><h2 id="accountNotificationsTitle">Bildirişlər</h2></div><button type="button" class="ac-text-link" data-action="refreshAccountOrders">Yenilə ${icon('arrow')}</button></div>
            <p class="ac-notification-intro">Sifarişlərinizin cari statusu və tarixçəsi burada göstərilir.</p>
            <div class="ac-notification-list" aria-live="polite">${notificationMarkup}</div>
          </section>

          <section class="ac-custom-card">
            <span class="ac-custom-art" aria-hidden="true"><span></span><i></i></span>
            <div><span class="ac-eyebrow">SİZƏ ÖZƏL DİZAYN</span><h2>Fərdiləşdir, daha xüsusi et!</h2><p>Sevdiklərinizə unikal və mənalı hədiyyələr yaratmaq üçün fərdi dizayn seçimlərindən istifadə edin.</p></div>
            <button class="ac-primary-button" type="button" data-action="accountStartCustomization">${icon('design')} Fərdiləşdir</button>
          </section>
        </div>

        <aside class="ac-details-column" aria-label="F1 Studio dəstəyi">
          <section class="ac-card ac-support-card">
            <span class="ac-support-icon">${icon('support')}</span><span class="ac-eyebrow">F1 STUDIO DƏSTƏYİ</span><h2>Yardıma ehtiyacınız var?</h2><p>${supportText}</p><button type="button" class="ac-outline-button" data-action="accountOpenSupport">${icon('support')} Dəstək ilə əlaqə</button>
          </section>
        </aside>

        <section class="ac-benefits" aria-label="F1 Studio üstünlükləri">
          <article>${icon('shield')}<span><b>100% Təhlükəsiz ödəniş</b><small>Sifariş məlumatlarınız qorunur</small></span></article>
          <article>${icon('truck')}<span><b>Sürətli çatdırılma</b><small>1–3 iş günü ərzində</small></span></article>
          <article>${icon('gift')}<span><b>Fərdiləşdirilə bilən hədiyyələr</b><small>Tam sizə özəl</small></span></article>
          <article>${icon('support')}<span><b>Müştəri dəstəyi</b><small>Hər zaman yanınızdayıq</small></span></article>
        </section>
      </div>`;
    page.querySelectorAll('.ac-order-row img.ac-order-thumb').forEach(image => {
        image.addEventListener('error', () => {
            image.hidden = true;
            const placeholder = image.previousElementSibling;
            if (placeholder) placeholder.hidden = false;
        }, { once: true });
    });
    void renderUploadedAvatar(user);
}

export function initAccountPage() {
    const page = document.getElementById('accountPage');
    if (!page) return;

    function syncAccountRoute({ scroll = false } = {}) {
        const active = decodeURIComponent(window.location.hash.replace(/^#/, '')).toLocaleLowerCase('az-AZ') === 'account';
        document.body.classList.toggle('f1-account-route', active);
        page.hidden = !active;
        page.setAttribute('aria-hidden', String(!active));
        if (active) {
            renderAccountDashboard();
            if (scroll) window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }
    }

    function openAccountPage() {
        if (!s.authUser) { ctx.openLogin?.(); return; }
        if (window.location.hash !== '#account') window.location.hash = '#account';
        else syncAccountRoute();
    }
    function scrollAccountSection(id) {
        const target = document.getElementById(id);
        if (!target) return;
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
        const nav = document.getElementById('accountNavigation');
        nav?.removeAttribute('data-open');
        document.querySelector('.ac-menu-toggle')?.setAttribute('aria-expanded', 'false');
    }
    function toggleAccountMenu() {
        const nav = document.getElementById('accountNavigation');
        const button = document.querySelector('.ac-menu-toggle');
        if (!nav || !button) return;
        const expanded = nav.getAttribute('data-open') !== 'true';
        nav.setAttribute('data-open', String(expanded));
        button.setAttribute('aria-expanded', String(expanded));
    }
    async function refreshAccountOrders() {
        await ctx.renderOrderHistory?.();
        renderAccountDashboard();
    }
    function toggleAllAccountOrders() {
        if ((Array.isArray(s.orders) ? s.orders.length : 0) <= 3) {
            scrollAccountSection('accountOrders');
            return;
        }
        s.accountShowAllOrders = !s.accountShowAllOrders;
        renderAccountDashboard();
        document.getElementById('accountOrders')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
    function accountOpenFavorites() {
        window.location.hash = '#products';
        window.setTimeout(() => ctx.showFavorites?.(), 80);
    }
    function accountStartCustomization() {
        window.location.hash = '#products';
        ctx.showAllProducts?.();
        showToast('Fərdiləşdirmək istədiyiniz məhsulu seçib “Fərdiləşdir” düyməsinə toxunun.');
    }
    function accountOpenSupport() {
        let digits = String(CONFIG.whatsappNumber || '').replace(/\D/g, '');
        if (digits.startsWith('00')) digits = digits.slice(2);
        else if (digits.startsWith('0')) digits = `994${digits.slice(1)}`;
        else if (digits.length === 9) digits = `994${digits}`;
        if (!/^\d{8,15}$/.test(digits)) {
            showToast('WhatsApp dəstək nömrəsi hazırda təyin edilməyib.');
            return;
        }
        const link = document.createElement('a');
        link.href = `https://wa.me/${digits}?text=${encodeURIComponent('Salam! F1 Studio ilə bağlı dəstəyə ehtiyacım var.')}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
    }
    function accountChangePassword() {
        const profileEmail = document.getElementById('profileEmail');
        if (profileEmail && s.authUser?.email) profileEmail.value = s.authUser.email;
        ctx.openDialog?.('loginModal', '#profileEmail');
        ctx.showForgotPassword?.();
    }
    function showAccountNotice(type) {
        const label = type === 'kart' ? 'Kart məlumatları' : type === 'kupon' ? 'Kuponlar' : 'Bildirişlər';
        showToast(`${label} üçün ayrıca hesab funksiyası hazırda mövcud deyil.`);
    }

    function toggleAvatarPicker() {
        if (avatarUpdateInProgress) return;
        avatarPickerOpen = !avatarPickerOpen;
        const picker = page.querySelector('[data-avatar-picker]');
        const toggle = page.querySelector('.ac-avatar-edit');
        if (picker) picker.hidden = !avatarPickerOpen;
        if (toggle) toggle.setAttribute('aria-expanded', String(avatarPickerOpen));
    }

    function chooseAccountAvatarFile() {
        if (avatarUpdateInProgress) return;
        page.querySelector('#accountAvatarFile')?.click();
    }

    async function saveAvatarTemplate(templateId) {
        if (!s.authUser?.id || !AVATAR_TEMPLATE_IDS.has(templateId)) return;
        if (avatarUpdateInProgress) return;
        avatarUpdateInProgress = true;
        renderAccountDashboard();
        const previousPath = s.authUser.avatar_path;
        try {
            const result = await authService.updateProfileAvatar({ avatarTemplate: templateId });
            s.authUser = result.user;
            s.profile = result.user;
            avatarPickerOpen = false;
            renderAccountDashboard();
            if (previousPath && isSafeCustomerAvatarPath(previousPath, s.authUser.id)) {
                await storageService.removeCustomerAvatar(previousPath, s.authUser.id).catch(() => {});
            }
            showToast('Profil şəkli yeniləndi.');
        } catch (_) {
            showToast('Profil şəkli saxlanmadı. Yenidən cəhd edin.');
        } finally {
            avatarUpdateInProgress = false;
            if (!page.hidden) renderAccountDashboard();
        }
    }

    async function uploadAccountAvatar(file) {
        if (!s.authUser?.id || avatarUpdateInProgress) return;
        const userId = s.authUser.id;
        const previousPath = s.authUser.avatar_path;
        avatarUpdateInProgress = true;
        renderAccountDashboard();
        try {
            const image = await prepareAvatarImage(file);
            const path = `avatars/${userId}/${createAvatarUuid()}.webp`;
            await storageService.uploadCustomerAvatar(path, image, userId);
            let result;
            try {
                result = await authService.updateProfileAvatar({ avatarPath: path });
            } catch (error) {
                await storageService.removeCustomerAvatar(path, userId).catch(() => {});
                throw error;
            }
            s.authUser = result.user;
            s.profile = result.user;
            avatarPickerOpen = false;
            renderAccountDashboard();
            if (previousPath && previousPath !== path && isSafeCustomerAvatarPath(previousPath, userId)) {
                await storageService.removeCustomerAvatar(previousPath, userId).catch(() => {});
            }
            showToast('Profil şəkli yükləndi.');
        } catch (error) {
            const message = error?.message;
            if (message === 'AVATAR_FILE_TYPE') showToast('JPG, PNG və ya WebP şəkli seçin.');
            else if (message === 'AVATAR_FILE_SIZE') showToast('Şəkil 5 MB-dan kiçik olmalıdır.');
            else showToast('Şəkil yüklənmədi. Bağlantını yoxlayıb yenidən cəhd edin.');
        } finally {
            avatarUpdateInProgress = false;
            if (!page.hidden) renderAccountDashboard();
        }
    }

    function onAvatarFileChange(event) {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.id !== 'accountAvatarFile') return;
        const file = input.files?.[0];
        input.value = '';
        if (file) void uploadAccountAvatar(file);
    }


    page.addEventListener('change', onAvatarFileChange);
    window.addEventListener('hashchange', () => syncAccountRoute({ scroll: true }));
    Object.assign(ctx, { openAccountPage, syncAccountRoute, renderAccountDashboard, scrollAccountSection, toggleAccountMenu, refreshAccountOrders, toggleAllAccountOrders, accountOpenFavorites, accountStartCustomization, accountOpenSupport, accountChangePassword, showAccountNotice, toggleAvatarPicker, chooseAccountAvatarFile, selectAccountAvatarTemplate: saveAvatarTemplate });
    syncAccountRoute();
}

