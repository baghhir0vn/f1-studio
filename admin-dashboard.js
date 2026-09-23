import { escapeHTML, money } from './ui.js';
import { state as s, ctx } from './state.js';
import { ADMIN_API, ADMIN_STATUS_LABELS } from './admin-shared.js';
function orderAmount(o){
        const n=Number(o.total_cents);
        return Number.isFinite(n)?n/100:Number(o.total||0);
    }
    function isCancelledOrder(o){ return o.status === "cancelled"; }
    function orderDateValue(o){ const d=new Date(o.createdAt||o.created_at||o.date||0); return Number.isNaN(d.getTime())?null:d; }
    function formatDateShort(d){ return d?d.toLocaleDateString("az-AZ",{day:"2-digit",month:"2-digit"}):"-"; }
    function formatDateLong(d){ return d?d.toLocaleString("az-AZ",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"-"; }
    async function loadAdminDashboard(){
        try{
            const [p,o,r]=await Promise.all([
                ctx.adminApi(ADMIN_API.products), ctx.adminApi(ADMIN_API.orders), ctx.adminApi(ADMIN_API.reviews)
            ]);
            const ps=Array.isArray(p.products)?p.products:[];
            const os=Array.isArray(o.orders)?o.orders:[];
            const rs=Array.isArray(r.reviews)?r.reviews:[];
            s.adminProducts=ps; s.adminOrders=os; s.adminReviews=rs;
            ctx.renderAdminDashboardStats(ps,os,rs);
            const status=document.getElementById("adminApiStatus");
            if(status) status.textContent="✅ Supabase Admin bağlantısı işləkdir.";
        }catch(e){
            const status=document.getElementById("adminApiStatus");
            if(status) status.textContent=`⚠️ Admin API əlçatan deyil (${e.message||"xəta"}). Supabase cədvəlləri və təhlükəsizlik siyasətləri qurulmayıb və ya hesab admin deyil.`;
            const stat=document.getElementById("adminStatProducts");
            if(stat) stat.textContent=s.products.length;
        }
    }
    function renderAdminDashboardStats(ps,os,rs){
        const active=os.filter(o=>!ctx.isCancelledOrder(o));
        const completed=os.filter(o=>o.status==="completed");
        const now=new Date();
        const todayKey=now.toLocaleDateString("az-AZ");
        const today=active.filter(o=>{const d=ctx.orderDateValue(o);return d&&d.toLocaleDateString("az-AZ")===todayKey;});
        const revenue=active.reduce((sum,o)=>sum+ctx.orderAmount(o),0);
        const todayRevenue=today.reduce((sum,o)=>sum+ctx.orderAmount(o),0);
        const average=active.length?revenue/active.length:0;
        document.getElementById("adminStatProducts").textContent=ps.length;
        document.getElementById("adminStatOrders").textContent=os.length;
        document.getElementById("adminStatTodayOrders").textContent=today.length;
        document.getElementById("adminStatPending").textContent=os.filter(x=>["pending_confirmation","confirmed","preparing"].includes(x.status)).length;
        document.getElementById("adminStatCompleted").textContent=completed.length;
        document.getElementById("adminStatRevenue").textContent=money(revenue);
        document.getElementById("adminStatTodayRevenue").textContent=money(todayRevenue);
        document.getElementById("adminStatAverage").textContent=money(average);
        document.getElementById("adminStatReviews").textContent=rs.filter(x=>!x.status||x.status==="pending").length;
        ctx.renderAdminSalesChart(active);
        ctx.renderAdminTopProducts(active);
        ctx.renderAdminRecentOrders(os);
    }
    function renderAdminSalesChart(orders){
        const box=document.getElementById("adminSalesChart"); if(!box)return;
        const days=[]; const base=new Date(); base.setHours(0,0,0,0);
        for(let i=6;i>=0;i--){ const d=new Date(base); d.setDate(base.getDate()-i); days.push(d); }
        const rows=days.map(d=>{
            const key=d.toLocaleDateString("az-AZ");
            const same=orders.filter(o=>{const od=ctx.orderDateValue(o);return od&&od.toLocaleDateString("az-AZ")===key;});
            return {date:d,count:same.length,amount:same.reduce((sum,o)=>sum+ctx.orderAmount(o),0)};
        });
        const max=Math.max(...rows.map(x=>x.amount),1);
        box.innerHTML=rows.map(x=>{
            const h=Math.max(4,(x.amount/max)*155);
            return `<div class="admin-chart-col" title="${x.date.toLocaleDateString("az-AZ")}: ${x.count} sifariş · ${money(x.amount)}"><div class="admin-chart-value">${x.amount?money(x.amount):"0 ₼"}</div><div class="admin-chart-bar" style="height:${h}px"></div><div class="admin-chart-label">${ctx.formatDateShort(x.date)}</div></div>`;
        }).join("");
    }
    function renderAdminTopProducts(orders){
        const box=document.getElementById("adminTopProducts"); if(!box)return;
        const map=new Map();
        orders.forEach(o=>(o.items||[]).forEach(i=>{
            const key=String(i.productId||i.name||"unknown");
            const row=map.get(key)||{name:i.name||`Məhsul #${i.productId||"?"}`,qty:0,revenue:0};
            row.qty += Number(i.qty)||0; row.revenue += (Number(i.price)||0)*(Number(i.qty)||0); map.set(key,row);
        }));
        const list=[...map.values()].sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue).slice(0,5);
        if(!list.length){box.innerHTML='<div class="admin-empty">Hələ sifariş məlumatı yoxdur.</div>';return;}
        box.innerHTML=list.map((x,idx)=>`<div class="admin-top-product"><div class="admin-top-rank">#${idx+1}</div><div><div class="admin-top-name">${escapeHTML(x.name)}</div><div class="admin-top-meta">${money(x.revenue)} məhsul dəyəri</div></div><div class="admin-top-qty">${x.qty} əd.</div></div>`).join("");
    }
    function renderAdminRecentOrders(orders){
        const box=document.getElementById("adminRecentOrders"); if(!box)return;
        const list=[...orders].sort((a,b)=>(ctx.orderDateValue(b)?.getTime()||0)-(ctx.orderDateValue(a)?.getTime()||0)).slice(0,5);
        if(!list.length){box.innerHTML='<div class="admin-empty">Hələ sifariş yoxdur.</div>';return;}
        box.innerHTML=list.map(o=>`<div class="admin-recent-order"><div class="admin-recent-code">${escapeHTML(o.orderCode||`#${o.id||"?"}`)}</div><div><div class="admin-recent-customer">${escapeHTML(o.customer?.name||o.name||"Müştəri")}</div><div class="admin-recent-date">${ctx.formatDateLong(ctx.orderDateValue(o))} · <span class="admin-recent-status">${escapeHTML(ADMIN_STATUS_LABELS[o.status]||o.status||"Naməlum")}</span></div></div><div class="admin-recent-amount">${money(ctx.orderAmount(o))}</div></div>`).join("");
    }
export function initDashboard(){
  Object.assign(ctx, {
    orderAmount, isCancelledOrder, orderDateValue, formatDateShort, formatDateLong, renderAdminDashboardStats, renderAdminSalesChart, renderAdminTopProducts, renderAdminRecentOrders, loadAdminDashboard
  });
}
