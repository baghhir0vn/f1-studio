// Newsletter submissions go through Vercel, not public Supabase RPC.
// The server validates the trusted IP and SQL enforces an atomic rate limit.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const newsletterService = {
    async subscribe(value) {
        const email = String(value || '').trim().toLowerCase();
        if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
            const error = new Error('INVALID_NEWSLETTER_EMAIL');
            error.code = 'INVALID_NEWSLETTER_EMAIL';
            throw error;
        }
        const response = await fetch('/api/newsletter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({ email })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(String(payload.error || 'NEWSLETTER_TEMPORARILY_UNAVAILABLE'));
            error.code = String(payload.error || 'NEWSLETTER_TEMPORARILY_UNAVAILABLE');
            throw error;
        }
        if (payload.ok !== true) throw new Error('NEWSLETTER_RESPONSE_INVALID');
        return payload;
    }
};
