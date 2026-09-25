const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const RESOURCE_PROTOCOLS = new Set(['http:', 'https:', 'blob:', 'data:']);
const ORDER_STATUSES = new Set(['pending_confirmation','confirmed','preparing','ready','shipped','completed','cancelled']);
const REVIEW_STATUSES = new Set(['pending','approved','rejected']);
const SAFE_ERROR_CODES = new Set([
    'AUTH_REQUIRED','ACCOUNT_BLOCKED','INVALID_AUTH_INPUT','INVALID_REVIEW','INVALID_ORDER_ITEMS','INVALID_ORDER',
    'ADDRESS_REQUIRED','OUT_OF_STOCK','PRODUCT_NOT_FOUND','CUSTOMER_NOT_FOUND','ADMIN_REQUIRED',
    'INVALID_CUSTOMER_ID','CANNOT_BLOCK_ADMIN','DESIGN_FILE_TYPE','DESIGN_FILE_TOO_LARGE',
    'DESIGN_UPLOAD_FAILED','DESIGN_FILE_NOT_FOUND','INVALID_DESIGN_PATH','INVALID_PRODUCT_IMAGE_PATH','IMAGE_ONLY','INVALID_PRODUCT','INVALID_STOCK_QUANTITY','INVALID_IMAGE_URL','IMAGE_LIMIT',
    'IMAGE_TOO_LARGE','STORAGE_UPLOAD_FAILED','IMAGE_URL_FAILED','DESIGN_SIGNED_URL_FAILED','INVALID_STORAGE_BUCKET','WHATSAPP_NOT_CONFIGURED','ORDER_RATE_LIMITED','ORDER_STATUS_TERMINAL','ORDER_NOT_FOUND','INVALID_NEWSLETTER_EMAIL'
]);

function parseUrl(value) {
    try { return new URL(String(value || '').trim(), window.location.href); }
    catch (_) { return null; }
}

export function safeHttpUrl(value, { allowRelative = false, maxLength = 2048 } = {}) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > maxLength) return '';
    const parsed = parseUrl(raw);
    if (!parsed) return '';
    if (allowRelative && (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) && parsed.origin === window.location.origin) {
        return parsed.pathname + parsed.search + parsed.hash;
    }
    if (!HTTP_PROTOCOLS.has(parsed.protocol)) return '';
    if (parsed.username || parsed.password) return '';
    return parsed.href;
}

export function safeResourceUrl(value, { allowData = false, allowBlob = false, allowRelative = true, maxLength = 2048 } = {}) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > maxLength) return '';
    const parsed = parseUrl(raw);
    if (!parsed) return '';
    if (allowRelative && (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) && parsed.origin === window.location.origin) {
        return parsed.pathname + parsed.search + parsed.hash;
    }
    if (!RESOURCE_PROTOCOLS.has(parsed.protocol)) return '';
    if (parsed.username || parsed.password) return '';
    if (parsed.protocol === 'data:' && !allowData) return '';
    if (parsed.protocol === 'blob:' && !allowBlob) return '';
    return parsed.href;
}

export function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export function isSafeCustomerDesignPath(path) {
    return /^orders\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$/i.test(String(path || ''));
}

export function isCustomerDesignPathOwnedBy(path, userId) {
    const cleanUserId = String(userId || '').trim();
    if (!isUuid(cleanUserId) || !isSafeCustomerDesignPath(path)) return false;
    return String(path).toLowerCase().startsWith(`orders/${cleanUserId.toLowerCase()}/`);
}

export function isSafeProductImagePath(path) {
    return /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/i.test(String(path || ''));
}


export function isSafeSiteContentPath(path) {
    return /^(categories|heroes)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/i.test(String(path || ''));
}


export function makeClientId(prefix = 'id') {
    try {
        if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    } catch (_) {}
    try {
        const bytes = new Uint8Array(16);
        if (globalThis.crypto?.getRandomValues) {
            globalThis.crypto.getRandomValues(bytes);
            const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
            return `${prefix}-${hex}`;
        }
    } catch (_) {}
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}


export function sanitizeDesignLayout(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const image = value.image && typeof value.image === 'object' ? value.image : {};
    const text = value.text && typeof value.text === 'object' ? value.text : {};
    const cleanNumber = (v, fallback, min, max) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    };
    const order = Array.isArray(value.order) ? value.order.filter(x => x === 'image' || x === 'text') : ['image','text'];
    const cleanOrder = [...new Set(order)];
    if (!cleanOrder.includes('image')) cleanOrder.unshift('image');
    if (!cleanOrder.includes('text')) cleanOrder.push('text');
    const align = ['left','center','right'].includes(text.align) ? text.align : 'center';
    return {
        version: 3,
        canvas: { width: 300, height: 240 },
        selected: value.selected === 'text' ? 'text' : 'image',
        order: cleanOrder,
        image: {
            x: Math.round(cleanNumber(image.x, 150, 10, 290)),
            y: Math.round(cleanNumber(image.y, 105, 10, 230)),
            scale: Number(cleanNumber(image.scale, 1, 0.25, 3).toFixed(2)),
            rotation: Math.round(cleanNumber(image.rotation, 0, -360, 360)),
            visible: image.visible !== false
        },
        text: {
            text: String(text.text || '').trim().slice(0, 80),
            x: Math.round(cleanNumber(text.x, 150, 10, 290)),
            y: Math.round(cleanNumber(text.y, 185, 10, 230)),
            scale: Number(cleanNumber(text.scale, 1, 0.5, 3).toFixed(2)),
            rotation: Math.round(cleanNumber(text.rotation, 0, -360, 360)),
            font: String(text.font || 'Klassik').slice(0, 40),
            color: String(text.color || '#111').slice(0, 20),
            fontSize: Math.round(cleanNumber(text.fontSize, 28, 12, 72)),
            align,
            visible: text.visible !== false
        }
    };
}

