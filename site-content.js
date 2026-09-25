import { escapeHTML, showToast } from './ui.js';
import { safeResourceUrl, safeUserError, isSafeSiteContentPath, isSafeProductImagePath } from './security.js';
import { storageService } from './services/storage-service.js';
import { siteSettingsService, normalizeSiteContent } from './services/site-settings-service.js';
import { realtimeService } from './services/realtime-service.js';
import { state as s, ctx } from './state.js';

const DEFAULT_CATEGORIES = [
  { id:'cat-laser', name:'Lazer & Taxta', subtitle:'Fərdi taxta və lazer işləri', image_url:'assets/reference/cat-1.jpg', image_path:'', action:'filter', active:true, sort_order:10 },
  { id:'cat-auto', name:'Avto & Aksessuar', subtitle:'Avtomobil üçün fərdi hədiyyələr', image_url:'assets/reference/cat-2.jpg', image_path:'', action:'filter', active:true, sort_order:20 },
  { id:'cat-print', name:'Çap & Poliqrafiya', subtitle:'Foto, banner, stiker və çap', image_url:'assets/reference/cat-3.jpg', image_path:'', action:'filter', active:true, sort_order:30 },
  { id:'cat-clock', name:'Saatlar & Hədiyyə', subtitle:'Saatlar və hədiyyəlik seçimlər', image_url:'assets/reference/cat-4.jpg', image_path:'', action:'filter', active:true, sort_order:40 },
  { id:'cat-custom', name:'Fərdi dizayn', subtitle:'İstədiyin ideyanı birlikdə hazırlayaq', image_url:'assets/reference/cat-5.jpg', image_path:'', action:'search', active:true, sort_order:50 },
  { id:'cat-all', name:'Bütün məhsullar', subtitle:'Kataloqu tam gör', image_url:'assets/reference/cat-6.jpg', image_path:'', action:'all', active:true, sort_order:60 }
];

const DEFAULT_HEROES = [
  { id:'hero-default', image_url:'assets/reference/hero-scene.jpg', image_path:'', alt:'F1 Studio hədiyyə qutusu və şam kompozisiyası', active:true, sort_order:10 }
];

let heroTimer = null;

export function initSiteContent(){
  Object.assign(ctx, {
    getDefaultCategories: () => DEFAULT_CATEGORIES.map(x=>({...x})),
    getDefaultHeroes: () => DEFAULT_HEROES.map(x=>({...x})),
    applySiteContent,
    renderSiteCategories,
    renderAdminSiteContent,
    renderAdminCategories,
    renderAdminHeroes,
    newAdminCategory,
    editAdminCategory,
    cancelAdminCategory,
    handleAdminCategoryImage,
    saveAdminCategory,
    deleteAdminCategory,
    handleAdminHeroImages,
    addHeroUrl,
    setPrimaryHero,
    deleteAdminHero,
    toggleAdminHeroActive,
    saveAdminSiteContent,
    resetAdminSiteContentUI,
    startSiteContentRealtime,
    stopSiteContentRealtime
  });
  applySiteContent(DEFAULT_CATEGORIES, DEFAULT_HEROES);
  startSiteContentRealtime();
}

function normalizedContent(categories, heroes){
  const hasCats=Array.isArray(categories);
  const hasHeroes=Array.isArray(heroes);
  const rawCats=hasCats ? categories : DEFAULT_CATEGORIES;
  const rawHeroes=hasHeroes ? heroes : DEFAULT_HEROES;
  const content=normalizeSiteContent(rawCats, rawHeroes);
  return {
    categories: content.categories.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)),
    heroes: content.heroes.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
  };
}

export function applySiteContent(categories, heroes, {persistLocalFallback=false} = {}){
  const content = normalizedContent(categories, heroes);
  s.siteCategories = content.categories;
  s.heroSlides = content.heroes;
  if(persistLocalFallback){
    try{ localStorage.setItem('f1SiteContentFallback', JSON.stringify(content)); }catch(_){ }
  }
  renderSiteCategories();
  applyHeroSlides();
  renderAdminSiteContent();
}

