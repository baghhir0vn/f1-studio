import { sb } from '../config.js';
import { safeHttpUrl, safeResourceUrl, isSafeProductImagePath, isSafeSiteContentPath } from '../security.js';

const SITE_SETTINGS_COLUMNS = 'id,whatsapp_number,instagram_url,tiktok_url,address,weekday_hours,weekend_hours,delivery_pickup,delivery_ganja,delivery_region,gift_wrap,categories_json,hero_images_json,homepage_content_json,banner_content_json,updated_at';
const CONTENT_SITE_SETTINGS_COLUMNS = 'id,whatsapp_number,instagram_url,tiktok_url,address,weekday_hours,weekend_hours,delivery_pickup,delivery_ganja,delivery_region,gift_wrap,categories_json,hero_images_json,homepage_content_json,updated_at';
const LEGACY_SITE_SETTINGS_COLUMNS = 'id,whatsapp_number,instagram_url,tiktok_url,address,weekday_hours,weekend_hours,delivery_pickup,delivery_ganja,delivery_region,gift_wrap,updated_at';

function cleanCategory(value = {}) {
    const imageUrl = safeResourceUrl(value.image_url || value.image || '', { allowData: false, allowBlob: false, allowRelative: true, maxLength: 2048 }) || '';
    const action = ['filter', 'search', 'all'].includes(value.action) ? value.action : 'filter';
    return {
        id: String(value.id || '').trim().slice(0, 80),
        name: String(value.name || '').trim().slice(0, 80),
        subtitle: String(value.subtitle || '').trim().slice(0, 100),
        image_url: imageUrl,
        image_path: (isSafeSiteContentPath(value.image_path || '') || isSafeProductImagePath(value.image_path || '')) ? String(value.image_path).trim() : '',
        action,
        active: value.active !== false,
        sort_order: Number.isFinite(Number(value.sort_order)) ? Math.max(0, Math.min(999, Math.floor(Number(value.sort_order)))) : 0
    };
}

function cleanHero(value = {}) {
    const imageUrl = safeResourceUrl(value.image_url || value.image || '', { allowData: false, allowBlob: false, allowRelative: true, maxLength: 2048 }) || '';
    return {
        id: String(value.id || '').trim().slice(0, 80),
        image_url: imageUrl,
        image_path: (isSafeSiteContentPath(value.image_path || '') || isSafeProductImagePath(value.image_path || '')) ? String(value.image_path).trim() : '',
        alt: String(value.alt || 'F1 Studio hədiyyə kompozisiyası').trim().slice(0, 180),
        active: value.active !== false,
        sort_order: Number.isFinite(Number(value.sort_order)) ? Math.max(0, Math.min(999, Math.floor(Number(value.sort_order)))) : 0
    };
}



