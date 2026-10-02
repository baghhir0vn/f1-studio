import { escapeHTML, money } from './ui.js';
import { safeResourceUrl } from './security.js';
import { state as s, ctx } from './state.js';
import { ADMIN_API, ADMIN_STATUS_LABELS } from './admin-shared.js';

let dashboardRange = "7";
const statusColors = {
  pending_confirmation:"#4385f5", confirmed:"#f4aa18", preparing:"#f4aa18",
  ready:"#8953ed", shipped:"#8953ed", completed:"#0eaf82", cancelled:"#ed3038"
};
function orderAmount(o){
  const n=Number(o.total_cents);
  return Number.isFinite(n)?n/100:Number(o.total||0);
}
function isCancelledOrder(o){ return o.status === "cancelled"; }
function orderDateValue(o){ const d=new Date(o.createdAt||o.created_at||o.date||0); return Number.isNaN(d.getTime())?null:d; }
function formatDateShort(d){ return d?d.toLocaleDateString("az-AZ",{day:"2-digit",month:"2-digit"}):"-"; }
function formatDateLong(d){ return d?d.toLocaleString("az-AZ",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"-"; }
function getRange(){
  const select=document.getElementById("adminDashboardRange");
  return select?.value||dashboardRange;
}
function filterOrdersForRange(orders, range=getRange()){
  if(range==="all") return [...orders];
  const now=new Date(), start=new Date(now);
  start.setHours(0,0,0,0);
  if(range==="today") return orders.filter(o=>{const d=orderDateValue(o);return d&&d>=start&&d<=now;});
  start.setDate(start.getDate()-(range==="30"?29:6));
  return orders.filter(o=>{const d=orderDateValue(o);return d&&d>=start&&d<=now;});
}
function renderAdminDashboardStats(ps,os,rs){
  const active=os.filter(o=>!isCancelledOrder(o));
  const completed=os.filter(o=>o.status==="completed");
  const now=new Date(), todayKey=now.toLocaleDateString("az-AZ");
  const today=active.filter(o=>{const d=orderDateValue(o);return d&&d.toLocaleDateString("az-AZ")===todayKey;});
  const revenue=active.reduce((sum,o)=>sum+orderAmount(o),0);
  const todayRevenue=today.reduce((sum,o)=>sum+orderAmount(o),0);
  const average=active.length?revenue/active.length:0;
  const values={
    adminStatProducts:ps.length,adminStatOrders:os.length,adminStatTodayOrders:today.length,
    adminStatPending:os.filter(x=>["pending_confirmation","confirmed","preparing"].includes(x.status)).length,
    adminStatCompleted:completed.length,adminStatRevenue:money(revenue),
    adminStatTodayRevenue:money(todayRevenue),adminStatAverage:money(average),
    adminStatReviews:rs.filter(x=>!x.status||x.status==="pending").length
  };
  Object.entries(values).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=String(value);});
  dashboardRange=getRange();
  ["adminDashboardRange","adminStatusRange"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=dashboardRange;});
  ctx.renderAdminSalesChart(active,dashboardRange);
  ctx.renderAdminOrderStatusChart(os,dashboardRange);
  ctx.renderAdminTopProducts(active);
  ctx.renderAdminRecentOrders(os);
  const dashboard=document.getElementById("adminView-dashboard");
  if(dashboard)dashboard.setAttribute("aria-busy","false");
}
function makeBuckets(orders,range){
  const now=new Date(), buckets=[];
  if(range==="today"){
    const base=new Date(now);base.setHours(0,0,0,0);
    for(let hour=0;hour<24;hour+=3){const from=new Date(base);from.setHours(hour);const to=new Date(from);to.setHours(hour+3);buckets.push({from,to,label:String(hour).padStart(2,"0")+":00"});}
  }else if(range==="30"){
    const base=new Date(now);base.setHours(0,0,0,0);base.setDate(base.getDate()-29);
    for(let i=0;i<15;i++){const from=new Date(base);from.setDate(base.getDate()+i*2);const to=new Date(from);to.setDate(to.getDate()+2);buckets.push({from,to,label:formatDateShort(from)});}
  }else if(range==="all"){
    const first=new Date(now.getFullYear(),now.getMonth()-11,1);
    for(let i=0;i<12;i++){const from=new Date(first.getFullYear(),first.getMonth()+i,1),to=new Date(first.getFullYear(),first.getMonth()+i+1,1);buckets.push({from,to,label:from.toLocaleDateString("az-AZ",{month:"short"})});}
  }else{
    const base=new Date(now);base.setHours(0,0,0,0);
    for(let i=6;i>=0;i--){const from=new Date(base);from.setDate(base.getDate()-i);const to=new Date(from);to.setDate(to.getDate()+1);buckets.push({from,to,label:formatDateShort(from)});}
  }
  return buckets.map(b=>{
    const matching=orders.filter(o=>{const d=orderDateValue(o);return d&&d>=b.from&&d<b.to;});
    return {...b,count:matching.length,amount:matching.reduce((sum,o)=>sum+orderAmount(o),0)};
  });
}
function smoothLine(points){
  if(!points.length)return "";
  if(points.length===1)return `M ${points[0].x} ${points[0].y}`;
  let d=`M ${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length;i++){
    const prev=points[i-1],next=points[i],mid=(prev.x+next.x)/2;
    d+=` C ${mid} ${prev.y}, ${mid} ${next.y}, ${next.x} ${next.y}`;
  }
  return d;
}
function renderAdminSalesChart(orders,range=getRange()){
  const box=document.getElementById("adminSalesChart");if(!box)return;
  const ranged=filterOrdersForRange(orders,range), rows=makeBuckets(ranged,range);
  const summary=document.getElementById("adminDashboardRangeSummary");
  const sum=ranged.reduce((n,o)=>n+orderAmount(o),0);
  if(summary)summary.textContent=`${ranged.length} sifariş · ${money(sum)} qeydə alınmış gəlir`;
  if(!rows.some(x=>x.count)){box.innerHTML='<div class="admin-chart-empty">Bu dövr üzrə sifariş məlumatı yoxdur.</div>';return;}
  const W=760,H=236,left=53,right=15,top=12,bottom=31,plotW=W-left-right,plotH=166,baseY=top+plotH;
  const max=Math.max(...rows.map(x=>x.amount),1);
  const points=rows.map((r,i)=>({x:left+(rows.length===1?plotW/2:i*plotW/(rows.length-1)),y:top+plotH-(r.amount/max)*plotH,row:r}));
  const line=smoothLine(points),first=points[0],last=points[points.length-1];
  const area=`${line} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
  const grid=Array.from({length:5},(_,i)=>{
    const y=top+i*plotH/4,value=max*(1-i/4);
    return `<line class="admin-chart-grid" x1="${left}" y1="${y}" x2="${W-right}" y2="${y}"/><text class="admin-chart-axis" x="${left-8}" y="${y+3}" text-anchor="end">${escapeHTML(money(value))}</text>`;
  }).join("");
  const step=rows.length>14?Math.ceil(rows.length/8):1;
  const labels=points.map((p,i)=>i%step===0||i===points.length-1?`<text class="admin-chart-axis" x="${p.x}" y="${H-8}" text-anchor="middle">${escapeHTML(p.row.label)}</text>`:"").join("");
  const circles=points.map(p=>`<circle class="admin-chart-point" cx="${p.x}" cy="${p.y}" r="3.8"><title>${escapeHTML(p.row.label)} · ${p.row.count} sifariş · ${escapeHTML(money(p.row.amount))}</title></circle>`).join("");
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Seçilmiş dövr üzrə sifariş gəliri"><defs><linearGradient id="adminChartAreaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ed262d" stop-opacity=".24"/><stop offset="100%" stop-color="#ed262d" stop-opacity=".015"/></linearGradient></defs>${grid}<path class="admin-chart-area" d="${area}"/><path class="admin-chart-line" d="${line}"/>${circles}${labels}</svg>`;
}
function renderAdminOrderStatusChart(orders,range=getRange()){
  const chart=document.getElementById("adminStatusChart"),legend=document.getElementById("adminStatusLegend"),total=document.getElementById("adminStatusTotal");
  if(!chart||!legend||!total)return;
  const list=filterOrdersForRange(orders,range),counts=new Map(Object.keys(ADMIN_STATUS_LABELS).map(key=>[key,0]));
  list.forEach(o=>{if(counts.has(o.status))counts.set(o.status,counts.get(o.status)+1);});
  const present=[...counts].filter(([,count])=>count>0),grand=list.length;
  total.textContent=String(grand);
  if(!grand){chart.style.background="conic-gradient(#eef1f5 0deg 360deg)";legend.innerHTML='<div class="admin-empty">Bu dövr üzrə sifariş yoxdur.</div>';return;}
  let angle=0;
  const stops=present.map(([key,count])=>{const end=angle+count/grand*360,color=statusColors[key]||"#9aa3b2";const stop=`${color} ${angle}deg ${end}deg`;angle=end;return stop;});
  chart.style.background=`conic-gradient(${stops.join(",")})`;
  legend.innerHTML=present.map(([key,count])=>{
    const label=ADMIN_STATUS_LABELS[key]||key,pct=Math.round(count/grand*100),color=statusColors[key]||"#9aa3b2";
    return `<div class="admin-status-row"><span class="admin-status-label"><i class="admin-status-swatch" style="background:${color}"></i>${escapeHTML(label)}</span><b>${count}</b><small>${pct}%</small></div>`;
  }).join("");
}
function setAdminDashboardRange(target){
  const value=typeof target==="string"?target:target?.value;
  if(!["today","7","30","all"].includes(value))return;
  dashboardRange=value;
  ["adminDashboardRange","adminStatusRange"].forEach(id=>{const el=document.getElementById(id);if(el)el.value=value;});
  const active=(s.adminOrders||[]).filter(o=>!isCancelledOrder(o));
  renderAdminSalesChart(active,value);
  renderAdminOrderStatusChart(s.adminOrders||[],value);
}
function productForItem(item){
  const id=String(item.productId??item.product_id??"");
  const name=String(item.name||"").trim().toLocaleLowerCase();
  return (s.adminProducts||[]).find(p=>(id&&String(p.id)===id)||(name&&String(p.name||"").trim().toLocaleLowerCase()===name));
}
function renderAdminTopProducts(orders){
  const box=document.getElementById("adminTopProducts");if(!box)return;
  const map=new Map();
  orders.forEach(o=>(Array.isArray(o.items)?o.items:[]).forEach(i=>{
    const key=String(i.productId||i.product_id||i.name||"unknown");
    const row=map.get(key)||{name:i.name||`Məhsul #${i.productId||i.product_id||"?"}`,productId:i.productId||i.product_id||"",qty:0,revenue:0};
    row.qty+=Number(i.qty)||0;row.revenue+=(Number(i.price)||0)*(Number(i.qty)||0);map.set(key,row);
  }));
  const list=[...map.values()].sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue).slice(0,5);
  if(!list.length){box.innerHTML='<div class="admin-empty">Hələ sifariş məlumatı yoxdur.</div>';return;}
  const fallback='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="m6 16 4-4 3 3 2-2 3 3M8 9h.01"/></svg>';
  box.innerHTML=list.map((x,idx)=>{
    const product=productForItem(x),src=safeResourceUrl(product?.image||(Array.isArray(product?.images)?product.images[0]:""));
    const thumb=src?`<img data-admin-thumb src="${escapeHTML(src)}" alt="" loading="lazy" decoding="async">`:fallback;
    return `<div class="admin-top-product"><span class="admin-top-rank">${idx+1}.</span><span class="admin-top-thumb">${thumb}</span><span class="admin-top-copy"><span class="admin-top-name">${escapeHTML(x.name)}</span><span class="admin-top-meta">${x.qty} satış</span></span><span class="admin-top-revenue">${escapeHTML(money(x.revenue))}</span></div>`;
  }).join("");
  box.querySelectorAll("img[data-admin-thumb]").forEach(img=>img.addEventListener("error",()=>{const holder=img.parentElement;if(holder)holder.innerHTML=fallback;},{once:true}));
}
function renderAdminRecentOrders(orders){
  const box=document.getElementById("adminRecentOrders");if(!box)return;
  const list=[...orders].sort((a,b)=>(orderDateValue(b)?.getTime()||0)-(orderDateValue(a)?.getTime()||0)).slice(0,5);
  if(!list.length){box.innerHTML='<tr><td colspan="6" class="admin-empty">Hələ sifariş yoxdur.</td></tr>';return;}
  box.innerHTML=list.map(o=>{
    const key=Object.hasOwn(ADMIN_STATUS_LABELS,o.status)?o.status:"unknown";
    const label=ADMIN_STATUS_LABELS[o.status]||o.status||"Naməlum";
    const code=o.orderCode||`#${o.id||"?"}`;
    const customer=o.customer?.name||o.name||"Müştəri";
    const date=orderDateValue(o);
    return `<tr><td>${escapeHTML(code)}</td><td><span class="admin-order-customer">${escapeHTML(customer)}</span></td><td>${escapeHTML(money(orderAmount(o)))}</td><td><span class="admin-status-badge status-${key}">${escapeHTML(label)}</span></td><td><span class="admin-order-time">${escapeHTML(formatDateLong(date))}</span></td><td><button class="admin-order-open" type="button" data-action="switchAdminView" data-action-args='["orders"]' aria-label="Sifarişlərə keç"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></td></tr>`;
  }).join("");
}
async function loadAdminDashboard(){
  const dashboard=document.getElementById("adminView-dashboard"),status=document.getElementById("adminApiStatus");
  if(dashboard)dashboard.setAttribute("aria-busy","true");
  if(status)status.textContent="Dashboard məlumatları yüklənir...";
  try{
    const [p,o,r]=await Promise.all([ctx.adminApi(ADMIN_API.products),ctx.adminApi(ADMIN_API.orders),ctx.adminApi(ADMIN_API.reviews)]);
    const ps=Array.isArray(p.products)?p.products:[],os=Array.isArray(o.orders)?o.orders:[],rs=Array.isArray(r.reviews)?r.reviews:[];
    s.adminProducts=ps;s.adminOrders=os;s.adminReviews=rs;
    renderAdminDashboardStats(ps,os,rs);
    if(status)status.textContent="Supabase admin bağlantısı işləkdir.";
  }catch(error){
    if(dashboard)dashboard.setAttribute("aria-busy","false");
    if(status)status.textContent="Dashboard məlumatlarını yükləmək mümkün olmadı. Sessiyanı və bağlantını yoxlayın.";
    console.error("Admin dashboard load failed:",error);
  }
}
export function initDashboard(){
  Object.assign(ctx,{orderAmount,isCancelledOrder,orderDateValue,formatDateShort,formatDateLong,renderAdminDashboardStats,renderAdminSalesChart,renderAdminOrderStatusChart,renderAdminTopProducts,renderAdminRecentOrders,setAdminDashboardRange,loadAdminDashboard});
}
