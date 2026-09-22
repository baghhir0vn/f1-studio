import { safeHttpUrl, safeResourceUrl, safeUserError } from './security.js';
import { escapeHTML, money, normalizeText, showToast } from './ui.js';
import { authService } from './services/auth-service.js';
import { storageService } from './services/storage-service.js';
import { state as s, ctx } from './state.js';

import { ADMIN_API } from './admin-shared.js';

async function loadAdminProducts(){
        try{
            const data=await ctx.adminApi(ADMIN_API.products);
            s.adminProducts=Array.isArray(data.products)?data.products:[];
            ctx.renderAdminProducts();
        }catch(e){
            // Server admin endpoint yoxdursa mövcud kataloqu paneldə göstəririk.
            s.adminProducts=[...s.products]; ctx.renderAdminProducts();
            showToast("Supabase-dən məhsullar oxunmadı; lokal kataloq göstərilir.");
        }
    }
    
    function renderAdminProducts(){
        const body=document.getElementById("adminProductsBody"); if(!body)return;
        const q=normalizeText(document.getElementById("adminProductSearch")?.value||"");
        const list=s.adminProducts.filter(p=>!q || normalizeText([p.name,p.cat,p.desc,p.material].join(" ")).includes(q));
        if(!list.length){body.innerHTML='<tr><td colspan="6" class="admin-empty">Məhsul tapılmadı.</td></tr>';return;}
        body.innerHTML=list.map(p=>`<tr><td><div class="admin-product-thumb">${safeResourceUrl(p.image)?`<img src="${escapeHTML(safeResourceUrl(p.image))}" alt="" style="width:100%;height:100%;object-fit:cover" data-fallback-emoji="${escapeHTML(p.emoji||"📦")}">`:escapeHTML(p.emoji||"📦")}</div></td><td><b>${escapeHTML(p.name)}</b><div class="admin-muted">${escapeHTML(p.badge||"")}</div></td><td>${escapeHTML(p.cat||"")}</td><td>${money(p.price)}</td><td>${p.stockQuantity==null?escapeHTML(p.stock||"-"):`${Number(p.stockQuantity)} ədəd`}</td><td><div class="admin-actions"><button data-action="editAdminProduct" data-action-args='[${Number(p.id)}]'>✏️ Dəyiş</button><button class="danger" data-action="deleteAdminProduct" data-action-args='[${Number(p.id)}]'>🗑 Sil</button></div></td></tr>`).join("");
        body.querySelectorAll("img[data-fallback-emoji]").forEach(img=>{
            img.addEventListener("error",()=>{const emoji=img.dataset.fallbackEmoji||"📦"; img.remove(); if(img.parentNode) img.parentNode.textContent=emoji;},{once:true});
        });
    }
    
    function clearAdminGalleryPreviewUrls(){
        s.adminGalleryPreviewUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(_){}});
        s.adminGalleryPreviewUrls=[];
    }
    
    function renderAdminGalleryPreview(items=[]){
        const box=document.getElementById("adminProductGalleryPreview"); if(!box)return;
        box.innerHTML="";
        items.slice(0,6).forEach((item,idx)=>{
            const wrap=document.createElement("div"); wrap.className="admin-gallery-item";
            const img=document.createElement("img"); img.src=item.url; img.alt=`Qalereya şəkli ${idx+1}`; wrap.appendChild(img);
            if(idx===0){const b=document.createElement("span");b.className="admin-gallery-badge";b.textContent="Əsas";wrap.appendChild(b);}
            box.appendChild(wrap);
        });
    }
    
    function revokeAdminImagePreview(){
        if(s.adminImagePreviewUrl){ URL.revokeObjectURL(s.adminImagePreviewUrl); s.adminImagePreviewUrl=null; }
    }
    
    function setAdminImagePreview(url, label="Şəkil yoxdur"){
        const box=document.getElementById("adminProductImagePreview"); if(!box)return;
        ctx.revokeAdminImagePreview();
        if(url){
            const img=document.createElement("img"); img.src=url; img.alt="Məhsul şəkli";
            img.onerror=()=>{box.textContent=label;};
            box.innerHTML=""; box.appendChild(img);
        } else {
            box.textContent=label;
        }
    }
    
    function handleAdminProductImage(input){
        const files=[...(input.files||[])];
        const status=document.getElementById("adminProductImageStatus");
        if(!files.length){ ctx.renderAdminGalleryPreview(s.adminExistingGallery.map(url=>({url,type:"existing"}))); if(status)status.textContent="Şəkil seçilməyib."; return; }
        const bad=files.find(f=>!f.type.startsWith("image/"));
        if(bad){ input.value=""; return showToast("Yalnız şəkil faylları seçin."); }
        const tooBig=files.find(f=>f.size>5*1024*1024);
        if(tooBig){ input.value=""; return showToast(`Şəkil 5 MB-dan böyük ola bilməz: ${tooBig.name}`); }
        const replace=!!document.getElementById("adminProductGalleryReplace")?.checked;
        const maxNew=replace?6:Math.max(0,6-s.adminExistingGallery.length);
        if(files.length>maxNew){ input.value=""; return showToast(replace?"Bir məhsul üçün maksimum 6 şəkil seçə bilərsiniz.":`Mövcud ${s.adminExistingGallery.length} şəkilə ən çox ${maxNew} yeni şəkil əlavə edə bilərsiniz.`); }
        if(document.getElementById("adminProductImage")) document.getElementById("adminProductImage").value="";
        ctx.clearAdminGalleryPreviewUrls();
        s.adminGalleryPreviewUrls=files.map(f=>URL.createObjectURL(f));
        const existing=replace?[]:s.adminExistingGallery;
        const previewItems=[...existing.map(url=>({url,type:"existing"})),...files.slice(0,Math.max(0,6-existing.length)).map((f,i)=>({url:s.adminGalleryPreviewUrls[i],type:"new",file:f}))];
        ctx.renderAdminGalleryPreview(previewItems);
        if(status) status.textContent=`${files.length} yeni şəkil seçildi · Yadda saxlayanda Supabase Storage-a yüklənəcək.`;
    }
    
    function clearAdminProductImage(){
        const url=document.getElementById("adminProductImage"); if(url)url.value="";
        const file=document.getElementById("adminProductImageFile"); if(file)file.value="";
        s.adminExistingGallery=[];
        const replace=document.getElementById("adminProductGalleryReplace"); if(replace)replace.checked=false;
        ctx.clearAdminGalleryPreviewUrls();
        ctx.renderAdminGalleryPreview([]);
        const status=document.getElementById("adminProductImageStatus"); if(status)status.textContent="Qalereya təmizləndi. Yadda saxlayanda məhsul şəkilsiz qalacaq.";
    }
    
    function storagePathFromPublicUrl(url,bucket){
        if(!url || !bucket) return "";
        try{
            const u=new URL(url,window.location.href);
            const marker=`/storage/v1/object/public/${bucket}/`;
            const idx=u.pathname.indexOf(marker);
            return idx>=0?decodeURIComponent(u.pathname.slice(idx+marker.length)):"";
        }catch(_){return "";}
    }
    
    async function removeStorageObjects(bucket,urls=[]){
        const paths=urls.map(u=>ctx.storagePathFromPublicUrl(u,bucket)).filter(Boolean);
        if(paths.length) await storageService.remove(bucket, paths);
    }
    
    async function uploadAdminProductImage(file){
        if(!file) return { url:"", path:"" };
        if(!ctx.isAdminUser()) throw new Error("ADMIN_REQUIRED");
        if(!file.type.startsWith("image/")) throw new Error("IMAGE_ONLY");
        if(file.size>5*1024*1024) throw new Error("IMAGE_TOO_LARGE");
        const extMap={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/avif":"avif"};
        const ext=extMap[file.type] || (file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"") || "jpg";
        const token=(globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const path=`products/${token}.${ext}`;
        const status=document.getElementById("adminProductImageStatus");
        if(status)status.textContent="⏳ Şəkil Supabase Storage-a yüklənir...";
        const {data:authData}=await authService.getUser();
        if(!authData?.user) throw new Error("AUTH_REQUIRED");
        if(!ctx.isAdminUser()) throw new Error("ADMIN_REQUIRED");
        const uploaded=await storageService.uploadProductImage(path,file);
        const data={publicUrl:uploaded.url};
        if(status)status.textContent="✅ Şəkil yükləndi.";
        return { url:data.publicUrl, path };
    }
    
    function resetAdminProductImageUI(){
        const url=document.getElementById("adminProductImage"); if(url)url.value="";
        const file=document.getElementById("adminProductImageFile"); if(file)file.value="";
        const replace=document.getElementById("adminProductGalleryReplace"); if(replace)replace.checked=false;
        s.adminExistingGallery=[];
        ctx.clearAdminGalleryPreviewUrls();
        ctx.renderAdminGalleryPreview([]);
        const status=document.getElementById("adminProductImageStatus"); if(status)status.textContent="Kompüterdən bir neçə şəkil seçə bilərsən. Maksimum 6 şəkil, hər biri 5 MB.";
    }
    
    function newAdminProduct(){
        s.editingAdminProductId=null; document.getElementById("adminProductForm").style.display="grid"; document.getElementById("adminProductFormTitle").textContent="Yeni məhsul";
        ["adminProductId","adminProductName","adminProductPrice","adminProductEmoji","adminProductBadge","adminProductMaterial","adminProductTime","adminProductStock","adminProductStockQty","adminProductDesc","adminProductTags"].forEach(id=>document.getElementById(id).value="");
        document.getElementById("adminProductCat").value="Lazer & Taxta"; document.getElementById("adminProductCustom").checked=true;
        ctx.resetAdminProductImageUI();
        document.getElementById("adminProductName").focus();
    }
    
    function editAdminProduct(id){
        const p=s.adminProducts.find(x=>Number(x.id)===Number(id)); if(!p)return;
        s.editingAdminProductId=Number(id); document.getElementById("adminProductForm").style.display="grid"; document.getElementById("adminProductFormTitle").textContent="Məhsulu dəyiş";
        document.getElementById("adminProductId").value=p.id||""; document.getElementById("adminProductName").value=p.name||""; document.getElementById("adminProductPrice").value=p.price??""; document.getElementById("adminProductCat").value=p.cat||"Lazer & Taxta"; document.getElementById("adminProductImage").value=p.image||""; document.getElementById("adminProductEmoji").value=p.emoji||""; document.getElementById("adminProductBadge").value=p.badge||""; document.getElementById("adminProductMaterial").value=p.material||""; document.getElementById("adminProductTime").value=p.productionTime||""; document.getElementById("adminProductStock").value=p.stock||""; document.getElementById("adminProductStockQty").value=p.stockQuantity==null?"":String(p.stockQuantity); document.getElementById("adminProductDesc").value=p.desc||""; document.getElementById("adminProductTags").value=Array.isArray(p.tags)?p.tags.join(","):p.tags||""; document.getElementById("adminProductCustom").checked=p.customizable!==false;
        const file=document.getElementById("adminProductImageFile"); if(file)file.value="";
        const replace=document.getElementById("adminProductGalleryReplace"); if(replace)replace.checked=false;
        s.adminExistingGallery=(Array.isArray(p.images)&&p.images.length?p.images:[p.image||""]).filter(Boolean).slice(0,6);
        ctx.clearAdminGalleryPreviewUrls();
        ctx.renderAdminGalleryPreview(s.adminExistingGallery.map(url=>({url,type:"existing"})));
        const status=document.getElementById("adminProductImageStatus"); if(status)status.textContent=s.adminExistingGallery.length?`${s.adminExistingGallery.length} mövcud şəkil göstərilir. Yeni şəkillər əlavə edə və ya əvəz edə bilərsiniz.`:"Şəkil əlavə edilməyib. Kompüterdən seçə bilərsiniz.";
        document.getElementById("adminProductName").focus();
    }
    
    function cancelAdminProduct(){ s.editingAdminProductId=null; ctx.resetAdminProductImageUI(); document.getElementById("adminProductForm").style.display="none"; }
    
    function collectAdminProduct(){
        const manualRaw=document.getElementById("adminProductImage").value.trim();
        const manualImage=manualRaw ? safeResourceUrl(manualRaw) : "";
        if(manualRaw && !manualImage) throw new Error("INVALID_IMAGE_URL");
        const stockQtyRaw=document.getElementById("adminProductStockQty")?.value.trim()||""; const stockQuantity=stockQtyRaw===""?null:Number(stockQtyRaw); if(stockQuantity!=null && (!Number.isInteger(stockQuantity)||stockQuantity<0)) throw new Error("INVALID_STOCK_QUANTITY");
        return {name:document.getElementById("adminProductName").value.trim(),price:Number(document.getElementById("adminProductPrice").value),cat:document.getElementById("adminProductCat").value,image:manualImage,images:[],emoji:document.getElementById("adminProductEmoji").value.trim()||"📦",badge:document.getElementById("adminProductBadge").value.trim(),material:document.getElementById("adminProductMaterial").value.trim(),productionTime:document.getElementById("adminProductTime").value.trim(),stock:document.getElementById("adminProductStock").value.trim()||"Sifarişlə",stockQuantity,desc:document.getElementById("adminProductDesc").value.trim(),tags:document.getElementById("adminProductTags").value.split(",").map(x=>x.trim()).filter(Boolean),customizable:document.getElementById("adminProductCustom").checked};
    }
    
    async function saveAdminProduct(e){
        e.preventDefault();
        const payload=ctx.collectAdminProduct();
        if(!payload.name||!Number.isFinite(payload.price))return showToast("Məhsul adı və düzgün qiymət daxil edin.");
        const submitBtn=e.submitter||document.querySelector('#adminProductForm button[type="submit"]');
        if(submitBtn)submitBtn.disabled=true;
        const newlyUploaded=[];
        const oldGallery=[...s.adminExistingGallery];
        try{
            const files=[...(document.getElementById("adminProductImageFile")?.files||[])];
            if(files.length>6) throw new Error("IMAGE_LIMIT");
            const replaceGallery=!!document.getElementById("adminProductGalleryReplace")?.checked;
            const uploadedUrls=[];
            for(const file of files){
                const uploaded=await ctx.uploadAdminProductImage(file);
                if(uploaded.url){ uploadedUrls.push(uploaded.url); newlyUploaded.push(uploaded.url); }
            }
            let gallery=replaceGallery?[]:[...s.adminExistingGallery];
            if(payload.image && !gallery.includes(payload.image) && !replaceGallery) gallery.unshift(payload.image);
            gallery=[...gallery,...uploadedUrls].filter(Boolean).slice(0,6);
            payload.images=gallery;
            payload.image=gallery[0]||payload.image||"";
            const path=s.editingAdminProductId?`${ADMIN_API.products}/${s.editingAdminProductId}`:ADMIN_API.products;
            const wasEditing=Boolean(s.editingAdminProductId);
            const data=await ctx.adminApi(path,{method:wasEditing?"PUT":"POST",body:JSON.stringify(payload)});
            if(data.products) s.adminProducts=data.products;
            const obsolete=wasEditing?oldGallery.filter(url=>url && !gallery.includes(url)):[];
            if(obsolete.length) ctx.removeStorageObjects("product-images",obsolete).catch(()=>{});
            await ctx.loadServerProducts(); await ctx.loadAdminProducts(); ctx.cancelAdminProduct(); showToast(wasEditing?"Məhsul yeniləndi və şəkil yadda saxlanıldı.":"Məhsul əlavə olundu və şəkil yadda saxlanıldı.");
        }catch(e){
            if(newlyUploaded.length) ctx.removeStorageObjects("product-images",newlyUploaded).catch(()=>{});
            console.error("Admin product save error:",e);
            const msg=e?.message||e||"naməlum xəta";
            const friendly={
                IMAGE_ONLY:"Yalnız şəkil faylı seçin.",
                IMAGE_TOO_LARGE:"Şəkil maksimum 5 MB ola bilər.",
                AUTH_REQUIRED:"Hesaba yenidən giriş etmək lazımdır.",
                ADMIN_REQUIRED:"Admin rolunuzu yoxlayın.",
                IMAGE_URL_FAILED:"Şəklin URL-i yaradıla bilmədi.",
                IMAGE_LIMIT:"Bir məhsul üçün maksimum 6 şəkil saxlamaq olar.",
                INVALID_STOCK_QUANTITY:"Stok miqdarı tam, mənfi olmayan rəqəm olmalıdır.",
                INVALID_IMAGE_URL:"Məhsul şəkli üçün yalnız etibarlı http/https və ya lokal fayl ünvanı istifadə edin.",
                "new row violates row-level security policy":"Storage policy icazə vermir. Storage V2 SQL-i tətbiq edin."
            };
            const visible=friendly[msg] || (msg.startsWith('IMAGE_') ? msg : safeUserError(e, 'Sorğu yerinə yetirilmədi.'));
            showToast(`Məhsul yadda saxlanmadı: ${visible}`);
        }finally{ if(submitBtn)submitBtn.disabled=false; }
    }
    
    async function deleteAdminProduct(id){
        const p=s.adminProducts.find(x=>Number(x.id)===Number(id)); if(!p)return;
        if(!confirm(`“${p.name}” məhsulu silinsin?`))return;
        try{
            await ctx.adminApi(`${ADMIN_API.products}/${Number(id)}`,{method:"DELETE"});
            const oldImages=(Array.isArray(p.images)&&p.images.length?p.images:[p.image||""]).filter(Boolean);
            if(oldImages.length) ctx.removeStorageObjects("product-images",oldImages).catch(()=>{});
            await ctx.loadServerProducts(); await ctx.loadAdminProducts(); showToast("Məhsul silindi.");
        }
        catch(e){ console.error("Admin product delete error:", e); showToast(`Məhsul silinmədi: ${safeUserError(e, "Sorğu yerinə yetirilmədi.")}`); }
    }

export function initProducts(){
  Object.assign(ctx, {
    loadAdminProducts, renderAdminProducts, clearAdminGalleryPreviewUrls, renderAdminGalleryPreview, revokeAdminImagePreview, setAdminImagePreview, handleAdminProductImage, clearAdminProductImage, storagePathFromPublicUrl, removeStorageObjects, uploadAdminProductImage, resetAdminProductImageUI, newAdminProduct, editAdminProduct, cancelAdminProduct, collectAdminProduct, saveAdminProduct, deleteAdminProduct
  });
}
