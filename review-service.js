import { sb } from '../config.js';
import { getProfileForUser } from './profile-service.js';
import { fetchAllRows } from './query-utils.js';
import { isAllowedReviewStatus } from '../security.js';

export function mapReviewRow(r) {
    return { id: r.id, author: r.author, stars: r.stars, text: r.text, status: r.status, createdAt: r.created_at, userId: r.user_id || null, reviewer: r.reviewer || null, isExample: false };
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
        const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
        let profiles = [];
        if (userIds.length) {
            const { data, error } = await sb.from('profiles')
                .select('id,name,phone,email,role,blocked,created_at')
                .in('id', userIds);
            if (!error) profiles = data || [];
        }
        const byId = new Map(profiles.map(p => [p.id, p]));
        return rows.map(r => mapReviewRow({ ...r, reviewer: r.user_id ? byId.get(r.user_id) || null : null }));
    },
    async setStatus(id, status) {
        if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('INVALID_REVIEW');
        if (!isAllowedReviewStatus(status)) throw new Error('INVALID_REVIEW');
        const { data, error } = await sb.from('reviews').update({ status }).eq('id', id).select(REVIEW_COLUMNS).single();
        if (error) throw error;
        return mapReviewRow(data);
    }
};

