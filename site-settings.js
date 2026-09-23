import { safeHttpUrl, safeResourceUrl, safeUserError } from './security.js?v=59.3';
import { escapeHTML, money, showToast } from './ui.js?v=59.3';
import { CONFIG } from './config.js?v=59.3';
import { siteSettingsService } from './services/site-settings-service.js?v=59.3';
import { state as s, ctx } from './state.js?v=59.3';
export function initSiteSettings() {
    function ensureCatalogReady(){
        if(s.serverCatalogReady || (Array.isArray(s.products) && s.products.length)) return true;
        showToast("Məhsullar hazırda əlçatan deyil. Səhifəni yeniləyin.");
        return false;
    }
    async function loadSiteSettings(silent=false){
        try{
            const data=await siteSettingsService.get();
            if(data){
                CONFIG.whatsappNumber=data.whatsapp_number||"";
                CONFIG.instagram=safeHttpUrl(data.instagram_url)||CONFIG.instagram;
                CONFIG.tiktok=safeHttpUrl(data.tiktok_url)||CONFIG.tiktok;
                CONFIG.delivery={pickup:Number(data.delivery_pickup)||0,ganja:Number(data.delivery_ganja)||0,region:Number(data.delivery_region)||0};
                CONFIG.giftWrap=Number(data.gift_wrap)||0;
                ctx.applySiteSettingsToPage(data);
                if(ctx.isAdminUser()) ctx.fillAdminSiteSettings(data);
                if(!silent) ctx.setSiteSettingsStatus("✅ Ayarlar yükləndi.");
            }else if(!silent){ ctx.setSiteSettingsStatus("ℹ️ Ayar sətri hələ yaradılmayıb."); }
        }catch(e){
            if(!silent) ctx.setSiteSettingsStatus(`⚠️ Ayarlar yüklənmədi: ${safeUserError(e)}`);
        }
    }
    function setSiteSettingsStatus(text){ const el=document.getElementById("siteSettingsStatus"); if(el) el.textContent=text; }
    function fillAdminSiteSettings(data){
        const map={siteSettingWhatsapp:data.whatsapp_number||"",siteSettingInstagram:data.instagram_url||"",siteSettingTiktok:data.tiktok_url||"",siteSettingAddress:data.address||"",siteSettingWeekdayHours:data.weekday_hours||"",siteSettingWeekendHours:data.weekend_hours||"",siteSettingPickup:data.delivery_pickup??0,siteSettingGanja:data.delivery_ganja??0,siteSettingRegion:data.delivery_region??0,siteSettingGiftWrap:data.gift_wrap??0};
        Object.entries(map).forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.value=val;});
    }
    function updateLocalBusinessStructuredData(data={}){
        const el=document.getElementById("localBusinessStructuredData"); if(!el)return;
        const payload={"@context":"https://schema.org","@type":"LocalBusiness",name:"F1 Studio",description:"Fərdi hədiyyələr, lazer kəsim, çap və avto aksessuarlar.",address:{"@type":"PostalAddress",addressLocality:"Gəncə",addressCountry:"AZ"},url:window.location.href.split("#")[0]};
        if(data.address) payload.address.streetAddress=String(data.address);
        if(data.weekday_hours||data.weekend_hours){
            payload.openingHoursSpecification=[];
            if(data.weekday_hours){const m=String(data.weekday_hours).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);if(m)payload.openingHoursSpecification.push({"@type":"OpeningHoursSpecification",dayOfWeek:["Monday","Tuesday","Wednesday","Thursday","Friday"],opens:m[1],closes:m[2]});}
            if(data.weekend_hours){const m=String(data.weekend_hours).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);if(m)payload.openingHoursSpecification.push({"@type":"OpeningHoursSpecification",dayOfWeek:["Saturday","Sunday"],opens:m[1],closes:m[2]});}
        }
        const sameAs=[safeHttpUrl(data.instagram_url),safeHttpUrl(data.tiktok_url)].filter(Boolean); if(sameAs.length) payload.sameAs=sameAs;
        el.textContent=JSON.stringify(payload);
    }
    function updateProductStructuredData(list=[]){
        const el=document.getElementById("productStructuredData"); if(!el)return;
        const baseUrl=window.location.href.split("#")[0];
        el.textContent=JSON.stringify({
            "@context":"https://schema.org",
            "@type":"ItemList",
            "itemListElement":list.slice(0,50).map((p,idx)=>({"@type":"ListItem",position:idx+1,item:{"@type":"Product",name:p.name,image:safeResourceUrl((Array.isArray(p.images)&&p.images[0])||p.image,{allowData:false,allowBlob:false,allowRelative:true})||undefined,description:p.desc||undefined,offers:{"@type":"Offer",price:Number(p.price||0).toFixed(2),priceCurrency:"AZN",availability:(p.stockQuantity!=null && Number(p.stockQuantity)<=0)?"https://schema.org/OutOfStock":"https://schema.org/InStock",url:baseUrl+`#product-${p.id}`}}}))
        });
    }
    function applySiteSettingsToPage(data){
        ctx.updateLocalBusinessStructuredData(data);
        const address=document.getElementById("siteAddressText"); if(address) address.innerHTML=`<b>${escapeHTML(data.address||"")}</b>`;
        const wh=document.getElementById("siteWeekdayHoursText"); if(wh) wh.textContent=`I - V günlər: ${data.weekday_hours||""}`;
        const we=document.getElementById("siteWeekendHoursText"); if(we) we.textContent=`VI - VII günlər: ${data.weekend_hours||""}`;
        const faq=document.getElementById("deliveryFaqText"); if(faq) faq.textContent=`Bəli. Gəncə daxili ünvanlara çatdırılma ${money(Number(data.delivery_ganja)||0)}, digər bölgələrə poçtla göndəriş isə ${money(Number(data.delivery_region)||0)} təşkil edir. Mağazadan götürmə isə ${Number(data.delivery_pickup)||0===0?"tamamilə ödənişsizdir":money(Number(data.delivery_pickup)||0)}.`;
        const pickup=document.querySelector('#deliveryOption option[value="pickup"]'); if(pickup) pickup.textContent=`🏬 Mağazadan götürmə (${(Number(data.delivery_pickup)||0)===0?"Ödənişsiz / 0.00 ₼":money(Number(data.delivery_pickup))})`;
        const ganja=document.querySelector('#deliveryOption option[value="ganja"]'); if(ganja) ganja.textContent=`🚚 Ünvanla çatdırılma (Gəncə daxili +${money(Number(data.delivery_ganja)||0)})`;
        const region=document.querySelector('#deliveryOption option[value="region"]'); if(region) region.textContent=`📦 Ünvanla çatdırılma (Rayonlar / Poçtlə +${money(Number(data.delivery_region)||0)})`;
        const wrap=document.querySelector('#wrapContainer span'); if(wrap) wrap.textContent=`🎁 Xüsusi hədiyyə qablaşdırması istəyirəm (+${money(Number(data.gift_wrap)||0)})`;
        const socials=document.getElementById("footerSocials"); if(socials){
            socials.innerHTML="";
            const instagramUrl=safeHttpUrl(data.instagram_url); if(instagramUrl){const a=document.createElement("a");a.href=instagramUrl;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Instagram";a.style.cssText="color:var(--ink);text-decoration:none;border:1px solid var(--line);padding:6px 10px;border-radius:999px";socials.appendChild(a);}
            const tiktokUrl=safeHttpUrl(data.tiktok_url); if(tiktokUrl){const a=document.createElement("a");a.href=tiktokUrl;a.target="_blank";a.rel="noopener noreferrer";a.textContent="TikTok";a.style.cssText="color:var(--ink);text-decoration:none;border:1px solid var(--line);padding:6px 10px;border-radius:999px";socials.appendChild(a);}
        }
    }
    async function saveSiteSettings(){
        if(!ctx.isAdminUser()) return showToast("Admin girişiniz olmalıdır.");
        const rawInstagram=document.getElementById("siteSettingInstagram").value.trim();
        const rawTiktok=document.getElementById("siteSettingTiktok").value.trim();
        const instagram_url=safeHttpUrl(rawInstagram);
        const tiktok_url=safeHttpUrl(rawTiktok);
        if(rawInstagram && !instagram_url) return showToast("Instagram ünvanı yalnız http/https link ola bilər.");
        if(rawTiktok && !tiktok_url) return showToast("TikTok ünvanı yalnız http/https link ola bilər.");
        const whatsapp=document.getElementById("siteSettingWhatsapp").value.trim();
        const address=document.getElementById("siteSettingAddress").value.trim();
        const weekday=document.getElementById("siteSettingWeekdayHours").value.trim();
        const weekend=document.getElementById("siteSettingWeekendHours").value.trim();
        const nums=["siteSettingPickup","siteSettingGanja","siteSettingRegion","siteSettingGiftWrap"].map(id=>Number(document.getElementById(id).value)||0);
        if(!whatsapp || whatsapp.length>30 || address.length>300 || weekday.length>120 || weekend.length>120 || nums.some(n=>!Number.isFinite(n)||n<0||n>100000)) return showToast("Ayar məlumatları düzgün deyil.");
        const payload={
            id:1, whatsapp_number:whatsapp, instagram_url, tiktok_url, address, weekday_hours:weekday, weekend_hours:weekend, delivery_pickup:nums[0], delivery_ganja:nums[1], delivery_region:nums[2], gift_wrap:nums[3], updated_at:new Date().toISOString()
        };
        if(!payload.whatsapp_number) return showToast("WhatsApp nömrəsini daxil edin.");
        let data;
        try { data=await siteSettingsService.save(payload); } catch(error) { ctx.setSiteSettingsStatus(`❌ Yadda saxlanmadı: ${safeUserError(error)}`); showToast("Ayarlar yadda saxlanmadı."); return; }
        ctx.applySiteSettingsToPage(data);
        CONFIG.whatsappNumber=data.whatsapp_number||""; CONFIG.instagram=safeHttpUrl(data.instagram_url)||""; CONFIG.tiktok=safeHttpUrl(data.tiktok_url)||""; CONFIG.delivery={pickup:Number(data.delivery_pickup)||0,ganja:Number(data.delivery_ganja)||0,region:Number(data.delivery_region)||0}; CONFIG.giftWrap=Number(data.gift_wrap)||0;
        ctx.setSiteSettingsStatus("✅ Ayarlar yadda saxlanıldı."); showToast("Sayt ayarları yeniləndi.");
    }
    function buildWhatsAppUrl(baseNumber, orderCode){
        const d=document.getElementById("deliveryOption")?.value||"pickup";
        const wrap=!!document.getElementById("giftWrap")?.checked;
        const unknown=!!document.getElementById("unknownAddress")?.checked;
        const lines=["Salam! F1 Studio-dan sifariş vermək istəyirəm."];
        if(orderCode) lines.push(`Sifariş kodu: ${orderCode}`);
        lines.push("", "Məhsullar:");
        s.cart.forEach((i,idx)=>{ const p=ctx.getProduct(i.id); if(!p)return; lines.push(`${idx+1}. ${p.name} × ${i.qty} — ${money(p.price*i.qty)}`); const c=i.customization; if(c){if(c.text)lines.push(`   • Yazı: ${c.text}`);if(c.color)lines.push(`   • Rəng: ${c.color}`);if(c.size)lines.push(`   • Ölçü: ${c.size}${c.sizeValue?` (${c.sizeValue})`:""}`);if(c.font)lines.push(`   • Şrift: ${c.font}`);if(c.imageName)lines.push(`   • Dizayn faylı: ${c.imageName}`);if(c.note)lines.push(`   • Qeyd: ${c.note}`);}});
        lines.push("",`Müştəri: ${ctx.customerNameSafe()}`,`Telefon: ${document.getElementById("phone")?.value.trim()||""}`);
        const dl=d==="pickup"?"Mağazadan götürmə":d==="ganja"?"Gəncə daxili çatdırılma":"Rayonlara poçtla göndəriş"; lines.push(`Çatdırılma: ${dl}`);
        if(d!=="pickup") lines.push(`Ünvan: ${unknown?"Telefonla dəqiqləşdirilsin":document.getElementById("address")?.value.trim()||""}`);
        lines.push(`Hədiyyə qablaşdırması: ${wrap?`Bəli (+${money(CONFIG.giftWrap)})`:"Xeyr"}`,`Təxmini cəmi: ${money(ctx.getEstimatedOrderTotal())}`);
        const digits=String(baseNumber||"").replace(/\D/g,"");
        if(!digits) return "";
        return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
    }
    Object.assign(ctx, {
    ensureCatalogReady,
    loadSiteSettings,
    setSiteSettingsStatus,
    fillAdminSiteSettings,
    updateLocalBusinessStructuredData,
    updateProductStructuredData,
    applySiteSettingsToPage,
    saveSiteSettings,
    buildWhatsAppUrl
    });
}
