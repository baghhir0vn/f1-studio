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

function updateAdminOrderBulkBar(){
    const bar=document.getElementById('adminOrdersBulkBar');
    const countEl=document.getElementById('adminOrdersSelectedCount');
    const selectAll=document.getElementById('adminSelectAllOrders');
    const checkboxes=[...document.querySelectorAll('#adminOrdersList [data-admin-order-select]')];
    const selected=checkboxes.filter(input=>input.checked);
    if(bar) bar.hidden=!checkboxes.length;
    if(countEl) countEl.textContent=`${selected.length} sifariş seçilib`;
    if(selectAll){
        selectAll.checked=checkboxes.length>0 && selected.length===checkboxes.length;
        selectAll.indeterminate=selected.length>0 && selected.length<checkboxes.length;
    }
}

function toggleAllAdminOrders(input){
    const checked=!!input?.checked;
    document.querySelectorAll('#adminOrdersList [data-admin-order-select]').forEach(box=>{box.checked=checked;});
    updateAdminOrderBulkBar();
}

function clearAdminOrderSelection(){
    document.querySelectorAll('#adminOrdersList [data-admin-order-select]').forEach(box=>{box.checked=false;});
    const selectAll=document.getElementById('adminSelectAllOrders');
    if(selectAll){selectAll.checked=false;selectAll.indeterminate=false;}
    updateAdminOrderBulkBar();
}

async function setSelectedAdminOrderStatus(){
    const ids=[...document.querySelectorAll('#adminOrdersList [data-admin-order-select]:checked')]
        .map(box=>Number(box.value)).filter(id=>Number.isInteger(id)&&id>0);
    const status=document.getElementById('adminBulkOrderStatus')?.value||'';
    if(!ids.length) return showToast('Əvvəlcə ən azı bir sifariş seç.');
    if(!status) return showToast('Yeni status seç.');
    if(status==='cancelled' && !window.confirm(`${ids.length} sifarişi ləğv etmək istəyirsiniz?`)) return;

    let success=0;
    for(const id of ids){
        try{
            await ctx.adminApi(`${ADMIN_API.orders}/${id}`,{method:'PATCH',body:JSON.stringify({status})});
            success++;
        }catch(error){
            console.error('Bulk admin order status error:',id,error);
        }
    }
    await ctx.loadAdminOrders();
    const failed=ids.length-success;
    showToast(failed?`✅ ${success} sifariş yeniləndi, ${failed} sifariş dəyişmədi.`:`✅ ${success} sifariş yeniləndi.`);
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
    if(!list.length){box.innerHTML='<div class="admin-empty">Bu filtrə uyğun sifariş tapılmadı.</div>'; updateAdminOrderBulkBar(); return;}

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
                <div class="admin-order-title-row">
                    <label class="admin-order-select" title="Sifarişi seç">
                        <input type="checkbox" value="${Number(order.id||0)}" data-admin-order-select data-change-action="updateAdminOrderBulkBar" aria-label="${escapeHTML(order.orderCode||`Sifariş #${order.id||'?'}`)} seç">
                    </label>
                    <div>
                        <b class="admin-order-code">${escapeHTML(order.orderCode||`#${order.id||'?'}`)}</b>
                    <div class="admin-muted">${escapeHTML(customerName)} · ${escapeHTML(customerPhone)}</div>
                        <div class="admin-muted">${escapeHTML(formatAdminCustomerDate(order.createdAt))}</div>
                    </div>
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
            <div class="admin-order-note-box">
                <label for="adminOrderNote-${Number(order.id||0)}"><b>📝 Admin qeydi</b><span>Yalnız adminlər görür</span></label>
                <textarea id="adminOrderNote-${Number(order.id||0)}" data-order-note="${Number(order.id||0)}" maxlength="2000" placeholder="Məs: Müştəri saat 18:00-da götürəcək...">${escapeHTML(order.adminNote||'')}</textarea>
                <div class="admin-order-note-actions"><small>Max. 2000 simvol</small><button type="button" data-action="setAdminOrderNote" data-action-args='[${Number(order.id||0)}]'>Qeydi yadda saxla</button></div>
            </div>

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
    updateAdminOrderBulkBar();
}


async function setAdminOrderNote(id){
    const field=document.querySelector(`textarea[data-order-note="${Number(id||0)}"]`);
    if(!field) return showToast('Admin qeydi sahəsi tapılmadı.');
    const note=field.value.trim().slice(0,2000);
    try{
        await ctx.adminApi(`${ADMIN_API.orders}/${id}`,{method:'PATCH',body:JSON.stringify({admin_note:note})});
        const order=s.adminOrders.find(item=>Number(item.id)===Number(id));
        if(order) order.adminNote=note;
        showToast(note?'📝 Admin qeydi yadda saxlanıldı.':'📝 Admin qeydi təmizləndi.');
    }catch(e){
        console.error('Admin order note error:',e);
        showToast('Admin qeydi Supabase-də yadda saxlanmadı.');
    }
}

