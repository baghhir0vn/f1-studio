import { escapeHTML, money } from './ui.js';
import { state as s, ctx } from './state.js';
import { ADMIN_API, ADMIN_STATUS_LABELS } from './admin-shared.js';

const DASHBOARD_RANGES = {
    today: { days: 1, label: 'Bu gün' },
    '7': { days: 7, label: 'Son 7 gün' },
    '30': { days: 30, label: 'Son 30 gün' },
    all: { days: null, label: 'Bütün dövr' }
};

function orderAmount(o){
    const n=Number(o.total_cents);
    return Number.isFinite(n)?n/100:Number(o.total||0);
}

function isCancelledOrder(o){ return o.status === 'cancelled'; }

function orderDateValue(o){
    const d=new Date(o.createdAt||o.created_at||o.date||0);
    return Number.isNaN(d.getTime())?null:d;
}

function formatDateShort(d){ return d?d.toLocaleDateString('az-AZ',{day:'2-digit',month:'2-digit'}):'-'; }

function formatDateLong(d){ return d?d.toLocaleString('az-AZ',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-'; }

function getDashboardRangeStart(rangeKey=s.adminDashboardRange||'7', now=new Date()){
    const config=DASHBOARD_RANGES[rangeKey]||DASHBOARD_RANGES['7'];
    if(config.days===null) return null;
    const d=new Date(now);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate()-(config.days-1));
    return d;
}

function filterDashboardOrders(orders, rangeKey=s.adminDashboardRange||'7'){
    const start=getDashboardRangeStart(rangeKey);
    if(!start) return [...orders];
    return orders.filter(o=>{
        const d=orderDateValue(o);
        return d && d>=start;
    });
}

function setAdminDashboardRange(value){
    const key=Object.prototype.hasOwnProperty.call(DASHBOARD_RANGES,value)?value:'7';
    s.adminDashboardRange=key;
    renderAdminDashboardAnalytics(s.adminOrders||[]);
}

function renderAdminDashboardSummary(orders){
    const box=document.getElementById('adminDashboardRangeSummary'); if(!box)return;
    const active=orders.filter(o=>!isCancelledOrder(o));
    const revenue=active.reduce((sum,o)=>sum+orderAmount(o),0);
    const avg=active.length?revenue/active.length:0;
    box.innerHTML=`<span><b>${active.length}</b> sifariş</span><span><b>${money(revenue)}</b> sifariş dəyəri</span><span><b>${money(avg)}</b> orta sifariş</span>`;
}

function renderAdminDashboardAnalytics(orders){
    const key=s.adminDashboardRange||'7';
    const config=DASHBOARD_RANGES[key]||DASHBOARD_RANGES['7'];
    const rangeOrders=filterDashboardOrders(orders,key);
    const active=rangeOrders.filter(o=>!isCancelledOrder(o));
    const title=document.getElementById('adminSalesChartTitle');
    const select=document.getElementById('adminDashboardRange');
    if(title) title.textContent=key==='all'?'Bütün dövr · qrafik son 30 gün':config.label;
    if(select && select.value!==key) select.value=key;
    renderAdminDashboardSummary(rangeOrders);
    renderAdminSalesChart(active,key);
    renderAdminTopProducts(active);
}

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
        const status=document.getElementById('adminApiStatus');
        if(status) status.textContent='✅ Supabase Admin bağlantısı işləkdir.';
    }catch(e){
        const status=document.getElementById('adminApiStatus');
        if(status) status.textContent=`⚠️ Admin API əlçatan deyil (${e.message||'xəta'}). Supabase cədvəlləri və təhlükəsizlik siyasətləri qurulmayıb və ya hesab admin deyil.`;
        const stat=document.getElementById('adminStatProducts');
        if(stat) stat.textContent=s.products.length;
    }
}

