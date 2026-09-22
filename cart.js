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
        if(!s.cart.length){ box.innerHTML='<p style="text-align:center;color:var(--muted);padding:30px 0;">Səbətiniz hazırda boşdur.</p>'; }
        s.cart.forEach(i=>{
            const p=ctx.getProduct(i.id); if(!p) return;
            const row=document.createElement("div"); row.className="cart-item";
            const mini=document.createElement("div"); mini.className="mini"; ctx.renderProductMedia(mini,p); row.appendChild(mini);
            const info=document.createElement("div"); info.style.flex="1";
            const name=document.createElement("b"); name.textContent=p.name; info.appendChild(name);
            const unit=document.createElement("div"); unit.style.cssText="color:var(--accent);font-weight:600;margin:4px 0;"; unit.textContent=money(p.price); info.appendChild(unit);
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
                custom.innerHTML=details.join("<br>");
                info.appendChild(custom);
                const edit=document.createElement("button"); edit.className="cart-edit"; edit.type="button"; edit.textContent="✏️ Fərdiləşdirməni dəyiş"; edit.onclick=()=>ctx.openCustomization(p.id,i.lineId); info.appendChild(edit);
            }
            const qty=document.createElement("div"); qty.className="qty";
            [["−",-1],["+",1]].forEach(([label,delta])=>{ const b=document.createElement("button"); b.type="button"; b.textContent=label; b.onclick=()=>ctx.change(i.lineId,delta); qty.appendChild(b); if(delta===-1){const s=document.createElement("span");s.style.margin="0 8px";s.style.fontWeight="600";s.textContent=i.qty;qty.appendChild(s);} });
            info.appendChild(qty); row.appendChild(info);
            const sum=document.createElement("b"); sum.textContent=money(p.price*i.qty); row.appendChild(sum); box.appendChild(row);
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
    
    function change(lineId,d){
        const item=s.cart.find(i=>i.lineId===lineId); if(!item) return;
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
        document.getElementById("orderForm").style.display="none";
        document.getElementById("giftWrap").checked=false;
        document.getElementById("name").value="";
        document.getElementById("phone").value="";
        document.getElementById("address").value="";
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
    
    function buildEnhancedWhatsAppUrl(baseUrl,orderCode=""){
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
                }
            });
            const delivery=document.getElementById("deliveryOption").value;
            const deliveryLabel=delivery==="pickup"?"Mağazadan götürmə":delivery==="ganja"?"Gəncə daxili çatdırılma":"Rayonlara poçtla göndəriş";
            lines.push("",`Müştəri: ${ctx.customerNameSafe()}`,`Telefon: ${document.getElementById("phone").value.trim()}`,`Çatdırılma: ${deliveryLabel}`);
            if(delivery!=="pickup") lines.push(`Ünvan: ${document.getElementById("unknownAddress").checked?"Telefonla dəqiqləşdirilsin":document.getElementById("address").value.trim()}`);
            lines.push(`Hədiyyə qablaşdırması: ${document.getElementById("giftWrap").checked?`Bəli (+${money(CONFIG.giftWrap)})`:"Xeyr"}`,`Təxmini cəmi: ${money(ctx.getEstimatedOrderTotal())}`);
            if(url.searchParams.has("text") || url.searchParams.has("phone") || url.hostname.includes("wa.me")){
                url.searchParams.set("text",lines.join("\n"));
            } else {
                url.searchParams.set("text",lines.join("\n"));
            }
            return url.toString();
        }catch(_){ return baseUrl; }
    }
    
    function customerNameSafe(){return document.getElementById("name").value.trim();}
    
    async function checkout(){
        if(!ctx.ensureCatalogReady()) return;
        if(!s.cart.length) return showToast("Səbətiniz boşdur.");
        const form=document.getElementById("orderForm");
        if(form.style.display==="none"){ form.style.display="grid"; if(s.authUser){document.getElementById("name").value=s.authUser.name||"";document.getElementById("phone").value=s.authUser.phone||"";} ctx.handleDeliveryChange(); return; }
        const error=ctx.validateOrder(); if(error) return showToast(error);
        // Popup-u klik hadisəsi daxilində açırıq ki, brauzer bloklamasın; sonra backend-in real WhatsApp URL-i ilə yönləndiririk.
        const popup=window.open("about:blank","_blank");
        if(!popup) return showToast("WhatsApp pəncərəsi brauzer tərəfindən bloklandı. Sayt üçün popup icazəsi verin.");
        popup.document.title="F1 Studio — WhatsApp sifarişi";
        const deliverySelect=document.getElementById("deliveryOption"), delivery=deliverySelect.value, isWrap=document.getElementById("giftWrap").checked, unknown=document.getElementById("unknownAddress").checked;
        const customerName=document.getElementById("name").value.trim(), customerPhone=document.getElementById("phone").value.trim();
        const address=delivery==="pickup"?"":(unknown?"":document.getElementById("address").value.trim());
        try {
            if(s.authUser){ const fresh=await ctx.api("/api/me"); s.authUser=fresh.user; s.profile=fresh.user; if(s.authUser?.blocked){ popup.close(); return showToast("Bu hesab bloklanıb. Sifariş yaratmaq mümkün deyil."); } }
            const result=await ctx.api("/api/orders",{method:"POST",body:JSON.stringify({
                items:s.cart.map(i=>({productId:Number(i.id),qty:Number(i.qty),customization:i.customization||null})),
                customer:{name:customerName,phone:customerPhone,email:s.authUser?.email||""},
                delivery,address,addressUnknown:unknown,giftWrap:isWrap
            })});
            const whatsappUrl=ctx.buildWhatsAppUrl(CONFIG.whatsappNumber,result.order?.orderCode||"");
            if(!whatsappUrl){ popup.close(); showToast("Sifariş yaradıldı. WhatsApp nömrəsini CONFIG.whatsappNumber hissəsinə əlavə edin."); return; }
            popup.location=whatsappUrl;
            s.cart=[]; ctx.saveCart();
            document.getElementById("orderForm").style.display="none";
            document.getElementById("giftWrap").checked=false;
            ["name","phone","address"].forEach(id=>document.getElementById(id).value="");
            await ctx.renderOrderHistory();
            ctx.closeCart();
            showToast(`Sifariş ${result.order.orderCode} yaradıldı. WhatsApp pəncərəsi açıldı.`);
        } catch(e) {
            popup.close();
            const raw = safeUserError(e, "Sifariş göndərilmədi.");
            const messages={WHATSAPP_NOT_CONFIGURED:"WhatsApp nömrəsi serverdə hələ təyin edilməyib.",OUT_OF_STOCK:"Məhsul stokda kifayət qədər yoxdur.",PRODUCT_NOT_FOUND:"Məhsul artıq mövcud deyil.",ADDRESS_REQUIRED:"Çatdırılma ünvanını daxil edin.",INVALID_ORDER:"Sifariş məlumatlarını düzgün daxil edin.",INVALID_ORDER_ITEMS:"Sifariş məlumatları düzgün deyil.",AUTH_REQUIRED:"Hesaba giriş etmək lazımdır.",ORDER_RATE_LIMITED:"Çox sayda sifariş cəhdi oldu. Bir az sonra yenidən cəhd edin."};
            showToast(messages[String(e?.code || e?.message || "")] || raw);
            console.error("F1 order error", e);
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
    checkout
    });
}
