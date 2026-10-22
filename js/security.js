const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const RESOURCE_PROTOCOLS = new Set(['http:', 'https:', 'blob:', 'data:']);
const ORDER_STATUSES = new Set(['pending_confirmation','confirmed','preparing','ready','shipped','completed','cancelled']);
const REVIEW_STATUSES = new Set(['pending','approved','rejected']);
const SAFE_ERROR_CODES = new Set([
    'AUTH_REQUIRED','ACCOUNT_BLOCKED','INVALID_AUTH_INPUT','INVALID_REVIEW','INVALID_ORDER_ITEMS','INVALID_ORDER',
    'ADDRESS_REQUIRED','OUT_OF_STOCK','PRODUCT_NOT_FOUND','CUSTOMER_NOT_FOUND','ADMIN_REQUIRED',
    'INVALID_CUSTOMER_ID','CANNOT_BLOCK_ADMIN','DESIGN_FILE_TYPE','DESIGN_FILE_TOO_LARGE',
    'DESIGN_UPLOAD_FAILED','INVALID_DESIGN_PATH','INVALID_PRODUCT_IMAGE_PATH','IMAGE_ONLY','INVALID_PRODUCT','INVALID_STOCK_QUANTITY','INVALID_IMAGE_URL','IMAGE_LIMIT',
    'IMAGE_TOO_LARGE','STORAGE_UPLOAD_FAILED','IMAGE_URL_FAILED','DESIGN_SIGNED_URL_FAILED','INVALID_STORAGE_BUCKET','WHATSAPP_NOT_CONFIGURED'
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
export function isSafeCustomerAvatarPath(path, userId) {
    const cleanUserId = String(userId || '').trim();
    if (!isUuid(cleanUserId)) return false;
    return /^avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i.test(String(path || ''))
        && String(path).toLowerCase().startsWith(`avatars/${cleanUserId.toLowerCase()}/`);
}
export function isCustomerDesignPathOwnedBy(path, userId) {
    const cleanUserId = String(userId || '').trim();
    if (!isUuid(cleanUserId) || !isSafeCustomerDesignPath(path)) return false;
    return String(path).toLowerCase().startsWith(`orders/${cleanUserId.toLowerCase()}/`);
}
export function isSafeProductImagePath(path) {
    return /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/i.test(String(path || ''));
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
    const cleanNumber = (v, fallback, min, max) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    };
    if (Number(value.version) >= 4 && Array.isArray(value.layers)) {
        const safeFonts = new Set(['Klassik','Modern','Qalın','Əlyazma','Operatorla seçim']);
        const safeMotifs = new Set(['heart','star','flower','divider']);
        const safeShapes = new Set(['rectangle','circle','line','border']);
        const safeBackgrounds = new Set(['solid','dots','lines']);
        const cleanColor = (v, fallback) => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : fallback;
        const ids = new Set();
        const layers = [];
        for (const raw of value.layers.slice(0, 30)) {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
            const type = ['text','image','ornament','shape','background','qr'].includes(raw.type) ? raw.type : '';
            if (!type || (type === 'image' && layers.filter(layer => layer.type === 'image').length >= 8)) continue;
            let id = String(raw.id || '').trim().slice(0, 48);
            if (!/^[A-Za-z0-9_-]{1,48}$/.test(id) || ids.has(id)) id = `layer-${layers.length + 1}`;
            while (ids.has(id)) id = `layer-${layers.length + 1}-${ids.size}`;
            ids.add(id);
            const common = {
                id, type,
                ...(String(raw.label || '').trim() ? { label: String(raw.label).trim().slice(0, 40) } : {}),
                x: Math.round(cleanNumber(raw.x, 150, 0, 300)),
                y: Math.round(cleanNumber(raw.y, 120, 0, 240)),
                scale: Number(cleanNumber(raw.scale, 1, 0.25, 3).toFixed(2)),
                rotation: Math.round(cleanNumber(raw.rotation, 0, -360, 360)),
                opacity: Number(cleanNumber(raw.opacity, 1, 0, 1).toFixed(2)),
                visible: raw.visible !== false,
                locked: raw.locked === true
            };
            if (type === 'text') {
                layers.push({
                    ...common,
                    name: String(raw.name || 'Mətn').trim().slice(0, 40),
                    text: String(raw.text || '').trim().slice(0, 80),
                    requiresInput: raw.requiresInput === true,
                    placeholderText: raw.requiresInput === true ? String(raw.placeholderText || raw.text || '').trim().slice(0, 80) : '',
                    font: safeFonts.has(raw.font) ? raw.font : 'Klassik',
                    color: cleanColor(raw.color, '#30251a'),
                    fontSize: Math.round(cleanNumber(raw.fontSize, 28, 12, 72)),
                    fontWeight: [400,500,600,700,800].includes(Number(raw.fontWeight)) ? Number(raw.fontWeight) : (raw.bold === false ? 400 : 700),
                    align: ['left','center','right'].includes(raw.align) ? raw.align : 'center',
                    verticalAlign: ['top','middle','bottom'].includes(raw.verticalAlign) ? raw.verticalAlign : 'middle',
                    lineHeight: Number(cleanNumber(raw.lineHeight, 1.2, .8, 2).toFixed(2)),
                    letterSpacing: Number(cleanNumber(raw.letterSpacing, 0, -2, 10).toFixed(1)),
                    boxWidth: Math.round(cleanNumber(raw.boxWidth, 220, 30, 256)),
                    boxHeight: Math.round(cleanNumber(raw.boxHeight, 48, 20, 196)),
                    bold: raw.bold !== false,
                    italic: raw.italic === true,
                    underline: raw.underline === true,
                    effect: ['none','shadow','outline'].includes(raw.effect) ? raw.effect : 'none',
                    effectColor: cleanColor(raw.effectColor, '#3b2114')
                });
            } else if (type === 'ornament') {
                layers.push({ ...common, motif: safeMotifs.has(raw.motif) ? raw.motif : 'heart', color: cleanColor(raw.color, '#b88919') });
            } else if (type === 'image') {
                layers.push({ ...common, crop: Number(cleanNumber(raw.crop, 0, 0, .4).toFixed(2)), name: String(raw.name || 'Şəkil').trim().slice(0, 90), sourceLayerId: /^[A-Za-z0-9_-]{1,48}$/.test(String(raw.sourceLayerId || '')) ? String(raw.sourceLayerId) : '' });
            } else if (type === 'shape') {
                layers.push({
                    ...common,
                    shape: safeShapes.has(raw.shape) ? raw.shape : 'rectangle',
                    width: Math.round(cleanNumber(raw.width, 80, 8, 256)),
                    height: Math.round(cleanNumber(raw.height, 52, 8, 196)),
                    filled: raw.filled !== false,
                    fillColor: cleanColor(raw.fillColor, '#d8c8aa'),
                    strokeColor: cleanColor(raw.strokeColor, '#30251a'),
                    strokeWidth: Math.round(cleanNumber(raw.strokeWidth, 2, 1, 12))
                });
            } else if (type === 'background') {
                layers.push({
                    ...common,
                    pattern: safeBackgrounds.has(raw.pattern) ? raw.pattern : 'solid',
                    fillColor: cleanColor(raw.fillColor, '#f5f3ef'),
                    patternColor: cleanColor(raw.patternColor, '#c6bba9')
                });
            } else {
                layers.push({
                    ...common,
                    content: String(raw.content || '').trim().slice(0, 512),
                    size: Math.round(cleanNumber(raw.size, 96, 48, 160)),
                    foregroundColor: cleanColor(raw.foregroundColor, '#111111'),
                    backgroundColor: cleanColor(raw.backgroundColor, '#ffffff')
                });
            }
        }
        const requestedOrder = Array.isArray(value.orderIds) ? value.orderIds.filter(id => ids.has(id)) : [];
        const orderIds = [...new Set(requestedOrder), ...layers.map(layer => layer.id).filter(id => !requestedOrder.includes(id))];
        const orderedLayers = orderIds.map(id => layers.find(layer => layer.id === id)).filter(Boolean);
        const selectedId = ids.has(value.selectedId) ? value.selectedId : orderedLayers.at(-1)?.id || '';
        const image = orderedLayers.find(layer => layer.type === 'image');
        const text = orderedLayers.find(layer => layer.type === 'text');
        return {
            version: 4,
            canvas: { width: 300, height: 240 },
            selectedId,
            orderIds: orderedLayers.map(layer => layer.id),
            selected: orderedLayers.find(layer => layer.id === selectedId)?.type === 'text' ? 'text' : 'image',
            order: ['image','text'],
            image: image ? { x: image.x, y: image.y, scale: image.scale, rotation: image.rotation, visible: image.visible } : { x: 150, y: 105, scale: 1, rotation: 0, visible: false },
            text: text ? { text: text.text, x: text.x, y: text.y, scale: text.scale, rotation: text.rotation, font: text.font, color: text.color, fontSize: text.fontSize, fontWeight: text.fontWeight, align: text.align, verticalAlign: text.verticalAlign, lineHeight: text.lineHeight, letterSpacing: text.letterSpacing, boxWidth: text.boxWidth, boxHeight: text.boxHeight, opacity: text.opacity, bold: text.bold, italic: text.italic, underline: text.underline, effect: text.effect, effectColor: text.effectColor, visible: text.visible } : { text: '', x: 150, y: 185, scale: 1, rotation: 0, font: 'Klassik', color: '#30251a', fontSize: 28, fontWeight: 700, align: 'center', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, boxWidth: 220, boxHeight: 48, opacity: 1, bold: true, italic: false, underline: false, effect: 'none', effectColor: '#3b2114', visible: false },
            layers: orderedLayers
        };
    }
    const image = value.image && typeof value.image === 'object' ? value.image : {};
    const text = value.text && typeof value.text === 'object' ? value.text : {};
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
export function sanitizeDesignPreview(value) {
    const preview = String(value || '').trim();
    if (preview.length > 7000) return '';
    return /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(preview) ? preview : '';
}
function sanitizeProductReference(value) {
    if (value == null || value === '') return null;
    const text = String(value).trim().slice(0, 120);
    return /^[A-Za-z0-9._:-]{1,120}$/.test(text) ? text : null;
}
export function sanitizeCustomizationProductContext(value, fallbackProductId) {
    const productId = Number(value?.productId);
    const fallback = Number(fallbackProductId);
    const safeProductId = Number.isSafeInteger(fallback) && fallback > 0
        ? fallback
        : (Number.isSafeInteger(productId) && productId > 0 ? productId : 0);
    return {
        productId: safeProductId,
        categoryId: sanitizeProductReference(value?.categoryId),
        category: String(value?.category || '').trim().slice(0, 120),
        variantId: sanitizeProductReference(value?.variantId),
        sku: sanitizeProductReference(value?.sku)
    };
}
export function sanitizeDesignUploads(value, legacy = {}) {
    const legacyOnly = !Array.isArray(value) || (value.length === 0 && !!legacy?.imagePath);
    const source = !legacyOnly ? value.slice(0, 9) : (legacy?.imagePath ? [{
        layerId: null, purpose: legacy.imageType === 'application/pdf' ? 'attachment' : 'image',
        name: legacy.imageName, path: legacy.imagePath, type: legacy.imageType, size: legacy.imageSize
    }] : []);
    const out = [];
    const ids = new Set();
    let imageCount = 0;
    let attachmentCount = 0;
    for (const item of source) {
        if (!item || typeof item !== 'object' || Array.isArray(item) || !isSafeCustomerDesignPath(item.path)) continue;
        const purpose = item.purpose === 'attachment' ? 'attachment' : 'image';
        if ((purpose === 'image' && imageCount >= 8) || (purpose === 'attachment' && attachmentCount >= 1)) continue;
        const layerId = String(item.layerId || '').trim().slice(0, 48);
        if (purpose === 'image' && !(legacyOnly && !layerId) && !/^[A-Za-z0-9_-]{1,48}$/.test(layerId)) continue;
        if (purpose === 'image' && ids.has(layerId)) continue;
        if (purpose === 'image' && layerId) { ids.add(layerId); imageCount++; }
        if (purpose === 'attachment') attachmentCount++;
        let type = String(item.type || '').trim().slice(0, 80);
        if (!type) {
            const path = String(item.path || '').toLowerCase();
            type = path.endsWith('.pdf') ? 'application/pdf' : path.endsWith('.webp') ? 'image/webp' : path.endsWith('.jpg') || path.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
        }
        if (purpose === 'image' && !['image/png','image/jpeg','image/webp'].includes(type)) continue;
        if (purpose === 'attachment' && type !== 'application/pdf') continue;
        out.push({
            layerId: purpose === 'image' ? layerId : '', purpose,
            name: String(item.name || 'Dizayn faylı').trim().slice(0, 180),
            path: String(item.path).trim(), type,
            size: Number.isFinite(Number(item.size)) ? Math.max(0, Math.min(10 * 1024 * 1024, Number(item.size))) : 0
        });
    }
    return out;
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
                productContext: sanitizeCustomizationProductContext(c.productContext, id),
                text: String(c.text || '').trim().slice(0, 500),
                color: String(c.color || '').trim().slice(0, 40),
                size: String(c.size || '').trim().slice(0, 80),
                sizeValue: String(c.sizeValue || '').trim().slice(0, 120),
                font: String(c.font || '').trim().slice(0, 80),
                imageName: String(c.imageName || '').trim().slice(0, 180),
                imagePath: isSafeCustomerDesignPath(c.imagePath || '') ? String(c.imagePath).trim() : '',
                imageType: String(c.imageType || '').trim().slice(0, 80),
                imageSize: Number.isFinite(Number(c.imageSize)) ? Math.max(0, Math.min(10 * 1024 * 1024, Number(c.imageSize))) : 0,
                uploads: sanitizeDesignUploads(c.uploads, c),
                note: String(c.note || '').trim().slice(0, 1000),
                layout: sanitizeDesignLayout(c.layout),
                previewData: sanitizeDesignPreview(c.previewData)
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
