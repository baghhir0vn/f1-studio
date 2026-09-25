import { persist, escapeHTML, money, isValidPhone, showToast } from './ui.js';
import { sanitizeStoredCart } from './security.js';
import { CONFIG } from './config.js';
import { storageService } from './services/storage-service.js';
import { state as s, ctx } from './state.js';
import { safeUserError } from './security.js';

export function initCart() {
    function normalizeCartLines(){
        const before = JSON.stringify(s.cart);
        s.cart = sanitizeStoredCart(s.cart);
        if (JSON.stringify(s.cart) !== before) persist("f1Cart", s.cart);
    }
    
    function openCart() { ctx.renderCart(); ctx.openDialog("modal", ".close"); }
    
    function closeCart() { ctx.closeDialog("modal"); }
    
    function handleDeliveryChange(){
        const select=document.getElementById("deliveryOption"), pickup=select.value==="pickup";
        const address=document.getElementById("address"), unknown=document.getElementById("unknownAddress"), label=document.getElementById("unknownAddressLabel");
        if(pickup){ unknown.checked=false; unknown.disabled=true; address.disabled=true; address.value=""; address.placeholder="Mağazadan götürüləcək — ünvan tələb olunmur."; label.style.opacity=".5"; }
        else { unknown.disabled=false; label.style.opacity="1"; ctx.toggleAddress(false); }
        ctx.updateTotal();
    }
    
    function toggleAddress(fromUser=true){
        const checked=document.getElementById("unknownAddress").checked, address=document.getElementById("address");
        address.disabled=checked;
        if(checked){ address.value=""; address.placeholder="Ünvanı telefonla dəqiqləşdirəcəyik."; }
        else address.placeholder="Çatdırılma ünvanı və ya xüsusi qeyd";
        if(fromUser) ctx.updateTotal();
    }
    
    function renderCart(){
        const box=document.getElementById("cartItems");
        box.innerHTML="";
        if(!s.cart.length){ box.innerHTML='<div class="cart-empty-state"><div class="cart-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 4h2l1.6 10.2a2 2 0 0 0 2 1.8h7.9a2 2 0 0 0 1.9-1.5L20 8H6"></path><circle cx="9" cy="19" r="1"></circle><circle cx="17" cy="19" r="1"></circle></svg></div><b>Səbətin boşdur</b><span>Məhsul seçəndə burada görünəcək.</span></div>'; }
        s.cart.forEach(i=>{
            const p=ctx.getProduct(i.id); if(!p) return;
            const row=document.createElement("div"); row.className="cart-item";
            const mini=document.createElement("div"); mini.className="mini"; ctx.renderProductMedia(mini,p); row.appendChild(mini);
            const info=document.createElement("div"); info.className="cart-item-info";
            const name=document.createElement("b"); name.textContent=p.name; info.appendChild(name);
            const unit=document.createElement("div"); unit.className="cart-item-unit"; unit.textContent=money(p.price); info.appendChild(unit);
            if(i.customization){
                const c=i.customization;
                const custom=document.createElement("div"); custom.className="cart-custom";
                const details=[];
                if(c.text) details.push(`<b>Yazı:</b> ${escapeHTML(c.text)}`);
                if(c.color) details.push(`<b>Rəng:</b> ${escapeHTML(c.color)}`);
                if(c.size) details.push(`<b>Ölçü:</b> ${escapeHTML(c.sizeValue?`${c.size} (${c.sizeValue})`:c.size)}`);
                if(c.font) details.push(`<b>Şrift:</b> ${escapeHTML(c.font)}`);
                if(c.imageName) details.push(`<b>Şəkil:</b> ${escapeHTML(c.imageName)}`);
                if(c.note) details.push(`<b>Qeyd:</b> ${escapeHTML(c.note)}`);
                if(c.layout){
                    const layout=c.layout;
                    const hasText=String(layout.text?.text||'').trim();
                    const hasImage=layout.image?.visible !== false && !!(c.imageName || layout.image?.visible);
                    const parts=[hasText?'mətn':'',hasImage?'şəkil':''].filter(Boolean);
                    details.push(`<b>Design Studio:</b> ${parts.length?escapeHTML(parts.join(' + ')):'quruluş yadda saxlanılıb'}`);
                }
                custom.innerHTML=details.join("<br>");
                info.appendChild(custom);
            }
            if(p.customizable){
                const edit=document.createElement("button"); edit.className="cart-edit"; edit.type="button"; edit.textContent=i.customization?"✏️ Fərdiləşdirməni dəyiş":"✨ Fərdiləşdir"; edit.onclick=()=>ctx.openCustomization(p.id,i.lineId); info.appendChild(edit);
            }
            const qty=document.createElement("div"); qty.className="qty";
            const currentProductQty=s.cart.filter(line=>line.id===i.id).reduce((sum,line)=>sum+(Number(line.qty)||0),0);
            [["−",-1],["+",1]].forEach(([label,delta])=>{
                const b=document.createElement("button"); b.type="button"; b.textContent=label;
                b.setAttribute("aria-label", delta>0?`${p.name} miqdarını artır`:`${p.name} miqdarını azalt`);
                b.title=delta>0?"Miqdarı artır":"Miqdarı azalt";
                if(delta>0 && p.stockQuantity!=null && currentProductQty>=Number(p.stockQuantity)){
                    b.disabled=true; b.setAttribute("aria-disabled","true"); b.title="Stok limiti dolub";
                }
                b.onclick=()=>ctx.change(i.lineId,delta); qty.appendChild(b);
                if(delta===-1){const count=document.createElement("span"); count.style.margin="0 8px"; count.style.fontWeight="600"; count.setAttribute("aria-live","polite"); count.textContent=i.qty; qty.appendChild(count);}
            });
            info.appendChild(qty); row.appendChild(info);
            const sum=document.createElement("b"); sum.className="cart-item-total"; sum.textContent=money(p.price*i.qty); row.appendChild(sum); box.appendChild(row);
        });
        document.getElementById("wrapContainer").style.display=s.cart.length?"flex":"none";
        ctx.handleDeliveryChange();
        document.getElementById("orderForm").style.display=s.cart.length && document.getElementById("orderForm").style.display!=="none" ? "grid":"none";
    }
    
    function updateTotal(){
        let total=s.cart.reduce((sum,i)=>{const p=ctx.getProduct(i.id);return sum+(p?p.price*i.qty:0)},0);
        if(document.getElementById("giftWrap").checked && s.cart.length) total += CONFIG.giftWrap;
        const select=document.getElementById("deliveryOption");
        if(select && s.cart.length) total += CONFIG.delivery[select.value] || 0;
        document.getElementById("total").textContent=s.cart.length?`Cəmi: ${money(total)}`:"";
    }
    
    function validateCartStock(){
        const totals=new Map();
        for(const item of s.cart){
            const qty=Math.floor(Number(item.qty));
            if(!Number.isInteger(qty) || qty<1) return {ok:false,item,message:"Səbətdə etibarsız məhsul miqdarı var."};
            totals.set(item.id,(totals.get(item.id)||0)+qty);
        }
        for(const [productId,qty] of totals){
            const product=ctx.getProduct(productId);
            if(!product) return {ok:false,item:s.cart.find(i=>i.id===productId),message:"Səbətdəki məhsullardan biri artıq mövcud deyil."};
            if(product.stockQuantity!=null && qty>Number(product.stockQuantity)){
                return {ok:false,item:s.cart.find(i=>i.id===productId),message:`${product.name} üçün stok yenilənib. Səbətdəki ümumi miqdarı azaldın.`};
            }
        }
        return {ok:true};
    }

    function change(lineId,d){
        const item=s.cart.find(i=>i.lineId===lineId); if(!item) return;
        const product=ctx.getProduct(item.id);
        if(d>0 && product?.stockQuantity!=null){
            const totalQty=s.cart.filter(i=>i.id===item.id).reduce((sum,i)=>sum+(Number(i.qty)||0),0);
            if(totalQty >= Number(product.stockQuantity)) return showToast("Bu məhsul üçün stok limiti dolub.");
        }
        item.qty += d;
        if(item.qty<=0){
            const path=item.customization?.imagePath||"";
            s.cart=s.cart.filter(i=>i.lineId!==lineId);
            if(path) storageService.removeCustomerDesigns([path]).catch(()=>{});
        }
        ctx.saveCart(); ctx.renderCart();
    }
    
    function clearCart(){
        if(!s.cart.length) return;
        const paths=s.cart.map(i=>i.customization?.imagePath).filter(Boolean);
        s.cart=[]; ctx.saveCart();
        if(paths.length) storageService.removeCustomerDesigns(paths).catch(()=>{});
        resetCheckoutState();
        ctx.renderCart();
        showToast("Səbət təmizləndi.");
    }
    
    function validateOrder(){
        const name=document.getElementById("name").value.trim(), phone=document.getElementById("phone").value.trim(), address=document.getElementById("address").value.trim();
        const delivery=document.getElementById("deliveryOption").value, unknown=document.getElementById("unknownAddress").checked;
        if(name.length<2) return "Adınızı və soyadınızı daxil edin.";
        if(!isValidPhone(phone)) return "Telefon nömrəsini düzgün daxil edin.";
        if(delivery!=="pickup" && !unknown && address.length<5) return "Çatdırılma ünvanını daxil edin və ya 'ünvanı bilmirəm' seçin.";
        return "";
    }
    
    function getEstimatedOrderTotal(){
        let total=s.cart.reduce((sum,i)=>{const p=ctx.getProduct(i.id);return sum+(p?p.price*i.qty:0)},0);
        if(document.getElementById("giftWrap").checked && s.cart.length) total += CONFIG.giftWrap;
        const select=document.getElementById("deliveryOption");
        if(select && s.cart.length) total += CONFIG.delivery[select.value] || 0;
        return total;
    }
    
    function buildEnhancedWhatsAppUrl(baseUrl,orderCode="",authoritativeTotalCents=null){
        try{
            const url=new URL(baseUrl);
            const lines=["Salam! F1 Studio-dan sifariş vermək istəyirəm."];
            if(orderCode) lines.push(`Sifariş kodu: ${orderCode}`);
            lines.push("", "Məhsullar:");
            s.cart.forEach((i,idx)=>{
                const p=ctx.getProduct(i.id); if(!p) return;
                lines.push(`${idx+1}. ${p.name} × ${i.qty} — ${money(p.price*i.qty)}`);
                const c=i.customization;
                if(c){
                    if(c.text) lines.push(`   • Yazı: ${c.text}`);
                    if(c.color) lines.push(`   • Rəng: ${c.color}`);
                    if(c.size) lines.push(`   • Ölçü: ${c.size}${c.sizeValue?` (${c.sizeValue})`:""}`);
                    if(c.font) lines.push(`   • Şrift: ${c.font}`);
                    if(c.imageName) lines.push(`   • Şəkil/Logo: ${c.imageName} (faylı WhatsApp-da ayrıca göndərəcəyəm)`);
                    if(c.note) lines.push(`   • Qeyd: ${c.note}`);
                    if(c.layout) lines.push(`   • Design Studio: fərdi quruluş yadda saxlanılıb`);
                }
            });
            const delivery=document.getElementById("deliveryOption").value;
            const deliveryLabel=delivery==="pickup"?"Mağazadan götürmə":delivery==="ganja"?"Gəncə daxili çatdırılma":"Rayonlara poçtla göndəriş";
            lines.push("",`Müştəri: ${ctx.customerNameSafe()}`,`Telefon: ${document.getElementById("phone").value.trim()}`,`Çatdırılma: ${deliveryLabel}`);
            if(delivery!=="pickup") lines.push(`Ünvan: ${document.getElementById("unknownAddress").checked?"Telefonla dəqiqləşdirilsin":document.getElementById("address").value.trim()}`);
            lines.push(`Hədiyyə qablaşdırması: ${document.getElementById("giftWrap").checked?`Bəli (+${money(CONFIG.giftWrap)})`:"Xeyr"}`);
            const finalTotal=Number.isFinite(Number(authoritativeTotalCents)) ? Number(authoritativeTotalCents)/100 : ctx.getEstimatedOrderTotal();
            lines.push(`${Number.isFinite(Number(authoritativeTotalCents)) ? "Sifariş cəmi" : "Təxmini cəmi"}: ${money(finalTotal)}`);
            if(url.searchParams.has("text") || url.searchParams.has("phone") || url.hostname.includes("wa.me")){
                url.searchParams.set("text",lines.join("\n"));
            } else {
                url.searchParams.set("text",lines.join("\n"));
            }
            return url.toString();
        }catch(_){ return baseUrl; }
    }
    
    function customerNameSafe(){return document.getElementById("name").value.trim();}

    function resetCheckoutState(){
        const delivery=document.getElementById("deliveryOption");
        const unknown=document.getElementById("unknownAddress");
        const form=document.getElementById("orderForm");
        if(delivery) delivery.value="pickup";
        if(unknown){ unknown.checked=false; unknown.disabled=true; }
        ["name","phone","address"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
        const wrap=document.getElementById("giftWrap"); if(wrap) wrap.checked=false;
        if(form) form.style.display="none";
        ctx.handleDeliveryChange();
    }
    
    async function checkout(){
        if(!ctx.ensureCatalogReady()) return;
        if(!s.cart.length) return showToast("Səbətiniz boşdur.");
        const form=document.getElementById("orderForm");
        if(form.style.display==="none"){
            form.style.display="grid";
            if(s.authUser){document.getElementById("name").value=s.authUser.name||"";document.getElementById("phone").value=s.authUser.phone||"";}
            ctx.handleDeliveryChange();
            return;
        }
        const error=ctx.validateOrder(); if(error) return showToast(error);
        if(!String(CONFIG.whatsappNumber||"").replace(/\D/g,"")) return showToast("WhatsApp nömrəsi hələ təyin edilməyib. Admin paneldə Sayt Ayarlarından əlavə edin.");

        const button=document.querySelector('button[data-action="checkout"]');
        if(button?.disabled) return;
        const oldText=button?.textContent;
        if(button){button.disabled=true;button.textContent="⏳ Sifariş yoxlanılır...";}

        // Popup-u klik hadisəsi daxilində açırıq ki, brauzer bloklamasın; backend sifarişi yaratdıqdan sonra real WhatsApp URL-si ilə yönləndiririk.
        const popup=window.open("about:blank","_blank");
        if(!popup){
            if(button){button.disabled=false;button.textContent=oldText||"WhatsApp ilə Sifariş Et";}
            return showToast("WhatsApp pəncərəsi brauzer tərəfindən bloklandı. Sayt üçün popup icazəsi verin.");
        }
        popup.document.title="F1 Studio — WhatsApp sifarişi";
        const deliverySelect=document.getElementById("deliveryOption"), delivery=deliverySelect.value, isWrap=document.getElementById("giftWrap").checked, unknown=document.getElementById("unknownAddress").checked;
        const customerName=document.getElementById("name").value.trim(), customerPhone=document.getElementById("phone").value.trim();
        const address=delivery==="pickup"?"":(unknown?"":document.getElementById("address").value.trim());
        try {
            // Checkout-dan əvvəl məhsul siyahısını təzələyirik. Son stok qərarı yenə Supabase create_order funksiyasına məxsusdur.
            await ctx.loadServerProducts?.(true);
            ctx.normalizeCartLines?.();
            if(!s.cart.length){ popup.close(); return showToast("Səbət yenilənib və artıq boşdur."); }
            const stockCheck=ctx.validateCartStock();
            if(!stockCheck.ok){
                popup.close();
                return showToast(stockCheck.message);
            }
            if(s.authUser){
                const fresh=await ctx.api("/api/me");
                s.authUser=fresh.user; s.profile=fresh.user;
                if(s.authUser?.blocked){ popup.close(); return showToast("Bu hesab bloklanıb. Sifariş yaratmaq mümkün deyil."); }
            }
            const result=await ctx.api("/api/orders",{method:"POST",body:JSON.stringify({
                items:s.cart.map(i=>({productId:Number(i.id),qty:Number(i.qty),customization:i.customization||null})),
                customer:{name:customerName,phone:customerPhone,email:s.authUser?.email||""},
                delivery,address,addressUnknown:unknown,giftWrap:isWrap
            })});
            const whatsappUrl=ctx.buildWhatsAppUrl(CONFIG.whatsappNumber,result.order?.orderCode||"",result.order?.total_cents);
            if(!whatsappUrl){
                popup.close();
                showToast("Sifariş yaradıldı, amma WhatsApp keçidi hazırlana bilmədi. Adminlə əlaqə saxlayın.");
                return;
            }
            popup.location=whatsappUrl;
            s.cart=[]; ctx.saveCart();
            resetCheckoutState();
            await ctx.renderOrderHistory();
            ctx.closeCart();
            showToast(`Sifariş ${result.order.orderCode} yaradıldı. WhatsApp açıldı.`);
        } catch(e) {
            popup.close();
            const raw = safeUserError(e, "Sifariş göndərilmədi.");
            const messages={WHATSAPP_NOT_CONFIGURED:"WhatsApp nömrəsi serverdə hələ təyin edilməyib.",OUT_OF_STOCK:"Məhsul stokda kifayət qədər yoxdur. Səbəti yeniləyin.",PRODUCT_NOT_FOUND:"Məhsul artıq mövcud deyil. Səbəti yeniləyin.",ADDRESS_REQUIRED:"Çatdırılma ünvanını daxil edin.",INVALID_ORDER:"Sifariş məlumatlarını düzgün daxil edin.",INVALID_ORDER_ITEMS:"Sifariş məlumatları düzgün deyil.",AUTH_REQUIRED:"Hesaba giriş etmək lazımdır.",ORDER_RATE_LIMITED:"Çox sayda sifariş cəhdi oldu. Bir az sonra yenidən cəhd edin."};
            showToast(messages[String(e?.code || e?.message || "")] || raw);
            console.error("F1 order error", e);
        } finally {
            if(button){button.disabled=false;button.textContent=oldText||"WhatsApp ilə Sifariş Et";}
        }
    }

    Object.assign(ctx, {
    normalizeCartLines,
    openCart,
    closeCart,
    handleDeliveryChange,
    toggleAddress,
    renderCart,
    updateTotal,
    change,
    clearCart,
    validateOrder,
    getEstimatedOrderTotal,
    buildEnhancedWhatsAppUrl,
    customerNameSafe,
    resetCheckoutState,
    validateCartStock,
    checkout
    });
}
