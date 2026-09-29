import { state as s, ctx } from './state.js';
import { safeResourceUrl } from './security.js';

const PAGE_SIZE = 8;
const MATERIAL_FACETS = [
    { label: 'Dəri', terms: ['dəri', 'deri', 'leather'] },
    { label: 'Metal', terms: ['metal'] },
    { label: 'Akril', terms: ['akril', 'acrylic'] },
    { label: 'Taxta', terms: ['taxta', 'wood'] },
    { label: 'Vinil', terms: ['vinil', 'vinyl'] },
    { label: 'Banner', terms: ['banner'] },
    { label: 'Foto kağız', terms: ['foto kağız', 'foto kagiz', 'photo paper'] }
];
const COLOR_FACETS = [
    { label: 'Qara', swatch: '#202124', terms: ['qara', 'black'] },
    { label: 'Ağ', swatch: '#f7f7f5', terms: ['ag', 'white'] },
    { label: 'Qızılı', swatch: '#c59a45', terms: ['qizili', 'gold'] },
    { label: 'Qəhvəyi', swatch: '#79543d', terms: ['qehveyi', 'brown'] },
    { label: 'Boz', swatch: '#92979e', terms: ['boz', 'grey', 'gray'] },
    { label: 'Mavi', swatch: '#2864c7', terms: ['mavi', 'blue'] },
    { label: 'Qırmızı', swatch: '#d52b32', terms: ['qirmizi', 'red'] }
];

function normalized(value) {
    return String(value || '').toLocaleLowerCase('az').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
}
function hasTerm(source, terms) {
    const words = normalized(source).split(/[^a-z0-9]+/).filter(Boolean);
    return terms.some(term => {
        const parts = normalized(term).split(/[^a-z0-9]+/).filter(Boolean);
        return parts.length > 0 && parts.every((part, index) => {
            if (parts.length === 1) return words.includes(part);
            return normalized(source).includes(normalized(term));
        });
    });
}
function productText(product) {
    return [product?.name, product?.desc, product?.description, product?.color,
        ...(Array.isArray(product?.colors) ? product.colors : [])].filter(Boolean).join(' ');
}
function productMaterials(product) {
    const source = String(product?.material || '');
    return MATERIAL_FACETS.filter(facet => hasTerm(source, facet.terms)).map(facet => facet.label);
}
function productColors(product) {
    const source = productText(product);
    return COLOR_FACETS.filter(facet => hasTerm(source, facet.terms)).map(facet => facet.label);
}
function categoryProducts(category) {
    return (Array.isArray(s.products) ? s.products : []).filter(product => !category || String(product.cat || '').trim() === category);
}
function currency(value) {
    const amount = Number(value);
    return `${Number.isFinite(amount) ? amount.toFixed(amount % 1 ? 2 : 0) : '0'} ₼`;
}

