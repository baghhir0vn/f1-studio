import { productService, mapProductRow } from './services/product-service.js';
import { orderService, mapOrderRow } from './services/order-service.js';
import { reviewService, mapReviewRow } from './services/review-service.js';
import { customerService } from './services/customer-service.js';
import { authService } from './services/auth-service.js';
import { getProfileForUser } from './services/profile-service.js';

export function createApi(deps = {}) {
    const isAdminUser = deps.isAdminUser || (() => false);
    const loadAdminDashboard = deps.loadAdminDashboard || (async () => ({}));

    return async function api(path, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const body = options.body ? JSON.parse(options.body) : null;

        if (path === '/api/auth/reset-password' && method === 'POST') {
            return authService.resetPassword(body.email).then(({ error }) => {
                if (error) throw error;
                return { ok: true };
            });
        }
        if (path === '/api/auth/update-password' && method === 'POST') {
            const { data, error } = await authService.updatePassword(body.password);
            if (error) throw error;
            return { user: data.user };
        }
        if (path === '/api/auth/register' && method === 'POST') return authService.register(body);
        if (path === '/api/auth/login' && method === 'POST') return authService.login(body.email, body.password);
        if (path === '/api/auth/logout' && method === 'POST') return authService.logout();
        if (path === '/api/me' && method === 'GET') return authService.getCurrentProfile();

        if (path === '/api/products' && method === 'GET') return { products: await productService.list() };
        if (path === '/api/reviews' && method === 'GET') return { reviews: await reviewService.listApproved() };
        if (path === '/api/reviews' && method === 'POST') return reviewService.submit(body);
        if (path === '/api/me/orders' && method === 'GET') return { orders: await orderService.listMine() };
        if (path === '/api/orders' && method === 'POST') return orderService.create(body);

        if (path === '/api/admin/customers' && method === 'GET') {
            requireAdmin(isAdminUser);
            return { customers: await customerService.list() };
        }
        if (path.startsWith('/api/admin/customers/') && method === 'PATCH') {
            requireAdmin(isAdminUser);
            const id = decodeURIComponent(path.split('/').pop() || '');
            return { customer: await customerService.setBlocked(id, !!body?.blocked) };
        }

        const adminMatch = path.match(/^\/api\/admin\/(products|orders|reviews)(?:\/(\d+))?$/);
        if (adminMatch) {
            requireAdmin(isAdminUser);
            const type = adminMatch[1];
            const id = adminMatch[2] ? Number(adminMatch[2]) : null;

            if (type === 'products') {
                if (method === 'GET') return { products: await productService.list() };
                if (method === 'POST') return { product: await productService.create(body) };
                if (method === 'PUT' && id) return { product: await productService.update(id, body) };
                if (method === 'DELETE' && id) return productService.remove(id);
            }
            if (type === 'orders') {
                if (method === 'GET') return { orders: await orderService.listAdmin() };
                if (method === 'PATCH' && id) return { order: await orderService.setStatus(id, body.status) };
            }
            if (type === 'reviews') {
                if (method === 'GET') return { reviews: await reviewService.listAdmin() };
                if (method === 'PATCH' && id) return { review: await reviewService.setStatus(id, body.status) };
            }
        }

        if (path === '/api/admin/stats' && method === 'GET') {
            requireAdmin(isAdminUser);
            return loadAdminDashboard();
        }

        throw new Error(`Unsupported API route: ${path}`);
    };
}

function requireAdmin(check) {
    if (!check()) throw new Error('ADMIN_REQUIRED');
}

export { mapProductRow, mapOrderRow, mapReviewRow, getProfileForUser };