function renderAdminDashboardStats(ps,os,rs){
    const active=os.filter(o=>!ctx.isCancelledOrder(o));
    const completed=os.filter(o=>o.status==='completed');
    const now=new Date();
    const todayKey=now.toLocaleDateString('az-AZ');
    const today=active.filter(o=>{const d=ctx.orderDateValue(o);return d&&d.toLocaleDateString('az-AZ')===todayKey;});
    const revenue=active.reduce((sum,o)=>sum+ctx.orderAmount(o),0);
    const todayRevenue=today.reduce((sum,o)=>sum+ctx.orderAmount(o),0);
    const average=active.length?revenue/active.length:0;
    document.getElementById('adminStatProducts').textContent=ps.length;
    document.getElementById('adminStatOrders').textContent=os.length;
    document.getElementById('adminStatTodayOrders').textContent=today.length;
    document.getElementById('adminStatPending').textContent=os.filter(x=>['pending_confirmation','confirmed','preparing'].includes(x.status)).length;
    document.getElementById('adminStatCompleted').textContent=completed.length;
    document.getElementById('adminStatRevenue').textContent=money(revenue);
    document.getElementById('adminStatTodayRevenue').textContent=money(todayRevenue);
    document.getElementById('adminStatAverage').textContent=money(average);
    document.getElementById('adminStatReviews').textContent=rs.filter(x=>!x.status||x.status==='pending').length;
    renderAdminDashboardAnalytics(os);
    ctx.renderAdminRecentOrders(os);
}

function renderAdminSalesChart(orders,rangeKey=s.adminDashboardRange||'7'){
    const box=document.getElementById('adminSalesChart'); if(!box)return;
    const config=DASHBOARD_RANGES[rangeKey]||DASHBOARD_RANGES['7'];
    const days=config.days===null?30:config.days;
    const base=new Date(); base.setHours(0,0,0,0);
    const rows=[];
    for(let i=days-1;i>=0;i--){
        const d=new Date(base); d.setDate(base.getDate()-i); rows.push(d);
    }
    const computed=rows.map(d=>{
        const key=d.toLocaleDateString('az-AZ');
        const same=orders.filter(o=>{const od=ctx.orderDateValue(o);return od&&od.toLocaleDateString('az-AZ')===key;});
        return {date:d,count:same.length,amount:same.reduce((sum,o)=>sum+ctx.orderAmount(o),0)};
    });
    const max=Math.max(...computed.map(x=>x.amount),1);
    const compact=days>14;
    box.classList.toggle('is-compact',compact);
    box.innerHTML=computed.map((x,idx)=>{
        const h=Math.max(4,(x.amount/max)*155);
        const label=compact&&idx%3!==0?'':ctx.formatDateShort(x.date);
        return `<div class="admin-chart-col" title="${x.date.toLocaleDateString('az-AZ')}: ${x.count} sifariş · ${money(x.amount)}"><div class="admin-chart-value">${x.amount?money(x.amount):'0 ₼'}</div><div class="admin-chart-bar" style="height:${h}px"></div><div class="admin-chart-label">${label}</div></div>`;
    }).join('');
}

function renderAdminTopProducts(orders){
    const box=document.getElementById('adminTopProducts'); if(!box)return;
    const map=new Map();
    orders.forEach(o=>(o.items||[]).forEach(i=>{
        const key=String(i.productId||i.name||'unknown');
        const row=map.get(key)||{name:i.name||`Məhsul #${i.productId||'?'}`,qty:0,revenue:0};
        row.qty += Number(i.qty)||0;
        row.revenue += (Number(i.price)||0)*(Number(i.qty)||0);
        map.set(key,row);
    }));
    const list=[...map.values()].sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue).slice(0,5);
    if(!list.length){box.innerHTML='<div class="admin-empty">Bu dövr üçün sifariş məlumatı yoxdur.</div>';return;}
    box.innerHTML=list.map((x,idx)=>`<div class="admin-top-product"><div class="admin-top-rank">#${idx+1}</div><div><div class="admin-top-name">${escapeHTML(x.name)}</div><div class="admin-top-meta">${money(x.revenue)} məhsul dəyəri</div></div><div class="admin-top-qty">${x.qty} əd.</div></div>`).join('');
}

