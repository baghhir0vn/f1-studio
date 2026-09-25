import { showToast } from './ui.js';
import { safeUserError } from './security.js';
import { siteSettingsService, normalizeHomepageContent, DEFAULT_HOMEPAGE_CONTENT } from './services/site-settings-service.js';
import { state as s, ctx } from './state.js';

export function initHomepageContent(){
  Object.assign(ctx, {
    getDefaultHomepageContent: () => JSON.parse(JSON.stringify(DEFAULT_HOMEPAGE_CONTENT)),
    applyHomepageContent,
    fillAdminHomepageContent,
    saveHomepageContent
  });
  applyHomepageContent(DEFAULT_HOMEPAGE_CONTENT);
}

function setText(id, value){
  const el=document.getElementById(id);
  if(el) el.textContent=String(value ?? '');
}
function setValue(id, value){
  const el=document.getElementById(id);
  if(el) el.value=String(value ?? '');
}
function setPlaceholder(id, value){
  const el=document.getElementById(id);
  if(el) el.placeholder=String(value ?? '');
}

export function applyHomepageContent(raw){
  const c = normalizeHomepageContent(raw || DEFAULT_HOMEPAGE_CONTENT);
  s.homepageContent = c;

  // IMPORTANT: only replace text/value/placeholder. No style, class or HTML is touched.
  // Therefore the existing font family, size, weight, color, spacing and layout remain unchanged.
  const textMap = {
    announcementBar:c.announcement,
    navHome:c.navHome, mobileNavHome:c.navHome, navShop:c.navShop, mobileNavProducts:c.mobileNavProducts,
    navCategories:c.navCategories, mobileNavCategories:c.navCategories, navAbout:c.navAbout, navReviews:c.navReviews, navContact:c.navContact,
    mobileNavFaq:c.mobileNavFaq, mobileNavContact:c.mobileNavContact, mobileNavSearch:c.mobileNavSearch, mobileNavFavorites:c.mobileNavFavorites, mobileNavProfile:c.mobileNavProfile,
    heroEyebrowText:c.heroEyebrow, heroTitleLine1:c.heroTitleLine1, heroTitleEm:c.heroTitleEm, heroSubtitle:c.heroSubtitle,
    heroPrimaryCta:c.heroPrimaryCta, heroSecondaryCta:c.heroSecondaryCta,
    heroBenefit1:c.heroBenefits[0], heroBenefit2:c.heroBenefits[1], heroBenefit3:c.heroBenefits[2],
    categorySectionKicker:c.categorySectionKicker, categorySectionTitle:c.categorySectionTitle,
    shopSectionKicker:c.shopSectionKicker, sectionTitle:c.shopSectionTitle, shopViewAll:c.shopViewAll,
    promoPersonalKicker:c.promoPersonalKicker, promoPersonalTitle:c.promoPersonalTitle, promoPersonalHighlight:c.promoPersonalHighlight, promoPersonalDescription:c.promoPersonalDescription, promoPersonalButton:c.promoPersonalButton,
    promoOfferKicker:c.promoOfferKicker, promoOfferTitle:c.promoOfferTitle, promoOfferHighlight:c.promoOfferHighlight, promoOfferDescription:c.promoOfferDescription, promoOfferButton:c.promoOfferButton,
    newsletterTitle:c.newsletterTitle, newsletterDescription:c.newsletterDescription, newsletterButton:c.newsletterButton,
    reviewsSectionTitle:c.reviewsSectionTitle, reviewsFormTitle:c.reviewsFormTitle,
    faqSectionTitle:c.faqSectionTitle,
    aboutSectionTitle:c.aboutSectionTitle, aboutHoursLabel:c.aboutHoursLabel, aboutMapTitle:c.aboutMapTitle, aboutMapDescription:c.aboutMapDescription, aboutMapButton:c.aboutMapButton, aboutWhatsappNote:c.aboutWhatsappNote,
    footerDescription:c.footerDescription, footerStatus:c.footerStatus, footerLinksTitle:c.footerLinksTitle, footerHome:c.footerHome, footerProducts:c.footerProducts, footerFaq:c.footerFaq, footerContact:c.footerContact,
    footerStoreTitle:c.footerStoreTitle, footerAllProducts:c.footerAllProducts, footerNewProducts:c.footerNewProducts, footerPopularProducts:c.footerPopularProducts, footerCategories:c.footerCategories,
    footerHelpTitle:c.footerHelpTitle, footerFaqLink:c.footerFaqLink, footerOrderRule:c.footerOrderRule, footerDelivery:c.footerDelivery, footerContactLink:c.footerContactLink,
    footerOrderTitle:c.footerOrderTitle, footerWhatsAppText:c.footerOrderText, footerCopyright:c.footerCopyright
  };
  Object.entries(textMap).forEach(([id,val])=>setText(id,val));
  setPlaceholder('newsletterEmail',c.newsletterPlaceholder);
  setPlaceholder('search',c.productSearchPlaceholder);
  setText('sortDefaultLabel',c.productSortDefault); setText('sortLowLabel',c.productSortLow); setText('sortHighLabel',c.productSortHigh);

  c.serviceItems.forEach((item, idx)=>{
    setText(`service${idx+1}Title`,item.title); setText(`service${idx+1}Subtitle`,item.subtitle);
  });
  c.faqItems.forEach((item, idx)=>{ setText(`faqQuestion${idx+1}`,item.question); if(idx===1) setText('deliveryFaqText',item.answer); else setText(`faqAnswer${idx+1}`,item.answer); });
  fillAdminHomepageContent(c);
}