export const DEFAULT_HOMEPAGE_CONTENT = {
  announcement:'🚚 Gəncə daxili çatdırılma · Fərdi sifarişlər qəbul edilir · WhatsApp ilə rahat sifariş',
  navHome:'Ana səhifə', navShop:'Mağaza', navCategories:'Kateqoriyalar⌄', navAbout:'Haqqımızda', navReviews:'Rəylər', navContact:'Əlaqə',
  mobileNavFaq:'Suallar', mobileNavProducts:'Məhsullar', mobileNavContact:'Əlaqə', mobileNavSearch:'⌕ Axtar', mobileNavFavorites:'♡ Sevimlilər', mobileNavProfile:'♙ Profil',
  heroEyebrow:'DÜŞÜNÜLMÜŞ HƏDİYYƏLƏR', heroTitleLine1:'Hər anı', heroTitleEm:'xüsusi et.',
  heroSubtitle:'Sevdiklərin üçün mənalı, zövqlü və fərdi hədiyyələr. Sənin üçün hazırlanır, gözəl təqdim olunur.',
  heroPrimaryCta:'İNDİ KƏŞF ET', heroSecondaryCta:'KATEQORİYALARA BAX',
  heroBenefits:['Fərdi dizayn','Keyfiyyətli hazırlanma','WhatsApp sifarişi'],
  serviceItems:[
    {title:'Sürətli hazırlanma',subtitle:'Sifarişdən sonra operativ proses'},
    {title:'Fərdi hədiyyələr',subtitle:'İstədiyin mətn və dizayn'},
    {title:'Etibarlı sifariş',subtitle:'Detallar WhatsApp-da dəqiqləşir'},
    {title:'Müştəri dəstəyi',subtitle:'Sualın olduqda yanındayıq'}
  ],
  categorySectionKicker:'F1 STUDIO', categorySectionTitle:'Kateqoriyalar',
  shopSectionKicker:'SEÇİLMİŞLƏR', shopSectionTitle:'Ən çox seçilənlər', shopViewAll:'Hamısına bax →',
  productSearchPlaceholder:'Xidmət və ya məhsul axtar (məs: Lipa nömrə)...',
  productSortDefault:'Sıralama (Standart)', productSortLow:'Ucuzdan bahaya', productSortHigh:'Bahadan ucuza',
  promoPersonalKicker:'FƏRDİ HƏDİYYƏLƏR', promoPersonalTitle:'Hədiyyəni daha', promoPersonalHighlight:'xüsusi et.',
  promoPersonalDescription:'İstədiyin ad, yazı və dizaynı əlavə et.', promoPersonalButton:'FƏRDİLƏŞDİR',
  promoOfferKicker:'XÜSUSİ TƏKLİF', promoOfferTitle:'İlk sifarişinə', promoOfferHighlight:'10% endirim',
  promoOfferDescription:'İlk sifarişində fürsətdən yararlan.', promoOfferButton:'10% ENDİRİM',
  newsletterTitle:'Yeniliklərdən xəbərdar ol', newsletterDescription:'Yeni məhsullar və xüsusi təkliflər üçün qoşul.',
  newsletterPlaceholder:'Email ünvanınız', newsletterButton:'ABUNƏ OL',
  reviewsSectionTitle:'Müştəri Rəyləri ⭐', reviewsFormTitle:'Siz də rəy bildirin:',
  faqSectionTitle:'Tez-tez Verilən Suallar ❓',
  faqItems:[
    {question:'Sifariş necə verilir?',answer:'Məhsulu səbətə əlavə edin, ad və telefon məlumatlarını doldurun, çatdırılmanı seçin. Sonra sifariş xülasəsi WhatsApp-a açılır və son detalları operatorla dəqiqləşdirirsiniz.'},
    {question:'Çatdırılma xidməti varmı və neçəyədir?',answer:'Bəli. Gəncə daxili ünvanlara çatdırılma {ganja}, digər bölgələrə poçtla göndəriş isə {region} təşkil edir. Mağazadan götürmə isə {pickup} təşkil edir.'},
    {question:'Ödənişi hansı yollarla edə bilərəm?',answer:'Ödəniş və sifariş detalları WhatsApp üzərindən operatorla razılaşdırılır. Bu saytda kartla onlayn ödəniş sistemi istifadə olunmur.'},
    {question:'Öz istədiyim dizaynda nəsə hazırlada bilərəm?',answer:'Əlbəttə! Lazer kəsim, taxta işləmələri və ya fərdi çaplar üçün öz ideya və ya dizaynlarınızı bizə WhatsApp-da göndərə bilərsiniz, istəyinizə uyğun şəkildə hazırlayarıq.'}
  ],
  aboutSectionTitle:'Bizimlə Əlaqə & Ünvan',
  aboutHoursLabel:'İş saatları:', aboutMapTitle:'Xəritədə tapın',
  aboutMapDescription:'📍 F1 Studio — 4 nömrəli poçtun yanı, Gəncə',
  aboutMapButton:'📍 Dəqiq yeri Google Maps-də aç',
  aboutWhatsappNote:'💬 WhatsApp sifarişi checkout zamanı avtomatik açılır.',
  footerDescription:'Fərdi hədiyyələr, çap, lazer kəsim və avto aksessuarlar. Dizaynını hazırla, sifarişini WhatsApp-da tamamla.',
  footerStatus:'Fərdi sifarişlər qəbul edilir', footerLinksTitle:'Keçidlər', footerHome:'Ana səhifə', footerProducts:'Məhsul və xidmətlər', footerFaq:'Suallar', footerContact:'Əlaqə & Ünvan',
  footerStoreTitle:'Mağaza', footerAllProducts:'Bütün məhsullar', footerNewProducts:'Yeni məhsullar', footerPopularProducts:'Ən çox seçilənlər', footerCategories:'Kateqoriyalar',
  footerHelpTitle:'Kömək', footerFaqLink:'FAQ', footerOrderRule:'Sifariş qaydası', footerDelivery:'Çatdırılma', footerContactLink:'Əlaqə',
  footerOrderTitle:'Sifariş', footerOrderText:'WhatsApp sifarişi checkout-dan açılır',
  footerCopyright:'© 2026 F1 Studio'
};

