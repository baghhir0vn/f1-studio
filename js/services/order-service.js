import { sb } from '../config.js';
import { fetchAllRows } from './query-utils.js';
import { isAllowedOrderStatus, isSafeCustomerDesignPath, sanitizeCustomizationProductContext, sanitizeDesignLayout, sanitizeDesignPreview, sanitizeDesignUploads } from '../security.js';
export function mapOrderRow(o) {
    return {
        id: o.id,
        orderCode: o.order_code,
        status: o.status,
        createdAt: o.created_at,
        total_cents: Math.round(Number(o.total) * 100),
        customer: { name: o.customer_name, phone: o.customer_phone, email: o.customer_email || '', userId: o.user_id || null },
        delivery: o.delivery,
        address: o.address || '',
        addressUnknown: !!o.address_unknown,
        giftWrap: !!o.gift_wrap,
        items: (o.order_items || []).map(i => ({
            name: i.product_name,
            productId: i.product_id,
            qty: i.qty,
            price: Number(i.price),
            customization: i.customization || null
        }))
    };
}
export const orderService = {
    async listMine() {
        const { data: userData } = await sb.auth.getUser();
        if (!userData.user) throw new Error('AUTH_REQUIRED');
        const { data, error } = await sb.from('orders').select('id,order_code,status,created_at,total,customer_name,customer_phone,customer_email,delivery,address,address_unknown,gift_wrap,user_id,order_items(id,product_id,product_name,qty,price,customization)')
            .eq('user_id', userData.user.id).order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        return (data || []).map(mapOrderRow);
    },
    async create(body = {}) {
        const { data: userData } = await sb.auth.getUser();
        const customer = body?.customer && typeof body.customer === 'object' ? body.customer : {};
        const rawItems = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
        if (!rawItems.length) throw new Error('INVALID_ORDER_ITEMS');
        const allowedDelivery = new Set(['pickup','ganja','region']);
        const delivery = String(body.delivery || 'pickup');
        if (!allowedDelivery.has(delivery)) throw new Error('INVALID_ORDER');
        const cleanEmail = String(customer.email || '').trim().toLowerCase();
        if (cleanEmail && (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) throw new Error('INVALID_ORDER');
        const items = rawItems.map((item) => {
            const productId = Number(item?.productId ?? item?.id);
            const qty = Math.floor(Number(item?.qty));
            if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error('INVALID_ORDER_ITEMS');
            let customization = null;
            if (item?.customization && typeof item.customization === 'object' && !Array.isArray(item.customization)) {
                const c = item.customization;
                customization = {
                    productContext: sanitizeCustomizationProductContext(c.productContext, productId),
                    text: String(c.text || '').trim().slice(0, 500),
                    color: String(c.color || '').trim().slice(0, 40),
                    size: String(c.size || '').trim().slice(0, 80),
                    sizeValue: String(c.sizeValue || '').trim().slice(0, 120),
                    font: String(c.font || '').trim().slice(0, 80),
                    imageName: String(c.imageName || '').trim().slice(0, 180),
                    imagePath: isSafeCustomerDesignPath(c.imagePath || '') ? String(c.imagePath).trim() : '',
                    imageType: String(c.imageType || '').trim().slice(0, 80),
                    imageSize: Number.isFinite(Number(c.imageSize)) ? Math.max(0, Math.min(10 * 1024 * 1024, Number(c.imageSize))) : 0,
                    uploads: sanitizeDesignUploads(c.uploads, c),
                    note: String(c.note || '').trim().slice(0, 1000),
                    layout: sanitizeDesignLayout(c.layout),
                    previewData: sanitizeDesignPreview(c.previewData)
                };
            }
            return { productId, qty, customization };
        });
        const payload = {
            items,
            customer_name: String(customer.name || '').trim().slice(0, 80),
            customer_phone: String(customer.phone || '').trim().slice(0, 40),
            customer_email: cleanEmail,
            delivery,
            address: String(body.address || '').trim().slice(0, 500),
            address_unknown: !!body.addressUnknown,
            gift_wrap: !!body.giftWrap,
            user_id: userData.user?.id || null
        };
        // All order writes go through the server-verified checkout gateway.
        // Never fall back to the old anonymous Supabase RPC if the API fails.
        const captchaToken = String(body.captchaToken || '').trim();
        if (!captchaToken) throw new Error('CAPTCHA_REQUIRED');
        const { data: sessionData } = await sb.auth.getSession();
        const accessToken = userData.user ? sessionData?.session?.access_token : '';
        if (userData.user && !accessToken) throw new Error('AUTH_REQUIRED');
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {})
            },
            cache: 'no-store',
            body: JSON.stringify({
                items: payload.items,
                customer: {
                    name: payload.customer_name,
                    phone: payload.customer_phone,
                    email: payload.customer_email
                },
                delivery: payload.delivery,
                address: payload.address,
                addressUnknown: payload.address_unknown,
                giftWrap: payload.gift_wrap,
                captchaToken
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(data.error || 'CHECKOUT_TEMPORARILY_UNAVAILABLE'));
        if (!data.order?.orderCode) throw new Error('ORDER_RESPONSE_INVALID');
        return { order: data.order };
    },
    async listAdmin() {
        const data = await fetchAllRows(() => sb.from('orders').select('id,order_code,status,created_at,total,customer_name,customer_phone,customer_email,delivery,address,address_unknown,gift_wrap,user_id,order_items(id,product_id,product_name,qty,price,customization)').order('created_at', { ascending: false }), { pageSize: 1000, maxRows: 25000 });
        return data.map(mapOrderRow);
    },
    async listSummary() {
        return fetchAllRows(() => sb.from('orders').select('id,user_id,total,created_at,status').not('user_id', 'is', null).order('created_at', { ascending: false }), { pageSize: 1000, maxRows: 25000 });
    },
    async setStatus(id, status) {
        if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('INVALID_ORDER');
        if (!isAllowedOrderStatus(status)) throw new Error('INVALID_ORDER');
        const { data, error } = await sb.from('orders').update({ status }).eq('id', id).select('id,order_code,status,created_at,total,customer_name,customer_phone,customer_email,delivery,address,address_unknown,gift_wrap,user_id,order_items(id,product_id,product_name,qty,price,customization)').single();
        if (error) throw error;
        return mapOrderRow(data);
    }
};