export function initCategoryPage() {
    const page = document.getElementById('categoryPageView');
    const main = document.getElementById('home');
    if (!page || !main) return;

    const categoryList = document.getElementById('categoryPageCategoryList');
    const materialList = document.getElementById('categoryPageMaterials');
    const colorList = document.getElementById('categoryPageColors');
    const productGrid = document.getElementById('categoryPageProducts');
    const pager = document.getElementById('categoryPagePagination');
    const heroImage = document.getElementById('categoryPageHeroImage');
    const aside = document.getElementById('categoryPageFilters');

    let isOpen = false;
    let selectedCategory = '';
    let selectedMaterials = new Set();
    let selectedColors = new Set();
    let minPrice = 0;
    let maxPrice = 0;
    let priceLimitMin = 0;
    let priceLimitMax = 100;
    let sortOrder = 'newest';
    let currentPage = 1;
    let layout = 'grid';
    let returnScrollY = 0;

    function priceLimits() {
        const values = (Array.isArray(s.products) ? s.products : []).map(p => Number(p.price)).filter(Number.isFinite);
        const lowest = values.length ? Math.max(0, Math.floor(Math.min(...values) / 10) * 10) : 0;
        const highest = values.length ? Math.ceil(Math.max(...values) / 50) * 50 : 100;
        return { low: lowest, high: Math.max(lowest + 1, highest) };
    }
    function updatePriceDisplays() {
        const minRange = document.getElementById('categoryMinRange');
        const maxRange = document.getElementById('categoryMaxRange');
        const minInput = document.getElementById('categoryMinPriceInput');
        const maxInput = document.getElementById('categoryMaxPriceInput');
        [minRange, minInput].filter(Boolean).forEach(el => { el.min = String(priceLimitMin); el.max = String(maxPrice); el.value = String(minPrice); });
        [maxRange, maxInput].filter(Boolean).forEach(el => { el.min = String(minPrice); el.max = String(priceLimitMax); el.value = String(maxPrice); });
        const minLabel = document.getElementById('categoryMinPriceLabel');
        const maxLabel = document.getElementById('categoryMaxPriceLabel');
        if (minLabel) minLabel.textContent = currency(minPrice);
        if (maxLabel) maxLabel.textContent = currency(maxPrice);
    }
    function addCategoryButton(category, count) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-page-category-option';
        button.dataset.action = 'openCategoryPage';
        button.setAttribute('data-action-args', JSON.stringify([category]));
        button.setAttribute('aria-pressed', String(selectedCategory === category));
        const title = document.createElement('span');
        title.textContent = category || 'Hamısı';
        const amount = document.createElement('small');
        amount.textContent = String(count);
        button.append(title, amount);
        categoryList.appendChild(button);
    }
    function renderCategoryChoices() {
        if (!categoryList) return;
        categoryList.replaceChildren();
        const products = Array.isArray(s.products) ? s.products : [];
        const categories = [...new Set(products.map(product => String(product.cat || '').trim()).filter(Boolean))];
        addCategoryButton('', products.length);
        categories.forEach(category => addCategoryButton(category, products.filter(product => String(product.cat || '').trim() === category).length));
    }
    function renderFacetChoices(container, facets, selected, type, sourceProducts) {
        if (!container) return;
        container.replaceChildren();
        const available = facets.map(facet => ({
            ...facet,
            count: sourceProducts.filter(product => (type === 'material' ? productMaterials(product) : productColors(product)).includes(facet.label)).length
        })).filter(facet => facet.count > 0);
        if (!available.length) {
            const note = document.createElement('p');
            note.className = 'category-facet-empty';
            note.textContent = type === 'color'
                ? 'Bu kateqoriyada məhsul məlumatlarında ayrıca rəng qeyd edilməyib.'
                : 'Bu kateqoriya üçün material məlumatı qeyd edilməyib.';
            container.appendChild(note);
            return;
        }
        available.forEach(facet => {
            const label = document.createElement('label');
            label.className = `category-facet-option${type === 'color' ? ' category-color-option' : ''}`;
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = selected.has(facet.label);
            input.dataset.categoryFilter = type;
            input.dataset.value = facet.label;
            input.setAttribute('data-input-action', 'updateCategoryFilter');
            input.setAttribute('data-input-args', '[{"$":"this"}]');
            if (type === 'color') {
                const swatch = document.createElement('i');
                swatch.className = 'category-color-swatch';
                swatch.style.backgroundColor = facet.swatch;
                swatch.setAttribute('aria-hidden', 'true');
                label.append(input, swatch);
            } else label.appendChild(input);
            const name = document.createElement('span');
            name.textContent = facet.label;
            const count = document.createElement('small');
            count.textContent = String(facet.count);
            label.append(name, count);
            container.appendChild(label);
        });
    }
    function renderFilters() {
        const bounds = priceLimits();
        priceLimitMin = bounds.low;
        priceLimitMax = bounds.high;
        if (!Number.isFinite(minPrice) || minPrice < priceLimitMin) minPrice = priceLimitMin;
        if (!Number.isFinite(maxPrice) || maxPrice > priceLimitMax) maxPrice = priceLimitMax;
        if (minPrice > maxPrice) minPrice = maxPrice;

        const total = categoryProducts(selectedCategory);
        renderCategoryChoices();
        renderFacetChoices(materialList, MATERIAL_FACETS, selectedMaterials, 'material', total);
        renderFacetChoices(colorList, COLOR_FACETS, selectedColors, 'color', total);
        updatePriceDisplays();
    }
    function renderHero() {
        const category = selectedCategory || 'Məhsul və xidmətlər';
        const title = document.getElementById('categoryPageTitle');
        const breadcrumb = document.getElementById('categoryPageBreadcrumbCurrent');
        const resultTitle = document.getElementById('categoryPageResultsTitle');
        const description = document.getElementById('categoryPageDescription');
        if (title) title.textContent = category;
        if (breadcrumb) breadcrumb.textContent = category;
        if (resultTitle) resultTitle.textContent = category;
        if (description) description.textContent = selectedCategory
            ? `Fərdiləşdirilə bilən ${category.toLocaleLowerCase('az')} seçimləri. Sevdikləriniz üçün unikal və mənalı hədiyyələr.`
            : 'Fərdiləşdirilə bilən hədiyyələr, lazer kəsim və çap məhsullarını bir yerdə kəşf edin.';

        if (!heroImage) return;
        heroImage.replaceChildren();
        const withImage = categoryProducts(selectedCategory).find(product => {
            const src = Array.isArray(product.images) && product.images.length ? product.images[0] : product.image;
            return !!safeResourceUrl(src, { allowData: false, allowBlob: false, allowRelative: true });
        });
        const raw = withImage && (Array.isArray(withImage.images) && withImage.images.length ? withImage.images[0] : withImage.image);
        const src = safeResourceUrl(raw, { allowData: false, allowBlob: false, allowRelative: true });
        if (src) {
            const image = document.createElement('img');
            image.className = 'category-page-hero-photo';
            image.src = src;
            image.alt = withImage.name;
            image.loading = 'eager';
            image.decoding = 'async';
            image.onerror = () => image.remove();
            heroImage.appendChild(image);
        }
    }
    function filteredProducts() {
        let list = categoryProducts(selectedCategory).filter(product => {
            const price = Number(product.price);
            if (Number.isFinite(price) && (price < minPrice || price > maxPrice)) return false;
            if (selectedMaterials.size && !productMaterials(product).some(value => selectedMaterials.has(value))) return false;
            if (selectedColors.size && !productColors(product).some(value => selectedColors.has(value))) return false;
            return true;
        });
        if (sortOrder === 'low') list.sort((a, b) => Number(a.price) - Number(b.price));
        else if (sortOrder === 'high') list.sort((a, b) => Number(b.price) - Number(a.price));
        else list.sort((a, b) => {
            const aTime = Date.parse(a.updatedAt || a.updated_at || '');
            const bTime = Date.parse(b.updatedAt || b.updated_at || '');
            if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
            return Number(b.id) - Number(a.id);
        });
        return list;
    }
    function renderPagination(totalPages) {
        if (!pager) return;
        pager.replaceChildren();
        pager.hidden = totalPages <= 1;
        if (totalPages <= 1) return;
        const makeButton = (label, pageNumber, disabled = false, current = false) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `category-page-page-button${current ? ' is-current' : ''}`;
            button.textContent = label;
            button.disabled = disabled;
            if (current) button.setAttribute('aria-current', 'page');
            button.dataset.action = 'setCategoryPage';
            button.setAttribute('data-action-args', JSON.stringify([pageNumber]));
            return button;
        };
        pager.appendChild(makeButton('‹', Math.max(1, currentPage - 1), currentPage === 1));
        for (let number = 1; number <= totalPages; number += 1) {
            if (totalPages > 6 && number > 3 && number < totalPages - 1 && Math.abs(number - currentPage) > 1) {
                if (number === 4 || number === totalPages - 2) {
                    const dots = document.createElement('span'); dots.textContent = '…'; pager.appendChild(dots);
                }
                continue;
            }
            pager.appendChild(makeButton(String(number), number, false, number === currentPage));
        }
        pager.appendChild(makeButton('›', Math.min(totalPages, currentPage + 1), currentPage === totalPages));
    }
    function renderProducts() {
        if (!productGrid) return;
        const list = filteredProducts();
        const count = document.getElementById('categoryPageResultCount');
        if (count) count.textContent = `${list.length} məhsul`;
        productGrid.dataset.layout = layout;
        const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        currentPage = Math.min(currentPage, totalPages);
        const visible = list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
        ctx.drawGrid?.(visible, productGrid);
        renderPagination(totalPages);
        const gridButton = document.getElementById('categoryPageGridLayout');
        const listButton = document.getElementById('categoryPageListLayout');
        gridButton?.setAttribute('aria-pressed', String(layout === 'grid'));
        listButton?.setAttribute('aria-pressed', String(layout === 'list'));
    }
    function refresh() {
        if (!isOpen) return;
        renderHero();
        renderFilters();
        renderProducts();
    }
    function openCategoryPage(category = '') {
        if (!isOpen) returnScrollY = window.scrollY || 0;
        isOpen = true;
        selectedCategory = String(category || '').trim();
        s.activeCat = selectedCategory;
        s.activeTag = '';
        s.viewingFavs = false;
        s.smartFilterActive = false;
        s.showAllProducts = true;
        const search = document.getElementById('search');
        if (search) search.value = '';
        const bounds = priceLimits();
        priceLimitMin = bounds.low;
        priceLimitMax = bounds.high;
        minPrice = priceLimitMin;
        maxPrice = priceLimitMax;
        selectedMaterials = new Set();
        selectedColors = new Set();
        currentPage = 1;
        page.hidden = false;
        main.classList.add('category-page-active');
        aside?.classList.remove('filters-expanded');
        document.getElementById('categoryPageFilterToggle')?.setAttribute('aria-expanded', 'false');
        refresh();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function closeCategoryPage(restore = true) {
        if (!isOpen) return;
        isOpen = false;
        selectedCategory = '';
        s.activeCat = '';
        s.activeTag = '';
        s.viewingFavs = false;
        s.smartFilterActive = false;
        s.showAllProducts = false;
        page.hidden = true;
        main.classList.remove('category-page-active');
        if (restore) {
            ctx.render?.();
            window.scrollTo({ top: returnScrollY, behavior: 'smooth' });
        }
    }
    function clearCategoryFilters() {
        minPrice = priceLimitMin;
        maxPrice = priceLimitMax;
        selectedMaterials.clear();
        selectedColors.clear();
        sortOrder = 'newest';
        currentPage = 1;
        const sort = document.getElementById('categoryPageSort');
        if (sort) sort.value = sortOrder;
        renderFilters();
        renderProducts();
    }
    function updateCategoryFilter(control) {
        if (!isOpen || !control) return;
        const type = control.dataset.categoryFilter;
        const value = control.dataset.value || control.value;
        if (type === 'minPrice' || type === 'minRange') {
            minPrice = Math.max(priceLimitMin, Math.min(priceLimitMax, Number(value) || 0));
            if (minPrice > maxPrice) maxPrice = minPrice;
            updatePriceDisplays();
        } else if (type === 'maxPrice' || type === 'maxRange') {
            maxPrice = Math.max(priceLimitMin, Math.min(priceLimitMax, Number(value) || 0));
            if (maxPrice < minPrice) minPrice = maxPrice;
            updatePriceDisplays();
        } else if (type === 'material') {
            control.checked ? selectedMaterials.add(value) : selectedMaterials.delete(value);
        } else if (type === 'color') {
            control.checked ? selectedColors.add(value) : selectedColors.delete(value);
        } else if (type === 'sort') {
            sortOrder = control.value;
        }
        currentPage = 1;
        renderProducts();
    }
    function toggleFilters() {
        if (!aside) return;
        const expanded = aside.classList.toggle('filters-expanded');
        document.getElementById('categoryPageFilterToggle')?.setAttribute('aria-expanded', String(expanded));
    }
    function setPage(pageNumber) {
        currentPage = Math.max(1, Number(pageNumber) || 1);
        renderProducts();
        page.querySelector('.category-page-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function setLayout(value) {
        layout = value === 'list' ? 'list' : 'grid';
        renderProducts();
    }

    document.addEventListener('click', event => {
        if (!isOpen) return;
        const anchor = event.target?.closest?.('a[href^="#"]');
        if (anchor && anchor.hash !== '#categoryPageView') {
            closeCategoryPage(false);
            ctx.render?.();
        }
    });
    Object.assign(ctx, {
        openCategoryPage,
        closeCategoryPage,
        categoryPageRefresh: refresh,
        categoryPageIsOpen: () => isOpen,
        clearCategoryPageFilters: clearCategoryFilters,
        updateCategoryFilter,
        toggleCategoryPageFilters: toggleFilters,
        setCategoryPage: setPage,
        setCategoryPageLayout: setLayout
    });
}

