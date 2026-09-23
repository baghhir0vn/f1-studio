import { sb } from '../config.js?v=59.3';
import { isSafeCustomerDesignPath, isSafeProductImagePath } from '../security.js?v=59.3';
const ALLOWED_BUCKETS = new Set(['customer-designs', 'product-images']);
const CUSTOMER_FILE_TYPES = new Set(['image/png','image/jpeg','image/webp','application/pdf']);
const PRODUCT_FILE_TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif']);
function assertBucket(bucket) {
    if (!ALLOWED_BUCKETS.has(bucket)) throw new Error('INVALID_STORAGE_BUCKET');
}
export const storageService = {
    async uploadCustomerDesign(path, file) {
        if (!isSafeCustomerDesignPath(path)) throw new Error('INVALID_DESIGN_PATH');
        if (!file || !CUSTOMER_FILE_TYPES.has(String(file.type || '')) || Number(file.size) > 10 * 1024 * 1024) throw new Error('DESIGN_FILE_TYPE');
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
        const validator = bucket === 'customer-designs' ? isSafeCustomerDesignPath : isSafeProductImagePath;
        const clean = paths.filter(validator);
        if (!clean.length) return;
        const { error } = await sb.storage.from(bucket).remove(clean);
        if (error) throw error;
    }
};