function startSiteContentRealtime(){
  if(s.siteContentRealtimeChannel) return;
  const applyRecord = (record) => {
    if(!record || record.id !== 1) return;
    const hasContent = Array.isArray(record.categories_json) && Array.isArray(record.hero_images_json);
    if(!hasContent) return;
    applySiteContent(record.categories_json, record.hero_images_json);
    ctx.applyHomepageContent?.(record.homepage_content_json);
    ctx.applySiteSettingsToPage?.(record);
  };
  try{
    s.siteContentRealtimeChannel = realtimeService.createSiteSettingsChannel({
      onInsert: payload => applyRecord(payload?.new),
      onUpdate: payload => applyRecord(payload?.new)
    });
    s.siteContentRealtimeChannel.subscribe(status => {
      if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
        // Realtime is an enhancement; regular server reads remain authoritative.
        ctx.siteContentRealtimeUnavailable = true;
      } else if(status === 'SUBSCRIBED'){
        ctx.siteContentRealtimeUnavailable = false;
      }
    });
  }catch(_){
    s.siteContentRealtimeChannel = null;
    ctx.siteContentRealtimeUnavailable = true;
  }
}

function stopSiteContentRealtime(){
  if(!s.siteContentRealtimeChannel) return;
  realtimeService.removeChannel(s.siteContentRealtimeChannel).catch(()=>{});
  s.siteContentRealtimeChannel = null;
}

function getStoredFallback(){
  try{
    const data=JSON.parse(localStorage.getItem('f1SiteContentFallback')||'null');
    if(data && Array.isArray(data.categories) && Array.isArray(data.heroes)) return normalizedContent(data.categories,data.heroes);
  }catch(_){ }
  return null;
}

export function resolveLoadedSiteContent(data){
  const hasSchema = data?.__contentSchemaAvailable !== false;
  const fromServer = normalizedContent(data?.categories_json, data?.hero_images_json);
  const fallback = getStoredFallback();
  if(!hasSchema && fallback) return { ...fallback, fromServer:false };
  return { ...fromServer, fromServer:hasSchema };
}

