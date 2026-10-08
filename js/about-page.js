import { state as s, ctx } from './state.js';

const aboutRouteHashes = new Set(['about', 'about-contact', 'delivery-info', 'faq', 'order-rules']);

export function initAboutPage() {
    const view = document.getElementById('aboutPageView');
    if (!view) return;

    const accordions = [...view.querySelectorAll(':scope > .about-page-accordion')];
    const mobile = window.matchMedia('(max-width: 700px)');
    let wasAboutRoute = false;

    function updateAboutMetrics() {
        const products = s.serverCatalogReady && Array.isArray(s.products) ? s.products : null;
        const categories = products
            ? new Set(products.map(product => String(product?.cat || '').trim()).filter(Boolean)).size
            : null;
        const reviewsLoaded = s.serverReviewsLoaded === true;
        const reviews = reviewsLoaded && Array.isArray(s.localReviews) ? s.localReviews : [];
        const ratings = reviews
            .map(review => Number(review?.stars))
            .filter(stars => Number.isInteger(stars) && stars >= 1 && stars <= 5);
        const averageRating = ratings.length
            ? `${(ratings.reduce((sum, stars) => sum + stars, 0) / ratings.length).toFixed(1)}/5`
            : '—';

        const values = {
            products: products ? products.length : '—',
            categories: categories ?? '—',
            reviews: reviewsLoaded ? reviews.length : '—',
            rating: averageRating
        };
        Object.entries(values).forEach(([key, value]) => {
            const node = view.querySelector('[data-about-stat="' + key + '"]');
            if (node) node.textContent = String(value);
        });
    }

    function setAccordionDefaults() {
        if (!mobile.matches) {
            accordions.forEach(item => { item.open = true; });
            return;
        }
        if (wasAboutRoute) return;
        accordions.forEach(item => { item.open = false; });
    }

    function syncAboutRoute({ scroll = false } = {}) {
        const hash = decodeURIComponent(window.location.hash.replace(/^#/, '')).toLowerCase();
        const active = aboutRouteHashes.has(hash);
        document.body.classList.toggle('f1-about-route', active);
        document.body.classList.toggle('f1-about-order-rules', hash === 'order-rules');
        view.setAttribute('aria-hidden', String(!active));

        if (!active) {
            wasAboutRoute = false;
            return;
        }
        setAccordionDefaults();
        const targetId = hash || 'about';
        const target = document.getElementById(targetId);
        const parentAccordion = target?.closest('details.about-page-accordion');
        if (mobile.matches && parentAccordion) parentAccordion.open = true;
        if (hash === 'order-rules') {
            const delivery = document.getElementById('delivery-info');
            if (delivery) delivery.open = true;
            const rules = document.getElementById('order-rules');
            if (rules) rules.open = true;
        }

        view.querySelectorAll('[data-about-tab]').forEach(link => {
            const isActive = link.dataset.aboutTab === (hash === 'order-rules' ? 'delivery-info' : hash);
            if (isActive) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        const mainAboutLink = document.querySelector('#aboutRouteMainNav a[href="#about"]');
        if (mainAboutLink) mainAboutLink.setAttribute('aria-current', 'page');

        wasAboutRoute = true;
        updateAboutMetrics();
        if (scroll) {
            requestAnimationFrame(() => {
                const currentHash = decodeURIComponent(window.location.hash.replace(/^#/, '')).toLowerCase();
                const scrollTarget = document.getElementById(currentHash);
                scrollTarget?.scrollIntoView({
                    block: currentHash === 'about' ? 'start' : 'center',
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
                });
            });
        }
    }

    window.addEventListener('hashchange', () => syncAboutRoute({ scroll: true }));
    mobile.addEventListener?.('change', () => {
        wasAboutRoute = false;
        syncAboutRoute({ scroll: false });
    });

    document.querySelectorAll('[data-action="focusProductSearch"], [data-actions*="focusProductSearch"]').forEach(button => {
        button.addEventListener('click', event => {
            if (!document.body.classList.contains('f1-about-route')) return;
            event.preventDefault();
            event.stopPropagation();
            window.location.hash = '#products';
            window.setTimeout(() => ctx.focusProductSearch?.(), 80);
        }, true);
    });
    document.querySelectorAll('[data-action="showFavorites"], [data-actions*="showFavorites"]').forEach(button => {
        button.addEventListener('click', event => {
            if (!document.body.classList.contains('f1-about-route')) return;
            event.preventDefault();
            event.stopPropagation();
            window.location.hash = '#products';
            window.setTimeout(() => ctx.showFavorites?.(), 80);
        }, true);
    });

    const form = document.getElementById('aboutContactForm');
    if (form) {
        let submitting = false;
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (submitting) return;
            const status = document.getElementById('aboutFormStatus');
            const button = form.querySelector('button[type="submit"]');
            if (!form.reportValidity()) {
                if (status) status.textContent = 'Zəhmət olmasa bütün sahələri düzgün doldurun.';
                return;
            }
            const values = new FormData(form);
            const name = String(values.get('name') || '').trim();
            const email = String(values.get('email') || '').trim();
            const subject = String(values.get('subject') || '').trim();
            const message = String(values.get('message') || '').trim();
            submitting = true;
            if (button) {
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
            }
            if (status) status.textContent = 'E-poçt tətbiqinizdə qaralama açılır. Göndərməyi orada təsdiqləyin.';
            const body = [
                'Ad: ' + name,
                'E-poçt: ' + email,
                'Mövzu: ' + subject,
                '',
                message
            ].join('\n');
            const mailto = 'mailto:info@f1studio.az?subject=' + encodeURIComponent('F1 Studio — ' + subject) + '&body=' + encodeURIComponent(body);
            window.location.href = mailto;
            window.setTimeout(() => {
                submitting = false;
                if (button) {
                    button.disabled = false;
                    button.removeAttribute('aria-busy');
                }
            }, 1800);
        });
        form.addEventListener('input', () => {
            const status = document.getElementById('aboutFormStatus');
            if (status && status.textContent) status.textContent = '';
        });
    }

    Object.assign(ctx, { updateAboutMetrics });
    syncAboutRoute({ scroll: aboutRouteHashes.has(decodeURIComponent(window.location.hash.replace(/^#/, '')).toLowerCase()) });
}
