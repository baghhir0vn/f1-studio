import { escapeHTML, money, showToast } from './ui.js';
import { state as s, ctx } from './state.js';
import { isCustomerDesignPathOwnedBy, safeResourceUrl } from './security.js';

const icons = {
    user: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.8-3.5 3-5.3 6.5-5.3s5.7 1.8 6.5 5.3"/>',
    orders: '<path d="M5 4h14l1 17H4L5 4Z"/><path d="M9 8a3 3 0 0 0 6 0M8 12h8"/>',
    heart: '<path d="M20.8 8.7c0 5-8.8 10-8.8 10s-8.8-5-8.8-10A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"/>',
    pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
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
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'
};

function icon(name, extra = '') {
    return `<svg class="${extra}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.box}</svg>`;
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
    const latestOrderPhone = orders.find(order => String(order.customer?.phone || '').trim())?.customer?.phone || '';
    const addressValue = String(latestAddressOrder?.address || '').trim();
    const lastDeliveryLabel = latestAddressOrder?.delivery === 'region' ? 'Rayonlar / poçt' : latestAddressOrder?.delivery === 'ganja' ? 'Gəncə daxili çatdırılma' : latestAddressOrder?.delivery === 'pickup' ? 'Mağazadan götürmə' : 'Çatdırılma məlumatı';
    const orderCount = s.accountOrdersLoadError ? '—' : s.accountOrdersFetched ? String(orders.length) : '—';
    const customCount = s.accountOrdersLoadError ? '—' : s.accountOrdersFetched ? String(customizationCount) : '—';
    const supportText = 'Müştəri dəstəyimiz hər zaman yanınızdadır.';

    page.innerHTML = `
      <div class="account-shell">
        <aside class="ac-sidebar" aria-label="Hesab menyusu">
          <section class="ac-profile-card" aria-label="Profil məlumatları">
            <div class="ac-avatar" aria-hidden="true">${escapeHTML(initials)}</div>
            <div class="ac-profile-copy"><b>${escapeHTML(name)}</b><span>${escapeHTML(email || 'E-poçt əlavə edilməyib')}</span></div>
          </section>
          <button class="ac-menu-toggle" type="button" data-action="toggleAccountMenu" aria-expanded="false" aria-controls="accountNavigation">Hesab menyusu ${icon('chevron')}</button>
          <nav class="ac-navigation" id="accountNavigation" aria-label="Hesab bölmələri">
            <button class="is-active" type="button" data-action="scrollAccountSection" data-action-args='["accountWelcome"]'>${icon('user')}<span>Ümumi məlumat</span></button>
            <button type="button" data-action="scrollAccountSection" data-action-args='["accountOrders"]'>${icon('orders')}<span>Sifarişlərim</span></button>
            <button type="button" data-action="accountOpenFavorites">${icon('heart')}<span>Favorilərim</span></button>
            <button type="button" data-action="scrollAccountSection" data-action-args='["accountDelivery"]'>${icon('pin')}<span>Ünvanlarım</span></button>
            <button type="button" data-action="showAccountNotice" data-action-args='["kart"]'>${icon('card')}<span>Kartlarım</span><small>Mövcud deyil</small></button>
            <button type="button" data-action="showAccountNotice" data-action-args='["kupon"]'>${icon('coupon')}<span>Kuponlarım</span><small>Mövcud deyil</small></button>
            <button type="button" data-action="scrollAccountSection" data-action-args='["accountOrders"]'>${icon('design')}<span>Fərdiləşdirmələrim</span></button>
            <button type="button" data-action="scrollAccountSection" data-action-args='["accountInformation"]'>${icon('user')}<span>Hesab məlumatları</span></button>
            <button type="button" data-action="accountChangePassword">${icon('lock')}<span>Şifrəni dəyiş</span></button>
            <button type="button" data-action="showAccountNotice" data-action-args='["bildiriş"]'>${icon('bell')}<span>Bildirişlər</span><small>Mövcud deyil</small></button>
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
            <button class="ac-stat-card ac-stat-green" type="button" data-action="showAccountNotice" data-action-args='["kupon"]'><span class="ac-stat-icon">${icon('coupon')}</span><span><small>Kuponlar</small><b>—</b><em>Kupon sistemi mövcud deyil</em></span></button>
          </section>

          <section class="ac-card ac-orders-card" id="accountOrders" aria-labelledby="accountOrdersTitle">
            <div class="ac-section-head"><div><span class="ac-eyebrow">SİFARİŞ TARİXÇƏSİ</span><h2 id="accountOrdersTitle">Son sifarişlərim</h2></div><button type="button" class="ac-text-link" data-action="toggleAllAccountOrders">${s.accountShowAllOrders ? 'Son 3 sifarişi göstər' : 'Hamısına bax'} ${icon('arrow')}</button></div>
            <div class="ac-order-list">${renderOrderRows()}</div>
          </section>

          <section class="ac-custom-card">
            <span class="ac-custom-art" aria-hidden="true"><span></span><i></i></span>
            <div><span class="ac-eyebrow">SİZƏ ÖZƏL DİZAYN</span><h2>Fərdiləşdir, daha xüsusi et!</h2><p>Sevdiklərinizə unikal və mənalı hədiyyələr yaratmaq üçün fərdi dizayn seçimlərindən istifadə edin.</p></div>
            <button class="ac-primary-button" type="button" data-action="accountStartCustomization">${icon('design')} Fərdiləşdir</button>
          </section>
        </div>

        <aside class="ac-details-column" aria-label="Hesab və çatdırılma məlumatları">
          <section class="ac-card ac-information-card" id="accountInformation">
            <div class="ac-section-head"><div><span class="ac-eyebrow">ŞƏXSİ MƏLUMATLAR</span><h2>Hesab məlumatları</h2></div><button class="ac-edit-button" type="button" disabled title="Profil redaktəsi üçün mövcud backend funksiyası yoxdur">Redaktə et</button></div>
            <div class="ac-info-row">${icon('user')}<span><small>Ad Soyad</small><b>${escapeHTML(name)}</b></span></div>
            <div class="ac-info-row">${icon('card')}<span><small>E-poçt</small><b>${escapeHTML(email || 'Məlumat əlavə edilməyib')}</b></span></div>
            <div class="ac-info-row">${icon('support')}<span><small>Telefon</small><b>${escapeHTML(phone || 'Məlumat əlavə edilməyib')}</b></span></div>
            <p class="ac-capability-note">Profil məlumatları hazırda hesabınızdan oxunur.</p>
          </section>

          <section class="ac-card ac-delivery-card" id="accountDelivery">
            <div class="ac-section-head"><div><span class="ac-eyebrow">SON SİFARİŞ</span><h2>Çatdırılma ünvanım</h2></div><button class="ac-edit-button" type="button" disabled title="Saxlanmış ünvanları redaktə edən ayrıca funksiya yoxdur">Redaktə et</button></div>
            <div class="ac-info-row">${icon('pin')}<span><small>${escapeHTML(lastDeliveryLabel)}</small><b>${escapeHTML(addressValue || 'Son sifarişdə ayrıca ünvan saxlanılmayıb')}</b></span></div>
            <div class="ac-info-row">${icon('support')}<span><small>Telefon</small><b>${escapeHTML(latestOrderPhone || phone || 'Məlumat yoxdur')}</b></span></div>
            <p class="ac-capability-note">Ünvanlar ayrıca saxlanmır; bu məlumat son sifarişdən götürülür.</p>
          </section>

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
    function accountOpenSupport() { window.location.hash = '#about-contact'; }
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

    window.addEventListener('hashchange', () => syncAccountRoute({ scroll: true }));
    Object.assign(ctx, { openAccountPage, syncAccountRoute, renderAccountDashboard, scrollAccountSection, toggleAccountMenu, refreshAccountOrders, toggleAllAccountOrders, accountOpenFavorites, accountStartCustomization, accountOpenSupport, accountChangePassword, showAccountNotice });
    syncAccountRoute();
}