export function normalizeHomepageContent(value = {}) {
  const c = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text=(v,d,max)=>String(v ?? d).trim().slice(0,max);
  const arr=(v,d,n,max)=>Array.from({length:n},(_,i)=>text(Array.isArray(v)?v[i]:undefined,d[i],max));
  const svc=Array.from({length:4},(_,i)=>({
    title:text(c.serviceItems?.[i]?.title,DEFAULT_HOMEPAGE_CONTENT.serviceItems[i].title,80),
    subtitle:text(c.serviceItems?.[i]?.subtitle,DEFAULT_HOMEPAGE_CONTENT.serviceItems[i].subtitle,140)
  }));
  const faq=Array.from({length:4},(_,i)=>({
    question:text(c.faqItems?.[i]?.question,DEFAULT_HOMEPAGE_CONTENT.faqItems[i].question,140),
    answer:text(c.faqItems?.[i]?.answer,DEFAULT_HOMEPAGE_CONTENT.faqItems[i].answer,700)
  }));
  return {
    ...DEFAULT_HOMEPAGE_CONTENT,
    announcement:text(c.announcement,DEFAULT_HOMEPAGE_CONTENT.announcement,180),
    navHome:text(c.navHome,DEFAULT_HOMEPAGE_CONTENT.navHome,60), navShop:text(c.navShop,DEFAULT_HOMEPAGE_CONTENT.navShop,60),
    navCategories:text(c.navCategories,DEFAULT_HOMEPAGE_CONTENT.navCategories,60), navAbout:text(c.navAbout,DEFAULT_HOMEPAGE_CONTENT.navAbout,60),
    navReviews:text(c.navReviews,DEFAULT_HOMEPAGE_CONTENT.navReviews,60), navContact:text(c.navContact,DEFAULT_HOMEPAGE_CONTENT.navContact,60),
    mobileNavFaq:text(c.mobileNavFaq,DEFAULT_HOMEPAGE_CONTENT.mobileNavFaq,60), mobileNavProducts:text(c.mobileNavProducts,DEFAULT_HOMEPAGE_CONTENT.mobileNavProducts,60), mobileNavContact:text(c.mobileNavContact,DEFAULT_HOMEPAGE_CONTENT.mobileNavContact,60),
    mobileNavSearch:text(c.mobileNavSearch,DEFAULT_HOMEPAGE_CONTENT.mobileNavSearch,60), mobileNavFavorites:text(c.mobileNavFavorites,DEFAULT_HOMEPAGE_CONTENT.mobileNavFavorites,60), mobileNavProfile:text(c.mobileNavProfile,DEFAULT_HOMEPAGE_CONTENT.mobileNavProfile,60),
    heroEyebrow:text(c.heroEyebrow,DEFAULT_HOMEPAGE_CONTENT.heroEyebrow,100), heroTitleLine1:text(c.heroTitleLine1,DEFAULT_HOMEPAGE_CONTENT.heroTitleLine1,80), heroTitleEm:text(c.heroTitleEm,DEFAULT_HOMEPAGE_CONTENT.heroTitleEm,80),
    heroSubtitle:text(c.heroSubtitle,DEFAULT_HOMEPAGE_CONTENT.heroSubtitle,260), heroPrimaryCta:text(c.heroPrimaryCta,DEFAULT_HOMEPAGE_CONTENT.heroPrimaryCta,60), heroSecondaryCta:text(c.heroSecondaryCta,DEFAULT_HOMEPAGE_CONTENT.heroSecondaryCta,60),
    heroBenefits:arr(c.heroBenefits,DEFAULT_HOMEPAGE_CONTENT.heroBenefits,3,60), serviceItems:svc,
    categorySectionKicker:text(c.categorySectionKicker,DEFAULT_HOMEPAGE_CONTENT.categorySectionKicker,60), categorySectionTitle:text(c.categorySectionTitle,DEFAULT_HOMEPAGE_CONTENT.categorySectionTitle,100),
    shopSectionKicker:text(c.shopSectionKicker,DEFAULT_HOMEPAGE_CONTENT.shopSectionKicker,60), shopSectionTitle:text(c.shopSectionTitle,DEFAULT_HOMEPAGE_CONTENT.shopSectionTitle,100), shopViewAll:text(c.shopViewAll,DEFAULT_HOMEPAGE_CONTENT.shopViewAll,60),
    productSearchPlaceholder:text(c.productSearchPlaceholder,DEFAULT_HOMEPAGE_CONTENT.productSearchPlaceholder,140), productSortDefault:text(c.productSortDefault,DEFAULT_HOMEPAGE_CONTENT.productSortDefault,80), productSortLow:text(c.productSortLow,DEFAULT_HOMEPAGE_CONTENT.productSortLow,80), productSortHigh:text(c.productSortHigh,DEFAULT_HOMEPAGE_CONTENT.productSortHigh,80),
    promoPersonalKicker:text(c.promoPersonalKicker,DEFAULT_HOMEPAGE_CONTENT.promoPersonalKicker,60), promoPersonalTitle:text(c.promoPersonalTitle,DEFAULT_HOMEPAGE_CONTENT.promoPersonalTitle,100), promoPersonalHighlight:text(c.promoPersonalHighlight,DEFAULT_HOMEPAGE_CONTENT.promoPersonalHighlight,80), promoPersonalDescription:text(c.promoPersonalDescription,DEFAULT_HOMEPAGE_CONTENT.promoPersonalDescription,180), promoPersonalButton:text(c.promoPersonalButton,DEFAULT_HOMEPAGE_CONTENT.promoPersonalButton,60),
    promoOfferKicker:text(c.promoOfferKicker,DEFAULT_HOMEPAGE_CONTENT.promoOfferKicker,60), promoOfferTitle:text(c.promoOfferTitle,DEFAULT_HOMEPAGE_CONTENT.promoOfferTitle,100), promoOfferHighlight:text(c.promoOfferHighlight,DEFAULT_HOMEPAGE_CONTENT.promoOfferHighlight,80), promoOfferDescription:text(c.promoOfferDescription,DEFAULT_HOMEPAGE_CONTENT.promoOfferDescription,180), promoOfferButton:text(c.promoOfferButton,DEFAULT_HOMEPAGE_CONTENT.promoOfferButton,60),
    newsletterTitle:text(c.newsletterTitle,DEFAULT_HOMEPAGE_CONTENT.newsletterTitle,100), newsletterDescription:text(c.newsletterDescription,DEFAULT_HOMEPAGE_CONTENT.newsletterDescription,180), newsletterPlaceholder:text(c.newsletterPlaceholder,DEFAULT_HOMEPAGE_CONTENT.newsletterPlaceholder,80), newsletterButton:text(c.newsletterButton,DEFAULT_HOMEPAGE_CONTENT.newsletterButton,60),
    reviewsSectionTitle:text(c.reviewsSectionTitle,DEFAULT_HOMEPAGE_CONTENT.reviewsSectionTitle,100), reviewsFormTitle:text(c.reviewsFormTitle,DEFAULT_HOMEPAGE_CONTENT.reviewsFormTitle,100),
    faqSectionTitle:text(c.faqSectionTitle,DEFAULT_HOMEPAGE_CONTENT.faqSectionTitle,120), faqItems:faq,
    aboutSectionTitle:text(c.aboutSectionTitle,DEFAULT_HOMEPAGE_CONTENT.aboutSectionTitle,120), aboutHoursLabel:text(c.aboutHoursLabel,DEFAULT_HOMEPAGE_CONTENT.aboutHoursLabel,60), aboutMapTitle:text(c.aboutMapTitle,DEFAULT_HOMEPAGE_CONTENT.aboutMapTitle,100), aboutMapDescription:text(c.aboutMapDescription,DEFAULT_HOMEPAGE_CONTENT.aboutMapDescription,180), aboutMapButton:text(c.aboutMapButton,DEFAULT_HOMEPAGE_CONTENT.aboutMapButton,100), aboutWhatsappNote:text(c.aboutWhatsappNote,DEFAULT_HOMEPAGE_CONTENT.aboutWhatsappNote,180),
    footerDescription:text(c.footerDescription,DEFAULT_HOMEPAGE_CONTENT.footerDescription,260), footerStatus:text(c.footerStatus,DEFAULT_HOMEPAGE_CONTENT.footerStatus,100), footerLinksTitle:text(c.footerLinksTitle,DEFAULT_HOMEPAGE_CONTENT.footerLinksTitle,60), footerHome:text(c.footerHome,DEFAULT_HOMEPAGE_CONTENT.footerHome,60), footerProducts:text(c.footerProducts,DEFAULT_HOMEPAGE_CONTENT.footerProducts,100), footerFaq:text(c.footerFaq,DEFAULT_HOMEPAGE_CONTENT.footerFaq,60), footerContact:text(c.footerContact,DEFAULT_HOMEPAGE_CONTENT.footerContact,100),
    footerStoreTitle:text(c.footerStoreTitle,DEFAULT_HOMEPAGE_CONTENT.footerStoreTitle,60), footerAllProducts:text(c.footerAllProducts,DEFAULT_HOMEPAGE_CONTENT.footerAllProducts,100), footerNewProducts:text(c.footerNewProducts,DEFAULT_HOMEPAGE_CONTENT.footerNewProducts,100), footerPopularProducts:text(c.footerPopularProducts,DEFAULT_HOMEPAGE_CONTENT.footerPopularProducts,100), footerCategories:text(c.footerCategories,DEFAULT_HOMEPAGE_CONTENT.footerCategories,100),
    footerHelpTitle:text(c.footerHelpTitle,DEFAULT_HOMEPAGE_CONTENT.footerHelpTitle,60), footerFaqLink:text(c.footerFaqLink,DEFAULT_HOMEPAGE_CONTENT.footerFaqLink,60), footerOrderRule:text(c.footerOrderRule,DEFAULT_HOMEPAGE_CONTENT.footerOrderRule,100), footerDelivery:text(c.footerDelivery,DEFAULT_HOMEPAGE_CONTENT.footerDelivery,60), footerContactLink:text(c.footerContactLink,DEFAULT_HOMEPAGE_CONTENT.footerContactLink,100),
    footerOrderTitle:text(c.footerOrderTitle,DEFAULT_HOMEPAGE_CONTENT.footerOrderTitle,60), footerOrderText:text(c.footerOrderText,DEFAULT_HOMEPAGE_CONTENT.footerOrderText,160), footerCopyright:text(c.footerCopyright,DEFAULT_HOMEPAGE_CONTENT.footerCopyright,80)
  };
}

