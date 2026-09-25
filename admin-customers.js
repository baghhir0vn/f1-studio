import { escapeHTML, money, normalizeText, showToast } from './ui.js';
import { state as s, ctx } from './state.js';
import { formatAdminCustomerDate } from './admin-shared.js';

async function loadAdminCustomers(){
        try{
            const data=await ctx.adminApi("/api/admin/customers");
            s.adminCustomers=Array.isArray(data.customers)?data.customers:[];
            ctx.renderAdminCustomers();
        }catch(e){
            s.adminCustomers=[]; ctx.renderAdminCustomers();
            console.error("Admin customers load error:",e);
            showToast("Müştəri məlumatları Supabase-dən oxunmadı.");
        }
    }
    
    function renderAdminCustomers(){
        const box=document.getElementById("adminCustomersBody"); if(!box)return;
        const q=normalizeText(document.getElementById("adminCustomerSearch")?.value||"");
        const filter=document.getElementById("adminCustomerFilter")?.value||"";
        const matches=s.adminCustomers.filter(c=>{
            if(filter==="active" && c.blocked)return false;
            if(filter==="blocked" && !c.blocked)return false;
            if(!q)return true;
            return [c.name,c.phone,c.email].some(v=>normalizeText(v).includes(q));
        });
        const totalRevenue=s.adminCustomers.reduce((sum,c)=>sum+Number(c.total_cents||0),0);
        const buyers=s.adminCustomers.filter(c=>Number(c.order_count||0)>0).length;
        document.getElementById("adminCustomerStatCount")?.replaceChildren(document.createTextNode(String(s.adminCustomers.length)));
        document.getElementById("adminCustomerStatBuyers")?.replaceChildren(document.createTextNode(String(buyers)));
        document.getElementById("adminCustomerStatRevenue")?.replaceChildren(document.createTextNode(money(totalRevenue/100)));
        if(!matches.length){box.innerHTML='<tr><td colspan="7"><div class="admin-empty">Müştəri tapılmadı.</div></td></tr>';return;}
        box.innerHTML=matches.map(c=>{
            const status=c.blocked?'<span class="admin-customer-status blocked">🔒 Bloklanmış</span>':'<span class="admin-customer-status active">● Aktiv</span>';
            const action=c.blocked
                ? `<button class="ok" data-action="setAdminCustomerBlocked" data-action-args='[${JSON.stringify(c.id)},false]'>🔓 Bloku aç</button>`
                : `<button class="danger" data-action="setAdminCustomerBlocked" data-action-args='[${JSON.stringify(c.id)},true]'>🔒 Blokla</button>`;
            return `<tr>
                <td><b>${escapeHTML(c.name||"Adsız müştəri")}</b><div class="admin-muted">${escapeHTML(formatAdminCustomerDate(c.created_at))}</div></td>
                <td>${escapeHTML(c.phone||"—")}<br><span class="admin-muted">${escapeHTML(c.email||"—")}</span></td>
                <td><b>${Number(c.order_count||0)}</b></td>
                <td><b>${money(Number(c.total_cents||0)/100)}</b></td>
                <td>${escapeHTML(formatAdminCustomerDate(c.last_order_at))}</td>
                <td>${status}</td>
                <td><div class="admin-actions"><button data-action="openAdminCustomerDetails" data-action-args='[${JSON.stringify(c.id)}]'>👤 Detallar</button><button data-action="openAdminCustomerOrders" data-action-args='[${JSON.stringify(c.id)}]'>🧾 Sifarişlər</button>${action}</div></td>
            </tr>`;
        }).join("");
    }
    
    async function openAdminCustomerOrders(id){
        const customer=s.adminCustomers.find(c=>c.id===id);
        if(!customer) return showToast('Müştəri tapılmadı.');
        try{
            if(!Array.isArray(s.adminOrders) || !s.adminOrders.length) await ctx.loadAdminOrders();
            ctx.switchAdminView('orders');
            const search=document.getElementById('adminOrderSearch');
            if(search){
                search.value=customer.phone || customer.email || customer.name || '';
                ctx.renderAdminOrders();
                search.focus();
            }
            showToast(`🔎 ${customer.name||'Müştəri'} üzrə sifarişlər göstərilir.`);
        }catch(e){
            console.error('Admin customer orders error:',e);
            showToast('Müştərinin sifarişlərini göstərmək alınmadı.');
        }
    }

    async function setAdminCustomerBlocked(id,blocked){
        const customer=s.adminCustomers.find(c=>c.id===id); if(!customer)return;
        const label=blocked?"bloklansın":"blokdan çıxarılsın";
        if(!confirm(`${customer.name||"Bu müştəri"} hesabı ${label}?`))return;
        try{
            await ctx.adminApi(`/api/admin/customers/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({blocked})});
            await ctx.loadAdminCustomers();
            showToast(blocked?"🔒 Müştəri hesabı bloklandı.":"🔓 Müştəri hesabının bloku açıldı.");
        }catch(e){
            console.error("Admin customer block error:",e);
            const msg=String(e?.message||e||"");
            showToast(msg.includes("CANNOT_BLOCK_ADMIN")?"Admin hesabı bloklana bilməz.":"Müştəri hesabının statusu dəyişdirilmədi.");
        }
    }


function customerOrdersFor(id){
    return (Array.isArray(s.adminOrders)?s.adminOrders:[])
        .filter(order=>String(order?.customer?.userId||'')===String(id))
        .sort((a,b)=>{
            const at=new Date(a?.createdAt||0).getTime()||0;
            const bt=new Date(b?.createdAt||0).getTime()||0;
            return bt-at;
        });
}

function adminCustomerStatusMarkup(customer){
    return customer?.blocked
        ? '<span class="admin-customer-status blocked">🔒 Bloklanmış</span>'
        : '<span class="admin-customer-status active">● Aktiv</span>';
}

function renderAdminCustomerDetails(id){
    const box=document.getElementById('adminCustomerDetailBody');
    if(!box) return;
    const customer=s.adminCustomers.find(c=>String(c.id)===String(id));
    if(!customer){
        box.innerHTML='<div class="admin-empty">Müştəri tapılmadı.</div>';
        return;
    }
    const orders=customerOrdersFor(customer.id);
    const nonCancelled=orders.filter(o=>o.status!=='cancelled');
    const total=nonCancelled.reduce((sum,o)=>sum+Number(o.total_cents||0),0);
    const last=orders[0]||null;
    const action=customer.blocked
        ? `<button class="ok" data-action="setAdminCustomerBlockedFromDetail" data-action-args='[${JSON.stringify(customer.id)},false]'>🔓 Bloku aç</button>`
        : `<button class="danger" data-action="setAdminCustomerBlockedFromDetail" data-action-args='[${JSON.stringify(customer.id)},true]'>🔒 Hesabı blokla</button>`;
    const ordersHtml=orders.length?orders.map(order=>{
        const items=(order.items||[]).map(item=>`${escapeHTML(item.name||'Məhsul')} ×${Number(item.qty)||1}`).join(' · ')||'Məhsul məlumatı yoxdur';
        const status=escapeHTML({pending_confirmation:'Təsdiq gözləyir',confirmed:'Təsdiqləndi',preparing:'Hazırlanır',ready:'Hazırdır',shipped:'Göndərildi',completed:'Tamamlandı',cancelled:'Ləğv edildi'}[order.status]||order.status||'Naməlum');
        return `<article class="admin-customer-order-row">
            <div class="admin-customer-order-main"><b>${escapeHTML(order.orderCode||`#${order.id||'?'}`)}</b><span>${escapeHTML(formatAdminCustomerDate(order.createdAt))}</span><small>${items}</small></div>
            <div class="admin-customer-order-meta"><span class="admin-status">${status}</span><b>${money(Number(order.total_cents||0)/100)}</b><button type="button" data-action="focusAdminCustomerOrder" data-action-args='[${JSON.stringify(order.orderCode||String(order.id||''))}]'>Aç</button></div>
        </article>`;
    }).join(''):'<div class="admin-empty">Bu müştərinin hələ sifarişi yoxdur.</div>';
    box.innerHTML=`<div class="admin-customer-detail-head">
        <div><h3>${escapeHTML(customer.name||'Adsız müştəri')}</h3><div class="admin-muted">Qeydiyyat: ${escapeHTML(formatAdminCustomerDate(customer.created_at))}</div></div>
        ${adminCustomerStatusMarkup(customer)}
    </div>
    <div class="admin-customer-contact-grid">
        <div><span>Telefon</span><b>${escapeHTML(customer.phone||'—')}</b></div>
        <div><span>Email</span><b>${escapeHTML(customer.email||'—')}</b></div>
        <div><span>Sifariş sayı</span><b>${orders.length}</b></div>
        <div><span>Ümumi alış</span><b>${money(total/100)}</b></div>
        <div><span>Son sifariş</span><b>${escapeHTML(formatAdminCustomerDate(last?.createdAt))}</b></div>
        <div><span>Son sifariş kodu</span><b>${escapeHTML(last?.orderCode||'—')}</b></div>
    </div>
    <div class="admin-customer-detail-actions">${action}<button type="button" data-action="focusAdminCustomerOrders" data-action-args='[${JSON.stringify(customer.id)}]'>🧾 Sifarişlərə keç</button></div>
    <div class="admin-customer-orders-title"><h4>Sifariş tarixçəsi</h4><span>${orders.length} sifariş</span></div>
    <div class="admin-customer-orders-list">${ordersHtml}</div>`;
}

function openAdminCustomerDetails(id){
    const customer=s.adminCustomers.find(c=>String(c.id)===String(id));
    if(!customer) return showToast('Müştəri tapılmadı.');
    const modal=document.getElementById('adminCustomerDetailModal');
    if(!modal) return showToast('Müştəri detalları paneli tapılmadı.');
    renderAdminCustomerDetails(customer.id);
    modal.hidden=false;
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
}

function closeAdminCustomerDetails(){
    const modal=document.getElementById('adminCustomerDetailModal');
    if(!modal) return;
    modal.hidden=true;
    modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
}

function setAdminCustomerBlockedFromDetail(id,blocked){
    return setAdminCustomerBlocked(id,blocked).then(()=>{
        const customer=s.adminCustomers.find(c=>String(c.id)===String(id));
        if(customer) renderAdminCustomerDetails(customer.id);
    });
}

async function focusAdminCustomerOrders(id){
    closeAdminCustomerDetails();
    return openAdminCustomerOrders(id);
}

async function focusAdminCustomerOrder(orderCode){
    closeAdminCustomerDetails();
    ctx.switchAdminView('orders');
    await ctx.loadAdminOrders();
    const search=document.getElementById('adminOrderSearch');
    if(search){
        search.value=String(orderCode||'');
        ctx.renderAdminOrders();
        search.focus();
    }
}


function csvCell(value, formulaSafe=false){
    let text=String(value??'').replace(/\r?\n/g,' ');
    if(formulaSafe && /^[=+@]/.test(text)) text=`'${text}`;
    if(formulaSafe && /^-/.test(text) && !/^-?\d[\d., ]*$/.test(text)) text=`'${text}`;
    return `"${text.replace(/"/g,'""')}"`;
}

function downloadAdminCSV(filename, rows){
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

async function exportAdminCustomersCSV(){
    const valid=await ctx.validateAdminSession?.(false);
    if(valid===false) return;
    const q=normalizeText(document.getElementById("adminCustomerSearch")?.value||"");
    const filter=document.getElementById("adminCustomerFilter")?.value||"";
    const matches=s.adminCustomers.filter(c=>{
        if(filter==="active" && c.blocked)return false;
        if(filter==="blocked" && !c.blocked)return false;
        if(!q)return true;
        return [c.name,c.phone,c.email].some(v=>normalizeText(v).includes(q));
    });
    const rows=[[
        "Müştəri adı","Telefon","Email","Qeydiyyat tarixi","Sifariş sayı",
        "Ümumi alış (AZN)","Son sifariş tarixi","Son sifariş kodu","Status"
    ]];
    matches.forEach(c=>{
        const customerOrders=customerOrdersFor(c.id);
        const last=customerOrders[0]||null;
        rows.push([
            c.name||"",
            c.phone||"",
            c.email||"",
            formatAdminCustomerDate(c.created_at),
            Number(c.order_count||0),
            (Number(c.total_cents||0)/100).toFixed(2),
            formatAdminCustomerDate(c.last_order_at||last?.createdAt),
            last?.orderCode||"",
            c.blocked?"Bloklanmış":"Aktiv"
        ]);
    });
    const stamp=new Date().toISOString().slice(0,10);
    const suffix=filter?`-${filter}`:"";
    downloadAdminCSV(`f1-studio-musteriler${suffix}-${stamp}.csv`,rows);
    showToast(`✅ ${matches.length} müştəri CSV olaraq ixrac edildi.`);
}

export function initCustomers(){
  Object.assign(ctx, {
    loadAdminCustomers, renderAdminCustomers, openAdminCustomerOrders, setAdminCustomerBlocked,
    openAdminCustomerDetails, closeAdminCustomerDetails, setAdminCustomerBlockedFromDetail,
    focusAdminCustomerOrders, focusAdminCustomerOrder, exportAdminCustomersCSV
  });
}
