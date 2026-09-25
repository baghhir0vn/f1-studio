import { sb } from '../config.js';

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

export const newsletterService = {
    async subscribe(email) {
        const clean = normalizeEmail(email);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 254) {
            throw new Error('INVALID_NEWSLETTER_EMAIL');
        }
        const { data, error } = await sb.rpc('subscribe_newsletter', { p_email: clean });
        if (error) throw error;
        return data || { ok: true, subscribed: true };
    },

    async listAdmin(limit = 1000) {
        const { data, error } = await sb.rpc('admin_list_newsletter_subscribers', {
            p_limit: Math.max(1, Math.min(5000, Number(limit) || 1000))
        });
        if (error) throw error;
        return Array.isArray(data?.subscribers) ? data.subscribers : [];
    }
};