export const DEFAULT_BANNER_CONTENT = {
  personal: {
    kicker: DEFAULT_HOMEPAGE_CONTENT.promoPersonalKicker,
    title: DEFAULT_HOMEPAGE_CONTENT.promoPersonalTitle,
    highlight: DEFAULT_HOMEPAGE_CONTENT.promoPersonalHighlight,
    description: DEFAULT_HOMEPAGE_CONTENT.promoPersonalDescription,
    button: DEFAULT_HOMEPAGE_CONTENT.promoPersonalButton
  },
  offer: {
    kicker: DEFAULT_HOMEPAGE_CONTENT.promoOfferKicker,
    title: DEFAULT_HOMEPAGE_CONTENT.promoOfferTitle,
    highlight: DEFAULT_HOMEPAGE_CONTENT.promoOfferHighlight,
    description: DEFAULT_HOMEPAGE_CONTENT.promoOfferDescription,
    button: DEFAULT_HOMEPAGE_CONTENT.promoOfferButton
  }
};

export function normalizeBannerContent(value = {}) {
  const c = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text = (v, d, max) => String(v ?? d).trim().slice(0, max);
  const block = (src, fallback) => ({
    kicker: text(src?.kicker, fallback.kicker, 60),
    title: text(src?.title, fallback.title, 100),
    highlight: text(src?.highlight, fallback.highlight, 80),
    description: text(src?.description, fallback.description, 180),
    button: text(src?.button, fallback.button, 60)
  });
  return {
    personal: block(c.personal, DEFAULT_BANNER_CONTENT.personal),
    offer: block(c.offer, DEFAULT_BANNER_CONTENT.offer)
  };
}

