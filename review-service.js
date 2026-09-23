import { sb } from '../config.js?v=59.2';
import { getProfileForUser } from './profile-service.js?v=59.2';
import { fetchAllRows } from './query-utils.js?v=59.2';
import { isAllowedReviewStatus } from '../security.js?v=59.2';
export function mapReviewRow(r) {
    return { id: r.id, author: r.author, stars: r.stars, text: r.text, status: r.status, createdAt: r.created_at, isExample: false };
}
const REVIEW_COLUMNS = 'id,author,stars,text,status,created_at,user_id';
export const reviewService = {
    async listApproved() {
        const { data, error } = await sb.from('reviews').select(REVIEW_COLUMNS)
            .in('status', ['approved']).order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        return (data || []).map(mapReviewRow);
    },
    async submit({ author, stars, text }) {
        const { data } = await sb.auth.getUser();
        const user = data.user;
        if (!user) throw new Error('AUTH_REQUIRED');
        const profile = await getProfileForUser(user);
        if (profile?.blocked) throw new Error('ACCOUNT_BLOCKED');
        const safeAuthor = String(author || '').trim().slice(0, 80);
        const safeText = String(text || '').trim().slice(0, 1000);
        const safeStars = Number(stars);
        if (safeAuthor.length < 2 || safeText.length < 5 || !Number.isInteger(safeStars) || safeStars < 1 || safeStars > 5) {
            throw new Error('INVALID_REVIEW');
        }
        const { error } = await sb.from('reviews').insert({
            author: safeAuthor, stars: safeStars, text: safeText, status: 'pending', user_id: user.id
        });
        if (error) throw error;
        return { ok: true };
    },
    async listAdmin() {
        const rows = await fetchAllRows(() => sb.from('reviews').select(REVIEW_COLUMNS).order('created_at', { ascending: false }), { pageSize: 1000, maxRows: 10000 });
        return rows.map(mapReviewRow);
    },
    async setStatus(id, status) {
        if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('INVALID_REVIEW');
        if (!isAllowedReviewStatus(status)) throw new Error('INVALID_REVIEW');
        const { data, error } = await sb.from('reviews').update({ status }).eq('id', id).select(REVIEW_COLUMNS).single();
        if (error) throw error;
        return mapReviewRow(data);
    }
};
