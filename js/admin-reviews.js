import { escapeHTML, normalizeText, showToast } from './ui.js';
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
function reviewStars(value){
    return Math.min(5,Math.max(1,Number(value)||1));
}
function renderAdminReviewStats(){
    const reviews=Array.isArray(s.adminReviews)?s.adminReviews:[];
    const statusOf=review=>String(review.status||"pending").toLowerCase();
    const counts={
        total:reviews.length,
        pending:reviews.filter(review=>statusOf(review)==="pending").length,
        approved:reviews.filter(review=>statusOf(review)==="approved").length,
        rejected:reviews.filter(review=>statusOf(review)==="rejected").length
    };
    counts.visible=counts.approved;
    const statIds={
        total:"adminReviewStatTotal",
        pending:"adminReviewStatPending",
        approved:"adminReviewStatApproved",
        rejected:"adminReviewStatRejected",
        visible:"adminReviewStatVisible"
    };
    Object.entries(statIds).forEach(([key,id])=>{
        const target=document.getElementById(id);
        if(target)target.textContent=String(counts[key]);
    });
    const chart=document.getElementById("adminReviewRatingChart");
    if(!chart)return;
    const distribution=[5,4,3,2,1].map(stars=>({
        stars,
        count:reviews.filter(review=>reviewStars(review.stars)===stars).length
    }));
    const maxCount=Math.max(0,...distribution.map(item=>item.count));
    const average=reviews.length
        ? (reviews.reduce((sum,review)=>sum+reviewStars(review.stars),0)/reviews.length).toLocaleString("az-AZ",{minimumFractionDigits:1,maximumFractionDigits:1})
        : "—";
    const averageNode=document.getElementById("adminReviewAverageRating");
    if(averageNode)averageNode.textContent=average;
    const totalNode=document.getElementById("adminReviewChartTotal");
    if(totalNode)totalNode.textContent=`${reviews.length} rəy`;
    chart.setAttribute("aria-label",`Rəylərin ulduz bölgüsü. ${distribution.map(item=>`${item.stars} ulduz: ${item.count}`).join(", ")}`);
    chart.innerHTML=distribution.map(({stars,count})=>{
        const width=maxCount?Math.round(count/maxCount*100):0;
        return `<div class="admin-review-rating-row" aria-label="${stars} ulduz: ${count} rəy">
            <span class="admin-review-rating-label">${stars} <span aria-hidden="true">★</span></span>
            <div class="admin-review-bar" aria-hidden="true"><i style="width:${width}%"></i></div>
            <b>${count}</b>
        </div>`;
    }).join("");
}
function renderAdminReviews(){
    const box=document.getElementById("adminReviewsList");
    if(!box)return;
    const reviews=Array.isArray(s.adminReviews)?s.adminReviews:[];
    renderAdminReviewStats();
    const filter=String(document.getElementById("adminReviewFilter")?.value||"").toLowerCase();
    const query=normalizeText(document.getElementById("adminReviewSearch")?.value||"");
    const list=reviews.filter(review=>{
        const status=String(review.status||"pending").toLowerCase();
        if(filter&&status!==filter)return false;
        if(!query)return true;
        const searchable=[
            review.author,review.name,review.phone,review.email,review.customer_name,
            review.customer_phone,review.customer_email,review.text,review.status,
            review.createdAt,review.created_at,review.id
        ].map(value=>String(value||"")).join(" ");
        return normalizeText(searchable).includes(query);
    });
    if(!list.length){box.innerHTML='<div class="admin-empty">Rəy tapılmadı.</div>';return;}
    box.innerHTML=list.map(r=>{
        const status=String(r.status||"pending").toLowerCase();
        const badgeClass=status==="approved"?"is-approved":status==="rejected"?"is-rejected":"is-pending";
        return `<div class="admin-review-card"><div class="admin-review-head"><div><b>${escapeHTML(r.author||"Anonim")}</b><div class="admin-muted">${"★".repeat(reviewStars(r.stars))} · ${escapeHTML(r.createdAt||r.created_at||"")}</div></div><div class="admin-status ${badgeClass}">${escapeHTML(r.status||"pending")}</div></div><p style="margin:12px 0;line-height:1.6">${escapeHTML(r.text||"")}</p><div class="admin-actions"><button class="ok" data-action="setAdminReviewStatus" data-action-args='[${Number(r.id||0)},"approved"]'>✓ Təsdiqlə</button><button class="danger" data-action="setAdminReviewStatus" data-action-args='[${Number(r.id||0)},"rejected"]'>✕ Rədd et</button></div></div>`;
    }).join("");
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