function renderAdminRecentOrders(orders){
    const box=document.getElementById('adminRecentOrders'); if(!box)return;
    const list=[...orders].sort((a,b)=>(ctx.orderDateValue(b)?.getTime()||0)-(ctx.orderDateValue(a)?.getTime()||0)).slice(0,5);
    if(!list.length){box.innerHTML='<div class="admin-empty">Hələ sifariş yoxdur.</div>';return;}
    box.innerHTML=list.map(o=>`<div class="admin-recent-order"><div class="admin-recent-code">${escapeHTML(o.orderCode||`#${o.id||'?'}`)}</div><div><div class="admin-recent-customer">${escapeHTML(o.customer?.name||o.name||'Müştəri')}</div><div class="admin-recent-date">${ctx.formatDateLong(ctx.orderDateValue(o))} · <span class="admin-recent-status">${escapeHTML(ADMIN_STATUS_LABELS[o.status]||o.status||'Naməlum')}</span></div></div><div class="admin-recent-amount">${money(ctx.orderAmount(o))}</div></div>`).join('');
}

function csvCell(value,formulaSafe=false){
    let text=String(value??'').replace(/\r?\n/g,' ');
    if(formulaSafe && /^[=+@]/.test(text)) text=`'${text}`;
    if(formulaSafe && /^-/.test(text) && !/^-?\d[\d., ]*$/.test(text)) text=`'${text}`;
    return `"${text.replace(/"/g,'""')}"`;
}

async function exportAdminDashboardCSV(){
    const valid=await ctx.validateAdminSession?.(false);
    if(valid===false) return;
    const key=s.adminDashboardRange||'7';
    const config=DASHBOARD_RANGES[key]||DASHBOARD_RANGES['7'];
    const rangeOrders=filterDashboardOrders(s.adminOrders||[],key).sort((a,b)=>(ctx.orderDateValue(b)?.getTime()||0)-(ctx.orderDateValue(a)?.getTime()||0));
    const lines=[
        ['Sifariş kodu','Tarix','Status','Müştəri','Telefon','Email','Məbləğ (AZN)','Məhsullar'].map(v=>csvCell(v)).join(',')
    ];
    rangeOrders.forEach(o=>{
        const items=(o.items||[]).map(i=>`${i.name||'Məhsul'} x${Number(i.qty)||0}`).join(' | ');
        lines.push([
            o.orderCode||`#${o.id||''}`,
            formatDateLong(orderDateValue(o)),
            ADMIN_STATUS_LABELS[o.status]||o.status||'',
            o.customer?.name||o.name||'',
            o.customer?.phone||o.phone||'',
            o.customer?.email||o.email||'',
            orderAmount(o).toFixed(2),
            items
        ].map((v,idx)=>csvCell(v,idx>0&&idx!==6)).join(','));
    });
    const blob=new Blob([`\uFEFF${lines.join('\n')}`],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const stamp=new Date().toISOString().slice(0,10);
    a.href=url;
    a.download=`f1-studio-sifarisler-${key}-${stamp}.csv`;
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function initDashboard(){
    if(!s.adminDashboardRange) s.adminDashboardRange='7';
    Object.assign(ctx, {
        orderAmount, isCancelledOrder, orderDateValue, formatDateShort, formatDateLong,
        renderAdminDashboardStats, renderAdminSalesChart, renderAdminTopProducts, renderAdminRecentOrders,
        loadAdminDashboard, setAdminDashboardRange, exportAdminDashboardCSV, filterDashboardOrders,
        getDashboardRangeStart, renderAdminDashboardAnalytics
    });
}