export function normalizeSiteContent(categories = [], heroes = []) {
    const cats = Array.isArray(categories) ? categories.map(cleanCategory).filter(x => x.id && x.name).slice(0, 30) : [];
    const hs = Array.isArray(heroes) ? heroes.map(cleanHero).filter(x => x.id && x.image_url).slice(0, 8) : [];
    return { categories: cats, heroes: hs };
}

function isMissingContentColumn(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    return msg.includes('categories_json') || msg.includes('hero_images_json') || msg.includes('homepage_content_json') || msg.includes('banner_content_json') || msg.includes('column') && msg.includes('does not exist');
}

export const siteSettingsService = {
    async get() {
        const extended = await sb.from('site_settings').select(SITE_SETTINGS_COLUMNS).eq('id', 1).maybeSingle();
        if (!extended.error) return extended.data ? {
            ...extended.data,
            homepage_content_json: normalizeHomepageContent(extended.data.homepage_content_json),
            banner_content_json: normalizeBannerContent(extended.data.banner_content_json),
            __contentSchemaAvailable: true
        } : null;

        if (!isMissingContentColumn(extended.error)) throw extended.error;

        const homepage = await sb.from('site_settings').select(CONTENT_SITE_SETTINGS_COLUMNS).eq('id', 1).maybeSingle();
        if (!homepage.error) {
            const data = homepage.data;
            if (!data) return null;
            return {
                ...data,
                homepage_content_json: normalizeHomepageContent(data.homepage_content_json),
                banner_content_json: normalizeBannerContent(undefined),
                __contentSchemaAvailable: true
            };
        }

        const content = await sb.from('site_settings').select(CONTENT_SITE_SETTINGS_COLUMNS.replace(',homepage_content_json','')).eq('id', 1).maybeSingle();
        if (!content.error) return content.data ? {
            ...content.data,
            categories_json: content.data.categories_json || [],
            hero_images_json: content.data.hero_images_json || [],
            homepage_content_json: DEFAULT_HOMEPAGE_CONTENT,
            banner_content_json: normalizeBannerContent(undefined),
            __contentSchemaAvailable: true
        } : null;

        const legacy = await sb.from('site_settings').select(LEGACY_SITE_SETTINGS_COLUMNS).eq('id', 1).maybeSingle();
        if (legacy.error) throw legacy.error;
        return legacy.data ? {
            ...legacy.data,
            categories_json: [],
            hero_images_json: [],
            homepage_content_json: DEFAULT_HOMEPAGE_CONTENT,
            banner_content_json: normalizeBannerContent(undefined),
            __contentSchemaAvailable: false
        } : null;
    },

    async save(payload = {}) {
        const clean = {
            id: 1,
            whatsapp_number: String(payload.whatsapp_number || '').trim().slice(0, 40),
            instagram_url: safeHttpUrl(payload.instagram_url || '', { maxLength: 2048 }) || null,
            tiktok_url: safeHttpUrl(payload.tiktok_url || '', { maxLength: 2048 }) || null,
            address: String(payload.address || '').trim().slice(0, 300),
            weekday_hours: String(payload.weekday_hours || '').trim().slice(0, 120),
            weekend_hours: String(payload.weekend_hours || '').trim().slice(0, 120),
            delivery_pickup: Number.isFinite(Number(payload.delivery_pickup)) ? Math.max(0, Math.min(100000, Number(payload.delivery_pickup))) : 0,
            delivery_ganja: Number.isFinite(Number(payload.delivery_ganja)) ? Math.max(0, Math.min(100000, Number(payload.delivery_ganja))) : 0,
            delivery_region: Number.isFinite(Number(payload.delivery_region)) ? Math.max(0, Math.min(100000, Number(payload.delivery_region))) : 0,
            gift_wrap: Number.isFinite(Number(payload.gift_wrap)) ? Math.max(0, Math.min(100000, Number(payload.gift_wrap))) : 0,
            categories_json: Array.isArray(payload.categories_json) ? normalizeSiteContent(payload.categories_json, []).categories : undefined,
            hero_images_json: Array.isArray(payload.hero_images_json) ? normalizeSiteContent([], payload.hero_images_json).heroes : undefined,
            homepage_content_json: payload.homepage_content_json ? normalizeHomepageContent(payload.homepage_content_json) : undefined,
            banner_content_json: payload.banner_content_json ? normalizeBannerContent(payload.banner_content_json) : undefined
        };
        const extendedPayload = { ...clean };
        if (!Array.isArray(extendedPayload.categories_json)) delete extendedPayload.categories_json;
        if (!Array.isArray(extendedPayload.hero_images_json)) delete extendedPayload.hero_images_json;
        if (!extendedPayload.homepage_content_json) delete extendedPayload.homepage_content_json;
        if (!extendedPayload.banner_content_json) delete extendedPayload.banner_content_json;
        const extended = await sb.from('site_settings').upsert(extendedPayload, { onConflict: 'id' }).select(SITE_SETTINGS_COLUMNS).single();
        if (!extended.error) return { ...extended.data, __contentSchemaAvailable: true };
        if (!isMissingContentColumn(extended.error)) throw extended.error;
        const legacyPayload = { ...clean };
        delete legacyPayload.categories_json;
        delete legacyPayload.hero_images_json;
        delete legacyPayload.homepage_content_json;
        delete legacyPayload.banner_content_json;
        const legacy = await sb.from('site_settings').upsert(legacyPayload, { onConflict: 'id' }).select(LEGACY_SITE_SETTINGS_COLUMNS).single();
        if (legacy.error) throw legacy.error;
        return { ...legacy.data, categories_json: [], hero_images_json: [], homepage_content_json: DEFAULT_HOMEPAGE_CONTENT, __contentSchemaAvailable: false };
    },

    async saveHomepageContent(content = {}) {
        const clean = normalizeHomepageContent(content);
        const { data, error } = await sb.from('site_settings')
          .upsert({ id:1, homepage_content_json:clean, updated_at:new Date().toISOString() }, { onConflict:'id' })
          .select('id,homepage_content_json').single();
        if(error){
          if(isMissingContentColumn(error)) throw new Error('HOMEPAGE_CONTENT_SCHEMA_MISSING');
          throw error;
        }
        return { ...data, homepage_content_json: normalizeHomepageContent(data.homepage_content_json) };
    },


    async saveBannerContent(content = {}) {
        const clean = normalizeBannerContent(content);
        const { data, error } = await sb.from('site_settings')
          .upsert({ id: 1, banner_content_json: clean, updated_at: new Date().toISOString() }, { onConflict: 'id' })
          .select('id,banner_content_json').single();
        if (error) {
          if (isMissingContentColumn(error)) throw new Error('BANNER_CONTENT_SCHEMA_MISSING');
          throw error;
        }
        return { ...data, banner_content_json: normalizeBannerContent(data.banner_content_json) };
    },

    async saveContent(categories = [], heroes = []) {
        const content = normalizeSiteContent(categories, heroes);
        const { data, error } = await sb.from('site_settings')
            .upsert({ id: 1, categories_json: content.categories, hero_images_json: content.heroes, updated_at: new Date().toISOString() }, { onConflict: 'id' })
            .select(SITE_SETTINGS_COLUMNS).single();
        if (error) {
            if (isMissingContentColumn(error)) throw new Error('SITE_CONTENT_SCHEMA_MISSING');
            throw error;
        }
        return { ...data, __contentSchemaAvailable: true };
    }
};
