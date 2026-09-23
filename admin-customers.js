import { escapeHTML, money, normalizeText, showToast } from './ui.js?v=59.2';
import { state as s, ctx } from './state.js?v=59.2';
import { formatAdminCustomerDate } from './admin-shared.js?v=59.2';
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
                <td><div class="admin-actions"><button data-action="openAdminCustomerOrders" data-action-args='[${JSON.stringify(c.id)}]'>🧾 Sifarişlər</button>${action}</div></td>
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
export function initCustomers(){
  Object.assign(ctx, {
    loadAdminCustomers, renderAdminCustomers, openAdminCustomerOrders, setAdminCustomerBlocked
  });
}