async function setAdminOrderStatus(id,status){
    if(!id) return showToast('Sifariş ID-si tapılmadı.');
    if(status==='cancelled' && !window.confirm('Bu sifarişi ləğv etmək istəyirsiniz?')) return;
    try{
        const result=await ctx.adminApi(`${ADMIN_API.orders}/${id}`,{method:'PATCH',body:JSON.stringify({status})});
        await ctx.loadAdminOrders();
        showToast(status==='cancelled' && result?.order?.stock_restored ? 'Sifariş ləğv edildi · stok geri qaytarıldı.' : 'Sifariş statusu yeniləndi.');
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


function csvCell(value,formulaSafe=false){
    let text=String(value??'').replace(/\r?\n/g,' ');
    if(formulaSafe && /^[=+@]/.test(text)) text=`'${text}`;
    if(formulaSafe && /^-/.test(text) && !/^-?\d[\d., ]*$/.test(text)) text=`'${text}`;
    return `"${text.replace(/"/g,'""')}"`;
}

function downloadAdminOrdersCSV(filename, rows){
    const lines=rows.map(row=>row.map((value,index)=>csvCell(value,index>0)).join(','));
    const blob=new Blob([`\uFEFF${lines.join('\n')}`],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=filename;
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function exportAdminOrdersCSV(){
    const valid=await ctx.validateAdminSession?.(false);
    if(valid===false) return;
    const list=getFilteredOrders();
    const rows=[[
        "Sifariş kodu","Tarix","Status","Müştəri","Telefon","Email",
        "Çatdırılma","Ünvan","Məbləğ (AZN)","Hədiyyə qablaşdırması",
        "Məhsullar","Fərdiləşdirmə","Admin qeydi"
    ]];
    list.forEach(order=>{
        const items=(order.items||[]).map(item=>{
            const qty=Number(item.qty)||0;
            const price=Number(item.price)||0;
            return `${item.name||`Məhsul #${item.productId||"?"}`} x${qty} (${(price*qty).toFixed(2)} AZN)`;
        }).join(" | ");
        const customizations=(order.items||[]).map(item=>{
            const c=item.customization||{};
            const parts=[
                c.text?`Yazı: ${c.text}`:"",
                c.color?`Rəng: ${c.color}`:"",
                c.size?`Ölçü: ${c.size}${c.sizeValue?` (${c.sizeValue})`:""}`:"",
                c.font?`Şrift: ${c.font}`:"",
                c.note?`Qeyd: ${c.note}`:"",
                c.imageName?`Dizayn: ${c.imageName}`:"",
                c.layout?`Studio: ${c.layout.version===3?"layout v3":"layout"}`:""
            ].filter(Boolean);
            return parts.length?`${item.name||"Məhsul"} — ${parts.join(" · ")}`:"";
        }).filter(Boolean).join(" | ");
        rows.push([
            order.orderCode||`#${order.id||""}`,
            formatAdminCustomerDate(order.createdAt),
            ADMIN_STATUS_LABELS[order.status]||order.status||"",
            order.customer?.name||order.name||"",
            order.customer?.phone||order.phone||"",
            order.customer?.email||order.email||"",
            order.delivery==="pickup"?"Götürülmə":(order.delivery||""),
            order.delivery==="pickup"?"":(order.addressUnknown?"Telefonla dəqiqləşdiriləcək":(order.address||"")),
            orderAmount(order).toFixed(2),
            order.giftWrap?"Bəli":"Xeyr",
            items,
            customizations,
            order.admin_note||order.adminNote||""
        ]);
    });
    const status=document.getElementById("adminOrderFilter")?.value||"";
    const stamp=new Date().toISOString().slice(0,10);
    const suffix=status?`-${status}`:"";
    downloadAdminOrdersCSV(`f1-studio-sifarisler${suffix}-${stamp}.csv`,rows);
    showToast(`✅ ${list.length} sifariş CSV olaraq ixrac edildi.`);
}

export function initOrders(){
    Object.assign(ctx, {
        loadAdminOrders,
        getAdminCustomerDesignSignedUrl,
        hydrateAdminCustomerDesignLinks,
        renderAdminOrders,
        setAdminOrderStatus,
        setAdminOrderStatusFromSelect,
        setAdminOrderNote,
        copyAdminOrderSummary,
        updateAdminOrderBulkBar,
        toggleAllAdminOrders,
        clearAdminOrderSelection,
        setSelectedAdminOrderStatus,
        formatAdminCustomerDate,
        orderDateValue,
        orderAmount, exportAdminOrdersCSV
    });
}
