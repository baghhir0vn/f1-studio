import { sb } from '../config.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const newsletterService = {
    async subscribe(value) {
        const email = String(value || '').trim().toLowerCase();
        if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
            const error = new Error('INVALID_NEWSLETTER_EMAIL');
            error.code = 'INVALID_NEWSLETTER_EMAIL';
            throw error;
        }
        const { data, error } = await sb.rpc('subscribe_newsletter', { p_email: email });
        if (error) throw error;
        return data || { ok: true, subscribed: true };
    }
};
