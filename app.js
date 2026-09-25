import { createApi } from './api.js';
import { state, ctx } from './state.js';
import { initTheme, initUiGlobalEvents, toggleTheme, toggleMobileMenu, closeMobileMenu, subscribeNewsletter } from './ui.js';
import { openDialog, closeDialog, initModalManager } from './modal.js';
import { initSiteSettings } from './site-settings.js';
import { initSiteContent } from './site-content.js';
import { initHomepageContent } from './homepage-content.js';
import { initBannerContent } from './banner-content.js';
import { initCatalog } from './catalog.js';
import { initAuth } from './auth.js';
import { initCustomization } from './customization.js';
import { initDesignStudio } from './design-studio.js';
import { initCart } from './cart.js';
import { initChat } from './chat.js';
import { initAdmin } from './admin.js';
import { initLegal } from './legal.js';
import { initReviews } from './reviews.js';
import { initEvents } from './events.js';
import { makeClientId } from './security.js';
import { initMotion } from './motion.js';

Object.assign(ctx, { openDialog, closeDialog, makeClientId, toggleTheme, toggleMobileMenu, closeMobileMenu, subscribeNewsletter });

// Register modules. Cross-module calls go through the shared ctx registry.
initModalManager();
initSiteContent();
initHomepageContent();
initBannerContent();
initSiteSettings();
initCatalog();
initAuth();
initCustomization();
initDesignStudio();
initCart();
initChat();
initAdmin();
initLegal();
initReviews();

ctx.api = createApi({
    isAdminUser: () => !!ctx.isAdminUser?.(),
    loadAdminDashboard: () => ctx.loadAdminDashboard()
});

initEvents();

window.addEventListener('load', () => {
    initTheme();
    ctx.normalizeCartLines?.();
    ctx.updateCount?.();
    ctx.render?.();
    initUiGlobalEvents();
    initMotion();
    ctx.handleDeliveryChange?.();
    ctx.updateAdminButton?.();
    ctx.loadCurrentUser?.();
    ctx.loadServerProducts?.();
    ctx.loadServerReviews?.();
    ctx.loadSiteSettings?.(true);
});