function fillAdminHomepageContent(c=s.homepageContent || DEFAULT_HOMEPAGE_CONTENT){
  const fields = {
    adminHomeAnnouncement:c.announcement, adminHomeNavHome:c.navHome, adminHomeNavShop:c.navShop, adminHomeNavCategories:c.navCategories, adminHomeNavAbout:c.navAbout, adminHomeNavReviews:c.navReviews, adminHomeNavContact:c.navContact,
    adminHomeMobileFaq:c.mobileNavFaq, adminHomeMobileProducts:c.mobileNavProducts, adminHomeMobileContact:c.mobileNavContact, adminHomeMobileSearch:c.mobileNavSearch, adminHomeMobileFavorites:c.mobileNavFavorites, adminHomeMobileProfile:c.mobileNavProfile,
    adminHomeHeroEyebrow:c.heroEyebrow, adminHomeHeroTitle1:c.heroTitleLine1, adminHomeHeroTitle2:c.heroTitleEm, adminHomeHeroSubtitle:c.heroSubtitle, adminHomeHeroPrimary:c.heroPrimaryCta, adminHomeHeroSecondary:c.heroSecondaryCta,
    adminHomeCategoryKicker:c.categorySectionKicker, adminHomeCategoryTitle:c.categorySectionTitle, adminHomeShopKicker:c.shopSectionKicker, adminHomeShopTitle:c.shopSectionTitle, adminHomeShopViewAll:c.shopViewAll,
    adminHomeProductSearch:c.productSearchPlaceholder, adminHomeSortDefault:c.productSortDefault, adminHomeSortLow:c.productSortLow, adminHomeSortHigh:c.productSortHigh,
    adminHomeNewsletterTitle:c.newsletterTitle, adminHomeNewsletterDesc:c.newsletterDescription, adminHomeNewsletterPlaceholder:c.newsletterPlaceholder, adminHomeNewsletterButton:c.newsletterButton,
    adminHomeReviewsTitle:c.reviewsSectionTitle, adminHomeReviewsFormTitle:c.reviewsFormTitle, adminHomeFaqTitle:c.faqSectionTitle,
    adminHomeAboutTitle:c.aboutSectionTitle, adminHomeAboutHoursLabel:c.aboutHoursLabel, adminHomeMapTitle:c.aboutMapTitle, adminHomeMapDescription:c.aboutMapDescription, adminHomeMapButton:c.aboutMapButton, adminHomeWhatsappNote:c.aboutWhatsappNote,
    adminHomeFooterDescription:c.footerDescription, adminHomeFooterStatus:c.footerStatus, adminHomeFooterLinksTitle:c.footerLinksTitle, adminHomeFooterHome:c.footerHome, adminHomeFooterProducts:c.footerProducts, adminHomeFooterFaq:c.footerFaq, adminHomeFooterContact:c.footerContact,
    adminHomeFooterStoreTitle:c.footerStoreTitle, adminHomeFooterAllProducts:c.footerAllProducts, adminHomeFooterNewProducts:c.footerNewProducts, adminHomeFooterPopular:c.footerPopularProducts, adminHomeFooterCategories:c.footerCategories,
    adminHomeFooterHelpTitle:c.footerHelpTitle, adminHomeFooterFaqLink:c.footerFaqLink, adminHomeFooterOrderRule:c.footerOrderRule, adminHomeFooterDelivery:c.footerDelivery, adminHomeFooterContactLink:c.footerContactLink,
    adminHomeFooterOrderTitle:c.footerOrderTitle, adminHomeFooterOrderText:c.footerOrderText, adminHomeFooterCopyright:c.footerCopyright
  };
  c.heroBenefits.forEach((v,i)=>fields[`adminHomeHeroBenefit${i+1}`]=v);
  c.serviceItems.forEach((item,i)=>{fields[`adminHomeService${i+1}Title`]=item.title;fields[`adminHomeService${i+1}Subtitle`]=item.subtitle;});
  c.faqItems.forEach((item,i)=>{fields[`adminHomeFaq${i+1}Question`]=item.question;fields[`adminHomeFaq${i+1}Answer`]=item.answer;});
  Object.entries(fields).forEach(([id,val])=>setValue(id,val));
}

