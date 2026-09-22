import { escapeHTML, showToast } from './ui.js';
import { storageService } from './services/storage-service.js';
import { state as s, ctx } from './state.js';
import { isCustomerDesignPathOwnedBy, isSafeCustomerDesignPath } from './security.js';

import { ADMIN_API, ADMIN_STATUS_LABELS, formatAdminCustomerDate } from './admin-shared.js';

async function loadAdminOrders(){
        try{const data=await ctx.adminApi(ADMIN_API.orders);s.adminOrders=Array.isArray(data.orders)?data.orders:[];ctx.renderAdminOrders();}
        catch(e){s.adminOrders=[];ctx.renderAdminOrders();showToast("Supabase-dən sifarişlər oxunmadı.");}
    }
    
    async function getAdminCustomerDesignSignedUrl(path){
        if(!path) throw new Error("DESIGN_PATH_MISSING");
        const cached=s.adminCustomerDesignSignedUrlCache?.get(path);
        if(cached && cached.expiresAt>Date.now()+30_000) return cached.url;
        const url=await storageService.createCustomerDesignSignedUrl(path,3600);
        s.adminCustomerDesignSignedUrlCache?.set(path,{url,expiresAt:Date.now()+55*60*1000});
        return url;
    }
    
    async function hydrateAdminCustomerDesignLinks(){
        if(!ctx.isAdminUser()) return;
        const links=[...document.querySelectorAll("#adminOrdersList a[data-design-path]")];
        await Promise.all(links.map(async link=>{
            const path=link.getAttribute("data-design-path")||"";
            const ownerId=link.getAttribute("data-owner-id")||"";
            if(!path || !ownerId || !isCustomerDesignPathOwnedBy(path, ownerId)) {
                link.removeAttribute("href");
                link.dataset.ready="0";
                link.textContent="⚠️ Dizayn linki etibarsızdır";
                link.style.pointerEvents="none";
                link.style.opacity=".6";
                link.setAttribute("aria-disabled","true");
                return;
            }
            try{
                const url=await ctx.getAdminCustomerDesignSignedUrl(path);
                const safeUrl = /^https:\/\/rfkqxiwbicjsszjbdhzd\.supabase\.co\//i.test(url) ? url : '';
                if(!safeUrl) throw new Error('DESIGN_SIGNED_URL_FAILED');
                link.href=safeUrl;
                link.dataset.ready="1";
                link.textContent="📎 Dizayn faylını aç";
                link.style.pointerEvents="auto";
                link.style.opacity="1";
                link.setAttribute("aria-disabled","false");
            }catch(e){
                console.error("Admin customer design signed URL error:",e);
                link.removeAttribute("href");
                link.dataset.ready="0";
                link.textContent="⚠️ Dizayn açıla bilmədi";
                link.style.pointerEvents="none";
                link.style.opacity=".6";
                link.setAttribute("aria-disabled","true");
            }
        }));
    }
    
    function renderAdminOrders(){
        const box=document.getElementById("adminOrdersList");if(!box)return;const filter=document.getElementById("adminOrderFilter")?.value||"";const list=s.adminOrders.filter(o=>!filter||o.status===filter);
        if(!list.length){box.innerHTML='<div class="admin-empty">Sifariş tapılmadı.</div>';return;}
        box.innerHTML=list.map(o=>{
            const items=(o.items||[]).map(i=>{
                const c=i.customization||{};
                const custom=[c.text?`Yazı: ${c.text}`:"",c.color?`Rəng: ${c.color}`:"",c.size?`Ölçü: ${c.size}${c.sizeValue?` (${c.sizeValue})`:""}`:"",c.font?`Şrift: ${c.font}`:"",c.note?`Qeyd: ${c.note}`:"",c.imageName?`Dizayn: ${c.imageName}`:""].filter(Boolean).join(" · ");
                return `<div class="admin-pill">${escapeHTML(i.name||`Məhsul #${i.productId||"?"}`)} ×${Number(i.qty)||1}${custom?`<div class="admin-muted" style="margin-top:5px;">${escapeHTML(custom)}</div>`:""}${c.imagePath && isSafeCustomerDesignPath(c.imagePath) && o.customer?.userId?`<div style="margin-top:7px;"><a href="#" data-design-path="${escapeHTML(c.imagePath)}" data-owner-id="${escapeHTML(o.customer.userId)}" data-ready="0" aria-disabled="true" style="pointer-events:none;opacity:.6;" target="_blank" rel="noopener noreferrer">⏳ Dizayn linki hazırlanır...</a></div>`:""}</div>`;
            }).join("");
            return `<div class="admin-order-card"><div class="admin-order-head"><div><b>${escapeHTML(o.orderCode||`#${o.id||"?"}`)}</b><div class="admin-muted">${escapeHTML(o.customer?.name||o.name||"Müştəri")} · ${escapeHTML(o.customer?.phone||o.phone||"")}<br>${escapeHTML(o.createdAt||o.date||"")}</div></div><div class="admin-status">${escapeHTML(ADMIN_STATUS_LABELS[o.status]||o.status||"Naməlum")}</div></div><div style="margin-top:10px">${items||"Məhsul məlumatı yoxdur"}</div><div class="admin-actions" style="margin-top:12px">${Object.entries(ADMIN_STATUS_LABELS).map(([k,v])=>`<button ${o.status===k?'style="border-color:var(--accent);color:var(--accent)"':''} data-action="setAdminOrderStatus" data-action-args='[${Number(o.id||0),JSON.stringify(k)}]'>${v}</button>`).join("")}</div></div>`;
        }).join("");
        ctx.hydrateAdminCustomerDesignLinks();
    }
    
    async function setAdminOrderStatus(id,status){
        if(!id)return showToast("Sifariş ID-si tapılmadı.");
        try{await ctx.adminApi(`${ADMIN_API.orders}/${id}`,{method:"PATCH",body:JSON.stringify({status})});await ctx.loadAdminOrders();showToast("Sifariş statusu yeniləndi.");}catch(e){showToast("Sifariş statusu Supabase-də dəyişdirilmədi.");}
    }

export function initOrders(){
  Object.assign(ctx, {
    loadAdminOrders, getAdminCustomerDesignSignedUrl, hydrateAdminCustomerDesignLinks, renderAdminOrders, setAdminOrderStatus, formatAdminCustomerDate
  });
}
