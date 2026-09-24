import { sb } from '../config.js';
import { orderService } from './order-service.js';
import { isUuid } from '../security.js';

export const customerService = {
    async list() {
        const [{ data: profilesData, error: profilesError }, ordersData] = await Promise.all([
            sb.from('profiles').select('id,name,phone,email,role,blocked,created_at').eq('role', 'customer').order('created_at', { ascending: false }),
            orderService.listSummary()
        ]);
        if (profilesError) throw profilesError;
        const rows = (profilesData || []).map(u => ({
            id: u.id, name: u.name || '', phone: u.phone || '', email: u.email || '', blocked: !!u.blocked,
            created_at: u.created_at, order_count: 0, total_cents: 0, last_order_at: null
        }));
        const byId = new Map(rows.map(x => [x.id, x]));
        (ordersData || []).forEach(o => {
            const row = byId.get(o.user_id);
            if (!row) return;
            row.order_count += 1;
            if (o.status !== 'cancelled') row.total_cents += Math.round(Number(o.total || 0) * 100);
            if (!row.last_order_at || new Date(o.created_at) > new Date(row.last_order_at)) row.last_order_at = o.created_at;
        });
        return rows;
    },
    async setBlocked(id, blocked) {
        if (!isUuid(id)) throw new Error('INVALID_CUSTOMER_ID');
        if (typeof blocked !== 'boolean') throw new Error('INVALID_CUSTOMER_ID');
        const { data, error } = await sb.from('profiles').update({ blocked })
            .eq('id', id).eq('role', 'customer')
            .select('id,name,phone,email,role,blocked,created_at').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('CUSTOMER_NOT_FOUND');
        return data;
    }
};