export async function saveHomepageContent(){
  if(!ctx.isAdminUser?.()) return showToast('Admin girişiniz olmalıdır.');
  const read=(id,max)=>String(document.getElementById(id)?.value||'').trim().slice(0,max);
  const payload={
    announcement:read('adminHomeAnnouncement',180),
    navHome:read('adminHomeNavHome',60), navShop:read('adminHomeNavShop',60), navCategories:read('adminHomeNavCategories',60), navAbout:read('adminHomeNavAbout',60), navReviews:read('adminHomeNavReviews',60), navContact:read('adminHomeNavContact',60),
    mobileNavFaq:read('adminHomeMobileFaq',60), mobileNavProducts:read('adminHomeMobileProducts',60), mobileNavContact:read('adminHomeMobileContact',60), mobileNavSearch:read('adminHomeMobileSearch',60), mobileNavFavorites:read('adminHomeMobileFavorites',60), mobileNavProfile:read('adminHomeMobileProfile',60),
    heroEyebrow:read('adminHomeHeroEyebrow',100), heroTitleLine1:read('adminHomeHeroTitle1',80), heroTitleEm:read('adminHomeHeroTitle2',80), heroSubtitle:read('adminHomeHeroSubtitle',260), heroPrimaryCta:read('adminHomeHeroPrimary',60), heroSecondaryCta:read('adminHomeHeroSecondary',60),
    heroBenefits:[read('adminHomeHeroBenefit1',60),read('adminHomeHeroBenefit2',60),read('adminHomeHeroBenefit3',60)],
    serviceItems:[1,2,3,4].map(i=>({title:read(`adminHomeService${i}Title`,80),subtitle:read(`adminHomeService${i}Subtitle`,140)})),
    categorySectionKicker:read('adminHomeCategoryKicker',60), categorySectionTitle:read('adminHomeCategoryTitle',100), shopSectionKicker:read('adminHomeShopKicker',60), shopSectionTitle:read('adminHomeShopTitle',100), shopViewAll:read('adminHomeShopViewAll',60),
    productSearchPlaceholder:read('adminHomeProductSearch',140), productSortDefault:read('adminHomeSortDefault',80), productSortLow:read('adminHomeSortLow',80), productSortHigh:read('adminHomeSortHigh',80),
    promoPersonalKicker:s.homepageContent?.promoPersonalKicker||DEFAULT_HOMEPAGE_CONTENT.promoPersonalKicker, promoPersonalTitle:s.homepageContent?.promoPersonalTitle||DEFAULT_HOMEPAGE_CONTENT.promoPersonalTitle, promoPersonalHighlight:s.homepageContent?.promoPersonalHighlight||DEFAULT_HOMEPAGE_CONTENT.promoPersonalHighlight, promoPersonalDescription:s.homepageContent?.promoPersonalDescription||DEFAULT_HOMEPAGE_CONTENT.promoPersonalDescription, promoPersonalButton:s.homepageContent?.promoPersonalButton||DEFAULT_HOMEPAGE_CONTENT.promoPersonalButton,
    promoOfferKicker:s.homepageContent?.promoOfferKicker||DEFAULT_HOMEPAGE_CONTENT.promoOfferKicker, promoOfferTitle:s.homepageContent?.promoOfferTitle||DEFAULT_HOMEPAGE_CONTENT.promoOfferTitle, promoOfferHighlight:s.homepageContent?.promoOfferHighlight||DEFAULT_HOMEPAGE_CONTENT.promoOfferHighlight, promoOfferDescription:s.homepageContent?.promoOfferDescription||DEFAULT_HOMEPAGE_CONTENT.promoOfferDescription, promoOfferButton:s.homepageContent?.promoOfferButton||DEFAULT_HOMEPAGE_CONTENT.promoOfferButton,
    newsletterTitle:read('adminHomeNewsletterTitle',100), newsletterDescription:read('adminHomeNewsletterDesc',180), newsletterPlaceholder:read('adminHomeNewsletterPlaceholder',80), newsletterButton:read('adminHomeNewsletterButton',60), reviewsSectionTitle:read('adminHomeReviewsTitle',100), reviewsFormTitle:read('adminHomeReviewsFormTitle',100),
    faqSectionTitle:read('adminHomeFaqTitle',120), faqItems:[1,2,3,4].map(i=>({question:read(`adminHomeFaq${i}Question`,140),answer:read(`adminHomeFaq${i}Answer`,700)})),
    aboutSectionTitle:read('adminHomeAboutTitle',120), aboutHoursLabel:read('adminHomeAboutHoursLabel',60), aboutMapTitle:read('adminHomeMapTitle',100), aboutMapDescription:read('adminHomeMapDescription',180), aboutMapButton:read('adminHomeMapButton',100), aboutWhatsappNote:read('adminHomeWhatsappNote',180),
    footerDescription:read('adminHomeFooterDescription',260), footerStatus:read('adminHomeFooterStatus',100), footerLinksTitle:read('adminHomeFooterLinksTitle',60), footerHome:read('adminHomeFooterHome',60), footerProducts:read('adminHomeFooterProducts',100), footerFaq:read('adminHomeFooterFaq',60), footerContact:read('adminHomeFooterContact',100), footerStoreTitle:read('adminHomeFooterStoreTitle',60), footerAllProducts:read('adminHomeFooterAllProducts',100), footerNewProducts:read('adminHomeFooterNewProducts',100), footerPopularProducts:read('adminHomeFooterPopular',100), footerCategories:read('adminHomeFooterCategories',100), footerHelpTitle:read('adminHomeFooterHelpTitle',60), footerFaqLink:read('adminHomeFooterFaqLink',60), footerOrderRule:read('adminHomeFooterOrderRule',100), footerDelivery:read('adminHomeFooterDelivery',60), footerContactLink:read('adminHomeFooterContactLink',100), footerOrderTitle:read('adminHomeFooterOrderTitle',60), footerOrderText:read('adminHomeFooterOrderText',160), footerCopyright:read('adminHomeFooterCopyright',80)
  };
  const required=['heroTitleLine1','heroTitleEm','heroSubtitle','categorySectionTitle','shopSectionTitle','newsletterTitle','newsletterDescription'];
  if(required.some(k=>!payload[k])) return showToast('Əsas mətn sahələrini boş saxlamaq olmaz.');
  if(payload.faqItems.some(x=>!x.question||!x.answer)) return showToast('FAQ sual və cavablarının hamısını doldurun.');
  try{
    const data=await siteSettingsService.saveHomepageContent(payload);
    applyHomepageContent(data.homepage_content_json);
    ctx.refreshDeliveryFaqText?.();
    const status=document.getElementById('homepageContentStatus'); if(status)status.textContent='✅ Ana səhifə mətnləri yadda saxlanıldı.';
    showToast('Ana səhifə mətnləri yeniləndi. Mövcud dizayn qorundu.');
  }catch(e){
    const status=document.getElementById('homepageContentStatus'); if(status)status.textContent=`❌ Yadda saxlanmadı: ${safeUserError(e)}`;
    showToast('Ana səhifə mətnləri yadda saxlanmadı.');
  }
}
