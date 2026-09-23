import { escapeHTML, showToast, money } from './ui.js';
import { storageService } from './services/storage-service.js';
import { state as s, ctx } from './state.js';
import { isCustomerDesignPathOwnedBy, isSafeCustomerDesignPath } from './security.js';
import { ADMIN_API, ADMIN_STATUS_LABELS, formatAdminCustomerDate } from './admin-shared.js';
const ADMIN_ORDER_FLOW = ['pending_confirmation','confirmed','preparing','ready','shipped','completed'];
function orderDateValue(order){
    const d=new Date(order?.createdAt||order?.created_at||order?.date||0);
    return Number.isNaN(d.getTime())?null:d;
}
function orderAmount(order){
    const cents=Number(order?.total_cents);
    return Number.isFinite(cents)?cents/100:Number(order?.total||0);
}
function normalizeText(value){
    return String(value||'').toLocaleLowerCase('az-AZ').trim();
}
function normalizeWhatsAppPhone(raw){
    let digits=String(raw||'').replace(/\D/g,'');
    if(digits.startsWith('994')) return digits;
    if(digits.startsWith('0')) return `994${digits.slice(1)}`;
    return digits;
}
function buildCustomerWhatsAppUrl(order){
    const phone=normalizeWhatsAppPhone(order?.customer?.phone);
    if(!/^994\d{9}$/.test(phone)) return '';
    const code=order?.orderCode||`#${order?.id||'?'}`;
    const status=ADMIN_STATUS_LABELS[order?.status]||order?.status||'Naməlum';
    const lines=[
        'Salam! F1 Studio-dan sifarişiniz barədə yazıram.',
        `Sifariş kodu: ${code}`,
        `Status: ${status}`,
        `Sifariş dəyəri: ${money(orderAmount(order))}`
    ];
    return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}
