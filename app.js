import { createApi } from './api.js?v=59.3';
import { state, ctx } from './state.js?v=59.3';
import { initTheme, initUiGlobalEvents, toggleTheme, toggleMobileMenu, closeMobileMenu } from './ui.js?v=59.3';
import { openDialog, closeDialog, initModalManager } from './modal.js?v=59.3';
import { initSiteSettings } from './site-settings.js?v=59.3';
import { initCatalog } from './catalog.js?v=59.3';
import { initAuth } from './auth.js?v=59.3';
import { initCustomization } from './customization.js?v=59.3';
import { initDesignStudio } from './design-studio.js?v=59.3';
import { initCart } from './cart.js?v=59.3';
import { initChat } from './chat.js?v=59.3';
import { initAdmin } from './admin.js?v=59.3';
import { initLegal } from './legal.js?v=59.3';
import { initReviews } from './reviews.js?v=59.3';
import { initEvents } from './events.js?v=59.3';
import { makeClientId } from './security.js?v=59.3';
import { initMotion } from './motion.js?v=59.3';
Object.assign(ctx, { openDialog, closeDialog, makeClientId, toggleTheme, toggleMobileMenu, closeMobileMenu });
initModalManager();
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
