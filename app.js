import { createApi } from './api.js';
import { state, ctx } from './state.js';
import { initTheme, initUiGlobalEvents } from './ui.js';
import { openDialog, closeDialog, initModalManager } from './modal.js';
import { initSiteSettings } from './site-settings.js';
import { initCatalog } from './catalog.js';
import { initAuth } from './auth.js';
import { initCustomization } from './customization.js';
import { initCart } from './cart.js';
import { initChat } from './chat.js';
import { initAdmin } from './admin.js';
import { initLegal } from './legal.js';
import { initReviews } from './reviews.js';
import { initEvents } from './events.js';
import { makeClientId } from './security.js';

Object.assign(ctx, { openDialog, closeDialog, makeClientId });

// Register modules. Cross-module calls go through the shared ctx registry.
initModalManager();
initSiteSettings();
initCatalog();
initAuth();
initCustomization();
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
    ctx.handleDeliveryChange?.();
    ctx.updateAdminButton?.();
    ctx.loadCurrentUser?.();
    ctx.loadServerProducts?.();
    ctx.loadServerReviews?.();
    ctx.loadSiteSettings?.(true);
});
