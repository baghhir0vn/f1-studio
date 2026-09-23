import { sb } from '../config.js?v=59.2';
import { fetchAllRows } from './query-utils.js?v=59.2';
import { isAllowedOrderStatus, isSafeCustomerDesignPath, sanitizeDesignLayout } from '../security.js?v=59.2';
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
                    text: String(c.text || '').trim().slice(0, 500),
                    color: String(c.color || '').trim().slice(0, 40),
                    size: String(c.size || '').trim().slice(0, 80),
                    sizeValue: String(c.sizeValue || '').trim().slice(0, 120),
                    font: String(c.font || '').trim().slice(0, 80),
                    imageName: String(c.imageName || '').trim().slice(0, 180),
                    imagePath: isSafeCustomerDesignPath(c.imagePath || '') ? String(c.imagePath).trim() : '',
                    imageType: String(c.imageType || '').trim().slice(0, 80),
                    imageSize: Number.isFinite(Number(c.imageSize)) ? Math.max(0, Math.min(10 * 1024 * 1024, Number(c.imageSize))) : 0,
                    note: String(c.note || '').trim().slice(0, 1000),
                    layout: sanitizeDesignLayout(c.layout)
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
        const { data, error } = await sb.rpc('create_order', {
            p_items: payload.items,
            p_customer_name: payload.customer_name,
            p_customer_phone: payload.customer_phone,
            p_customer_email: payload.customer_email,
            p_delivery: payload.delivery,
            p_address: payload.address,
            p_address_unknown: payload.address_unknown,
            p_gift_wrap: payload.gift_wrap
        });
        if (error) throw error;
        const order = data?.order || data;
        return { order: { orderCode: order.order_code, status: order.status, total_cents: Math.round(Number(order.total) * 100) } };
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
