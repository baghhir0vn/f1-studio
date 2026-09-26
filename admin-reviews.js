import { escapeHTML, showToast } from './ui.js';
import { state as s, ctx } from './state.js';
import { ADMIN_API } from './admin-shared.js';

const STATUS_LABELS = { pending: 'Gözləyir', approved: 'Təsdiqlənib', rejected: 'Rədd edilib' };

async function loadAdminReviews(){
    try{
        const data=await ctx.adminApi(ADMIN_API.reviews);
        s.adminReviews=Array.isArray(data.reviews)?data.reviews:[];
        ctx.renderAdminReviews();
    }catch(e){
        s.adminReviews=[];
        ctx.renderAdminReviews();
        showToast('Supabase-dən rəylər oxunmadı.');
    }
}

function getFilteredReviews(){
    const filter=document.getElementById('adminReviewFilter')?.value||'';
    const search=(document.getElementById('adminReviewSearch')?.value||'').trim().toLocaleLowerCase('az');
    return s.adminReviews.filter(r=>{
        if(filter && r.status!==filter) return false;
        if(!search) return true;
        const reviewer=r.reviewer||{};
        const hay=[r.author,r.text,reviewer.name,reviewer.phone,reviewer.email].filter(Boolean).join(' ').toLocaleLowerCase('az');
        return hay.includes(search);
    });
}

function renderReviewStats(list){
    const total=s.adminReviews.length;
    const pending=s.adminReviews.filter(r=>r.status==='pending').length;
    const approved=s.adminReviews.filter(r=>r.status==='approved').length;
    const rejected=s.adminReviews.filter(r=>r.status==='rejected').length;
    const pairs=[['adminReviewStatTotal',total],['adminReviewStatPending',pending],['adminReviewStatApproved',approved],['adminReviewStatRejected',rejected],['adminReviewStatVisible',list.length]];
    pairs.forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.textContent=String(val)});
}

function renderAdminReviews(){
    const box=document.getElementById('adminReviewsList');
    if(!box)return;
    const list=getFilteredReviews();
    renderReviewStats(list);
    if(!list.length){box.innerHTML='<div class="admin-empty">Uyğun rəy tapılmadı.</div>';return;}
    box.innerHTML=list.map(r=>{
        const reviewer=r.reviewer||{};
        const status=r.status||'pending';
        const stars=Math.min(5,Math.max(1,Number(r.stars)||1));
        const hasAccount=Boolean(r.userId);
        const authorExtra=hasAccount ? [reviewer.phone,reviewer.email].filter(Boolean).join(' · ') : 'Hesabla əlaqələndirilməyib';
        return `<article class="admin-review-card">
          <div class="admin-review-head">
            <div class="admin-review-author">
              <b>${escapeHTML(r.author||'Anonim')}</b>
              <div class="admin-muted">${'★'.repeat(stars)}${'☆'.repeat(5-stars)} · ${escapeHTML(r.createdAt||'')}</div>
              <small>${escapeHTML(authorExtra||'')}</small>
            </div>
            <span class="admin-review-status status-${escapeHTML(status)}">${escapeHTML(STATUS_LABELS[status]||status)}</span>
          </div>
          <p class="admin-review-preview">${escapeHTML(r.text||'')}</p>
          <div class="admin-review-meta">
            <span>${hasAccount?'👤 Hesablı müştəri':'👤 Qonaq profil'}</span>
            <span>Rəy #${Number(r.id)||0}</span>
          </div>
          <div class="admin-actions admin-review-actions">
            <button data-action="openAdminReviewDetails" data-action-args='[${Number(r.id)||0}]'>Detallara bax</button>
            ${status!=='approved' ? `<button class="ok" data-action="setAdminReviewStatus" data-action-args='[${Number(r.id)||0},&quot;approved&quot;]'>✓ Təsdiqlə</button>` : ''}
            ${status!=='rejected' ? `<button class="danger" data-action="setAdminReviewStatus" data-action-args='[${Number(r.id)||0},&quot;rejected&quot;]'>✕ Rədd et</button>` : ''}
          </div>
        </article>`;
    }).join('');
}