function buildOrderCopyText(order){
    const lines=[
        `F1 Studio — ${order?.orderCode||`#${order?.id||'?'}`}`,
        `Müştəri: ${order?.customer?.name||'—'}`,
        `Telefon: ${order?.customer?.phone||'—'}`,
        `Email: ${order?.customer?.email||'—'}`,
        `Tarix: ${formatAdminCustomerDate(order?.createdAt)}`,
        `Status: ${ADMIN_STATUS_LABELS[order?.status]||order?.status||'Naməlum'}`,
        `Çatdırılma: ${order?.delivery==='pickup'?'Mağazadan götürmə':order?.delivery==='ganja'?'Gəncə daxili çatdırılma':'Rayonlara poçtla göndəriş'}`,
        `Ünvan: ${order?.delivery==='pickup'?'—':order?.addressUnknown?'Telefonla dəqiqləşdirilsin':order?.address||'—'}`,
        `Hədiyyə qablaşdırması: ${order?.giftWrap?'Bəli':'Xeyr'}`,
        `Cəmi: ${money(orderAmount(order))}`,
        '',
        'Məhsullar:'
    ];
    (order?.items||[]).forEach((item,index)=>{
        const c=item.customization||{};
        const options=[c.text?`Yazı: ${c.text}`:'',c.color?`Rəng: ${c.color}`:'',c.size?`Ölçü: ${c.size}${c.sizeValue?` (${c.sizeValue})`:''}`:'',c.font?`Şrift: ${c.font}`:'',c.note?`Qeyd: ${c.note}`:''].filter(Boolean).join(' · ');
        lines.push(`${index+1}. ${item.name||`Məhsul #${item.productId||'?'}`} × ${Number(item.qty)||1}`);
        if(options) lines.push(`   ${options}`);
        if(c.imageName) lines.push(`   Dizayn: ${c.imageName}`);
    });
    return lines.join('\n');
}
async function loadAdminOrders(){
    try{
        const data=await ctx.adminApi(ADMIN_API.orders);
        s.adminOrders=Array.isArray(data.orders)?data.orders:[];
        ctx.renderAdminOrders();
    }catch(e){
        s.adminOrders=[];
        ctx.renderAdminOrders();
        showToast('Supabase-dən sifarişlər oxunmadı.');
    }
}
async function getAdminCustomerDesignSignedUrl(path){
    if(!path) throw new Error('DESIGN_PATH_MISSING');
    const cached=s.adminCustomerDesignSignedUrlCache?.get(path);
    if(cached && cached.expiresAt>Date.now()+30_000) return cached.url;
    const url=await storageService.createCustomerDesignSignedUrl(path,3600);
    s.adminCustomerDesignSignedUrlCache?.set(path,{url,expiresAt:Date.now()+55*60*1000});
    return url;
}
async function hydrateAdminCustomerDesignLinks(){
    if(!ctx.isAdminUser()) return;
    const links=[...document.querySelectorAll('#adminOrdersList a[data-design-path]')];
    await Promise.all(links.map(async link=>{
        const path=link.getAttribute('data-design-path')||'';
        const ownerId=link.getAttribute('data-owner-id')||'';
        if(!path || !ownerId || !isCustomerDesignPathOwnedBy(path, ownerId)){
            link.removeAttribute('href');
            link.textContent='⚠️ Dizayn linki etibarsızdır';
            link.style.pointerEvents='none';
            link.style.opacity='.6';
            link.setAttribute('aria-disabled','true');
            return;
        }
        try{
            const url=await ctx.getAdminCustomerDesignSignedUrl(path);
            const safeUrl=/^https:\/\/rfkqxiwbicjsszjbdhzd\.supabase\.co\//i.test(url)?url:'';
            if(!safeUrl) throw new Error('DESIGN_SIGNED_URL_FAILED');
            link.href=safeUrl;
            link.textContent='📎 Dizayn faylını aç';
            link.style.pointerEvents='auto';
            link.style.opacity='1';
            link.setAttribute('aria-disabled','false');
        }catch(e){
            console.error('Admin customer design signed URL error:',e);
            link.removeAttribute('href');
            link.textContent='⚠️ Dizayn açıla bilmədi';
            link.style.pointerEvents='none';
            link.style.opacity='.6';
            link.setAttribute('aria-disabled','true');
        }
    }));
}
function getFilteredOrders(){
    const query=normalizeText(document.getElementById('adminOrderSearch')?.value||'');
    const status=document.getElementById('adminOrderFilter')?.value||'';
    const sort=document.getElementById('adminOrderSort')?.value||'newest';
    const list=s.adminOrders.filter(order=>{
        if(status && order.status!==status) return false;
        if(!query) return true;
        const hay=normalizeText([
            order.orderCode,order.customer?.name,order.customer?.phone,order.customer?.email,
            ...(order.items||[]).map(item=>item.name)
        ].join(' '));
        return hay.includes(query);
    });
    list.sort((a,b)=>{
        const at=orderDateValue(a)?.getTime()||0, bt=orderDateValue(b)?.getTime()||0;
        return sort==='oldest'?at-bt:bt-at;
    });
    return list;
}
function renderAdminOrders(){
    const box=document.getElementById('adminOrdersList');
    if(!box) return;
    const list=getFilteredOrders();
    if(!list.length){box.innerHTML='<div class="admin-empty">Bu filtrə uyğun sifariş tapılmadı.</div>';return;}
    box.innerHTML=list.map(order=>{
        const customerName=order.customer?.name||order.name||'Müştəri';
        const customerPhone=order.customer?.phone||order.phone||'Telefon yoxdur';
        const whatsapp=buildCustomerWhatsAppUrl(order);
        const currentIndex=ADMIN_ORDER_FLOW.indexOf(order.status);
        const nextStatus=currentIndex>=0 && currentIndex<ADMIN_ORDER_FLOW.length-1?ADMIN_ORDER_FLOW[currentIndex+1]:'';
        const items=(order.items||[]).map(item=>{
            const c=item.customization||{};
            const custom=[c.text?`Yazı: ${c.text}`:'',c.color?`Rəng: ${c.color}`:'',c.size?`Ölçü: ${c.size}${c.sizeValue?` (${c.sizeValue})`:''}`:'',c.font?`Şrift: ${c.font}`:'',c.note?`Qeyd: ${c.note}`:'',c.imageName?`Dizayn: ${c.imageName}`:'',c.layout?`Studio: ${c.layout.version===3?'layout v3':'layout'}`:''].filter(Boolean).join(' · ');
            const design=c.imagePath && isSafeCustomerDesignPath(c.imagePath) && order.customer?.userId
                ? `<div style="margin-top:7px"><a class="admin-design-link" href="#" data-design-path="${escapeHTML(c.imagePath)}" data-owner-id="${escapeHTML(order.customer.userId)}" target="_blank" rel="noopener noreferrer">⏳ Dizayn hazırlanır...</a></div>`
                : '';
            return `<div class="admin-pill"><b>${escapeHTML(item.name||`Məhsul #${item.productId||'?'}`)} ×${Number(item.qty)||1}</b>${custom?`<div class="admin-muted" style="margin-top:5px">${escapeHTML(custom)}</div>`:''}${design}</div>`;
        }).join('');
        const argsFor=(id,status)=>`[${Number(id||0)},${JSON.stringify(status)}]`;
        return `<article class="admin-order-card" data-order-id="${Number(order.id||0)}">
            <div class="admin-order-head">
                <div>
                    <b class="admin-order-code">${escapeHTML(order.orderCode||`#${order.id||'?'}`)}</b>
                    <div class="admin-muted">${escapeHTML(customerName)} · ${escapeHTML(customerPhone)}</div>
                    <div class="admin-muted">${escapeHTML(formatAdminCustomerDate(order.createdAt))}</div>
                </div>
                <div class="admin-status">${escapeHTML(ADMIN_STATUS_LABELS[order.status]||order.status||'Naməlum')}</div>
            </div>
            <div class="admin-order-info-grid">
                <div><span>Status</span><b>${escapeHTML(ADMIN_STATUS_LABELS[order.status]||order.status||'—')}</b></div>
                <div><span>Sifariş dəyəri</span><b>${escapeHTML(money(orderAmount(order)))}</b></div>
                <div><span>Çatdırılma</span><b>${escapeHTML(order.delivery==='pickup'?'Mağazadan götürmə':order.delivery==='ganja'?'Gəncə daxili':'Rayonlar / poçt')}</b></div>
                <div><span>Ünvan</span><b>${escapeHTML(order.delivery==='pickup'?'—':order.addressUnknown?'Telefonla dəqiqləşdiriləcək':order.address||'—')}</b></div>
                <div><span>Email</span><b>${escapeHTML(order.customer?.email||'—')}</b></div>
                <div><span>Hədiyyə qablaşdırması</span><b>${order.giftWrap?'Bəli':'Xeyr'}</b></div>
            </div>
            <div style="margin-top:10px"><div class="admin-muted" style="margin-bottom:7px"><b>Məhsullar</b></div>${items||'<div class="admin-empty">Məhsul məlumatı yoxdur.</div>'}</div>
            <div class="admin-actions admin-order-actions" style="margin-top:12px">
                <select class="admin-order-status-select" data-order-status-select="${Number(order.id||0)}" aria-label="Sifariş statusu">${Object.entries(ADMIN_STATUS_LABELS).map(([key,label])=>`<option value="${key}" ${order.status===key?'selected':''}>${escapeHTML(label)}</option>`).join('')}</select>
                <button class="admin-primary" data-action="setAdminOrderStatusFromSelect" data-action-args='[${Number(order.id||0)}]'>Statusu yadda saxla</button>
                ${nextStatus?`<button class="admin-next-status" data-action="setAdminOrderStatus" data-action-args='${argsFor(order.id,nextStatus)}'>→ ${escapeHTML(ADMIN_STATUS_LABELS[nextStatus])}</button>`:''}
                ${whatsapp?`<a class="admin-whatsapp-link" href="${escapeHTML(whatsapp)}" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>`:''}
                <button data-action="copyAdminOrderSummary" data-action-args='[${Number(order.id||0)}]'>📋 Kopyala</button>
                ${order.status==='cancelled' || order.status==='completed'?'':`<button class="danger" data-action="setAdminOrderStatus" data-action-args='${argsFor(order.id,'cancelled')}'>Ləğv et</button>`}
            </div>
        </article>`;
    }).join('');
    ctx.hydrateAdminCustomerDesignLinks();
}
async function setAdminOrderStatus(id,status){
    if(!id) return showToast('Sifariş ID-si tapılmadı.');
    if(status==='cancelled' && !window.confirm('Bu sifarişi ləğv etmək istəyirsiniz?')) return;
    try{
        await ctx.adminApi(`${ADMIN_API.orders}/${id}`,{method:'PATCH',body:JSON.stringify({status})});
        await ctx.loadAdminOrders();
        showToast('Sifariş statusu yeniləndi.');
    }catch(e){
        console.error('Admin order status error:',e);
        showToast('Sifariş statusu Supabase-də dəyişdirilmədi.');
    }
}
async function setAdminOrderStatusFromSelect(id){
    const select=document.querySelector(`select[data-order-status-select="${Number(id||0)}"]`);
    if(!select) return showToast('Status seçimi tapılmadı.');
    return setAdminOrderStatus(Number(id),select.value);
}
async function copyAdminOrderSummary(id){
    const order=s.adminOrders.find(item=>Number(item.id)===Number(id));
    if(!order) return showToast('Sifariş tapılmadı.');
    const text=buildOrderCopyText(order);
    try{
        await navigator.clipboard.writeText(text);
        showToast('📋 Sifariş məlumatı kopyalandı.');
    }catch(e){
        console.error('Order copy error:',e);
        showToast('Sifariş məlumatını kopyalamaq alınmadı.');
    }
}
export function initOrders(){
    Object.assign(ctx, {
        loadAdminOrders,
        getAdminCustomerDesignSignedUrl,
        hydrateAdminCustomerDesignLinks,
        renderAdminOrders,
        setAdminOrderStatus,
        setAdminOrderStatusFromSelect,
        copyAdminOrderSummary,
        formatAdminCustomerDate,
        orderDateValue,
        orderAmount
    });
}
