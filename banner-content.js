import { showToast } from './ui.js';
import { safeUserError } from './security.js';
import { siteSettingsService, normalizeBannerContent, DEFAULT_BANNER_CONTENT } from './services/site-settings-service.js';
import { state as s, ctx } from './state.js';

export function initBannerContent(){
  Object.assign(ctx, {
    applyBannerContent,
    fillAdminBannerContent,
    saveBannerContent
  });
  applyBannerContent(DEFAULT_BANNER_CONTENT);
}

function writeBannerBlock(prefix, block){
  const map = {
    [`${prefix}Kicker`]: block.kicker,
    [`${prefix}Title`]: block.title,
    [`${prefix}Highlight`]: block.highlight,
    [`${prefix}Description`]: block.description,
    [`${prefix}Button`]: block.button
  };
  Object.entries(map).forEach(([id,val])=>{
    const el=document.getElementById(id);
    if(el) el.textContent=val;
  });
}

export function applyBannerContent(raw){
  const c = normalizeBannerContent(raw || DEFAULT_BANNER_CONTENT);
  s.bannerContent = c;
  writeBannerBlock('promoPersonal', c.personal);
  writeBannerBlock('promoOffer', c.offer);
  fillAdminBannerContent(c);
}

export function fillAdminBannerContent(c=s.bannerContent || DEFAULT_BANNER_CONTENT){
  const fields = {
    adminBannerPersonalKicker:c.personal.kicker,
    adminBannerPersonalTitle:c.personal.title,
    adminBannerPersonalHighlight:c.personal.highlight,
    adminBannerPersonalDescription:c.personal.description,
    adminBannerPersonalButton:c.personal.button,
    adminBannerOfferKicker:c.offer.kicker,
    adminBannerOfferTitle:c.offer.title,
    adminBannerOfferHighlight:c.offer.highlight,
    adminBannerOfferDescription:c.offer.description,
    adminBannerOfferButton:c.offer.button
  };
  Object.entries(fields).forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.value=val||'';});
}

export async function saveBannerContent(){
  if(!ctx.isAdminUser?.()) return showToast('Admin girişiniz olmalıdır.');
  const read=(id,max)=>String(document.getElementById(id)?.value||'').trim().slice(0,max);
  const payload={
    personal:{
      kicker:read('adminBannerPersonalKicker',60), title:read('adminBannerPersonalTitle',100), highlight:read('adminBannerPersonalHighlight',80),
      description:read('adminBannerPersonalDescription',180), button:read('adminBannerPersonalButton',60)
    },
    offer:{
      kicker:read('adminBannerOfferKicker',60), title:read('adminBannerOfferTitle',100), highlight:read('adminBannerOfferHighlight',80),
      description:read('adminBannerOfferDescription',180), button:read('adminBannerOfferButton',60)
    }
  };
  const required = [
    payload.personal.kicker,payload.personal.title,payload.personal.description,payload.personal.button,
    payload.offer.kicker,payload.offer.title,payload.offer.description,payload.offer.button
  ];
  if(required.some(v=>!v)) return showToast('Bannerın əsas mətn sahələrini boş saxlamaq olmaz.');
  try{
    const data=await siteSettingsService.saveBannerContent(payload);
    applyBannerContent(data.banner_content_json);
    const status=document.getElementById('bannerContentStatus');
    if(status)status.textContent='✅ Banner mətnləri yadda saxlanıldı.';
    showToast('Banner mətnləri yeniləndi.');
  }catch(e){
    const status=document.getElementById('bannerContentStatus');
    if(status)status.textContent=`❌ Yadda saxlanmadı: ${safeUserError(e)}`;
    showToast(e?.message==='BANNER_CONTENT_SCHEMA_MISSING'?'Banner migration-u hələ Supabase-də tətbiq edilməyib.':'Banner mətnləri yadda saxlanmadı.');
  }
}
