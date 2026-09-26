import { safeHttpUrl, safeResourceUrl } from './security.js';
import { persist, escapeHTML, money, normalizeText, showToast } from './ui.js';
import { state as s, ctx } from './state.js';
export function initCatalog() {
    const synonymMap = {
        "lipa":[1,2], "nömrə":[1,2], "nomre":[1,2], "alışqan":[3], "domino":[4], "taxta":[4,5,6,12],
        "lazer":[4,5,6,12], "masaüstü":[6], "saat":[7,8], "qol saatı":[8], "şəkil":[9], "3x4":[9],
        "foto":[9], "banner":[10], "vinil":[10], "stiker":[11], "brelok":[11], "maket":[12]
    };
    function getProduct(id){ return s.products.find(p => p.id === Number(id)); }
    function renderCatalogSkeleton() {
        const grid = document.getElementById("grid");
        if (!grid || s.products.length) return;
        grid.classList.add("catalog-skeleton-grid");
        grid.innerHTML = Array.from({length: 6}, () => `
            <article class="product product-skeleton" aria-hidden="true">
                <div class="pic skeleton-block"></div>
                <div class="info">
                    <div class="skeleton-line skeleton-title"></div>
                    <div class="skeleton-line skeleton-meta"></div>
                    <div class="skeleton-line skeleton-price"></div>
                    <div class="skeleton-button"></div>
                </div>
            </article>
        `).join("");
    }
    function clearCatalogSkeleton() {
        const grid = document.getElementById("grid");
        grid?.classList.remove("catalog-skeleton-grid");
    }
    async function loadServerProducts(force=false) {
        const status=document.getElementById("catalogStatus");
        if(status && !s.serverCatalogReady){
            status.className="notice catalog-status catalog-status-loading";
            status.style.display="block";
            status.setAttribute("aria-busy","true");
            status.innerHTML='<span class="status-spinner" aria-hidden="true"></span><span><b>Kataloq yenilənir…</b><small>Aktual məhsul və stok məlumatları gətirilir.</small></span>';
        } else if(status && force){
            status.className="notice catalog-status catalog-status-loading";
            status.style.display="block";
            status.setAttribute("aria-busy","true");
            status.innerHTML='<span class="status-spinner" aria-hidden="true"></span><span><b>Kataloq yenilənir…</b><small>Aktual məhsul və stok məlumatları yoxlanılır.</small></span>';
        }
        if (!s.products.length) renderCatalogSkeleton();
        try {
            const data = await ctx.api("/api/products");
            if(Array.isArray(data.products) && data.products.length){
                s.products=data.products;
                s.serverCatalogReady=true;
                if(status){status.style.display="none";status.setAttribute("aria-busy","false");status.innerHTML="";status.className="notice catalog-status";}
                ctx.updateProductStructuredData(s.products);
                ctx.render();
            }else{
                s.serverCatalogReady=false;
                if(status){
                    status.className="notice catalog-status catalog-status-error";
                    status.style.display="block";
                    status.setAttribute("aria-busy","false");
                    status.innerHTML='<span class="status-icon" aria-hidden="true">!</span><span><b>Kataloq hazırda əlçatan deyil.</b><small>Bu ekrandakı ilkin məhsullar yalnız önbaxış üçündür; sifariş üçün aktual kataloqu yükləyin.</small></span><button type="button" class="status-retry" data-action="loadServerProducts">↻ Yenidən yoxla</button>';
                }
                if (!s.products.length) ctx.render();
            }
        } catch (e) {
            s.serverCatalogReady=false;
            if(status){
                status.className="notice catalog-status catalog-status-error";
                status.style.display="block";
                status.setAttribute("aria-busy","false");
                status.innerHTML='<span class="status-icon" aria-hidden="true">!</span><span><b>Kataloq serverdən yüklənmədi.</b><small>Bağlantını yoxlayıb yenidən cəhd edə bilərsiniz.</small></span><button type="button" class="status-retry" data-action="loadServerProducts">↻ Yenidən yoxla</button>';
            }
            if(!s.products.length) ctx.render();
            if(!s.catalogLoadErrorShown){s.catalogLoadErrorShown=true;console.error("F1 catalog load error",e);}
        }
    }
    async function loadServerReviews() {
        try { const data=await ctx.api("/api/reviews"); if(Array.isArray(data.reviews)){ s.localReviews=data.reviews; ctx.renderReviews(); } } catch (_) {}
    }
    function openProductModal(id, e) {
        if(!ctx.ensureCatalogReady()) return;
        if (e && e.target.closest("button")) return;
        const p = ctx.getProduct(id); if (!p) return;
        document.getElementById("modalProdTitle").textContent = p.name;
        document.getElementById("modalProdDesc").textContent = p.desc;
        document.getElementById("modalProdPrice").textContent = money(p.price);
        const media = document.getElementById("modalProdMedia");
        ctx.renderProductMedia(media, p, true);
        const detail = document.getElementById("modalProdDesc");
        const existing = detail.parentElement.querySelectorAll(".product-meta");
        existing.forEach(el => el.remove());
        const meta = document.createElement("div");
        meta.className = "product-meta";
        ["material","size","productionTime","stock"].forEach((key, idx) => {
            const labels = ["Material", "Ölçü", "Hazırlanma", "Status"];
            const chip = document.createElement("span"); chip.className = "meta-chip"; chip.textContent = `${labels[idx]}: ${key==="stock" && p.stockQuantity!=null ? (Number(p.stockQuantity)>0 ? `${p.stockQuantity} ədəd` : "Stokda yoxdur") : p[key]}`; meta.appendChild(chip);
        });
        detail.insertAdjacentElement("afterend", meta);
        const btn = document.getElementById("modalAddToCartBtn");
        const outOfStock=p.stockQuantity!=null && Number(p.stockQuantity)<=0;
        btn.disabled=outOfStock;
        btn.style.opacity=outOfStock?".55":"1";
        btn.style.cursor=outOfStock?"not-allowed":"pointer";
        if(p.customizable){
            btn.textContent = outOfStock ? "Stokda yoxdur" : "✨ Fərdiləşdir və səbətə əlavə et";
            btn.onclick = () => { if(!outOfStock){ ctx.closeProductModal(); ctx.openCustomization(p.id); } };
        } else {
            btn.textContent = outOfStock ? "Stokda yoxdur" : "🛒 Səbətə əlavə et";
            btn.onclick = () => { if(!outOfStock){ ctx.add(p.id); ctx.closeProductModal(); } };
        }
        ctx.openDialog("productModal", ".close");
    }
    function closeProductModal() { ctx.closeDialog("productModal"); }
    function renderProductMedia(box, p, large=false) {
        box.innerHTML="";
        const gallery=(Array.isArray(p.images)&&p.images.length?p.images:[p.image]).map(url=>safeResourceUrl(url,{allowData:false,allowBlob:false,allowRelative:true})).filter(Boolean).slice(0,6);
        if(!gallery.length){
            box.innerHTML=`<div class="product-media-fallback" style="width:100%;height:100%;"><div class="emoji">${escapeHTML(p.emoji)}</div><span>Foto faylı əlavə edilməyib</span></div>`;
            return;
        }
        if(!large){
            const img=document.createElement("img");
            box.classList.add("media-loading");
            img.alt=p.name; img.loading="lazy"; img.decoding="async";
            img.style.cssText="width:100%;height:100%;object-fit:cover";
            img.onload=()=>box.classList.remove("media-loading");
            img.onerror=()=>{box.classList.remove("media-loading");box.innerHTML=`<div class="product-media-fallback"><div class="emoji">${escapeHTML(p.emoji)}</div><span>Foto faylı açılmadı</span></div>`;};
            img.src=gallery[0];
            box.appendChild(img);
            return;
        }
        if(gallery.length===1){
            const main=document.createElement("div"); main.className="product-gallery-main media-loading";
            const img=document.createElement("img"); img.alt=p.name; img.loading=large?"eager":"lazy"; img.decoding="async"; if(large) img.fetchPriority="high";
            img.onload=()=>main.classList.remove("media-loading");
            img.onerror=()=>{main.classList.remove("media-loading");main.innerHTML=`<div class="product-media-fallback"><div class="emoji">${escapeHTML(p.emoji)}</div><span>Foto faylı açılmadı</span></div>`;};
            img.src=gallery[0];
            main.appendChild(img); box.appendChild(main); return;
        }
        const main=document.createElement("div"); main.className="product-gallery-main media-loading";
        const img=document.createElement("img"); img.alt=p.name; img.loading=large?"eager":"lazy"; img.decoding="async"; if(large) img.fetchPriority="high";
        img.onload=()=>main.classList.remove("media-loading");
        img.onerror=()=>{main.classList.remove("media-loading");main.innerHTML=`<div class="product-media-fallback"><div class="emoji">${escapeHTML(p.emoji)}</div><span>Foto faylı açılmadı</span></div>`;};
        img.src=gallery[0]; main.appendChild(img);
        const nav=document.createElement("div"); nav.className="product-gallery-nav";
        const prev=document.createElement("button"); prev.type="button"; prev.textContent="‹"; prev.setAttribute("aria-label","Əvvəlki şəkil");
        const next=document.createElement("button"); next.type="button"; next.textContent="›"; next.setAttribute("aria-label","Növbəti şəkil"); nav.append(prev,next); main.appendChild(nav); box.appendChild(main);
        const thumbs=document.createElement("div"); thumbs.className="product-gallery-thumbs"; box.appendChild(thumbs);
        let current=0;
        const show=idx=>{
            current=(idx+gallery.length)%gallery.length;
            main.classList.add("media-loading");
            img.onload=()=>main.classList.remove("media-loading");
            img.src=gallery[current];
            img.alt=`${p.name} — şəkil ${current+1}`;
            [...thumbs.children].forEach((el,i)=>el.classList.toggle("active",i===current));
        };
        prev.onclick=()=>show(current-1); next.onclick=()=>show(current+1);
        gallery.forEach((url,i)=>{
            const b=document.createElement("button");
            b.type="button"; b.className=`product-gallery-thumb${i===0?" active":""}`; b.title=`Şəkil ${i+1}`;
            const t=document.createElement("img"); t.alt=`${p.name} şəkil ${i+1}`; t.loading="lazy"; t.decoding="async";
            b.classList.add("thumb-loading");
            t.onload=()=>b.classList.remove("thumb-loading");
            t.onerror=()=>b.classList.remove("thumb-loading");
            t.src=url; b.appendChild(t); b.onclick=()=>show(i); thumbs.appendChild(b);
        });
    }
    function toggleFav(id, event) {
        event?.stopPropagation();
        const n = Number(id);
        s.favs = s.favs.includes(n) ? s.favs.filter(x => x !== n) : [...s.favs, n];
        persist("f1Favs", s.favs); ctx.render();
    }
    function updateFavCount() { document.getElementById("favCount").textContent = s.favs.length; }
    function showFavorites() {
        s.viewingFavs = true; s.smartFilterActive = false; s.activeCat = ""; s.activeTag = "";
        document.getElementById("search").value = "";
        ctx.render(); document.getElementById("products").scrollIntoView({ behavior:"smooth", block:"start" });
    }
    function applySmartFilter() {
        s.smartFilterActive = true; s.viewingFavs = false; s.activeCat = ""; s.activeTag = "";
        ctx.render(); document.getElementById("products").scrollIntoView({ behavior:"smooth", block:"start" });
    }
    function clearFilters() {
        s.smartFilterActive = false; s.viewingFavs = false; s.activeCat = ""; s.activeTag = "";
        ["smartPrice","smartPerson","smartType","search"].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = "";
        });
        ctx.render();
    }
    function filterByTag(tag) { s.activeTag = tag; s.activeCat = ""; s.viewingFavs = false; s.smartFilterActive = false; document.getElementById("search").value=""; ctx.render(); document.getElementById("products").scrollIntoView({behavior:"smooth", block:"start"}); }
    function filterCat(cat) { s.activeCat = cat; s.activeTag = ""; s.viewingFavs=false; s.smartFilterActive=false; document.getElementById("search").value=""; ctx.render(); document.getElementById("products").scrollIntoView({behavior:"smooth", block:"start"}); }
    function matchesSearch(p,q) {
        if (!q) return true;
        const hay = normalizeText([p.name,p.desc,p.cat,p.material,...Object.keys(synonymMap).filter(k => synonymMap[k].includes(p.id))].join(" "));
        return hay.includes(normalizeText(q));
    }
    function updateCategoryCounts() {
        const buttons = document.querySelectorAll('.categories .cat[data-action="filterCat"]');
        buttons.forEach(btn => {
            const args = btn.getAttribute('data-action-args') || '';
            let cat = '';
            try { cat = JSON.parse(args.replace(/&quot;/g, '"'))[0] || ''; } catch (_) {}
            const count = cat ? s.products.filter(p => p.cat === cat).length : s.products.length;
            let badge = btn.querySelector('.category-count');
            if (!badge) { badge = document.createElement('span'); badge.className = 'category-count'; btn.appendChild(badge); }
            badge.textContent = `${count} məhsul`;
            btn.setAttribute('aria-label', `${cat || 'Bütün məhsullar'} — ${count} məhsul`);
        });
    }
    function render() {
        const q = document.getElementById("search").value;
        const sort = document.getElementById("sort").value;
        let list = [...s.products];
        const titleEl = document.getElementById("sectionTitle");
        if (s.viewingFavs) {
            list = list.filter(p => s.favs.includes(p.id));
            titleEl.innerHTML = `❤️ Sevimlilərim <button data-action="clearFilters" style="margin-left:12px;font-size:13px;padding:6px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);cursor:pointer;color:var(--ink);">Bütün məhsullar</button>`;
        } else if (s.smartFilterActive) {
            const price = document.getElementById("smartPrice").value;
            const person = document.getElementById("smartPerson").value;
            const type = document.getElementById("smartType").value;
            if (price === "0-20") list = list.filter(p => p.price <= 20);
            if (price === "20-50") list = list.filter(p => p.price > 20 && p.price <= 50);
            if (price === "50+") list = list.filter(p => p.price > 50);
            if (person) list = list.filter(p => p.tags?.includes(person));
            if (type) list = list.filter(p => p.cat === type);
            list = list.filter(p => ctx.matchesSearch(p,q));
            titleEl.innerHTML = `🔎 Axtarış Nəticələri <button data-action="clearFilters" style="margin-left:12px;font-size:13px;padding:6px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);cursor:pointer;color:var(--ink);">Filtri təmizlə</button>`;
        } else if (s.activeTag) {
            list = list.filter(p => p.tags?.includes(s.activeTag) && ctx.matchesSearch(p,q));
            titleEl.innerHTML = `🎁 Seçilmiş Hədiyyələr <button data-action="clearFilters" style="margin-left:12px;font-size:13px;padding:6px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);cursor:pointer;color:var(--ink);">Bütün məhsullar</button>`;
        } else {
            list = list.filter(p => (!s.activeCat || p.cat === s.activeCat) && ctx.matchesSearch(p,q));
            titleEl.textContent = "Məhsul və Xidmətlərimiz";
        }
        if (sort === "low") list.sort((a,b) => a.price-b.price);
        if (sort === "high") list.sort((a,b) => b.price-a.price);
        updateCategoryCounts();
        ctx.drawGrid(list); ctx.updateFavCount(); ctx.renderReviews();
    }
    function drawGrid(list) {
        const grid = document.getElementById("grid");
        clearCatalogSkeleton();
        if (!list.length) {
            const hasFilters = s.viewingFavs || s.smartFilterActive || s.activeTag || s.activeCat || document.getElementById("search").value.trim();
            grid.innerHTML = `<div class="catalog-empty-state"><div class="empty-icon" aria-hidden="true">${hasFilters ? "⌕" : "◌"}</div><div><b>${hasFilters ? "Uyğun məhsul tapılmadı" : "Hazırda məhsul görünmür"}</b><span>${hasFilters ? "Axtarış və filtr meyarlarını dəyişib yenidən yoxlaya bilərsən." : "Kataloq yenilənəndən sonra məhsullar burada görünəcək."}</span></div>${hasFilters ? '<button type="button" class="empty-action" data-action="clearFilters">Filtrləri təmizlə</button>' : '<button type="button" class="empty-action" data-action="loadServerProducts">↻ Kataloqu yenilə</button>'}</div>`;
            return;
        }
        clearCatalogSkeleton();
        grid.innerHTML = "";
        list.forEach(p => {
            const article = document.createElement("article"); article.className="product"; article.id=`product-${p.id}`; article.setAttribute("tabindex","0"); article.setAttribute("role","button"); article.setAttribute("aria-label",`${p.name} detallarını aç`); article.onclick = e => ctx.openProductModal(p.id,e); article.onkeydown=e=>{if((e.key==="Enter"||e.key===" ") && !e.target.closest("button")){e.preventDefault();ctx.openProductModal(p.id,e);}};
            if (p.badge) { const b=document.createElement("span"); b.className="badge"; b.textContent=p.badge; article.appendChild(b); }
            const fav=document.createElement("button"); fav.className="fav-btn"; fav.type="button"; fav.textContent=s.favs.includes(p.id)?"❤️":"🤍"; fav.setAttribute("aria-label", s.favs.includes(p.id)?"Sevimlilərdən sil":"Sevimlilərə əlavə et"); fav.onclick=e=>ctx.toggleFav(p.id,e); article.appendChild(fav);
            const pic=document.createElement("div"); pic.className="pic"; ctx.renderProductMedia(pic,p);
            const picOverlay=document.createElement("div"); picOverlay.className="pic-overlay";
            const quick=document.createElement("span"); quick.className="quick-view"; quick.textContent="Baxışa keç →"; picOverlay.appendChild(quick); pic.appendChild(picOverlay);
            article.appendChild(pic);
            const info=document.createElement("div"); info.className="info";
            const h3=document.createElement("h3"); h3.textContent=p.name; info.appendChild(h3);
            const categoryRow=document.createElement("div"); categoryRow.className="product-category-row";
            const small=document.createElement("small"); small.className="product-category"; small.textContent=p.cat; categoryRow.appendChild(small);
            if (p.customizable) { const customPill=document.createElement("span"); customPill.className="custom-pill"; customPill.textContent="✨ Fərdi"; categoryRow.appendChild(customPill); }
            info.appendChild(categoryRow);
            const meta=document.createElement("div"); meta.className="product-meta";
            const c1=document.createElement("span"); c1.className="meta-chip"; c1.textContent=p.customizable?"Fərdi dizayn":"Standart"; meta.appendChild(c1);
            const c2=document.createElement("span"); c2.className="meta-chip"; c2.textContent=p.productionTime; meta.appendChild(c2);
            if(p.stockQuantity!=null){
                const qty=Number(p.stockQuantity);
                const c3=document.createElement("span"); c3.className="meta-chip";
                c3.textContent=qty>0?(qty<=5?`Az qalıb: ${qty}`:`Stok: ${qty}`):"Stokda yoxdur";
                c3.classList.toggle("stock-low",qty>0 && qty<=5);
                c3.classList.toggle("stock-out",qty<=0);
                meta.appendChild(c3);
            }
            info.appendChild(meta);
            const price=document.createElement("div"); price.className="price"; price.textContent=money(p.price); info.appendChild(price);
            const outOfStock=p.stockQuantity!=null && Number(p.stockQuantity)<=0;
            const addBtn=document.createElement("button"); addBtn.className="add"; addBtn.type="button"; addBtn.disabled=outOfStock; addBtn.style.opacity=outOfStock?".55":"1"; addBtn.style.cursor=outOfStock?"not-allowed":"pointer"; addBtn.textContent=outOfStock?"Stokda yoxdur":(p.customizable?"✨ Fərdiləşdir":"🛒 Səbətə at"); addBtn.setAttribute("aria-label", outOfStock?`${p.name}: stokda yoxdur`:(p.customizable?`${p.name} üçün fərdi dizayn aç`:`${p.name} səbətə əlavə et`)); addBtn.onclick=e=>{e.stopPropagation();if(outOfStock)return;p.customizable?ctx.openCustomization(p.id):ctx.add(p.id)}; info.appendChild(addBtn);
            article.appendChild(info); grid.appendChild(article);
        });
    }
    function add(id) {
        if(!ctx.ensureCatalogReady()) return;
        const p=ctx.getProduct(id); if(!p) return;
        const current=s.cart.filter(i=>i.id===p.id).reduce((sum,i)=>sum+(Number(i.qty)||0),0);
        if(p.stockQuantity!=null && current >= Number(p.stockQuantity)) return showToast("Bu məhsul üçün stok limiti dolub.");
        if(p.stockQuantity!=null && Number(p.stockQuantity)<=0) return showToast("Bu məhsul hazırda stokda yoxdur.");
        if(p.customizable){ ctx.openCustomization(p.id); return; }
        const item=s.cart.find(i=>i.id===p.id && !i.customization);
        item ? item.qty++ : s.cart.push({id:p.id,qty:1,lineId:ctx.makeClientId(`line-${p.id}`),customization:null});
        ctx.saveCart(); ctx.openCart();
        showToast(`${p.name} səbətə əlavə olundu.`);
    }
    function saveCart(){ persist("f1Cart",s.cart); ctx.updateCount(); }
    function updateCount(){ document.getElementById("count").textContent=s.cart.reduce((sum,i)=>sum+Math.max(0,Number(i.qty)||0),0); }
    Object.assign(ctx, {
    getProduct,
    loadServerProducts,
    loadServerReviews,
    openProductModal,
    closeProductModal,
    renderProductMedia,
    toggleFav,
    updateFavCount,
    showFavorites,
    applySmartFilter,
    clearFilters,
    filterByTag,
    filterCat,
    matchesSearch,
    render,
    updateCategoryCounts,
    drawGrid,
    add,
    saveCart,
    updateCount
    });
}
