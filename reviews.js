import * as UI from './ui.js?v=59.2';
import { state as s, ctx } from './state.js?v=59.2';
const { escapeHTML, showToast } = UI;
export function initReviews() {
    function renderReviews() {
        const box = document.getElementById('reviewsList');
        if (!box) return;
        const all = Array.isArray(s.localReviews) ? s.localReviews.slice(0, 20) : [];
        if (!all.length) {
            box.innerHTML = '<p style="color:var(--muted)">Hələ rəy yoxdur.</p>';
            return;
        }
        box.innerHTML = all.map(review => {
            const stars = Math.min(5, Math.max(1, Number(review.stars) || 1));
            return `<div class="review-card">
                <div class="review-stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</div>
                <div class="review-author">${escapeHTML(review.author || 'Anonim')}${review.isExample ? '<span class="review-label">Nümunə</span>' : ''}</div>
                <div class="review-text">${escapeHTML(review.text || '')}</div>
            </div>`;
        }).join('');
    }
    async function submitReview() {
        if (!s.authUser) return showToast('Rəy göndərmək üçün əvvəlcə hesabınıza daxil olun.');
        if (s.authUser.blocked) return showToast('Bloklanmış hesabdan rəy göndərmək mümkün deyil.');
        const name = document.getElementById('revAuthor')?.value.trim() || '';
        const stars = Number.parseInt(document.getElementById('revStars')?.value, 10);
        const text = document.getElementById('revText')?.value.trim() || '';
        if (name.length < 2 || text.length < 5) {
            return showToast('Adınızı və ən azı qısa bir rəy yazın.');
        }
        try {
            await ctx.api('/api/reviews', {
                method: 'POST',
                body: JSON.stringify({ author: name, stars, text })
            });
            document.getElementById('revAuthor').value = '';
            document.getElementById('revText').value = '';
            showToast('Rəy moderasiyaya göndərildi.');
        } catch (error) {
            const raw = String(error?.message || error || '');
            const message = raw === 'AUTH_REQUIRED'
                ? 'Rəy göndərmək üçün hesabınıza daxil olun.'
                : raw === 'ACCOUNT_BLOCKED'
                    ? 'Bloklanmış hesabdan rəy göndərmək mümkün deyil.'
                    : 'Rəy göndərilmədi.';
            showToast(message);
        }
    }
    Object.assign(ctx, {
        renderReviews,
        submitReview
    });
}
