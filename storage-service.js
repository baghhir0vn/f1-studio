import { sb } from '../config.js';
import { isSafeCustomerDesignPath, isSafeProductImagePath, isSafeSiteContentPath } from '../security.js';

const ALLOWED_BUCKETS = new Set(['customer-designs', 'product-images', 'site-content']);
const CUSTOMER_FILE_TYPES = new Set(['image/png','image/jpeg','image/webp','application/pdf']);
const PRODUCT_FILE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
const SITE_CONTENT_FILE_TYPES = PRODUCT_FILE_TYPES;
const EXT_BY_TYPE = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'};

function assertBucket(bucket) {
    if (!ALLOWED_BUCKETS.has(bucket)) throw new Error('INVALID_STORAGE_BUCKET');
}

export const storageService = {
    async uploadCustomerDesign(path, file) {
        if (!isSafeCustomerDesignPath(path)) throw new Error('INVALID_DESIGN_PATH');
        if (!file || !CUSTOMER_FILE_TYPES.has(String(file.type || ''))) throw new Error('DESIGN_FILE_TYPE');
        if (Number(file.size) > 10 * 1024 * 1024) throw new Error('DESIGN_FILE_TOO_LARGE');
        const { error } = await sb.storage.from('customer-designs').upload(path, file, {
            cacheControl: '3600', upsert: false, contentType: file.type
        });
        if (error) throw new Error('DESIGN_UPLOAD_FAILED');
        return { path, name: file.name, type: file.type, size: file.size };
    },
    async removeCustomerDesigns(paths = []) {
        const clean = paths.filter(isSafeCustomerDesignPath);
        if (!clean.length) return;
        const { error } = await sb.storage.from('customer-designs').remove(clean);
        if (error) throw error;
    },
    async createCustomerDesignSignedUrl(path, expiresIn = 900) {
        if (!isSafeCustomerDesignPath(path)) throw new Error('INVALID_DESIGN_PATH');
        const ttl = Math.min(3600, Math.max(60, Number(expiresIn) || 900));
        const { data, error } = await sb.storage.from('customer-designs').createSignedUrl(path, ttl);
        if (error || !data?.signedUrl) throw new Error('DESIGN_SIGNED_URL_FAILED');
        return data.signedUrl;
    },
    async uploadSiteContentImage(kind, file) {
        const folder = kind === 'category' ? 'categories' : kind === 'hero' ? 'heroes' : '';
        if (!folder) throw new Error('INVALID_STORAGE_BUCKET');
        if (!file || !SITE_CONTENT_FILE_TYPES.has(String(file.type || '')) || Number(file.size) > 5 * 1024 * 1024) throw new Error('IMAGE_ONLY');
        const ext = EXT_BY_TYPE[String(file.type || '')] || 'jpg';
        const token = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const path = `${folder}/${token}.${ext}`;
        const { error } = await sb.storage.from('site-content').upload(path, file, {
            cacheControl: '3600', upsert: false, contentType: file.type
        });
        if (error) throw new Error('STORAGE_UPLOAD_FAILED');
        const { data } = sb.storage.from('site-content').getPublicUrl(path);
        if (!data?.publicUrl) throw new Error('IMAGE_URL_FAILED');
        return { path, url: data.publicUrl };
    },
    async uploadProductImage(path, file) {
        if (!isSafeProductImagePath(path)) throw new Error('INVALID_PRODUCT_IMAGE_PATH');
        if (!file || !PRODUCT_FILE_TYPES.has(String(file.type || '')) || Number(file.size) > 5 * 1024 * 1024) throw new Error('IMAGE_ONLY');
        const { error } = await sb.storage.from('product-images').upload(path, file, {
            cacheControl: '3600', upsert: false, contentType: file.type
        });
        if (error) throw new Error('STORAGE_UPLOAD_FAILED');
        const { data } = sb.storage.from('product-images').getPublicUrl(path);
        if (!data?.publicUrl) throw new Error('IMAGE_URL_FAILED');
        return { path, url: data.publicUrl };
    },
    async remove(bucket, paths = []) {
        assertBucket(bucket);
        const validator = bucket === 'customer-designs' ? isSafeCustomerDesignPath : bucket === 'site-content' ? isSafeSiteContentPath : isSafeProductImagePath;
        const clean = paths.filter(validator);
        if (!clean.length) return;
        const { error } = await sb.storage.from(bucket).remove(clean);
        if (error) throw error;
    }
};
