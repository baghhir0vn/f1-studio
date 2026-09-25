import { safeHttpUrl, safeResourceUrl, safeUserError } from './security.js';
import { money, showToast, escapeHTML } from './ui.js';
import { CONFIG } from './config.js';
import { siteSettingsService } from './services/site-settings-service.js';
import { newsletterService } from './services/newsletter-service.js';
import { state as s, ctx } from './state.js';

export function initSiteSettings() {
    function ensureCatalogReady(){
        if(s.serverCatalogReady || (Array.isArray(s.products) && s.products.length)) return true;
        showToast("Kataloq hələ yüklənməyib. Bir neçə saniyə sonra yenidən cəhd edin.");
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
                ctx.applyHomepageContent?.(data.homepage_content_json);
                ctx.applyBannerContent?.(data.banner_content_json);
                ctx.applySiteSettingsToPage(data);
                if(data.__contentSchemaAvailable===false) ctx.applySiteContent?.();
                else ctx.applySiteContent?.(data.categories_json, data.hero_images_json);
                if(data.__contentSchemaAvailable===false && ctx.setSiteSettingsStatus && ctx.isAdminUser()) ctx.setSiteSettingsStatus("⚠️ Kateqoriya və hero idarəsi üçün content-management.sql migration-u tətbiq edin.");
                if(ctx.isAdminUser()) { ctx.fillAdminSiteSettings(data); ctx.fillAdminHomepageContent?.(data.homepage_content_json); ctx.fillAdminBannerContent?.(data.banner_content_json); }
                if(!silent) ctx.setSiteSettingsStatus(data.__contentSchemaAvailable===false ? "✅ Əsas ayarlar yükləndi · content migration gözlənilir." : "✅ Ayarlar yükləndi.");
            }else if(!silent){ ctx.setSiteSettingsStatus("ℹ️ Ayar sətri hələ yaradılmayıb."); }
        }catch(e){
            if(!silent) ctx.setSiteSettingsStatus(`⚠️ Ayarlar yüklənmədi: ${safeUserError(e)}`);
        }
    }
    
    function setSiteSettingsStatus(text){ const el=document.getElementById("siteSettingsStatus"); if(el) el.textContent=text; }
    
    function fillAdminSiteSettings(data){
        setSettingsDirty(false);
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
    
    function refreshDeliveryFaqText(data){
        const faq=document.getElementById("deliveryFaqText");
        if(!faq)return;
        const d=data||{};
        const pickupCost=Number(d.delivery_pickup??CONFIG.delivery?.pickup)||0;
        const ganjaCost=Number(d.delivery_ganja??CONFIG.delivery?.ganja)||0;
        const regionCost=Number(d.delivery_region??CONFIG.delivery?.region)||0;
        const template=String(s.homepageContent?.faqItems?.[1]?.answer||"Bəli. Gəncə daxili ünvanlara çatdırılma {ganja}, digər bölgələrə poçtla göndəriş isə {region} təşkil edir. Mağazadan götürmə isə {pickup} təşkil edir.");
        const pickupLabel=pickupCost===0?"tamamilə ödənişsizdir":money(pickupCost);
        faq.textContent=template.replaceAll("{ganja}",money(ganjaCost)).replaceAll("{region}",money(regionCost)).replaceAll("{pickup}",pickupLabel);
    }

    function applySiteSettingsToPage(data){
        ctx.updateLocalBusinessStructuredData(data);
        const addressCity=document.getElementById("siteAddressCity"); if(addressCity) addressCity.textContent=String(data.address||"");
        const wh=document.getElementById("siteWeekdayHoursText"); if(wh) wh.textContent=`I - V günlər: ${data.weekday_hours||""}`;
        const we=document.getElementById("siteWeekendHoursText"); if(we) we.textContent=`VI - VII günlər: ${data.weekend_hours||""}`;
        refreshDeliveryFaqText(data);
        const footerLocation=document.getElementById("footerLocationText"); if(footerLocation && data.address) footerLocation.textContent=`📍 ${String(data.address).trim()}`;
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
    
    let settingsDirty=false;

    function setSettingsDirty(value){
        settingsDirty=!!value;
        const el=document.getElementById("siteSettingsDirty");
        if(el) el.hidden=!settingsDirty;
        const save=document.querySelector('[data-action="saveSiteSettings"]');
        if(save) save.classList.toggle("is-dirty",settingsDirty);
    }

    function markSiteSettingsDirty(){
        if(ctx.isAdminUser()) setSettingsDirty(true);
    }

    function openExternal(url, label){
        const safe=safeHttpUrl(url);
        if(!safe) return showToast(`${label} linki düzgün deyil.`);
        window.open(safe,"_blank","noopener,noreferrer");
    }

    function testSiteWhatsapp(){
        if(!ctx.isAdminUser()) return showToast("Admin girişiniz olmalıdır.");
        const raw=document.getElementById("siteSettingWhatsapp")?.value?.trim()||"";
        const digits=raw.replace(/\D/g,"");
        if(!digits || digits.length<8 || digits.length>15) return showToast("WhatsApp nömrəsini beynəlxalq formatda yazın.");
        window.open(`https://wa.me/${digits}`,"_blank","noopener,noreferrer");
    }

    function testSiteInstagram(){
        if(!ctx.isAdminUser()) return showToast("Admin girişiniz olmalıdır.");
        openExternal(document.getElementById("siteSettingInstagram")?.value?.trim()||"","Instagram");
    }

    function testSiteTiktok(){
        if(!ctx.isAdminUser()) return showToast("Admin girişiniz olmalıdır.");
        openExternal(document.getElementById("siteSettingTiktok")?.value?.trim()||"","TikTok");
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
            id:1, whatsapp_number:whatsapp, instagram_url, tiktok_url, address, weekday_hours:weekday, weekend_hours:weekend, delivery_pickup:nums[0], delivery_ganja:nums[1], delivery_region:nums[2], gift_wrap:nums[3], updated_at:new Date().toISOString(), categories_json:s.siteCategories||[], hero_images_json:s.heroSlides||[], homepage_content_json:s.homepageContent||undefined, banner_content_json:s.bannerContent||undefined
        };
        if(!payload.whatsapp_number) return showToast("WhatsApp nömrəsini daxil edin.");
        let data;
        try { data=await siteSettingsService.save(payload); } catch(error) { ctx.setSiteSettingsStatus(`❌ Yadda saxlanmadı: ${safeUserError(error)}`); showToast("Ayarlar yadda saxlanmadı."); return; }
        ctx.applyHomepageContent?.(data.homepage_content_json); ctx.applyBannerContent?.(data.banner_content_json); ctx.applySiteSettingsToPage(data);
        setSettingsDirty(false);
        CONFIG.whatsappNumber=data.whatsapp_number||""; CONFIG.instagram=safeHttpUrl(data.instagram_url)||""; CONFIG.tiktok=safeHttpUrl(data.tiktok_url)||""; CONFIG.delivery={pickup:Number(data.delivery_pickup)||0,ganja:Number(data.delivery_ganja)||0,region:Number(data.delivery_region)||0}; CONFIG.giftWrap=Number(data.gift_wrap)||0;
        ctx.setSiteSettingsStatus("✅ Ayarlar yadda saxlanıldı."); showToast("Sayt ayarları yeniləndi.");
    }
    
    function buildWhatsAppUrl(baseNumber, orderCode, authoritativeTotalCents=null){
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
        lines.push(`Hədiyyə qablaşdırması: ${wrap?`Bəli (+${money(CONFIG.giftWrap)})`:"Xeyr"}`);
        const finalTotal=Number.isFinite(Number(authoritativeTotalCents)) ? Number(authoritativeTotalCents)/100 : ctx.getEstimatedOrderTotal();
        lines.push(`${Number.isFinite(Number(authoritativeTotalCents)) ? "Sifariş cəmi" : "Təxmini cəmi"}: ${money(finalTotal)}`);
        const digits=String(baseNumber||"").replace(/\D/g,"");
        if(!digits) return "";
        return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
    }


    async function loadNewsletterSubscribers(){
        if(!ctx.isAdminUser()) return showToast("Admin girişiniz olmalıdır.");
        const box=document.getElementById("adminNewsletterList");
        const count=document.getElementById("adminNewsletterCount");
        if(box) box.textContent="Yüklənir...";
        try{
            const rows=await newsletterService.listAdmin(1000);
            if(count) count.textContent=String(rows.length);
            if(!box) return;
            if(!rows.length){ box.innerHTML='<div class="admin-muted">Hələ abunəçi yoxdur.</div>'; return; }
            box.innerHTML=rows.map(row=>`<div class="admin-newsletter-row"><span>${escapeHTML(row.email||"")}</span><time datetime="${escapeHTML(row.created_at||"")}">${escapeHTML(formatAdminDate(row.created_at))}</time></div>`).join("");
        }catch(error){
            if(box) box.textContent="Abunəçilər yüklənmədi.";
            showToast("Newsletter abunəçiləri oxunmadı.");
            console.error("F1 newsletter admin list error",error);
        }
    }

    function formatAdminDate(value){
        if(!value) return "—";
        try { return new Date(value).toLocaleString("az-AZ"); } catch (_) { return String(value); }
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
    buildWhatsAppUrl,
    setSettingsDirty,
    markSiteSettingsDirty,
    testSiteWhatsapp,
    testSiteInstagram,
    testSiteTiktok,
    loadNewsletterSubscribers
    });
}