function openAdminReviewDetails(id){
    const review=s.adminReviews.find(r=>Number(r.id)===Number(id));
    const modal=document.getElementById('adminReviewDetailModal');
    const body=document.getElementById('adminReviewDetailBody');
    if(!review||!modal||!body)return;
    const reviewer=review.reviewer||{};
    const status=review.status||'pending';
    const statusLabel=STATUS_LABELS[status]||status;
    const accountId=review.userId||'';
    body.innerHTML=`
      <div class="admin-review-detail-grid">
        <div class="admin-review-detail-card"><span>Rəy statusu</span><b class="admin-review-status status-${escapeHTML(status)}">${escapeHTML(statusLabel)}</b></div>
        <div class="admin-review-detail-card"><span>Ulduz</span><b>${'★'.repeat(Math.min(5,Math.max(1,Number(review.stars)||1)))} / 5</b></div>
        <div class="admin-review-detail-card"><span>Göndərilmə tarixi</span><b>${escapeHTML(review.createdAt||'—')}</b></div>
        <div class="admin-review-detail-card"><span>Rəy ID</span><b>#${Number(review.id)||0}</b></div>
      </div>
      <div class="admin-review-detail-section"><span class="admin-muted">Müştəri</span><h3>${escapeHTML(review.author||'Anonim')}</h3>
        <div class="admin-review-account-grid">
          <div><small>Telefon</small><b>${escapeHTML(reviewer.phone||'—')}</b></div>
          <div><small>Email</small><b>${escapeHTML(reviewer.email||'—')}</b></div>
          <div><small>Hesab statusu</small><b>${reviewer.blocked?'Bloklanıb':'Aktiv / məlum deyil'}</b></div>
          <div><small>Hesab ID</small><b class="admin-mono">${escapeHTML(accountId||'Hesabla əlaqəsi yoxdur')}</b></div>
        </div>
      </div>
      <div class="admin-review-detail-section"><span class="admin-muted">Rəy mətni</span><div class="admin-review-fulltext">${escapeHTML(review.text||'')}</div></div>
      <div class="admin-note">Bu rəy modelində ayrıca <b>məhsul ID-si</b> saxlanmadığı üçün rəy məhsula avtomatik bağlanmır. Məhsula görə rəyləri ayırmaq istəyəndə ayrıca product bağlantısı əlavə edilməlidir.</div>
      <div class="admin-actions admin-review-detail-actions">
        ${status!=='approved' ? `<button class="ok" data-action="setAdminReviewStatusAndClose" data-action-args='[${Number(review.id)||0},&quot;approved&quot;]'>✓ Təsdiqlə</button>` : ''}
        ${status!=='rejected' ? `<button class="danger" data-action="setAdminReviewStatusAndClose" data-action-args='[${Number(review.id)||0},&quot;rejected&quot;]'>✕ Rədd et</button>` : ''}
        <button data-action="closeAdminReviewDetails">Bağla</button>
      </div>`;
    modal.hidden=false;
    modal.setAttribute('aria-hidden','false');
}

function closeAdminReviewDetails(){
    const modal=document.getElementById('adminReviewDetailModal');
    if(!modal)return;
    modal.hidden=true;
    modal.setAttribute('aria-hidden','true');
}

async function setAdminReviewStatus(id,status){
    if(!id)return showToast('Rəy ID-si tapılmadı.');
    try{
        await ctx.adminApi(`${ADMIN_API.reviews}/${id}`,{method:'PATCH',body:JSON.stringify({status})});
        await ctx.loadAdminReviews();
        await ctx.loadServerReviews();
        showToast(status==='approved'?'Rəy təsdiqləndi.':'Rəy rədd edildi.');
    }catch(e){
        showToast('Rəy statusu Supabase-də dəyişdirilmədi.');
    }
}

async function setAdminReviewStatusAndClose(id,status){
    await setAdminReviewStatus(id,status);
    closeAdminReviewDetails();
}

export function initReviews(){
    Object.assign(ctx, { loadAdminReviews, renderAdminReviews, setAdminReviewStatus, openAdminReviewDetails, closeAdminReviewDetails, setAdminReviewStatusAndClose });
}
