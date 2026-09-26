import { sb } from '../config.js';
import { safeResourceUrl } from '../security.js';
const PRODUCT_COLUMNS = 'id,name,price,cat,image,images,emoji,badge,material,size,production_time,stock,stock_quantity,description,tags,customizable,updated_at';
const PRODUCT_IMAGE_EXTERNAL_ORIGINS = new Set([
    'https://rfkqxiwbicjsszjbdhzd.supabase.co',
    'https://images.pexels.com'
]);
function resolveProductImage(value) {
    const url = safeResourceUrl(value, { allowData: false, allowBlob: false, allowRelative: true });
    if (!url) return '';
    try {
        const parsed = new URL(url, window.location.href);
        if ((parsed.origin !== window.location.origin && !PRODUCT_IMAGE_EXTERNAL_ORIGINS.has(parsed.origin)) || parsed.pathname.startsWith('/images/')) return '';
        return url;
    } catch (_) {
        return '';
    }
}
export function mapProductRow(p) {
    const rawGallery = Array.isArray(p.images) ? p.images : [];
    const gallery = rawGallery
        .map(resolveProductImage)
        .filter(Boolean)
        .slice(0, 6);
    const primary = resolveProductImage(p.image) || gallery[0] || '';
    return {
        id: p.id,
        name: p.name,
        price: Number(p.price),
        cat: p.cat,
        emoji: p.emoji || '📦',
        image: primary,
        images: gallery.length ? gallery : (primary ? [primary] : []),
        desc: p.description || '',
        material: p.material || '',
        size: p.size || '',
        productionTime: p.production_time || p.productionTime || '',
        customizable: p.customizable !== false,
        stock: p.stock || 'Sifarişlə',
        stockQuantity: p.stock_quantity == null ? null : Number(p.stock_quantity),
        badge: p.badge || '',
        tags: Array.isArray(p.tags) ? p.tags.slice(0, 30).map(v => String(v).slice(0, 80)) : []
    };
}
function validateProductPayload(x) {
    const name = String(x.name || '').trim();
    if (name.length < 1 || name.length > 160) throw new Error('INVALID_PRODUCT');
    if (!Number.isFinite(Number(x.price)) || Number(x.price) < 0 || Number(x.price) > 10000000) throw new Error('INVALID_PRODUCT');
    if (String(x.cat || '').length > 120 || String(x.description || '').length > 5000) throw new Error('INVALID_PRODUCT');
    if (String(x.badge || '').length > 120 || String(x.material || '').length > 160 || String(x.size || '').length > 120 || String(x.production_time || '').length > 120 || String(x.stock || '').length > 120) throw new Error('INVALID_PRODUCT');
    if (x.stock_quantity != null && (!Number.isInteger(Number(x.stock_quantity)) || Number(x.stock_quantity) < 0 || Number(x.stock_quantity) > 1000000)) throw new Error('INVALID_STOCK_QUANTITY');
    if (!Array.isArray(x.images) || x.images.length > 6 || x.images.some(v => String(v).length > 2048)) throw new Error('INVALID_PRODUCT');
    if (!Array.isArray(x.tags) || x.tags.length > 30 || x.tags.some(v => String(v).length > 80)) throw new Error('INVALID_PRODUCT');
}
const writePayload = x => {
    const images = Array.isArray(x.images) ? x.images.filter(Boolean).slice(0, 6) : [];
    return {
        name: String(x.name || '').trim(),
        price: Number(x.price),
        cat: String(x.cat || ''),
        image: x.image || images[0] || '',
        images,
        emoji: String(x.emoji || '📦').slice(0, 12),
        badge: String(x.badge || ''),
        material: String(x.material || ''),
        size: String(x.size || ''),
        production_time: String(x.productionTime || ''),
        stock: String(x.stock || 'Sifarişlə'),
        stock_quantity: x.stockQuantity == null ? null : Number(x.stockQuantity),
        description: String(x.desc || ''),
        tags: Array.isArray(x.tags) ? x.tags.slice(0, 30).map(v => String(v).trim()).filter(Boolean) : [],
        customizable: x.customizable !== false
    };
};
export const productService = {
    async list() {
        const { data, error } = await sb.from('products').select(PRODUCT_COLUMNS).order('id');
        if (error) throw error;
        return (data || []).map(mapProductRow);
    },
    async create(x) {
        const payload = writePayload(x);
        validateProductPayload(payload);
        const { data, error } = await sb.from('products').insert(payload).select(PRODUCT_COLUMNS).single();
        if (error) throw error;
        return mapProductRow(data);
    },
    async update(id, x) {
        if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('INVALID_PRODUCT');
        const payload = writePayload(x);
        validateProductPayload(payload);
        const { data, error } = await sb.from('products')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', id).select(PRODUCT_COLUMNS).single();
        if (error) throw error;
        return mapProductRow(data);
    },
    async remove(id) {
        if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('INVALID_PRODUCT');
        const { error } = await sb.from('products').delete().eq('id', id);
        if (error) throw error;
        return { ok: true };
    }
};