function renderSiteCategories(){
  const grid=document.getElementById('categoryGrid');
  if(!grid)return;
  const active=(s.siteCategories||[]).filter(c=>c.active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  grid.innerHTML=active.length ? active.map((c,idx)=>{
    const image=safeResourceUrl(c.image_url||'',{allowData:false,allowBlob:false,allowRelative:true});
    const count = c.action==='all' ? s.products.length : c.action==='search' ? s.products.filter(p=>p.customizable!==false).length : s.products.filter(p=>p.cat===c.name).length;
    const actionArgs=c.action==='all'?[]:c.action==='search'?[]:[c.name];
    const action=c.action==='all'?'filterCat':c.action==='search'?'focusProductSearch':'filterCat';
    const imgHtml=image?`<img src="${escapeHTML(image)}" alt="" loading="lazy" decoding="async">`:`<span class="category-fallback-emoji" aria-hidden="true">✦</span>`;
    return `<button class="cat category-card" type="button" data-action="${action}"${actionArgs.length?` data-action-args='${escapeHTML(JSON.stringify(actionArgs))}'`:''}>
      <span class="category-photo category-photo-${idx%6}">${imgHtml}</span>
      <b>${escapeHTML(c.name)}</b><small>${count} məhsul</small>${c.subtitle?`<em class="category-subtitle">${escapeHTML(c.subtitle)}</em>`:''}
    </button>`;
  }).join('') : `<div class="catalog-empty-state"><div class="empty-icon">◌</div><div><b>Kateqoriya yoxdur</b><span>Admin panelindən yeni kateqoriya əlavə edə bilərsiniz.</span></div></div>`;
}

function updateAdminCategorySelect(){
  const select=document.getElementById('adminProductCat');
  if(!select)return;
  const current=select.value;
  const cats=(s.siteCategories||[]).filter(c=>c.action==='filter');
  select.innerHTML=cats.length ? cats.map(c=>`<option value="${escapeHTML(c.name)}">${escapeHTML(c.name)}${c.active===false?' (gizli)':''}</option>`).join('') : '<option value="">Kateqoriya yoxdur</option>';
  if(cats.some(c=>c.name===current)) select.value=current; else if(cats[0]) select.value=cats[0].name;
}

function renderAdminSiteContent(){
  renderAdminCategories();
  renderAdminHeroes();
  updateAdminCategorySelect();
}

function renderAdminCategories(){
  const list=document.getElementById('adminCategoriesList');
  if(!list)return;
  const cats=(s.siteCategories||[]).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  if(!cats.length){list.innerHTML='<div class="admin-empty-card">Kateqoriya yoxdur.</div>';return;}
  list.innerHTML=cats.map(c=>{
    const safeImg=safeResourceUrl(c.image_url||'',{allowData:false,allowBlob:false,allowRelative:true});
    const count=c.action==='filter'?s.products.filter(p=>p.cat===c.name).length:0;
    return `<div class="admin-content-item">
      <div class="admin-content-thumb">${safeImg?`<img src="${escapeHTML(safeImg)}" alt="">`:'✦'}</div>
      <div class="admin-content-item-main"><b>${escapeHTML(c.name)}</b><small>${escapeHTML(c.subtitle||'')} · ${c.action==='filter'?`${count} məhsul`:(c.action==='search'?'Fərdi dizayn':'Bütün məhsullar')} · ${c.active!==false?'Aktiv':'Gizli'}</small></div>
      <div class="admin-actions"><button type="button" data-action="editAdminCategory" data-action-args='[&quot;${escapeHTML(c.id)}&quot;]'>✏️ Dəyiş</button><button type="button" class="danger" data-action="deleteAdminCategory" data-action-args='[&quot;${escapeHTML(c.id)}&quot;]'>🗑 Sil</button></div>
    </div>`;
  }).join('');
}

function renderAdminHeroes(){
  const list=document.getElementById('adminHeroesList');
  if(!list)return;
  const heroes=(s.heroSlides||[]).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  if(!heroes.length){list.innerHTML='<div class="admin-empty-card">Hero şəkli yoxdur.</div>';return;}
  list.innerHTML=heroes.map((h,idx)=>{
    const img=safeResourceUrl(h.image_url||'',{allowData:false,allowBlob:false,allowRelative:true});
    return `<div class="admin-hero-item"><div class="admin-hero-thumb">${img?`<img src="${escapeHTML(img)}" alt="">`:'◌'}</div><div class="admin-content-item-main"><b>${idx===0?'⭐ Əsas hero':`Hero ${idx+1}`}</b><small>${escapeHTML(h.alt||'Hero şəkli')} · ${h.active!==false?'Aktiv':'Gizli'}</small></div><div class="admin-actions">${idx!==0?`<button type="button" data-action="setPrimaryHero" data-action-args='[&quot;${escapeHTML(h.id)}&quot;]'>Əsas et</button>`:''}<button type="button" data-action="toggleAdminHeroActive" data-action-args='[&quot;${escapeHTML(h.id)}&quot;]'>${h.active!==false?'Gizlət':'Göstər'}</button><button type="button" class="danger" data-action="deleteAdminHero" data-action-args='[&quot;${escapeHTML(h.id)}&quot;]'>🗑 Sil</button></div></div>`;
  }).join('');
}

function categoryFormElement(id){ return document.getElementById(id); }

function newAdminCategory(){
  s.editingAdminCategoryId=null;
  const form=categoryFormElement('adminCategoryForm'); if(form)form.style.display='grid';
  const title=categoryFormElement('adminCategoryFormTitle'); if(title)title.textContent='Yeni kateqoriya';
  ['adminCategoryId','adminCategoryName','adminCategorySubtitle','adminCategoryImageUrl'].forEach(id=>{const el=categoryFormElement(id);if(el)el.value='';});
  const action=categoryFormElement('adminCategoryAction'); if(action)action.value='filter';
  const active=categoryFormElement('adminCategoryActive'); if(active)active.checked=true;
  const file=categoryFormElement('adminCategoryImageFile'); if(file)file.value='';
  const status=categoryFormElement('adminCategoryImageStatus'); if(status)status.textContent='Şəkil seçilməyib.';
  categoryFormElement('adminCategoryName')?.focus();
}

function editAdminCategory(id){
  const c=(s.siteCategories||[]).find(x=>x.id===id); if(!c)return;
  s.editingAdminCategoryId=id;
  const form=categoryFormElement('adminCategoryForm'); if(form)form.style.display='grid';
  const title=categoryFormElement('adminCategoryFormTitle'); if(title)title.textContent='Kateqoriyanı dəyiş';
  [['adminCategoryId',c.id],['adminCategoryName',c.name],['adminCategorySubtitle',c.subtitle||''],['adminCategoryImageUrl',c.image_url||'']].forEach(([id,v])=>{const el=categoryFormElement(id);if(el)el.value=v;});
  const action=categoryFormElement('adminCategoryAction'); if(action)action.value=c.action||'filter';
  const active=categoryFormElement('adminCategoryActive'); if(active)active.checked=c.active!==false;
  const file=categoryFormElement('adminCategoryImageFile'); if(file)file.value='';
  const status=categoryFormElement('adminCategoryImageStatus'); if(status)status.textContent=c.image_url?'Mövcud şəkil istifadə olunur. Yeni şəkil seçsəniz əvəz ediləcək.':'Şəkil seçilməyib.';
  categoryFormElement('adminCategoryName')?.focus();
}

function cancelAdminCategory(){
  s.editingAdminCategoryId=null;
  const form=categoryFormElement('adminCategoryForm'); if(form)form.style.display='none';
}

function handleAdminCategoryImage(input){
  const file=input?.files?.[0];
  const status=categoryFormElement('adminCategoryImageStatus');
  if(!file){if(status)status.textContent='Şəkil seçilməyib.';return;}
  if(!file.type.startsWith('image/')){input.value='';return showToast('Yalnız şəkil faylı seçin.');}
  if(file.size>5*1024*1024){input.value='';return showToast('Kateqoriya şəkli maksimum 5 MB ola bilər.');}
  if(status)status.textContent=`${file.name} seçildi · yadda saxlayanda Storage-a yüklənəcək.`;
}

function removeContentImage(path){
  const raw=String(path||'').trim();
  if(!raw) return;
  if(isSafeSiteContentPath(raw)) ctx.removeStorageObjects('site-content',[raw]).catch(()=>{});
  else if(isSafeProductImagePath(raw)) ctx.removeStorageObjects('product-images',[raw]).catch(()=>{});
}

async function saveAdminCategory(e){
  e?.preventDefault?.();
  if(!ctx.isAdminUser())return showToast('Admin girişiniz olmalıdır.');
  const name=categoryFormElement('adminCategoryName')?.value.trim()||'';
  const subtitle=categoryFormElement('adminCategorySubtitle')?.value.trim()||'';
  const action=categoryFormElement('adminCategoryAction')?.value||'filter';
  const active=categoryFormElement('adminCategoryActive')?.checked!==false;
  if(name.length<2||name.length>80)return showToast('Kateqoriya adı 2-80 simvol olmalıdır.');
  if(subtitle.length>100)return showToast('Alt başlıq 100 simvoldan çox ola bilməz.');
  const duplicate=(s.siteCategories||[]).some(c=>c.name.toLowerCase()===name.toLowerCase() && c.id!==s.editingAdminCategoryId && c.action==='filter' && action==='filter');
  if(duplicate)return showToast('Bu adda kateqoriya artıq mövcuddur.');
  const existing=(s.siteCategories||[]).find(c=>c.id===s.editingAdminCategoryId);
  let imageUrl=categoryFormElement('adminCategoryImageUrl')?.value.trim()||'';
  if(imageUrl){imageUrl=safeResourceUrl(imageUrl,{allowData:false,allowBlob:false,allowRelative:true});if(!imageUrl)return showToast('Şəkil URL-i düzgün deyil.');}
  let newUpload=null;
  try{
    const file=categoryFormElement('adminCategoryImageFile')?.files?.[0];
    if(file){ newUpload=await storageService.uploadSiteContentImage('category',file); imageUrl=newUpload.url; }
    if(!imageUrl && existing) imageUrl=existing.image_url||'';
    const id=existing?.id||`cat-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const next={...existing,id,name,subtitle,image_url:imageUrl,image_path:newUpload?.path||existing?.image_path||'',action,active,sort_order:existing?.sort_order??((s.siteCategories?.length||0)+1)*10};
    const cats=[...(s.siteCategories||[])];
    const idx=cats.findIndex(c=>c.id===id); if(idx>=0)cats[idx]=next;else cats.push(next);
    const heroes=s.heroSlides||[];
    const data=await siteSettingsService.saveContent(cats,heroes);
    applySiteContent(data.categories_json,data.hero_images_json);
    if(existing?.image_path && newUpload?.path && existing.image_path!==newUpload.path) removeContentImage(existing.image_path);
    cancelAdminCategory(); showToast(existing?'Kateqoriya yeniləndi.':'Kateqoriya əlavə olundu.');
  }catch(err){
    if(newUpload?.path)ctx.removeStorageObjects('site-content',[newUpload.path]).catch(()=>{});
    const friendly={SITE_CONTENT_SCHEMA_MISSING:'Supabase-də content-management.sql migration-u hələ tətbiq edilməyib.',STORAGE_UPLOAD_FAILED:'Şəkil Storage-a yüklənmədi.'};
    showToast(`Kateqoriya yadda saxlanmadı: ${friendly[err?.message]||safeUserError(err,'Sorğu yerinə yetirilmədi.')}`);
  }
}

async function deleteAdminCategory(id){
  const c=(s.siteCategories||[]).find(x=>x.id===id); if(!c)return;
  if(c.action==='filter'){
    const used=s.products.filter(p=>p.cat===c.name).length;
    if(used>0)return showToast(`“${c.name}” kateqoriyasında ${used} məhsul var. Əvvəl məhsulların kateqoriyasını dəyişin.`);
  }
  if(!confirm(`“${c.name}” kateqoriyası silinsin?`))return;
  try{
    const next=(s.siteCategories||[]).filter(x=>x.id!==id);
    const data=await siteSettingsService.saveContent(next,s.heroSlides||[]);
    applySiteContent(data.categories_json,data.hero_images_json);
    removeContentImage(c.image_path);
    showToast('Kateqoriya silindi.');
  }catch(err){showToast(`Kateqoriya silinmədi: ${err?.message==='SITE_CONTENT_SCHEMA_MISSING'?'Supabase migration tələb olunur.':safeUserError(err,'Sorğu yerinə yetirilmədi.')}`);}
}

function handleAdminHeroImages(input){
  const files=[...(input?.files||[])];
  if(files.length>5)return showToast('Bir dəfə maksimum 5 hero şəkli seçə bilərsiniz.');
  for(const file of files){if(!file.type.startsWith('image/')){input.value='';return showToast('Yalnız şəkil faylları seçin.');}if(file.size>5*1024*1024){input.value='';return showToast(`Hero şəkli maksimum 5 MB ola bilər: ${file.name}`);}}
  const status=document.getElementById('adminHeroImageStatus');if(status)status.textContent=files.length?`${files.length} şəkil seçildi · aşağıdakı Əlavə et düyməsi ilə yüklənəcək.`:'Şəkil seçilməyib.';
}

async function addHeroUrl(){
  if(!ctx.isAdminUser())return showToast('Admin girişiniz olmalıdır.');
  const input=document.getElementById('adminHeroImageUrl');const urlRaw=input?.value.trim()||'';
  if(!urlRaw)return showToast('Hero şəkli URL-i daxil edin.');
  const url=safeResourceUrl(urlRaw,{allowData:false,allowBlob:false,allowRelative:true});if(!url)return showToast('Hero şəkli URL-i düzgün deyil.');
  try{
    const next=[...(s.heroSlides||[]),{id:`hero-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`,image_url:url,image_path:'',alt:'F1 Studio hero şəkli',active:true,sort_order:((s.heroSlides?.length||0)+1)*10}];
    const data=await siteSettingsService.saveContent(s.siteCategories||[],next);applySiteContent(data.categories_json,data.hero_images_json);input.value='';showToast('Hero şəkli əlavə olundu.');
  }catch(err){showToast(`Hero əlavə olunmadı: ${err?.message==='SITE_CONTENT_SCHEMA_MISSING'?'Supabase migration tələb olunur.':safeUserError(err,'Sorğu yerinə yetirilmədi.')}`);}
}

async function saveUploadedHeroFiles(){
  const input=document.getElementById('adminHeroImageFile');
  const files=[...(input?.files||[])]; if(!files.length)return showToast('Əvvəl hero şəkillərini seçin.');
  const uploaded=[];
  try{
    for(const file of files){const u=await storageService.uploadSiteContentImage('hero',file);uploaded.push({id:`hero-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`,image_url:u.url,image_path:u.path,alt:'F1 Studio hero şəkli',active:true,sort_order:((s.heroSlides?.length||0)+uploaded.length+1)*10});}
    const data=await siteSettingsService.saveContent(s.siteCategories||[],[...(s.heroSlides||[]),...uploaded]);
    applySiteContent(data.categories_json,data.hero_images_json);input.value='';const status=document.getElementById('adminHeroImageStatus');if(status)status.textContent='Hero şəkilləri yükləndi.';showToast('Hero şəkilləri əlavə olundu.');
  }catch(err){for(const x of uploaded)ctx.removeStorageObjects('site-content',[x.image_path]).catch(()=>{});showToast(`Hero şəkli əlavə olunmadı: ${err?.message==='SITE_CONTENT_SCHEMA_MISSING'?'Supabase migration tələb olunur.':safeUserError(err,'Sorğu yerinə yetirilmədi.')}`);}
}

async function setPrimaryHero(id){
  if(!ctx.isAdminUser()) return showToast('Admin girişiniz olmalıdır.');
  const heroes=[...(s.heroSlides||[])];
  const idx=heroes.findIndex(x=>x.id===id);
  if(idx<0)return;
  const [selected]=heroes.splice(idx,1);
  selected.active=true;
  heroes.unshift(selected);
  heroes.forEach((h,i)=>h.sort_order=(i+1)*10);
  try{
    const data=await siteSettingsService.saveContent(s.siteCategories||[],heroes);
    applySiteContent(data.categories_json,data.hero_images_json);
    showToast('Əsas hero dəyişdirildi.');
  }catch(err){
    showToast(`Hero dəyişdirilmədi: ${err?.message==='SITE_CONTENT_SCHEMA_MISSING'?'Supabase migration tələb olunur.':safeUserError(err,'Sorğu yerinə yetirilmədi.')}`);
  }
}

async function toggleAdminHeroActive(id){
  if(!ctx.isAdminUser())return showToast('Admin girişiniz olmalıdır.');
  const heroes=[...(s.heroSlides||[])];
  const hero=heroes.find(x=>x.id===id);
  if(!hero)return;
  const nextActive=hero.active===false;
  if(!nextActive && heroes.filter(x=>x.active!==false).length<=1) return showToast('Ən azı bir aktiv hero saxlanmalıdır.');
  hero.active=nextActive;
  try{
    const data=await siteSettingsService.saveContent(s.siteCategories||[],heroes);
    applySiteContent(data.categories_json,data.hero_images_json);
    showToast(nextActive?'Hero aktiv edildi.':'Hero gizlədildi.');
  }catch(err){
    showToast(`Hero statusu dəyişdirilmədi: ${err?.message==='SITE_CONTENT_SCHEMA_MISSING'?'Supabase migration tələb olunur.':safeUserError(err,'Sorğu yerinə yetirilmədi.')}`);
  }
}

async function deleteAdminHero(id){
  const hero=(s.heroSlides||[]).find(x=>x.id===id);if(!hero)return;
  if((s.heroSlides||[]).length<=1)return showToast('Ən azı bir hero şəkli saxlanmalıdır.');
  if(!confirm('Bu hero şəkli silinsin?'))return;
  try{const data=await siteSettingsService.saveContent(s.siteCategories||[],(s.heroSlides||[]).filter(x=>x.id!==id));applySiteContent(data.categories_json,data.hero_images_json);removeContentImage(hero.image_path);showToast('Hero şəkli silindi.');}catch(err){showToast(`Hero silinmədi: ${err?.message==='SITE_CONTENT_SCHEMA_MISSING'?'Supabase migration tələb olunur.':safeUserError(err,'Sorğu yerinə yetirilmədi.')}`);}
}

async function saveAdminSiteContent(){
  try{
    const data=await siteSettingsService.saveContent(s.siteCategories||[],s.heroSlides||[]);applySiteContent(data.categories_json,data.hero_images_json,{persistLocalFallback:false});showToast('Kateqoriya və hero ayarları yadda saxlanıldı.');
  }catch(err){showToast(`Yadda saxlamaq mümkün olmadı: ${err?.message==='SITE_CONTENT_SCHEMA_MISSING'?'Supabase-də content-management.sql migration-u tətbiq edin.':safeUserError(err,'Sorğu yerinə yetirilmədi.')}`);}
}

function resetAdminSiteContentUI(){cancelAdminCategory();const u=document.getElementById('adminHeroImageUrl');if(u)u.value='';const f=document.getElementById('adminHeroImageFile');if(f)f.value='';}

function applyHeroSlides(){
  const img=document.querySelector('.hero-giftique .gift-scene img');
  const dots=document.getElementById('heroDots');
  const controls=document.getElementById('heroSlideControls');
  const heroes=(s.heroSlides||[]).filter(h=>h.active!==false && safeResourceUrl(h.image_url,{allowData:false,allowBlob:false,allowRelative:true}));
  if(!img || !heroes.length)return;
  if(s.heroSlideIndex>=heroes.length)s.heroSlideIndex=0;
  const current=heroes[s.heroSlideIndex];
  img.src=current.image_url;img.alt=current.alt||'F1 Studio hədiyyə kompozisiyası';
  if(dots)dots.innerHTML=heroes.map((h,i)=>`<button type="button" class="hero-dot ${i===s.heroSlideIndex?'active':''}" aria-label="Hero ${i+1}" data-action="setHeroSlide" data-action-args='[${i}]'></button>`).join('');
  if(controls)controls.style.display=heroes.length>1?'flex':'none';
  clearInterval(heroTimer);
  if(heroes.length>1)heroTimer=setInterval(()=>{s.heroSlideIndex=(s.heroSlideIndex+1)%heroes.length;applyHeroSlides();},6000);
}

export function setHeroSlide(index){
  const heroes=(s.heroSlides||[]).filter(h=>h.active!==false);if(!heroes.length)return;s.heroSlideIndex=Math.max(0,Math.min(heroes.length-1,Number(index)||0));applyHeroSlides();
}

export function heroNext(){const heroes=(s.heroSlides||[]).filter(h=>h.active!==false);if(!heroes.length)return;s.heroSlideIndex=(s.heroSlideIndex+1)%heroes.length;applyHeroSlides();}
export function heroPrev(){const heroes=(s.heroSlides||[]).filter(h=>h.active!==false);if(!heroes.length)return;s.heroSlideIndex=(s.heroSlideIndex-1+heroes.length)%heroes.length;applyHeroSlides();}

// Expose extra hero controls without creating a second init module.
Object.assign(ctx,{setHeroSlide,heroNext,heroPrev,saveUploadedHeroFiles});
