import { escapeHTML, showToast } from './ui.js';
import { state as s, ctx } from './state.js';
import { ADMIN_API } from './admin-shared.js';

async function loadAdminReviews(){
    try{
        const data=await ctx.adminApi(ADMIN_API.reviews);
        s.adminReviews=Array.isArray(data.reviews)?data.reviews:[];
        ctx.renderAdminReviews();
    }catch(e){
        s.adminReviews=[];
        ctx.renderAdminReviews();
        showToast("Supabase-dən rəylər oxunmadı.");
    }
}

function renderAdminReviews(){
    const box=document.getElementById("adminReviewsList");
    if(!box)return;
    const filter=document.getElementById("adminReviewFilter")?.value||"";
    const list=s.adminReviews.filter(r=>!filter||r.status===filter);
    if(!list.length){box.innerHTML='<div class="admin-empty">Rəy tapılmadı.</div>';return;}
    box.innerHTML=list.map(r=>`<div class="admin-review-card"><div class="admin-review-head"><div><b>${escapeHTML(r.author||"Anonim")}</b><div class="admin-muted">${"★".repeat(Math.min(5,Math.max(1,Number(r.stars)||1)))} · ${escapeHTML(r.createdAt||"")}</div></div><div class="admin-status">${escapeHTML(r.status||"pending")}</div></div><p style="margin:12px 0;line-height:1.6">${escapeHTML(r.text||"")}</p><div class="admin-actions"><button class="ok" data-action="setAdminReviewStatus" data-action-args='[${Number(r.id||0),"approved"}]'>✓ Təsdiqlə</button><button class="danger" data-action="setAdminReviewStatus" data-action-args='[${Number(r.id||0),"rejected"}]'>✕ Rədd et</button></div></div>`).join("");
}

async function setAdminReviewStatus(id,status){
    if(!id)return showToast("Rəy ID-si tapılmadı.");
    try{
        await ctx.adminApi(`${ADMIN_API.reviews}/${id}`,{method:"PATCH",body:JSON.stringify({status})});
        await ctx.loadAdminReviews();
        await ctx.loadServerReviews();
        showToast(status==="approved"?"Rəy təsdiqləndi.":"Rəy rədd edildi.");
    }catch(e){
        showToast("Rəy statusu Supabase-də dəyişdirilmədi.");
    }
}

export function initReviews(){
    Object.assign(ctx, { loadAdminReviews, renderAdminReviews, setAdminReviewStatus });
}