export function sanitizeStoredCart(value) {
    if (!Array.isArray(value)) return [];
    const seenLines = new Set();
    const out = [];
    for (const item of value.slice(0, 50)) {
        const id = Number(item?.id);
        const qty = Math.floor(Number(item?.qty));
        if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 99) continue;
        let lineId = String(item?.lineId || '').trim().slice(0, 120);
        if (!/^[A-Za-z0-9._:-]{1,120}$/.test(lineId) || seenLines.has(lineId)) {
            lineId = `legacy-${id}-${out.length}`;
        }
        seenLines.add(lineId);
        let customization = null;
        const c = item?.customization;
        if (c && typeof c === 'object' && !Array.isArray(c)) {
            customization = {
                text: String(c.text || '').trim().slice(0, 500),
                color: String(c.color || '').trim().slice(0, 40),
                size: String(c.size || '').trim().slice(0, 80),
                sizeValue: String(c.sizeValue || '').trim().slice(0, 120),
                font: String(c.font || '').trim().slice(0, 80),
                imageName: String(c.imageName || '').trim().slice(0, 180),
                imagePath: isSafeCustomerDesignPath(c.imagePath || '') ? String(c.imagePath).trim() : '',
                imageType: String(c.imageType || '').trim().slice(0, 80),
                imageSize: Number.isFinite(Number(c.imageSize)) ? Math.max(0, Math.min(10 * 1024 * 1024, Number(c.imageSize))) : 0,
                note: String(c.note || '').trim().slice(0, 1000),
                layout: sanitizeDesignLayout(c.layout)
            };
        }
        out.push({ id, qty, lineId, customization });
    }
    return out;
}

export function isSafePositiveInteger(value, max = 1000000000) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 && n <= max;
}

export function isAllowedOrderStatus(value) {
    return ORDER_STATUSES.has(String(value || ''));
}

export function isAllowedReviewStatus(value) {
    return REVIEW_STATUSES.has(String(value || ''));
}

export function safeErrorCode(error) {
    const code = String(error?.code || '').trim();
    if (SAFE_ERROR_CODES.has(code)) return code;
    const message = String(error?.message || error || '').trim();
    return SAFE_ERROR_CODES.has(message) ? message : 'REQUEST_FAILED';
}

export function safeUserError(error, fallback = 'Əməliyyat yerinə yetirilmədi.') {
    const code = safeErrorCode(error);
    const labels = {
        AUTH_REQUIRED: 'Hesaba giriş tələb olunur.',
        INVALID_AUTH_INPUT: 'Giriş məlumatları düzgün deyil.',
        ACCOUNT_BLOCKED: 'Bu hesab bloklanıb.',
        INVALID_REVIEW: 'Rəy məlumatları düzgün deyil.',
        INVALID_PRODUCT: 'Məhsul məlumatları düzgün deyil.',
        INVALID_STOCK_QUANTITY: 'Stok miqdarı düzgün deyil.',
        INVALID_IMAGE_URL: 'Şəkil ünvanı düzgün deyil.',
        IMAGE_LIMIT: 'Şəkil limiti aşılıb.',
        INVALID_ORDER_ITEMS: 'Sifariş məlumatları düzgün deyil.',
        INVALID_ORDER: 'Sifariş məlumatları düzgün deyil.',
        ADDRESS_REQUIRED: 'Çatdırılma ünvanı tələb olunur.',
        OUT_OF_STOCK: 'Məhsul stokda kifayət qədər yoxdur.',
        PRODUCT_NOT_FOUND: 'Məhsul artıq mövcud deyil.',
        CUSTOMER_NOT_FOUND: 'Müştəri tapılmadı.',
        ADMIN_REQUIRED: 'Admin icazəsi tələb olunur.',
        INVALID_CUSTOMER_ID: 'Müştəri identifikatoru düzgün deyil.',
        CANNOT_BLOCK_ADMIN: 'Admin hesabı bloklana bilməz.',
        DESIGN_FILE_TYPE: 'Dəstəklənməyən fayl növüdür.',
        DESIGN_FILE_TOO_LARGE: 'Dizayn faylı çox böyükdür.',
        IMAGE_ONLY: 'Yalnız şəkil faylı qəbul olunur.',
        IMAGE_TOO_LARGE: 'Şəkil faylı çox böyükdür.',
        WHATSAPP_NOT_CONFIGURED: 'WhatsApp nömrəsi hələ təyin edilməyib.'
    };
    return labels[code] || fallback;
}
