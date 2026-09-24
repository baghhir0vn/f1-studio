import { sb } from '../config.js';
import { safeHttpUrl } from '../security.js';

const SITE_SETTINGS_COLUMNS = 'id,whatsapp_number,instagram_url,tiktok_url,address,weekday_hours,weekend_hours,delivery_pickup,delivery_ganja,delivery_region,gift_wrap,updated_at';

export const siteSettingsService = {
    async get() {
        const { data, error } = await sb.from('site_settings').select(SITE_SETTINGS_COLUMNS).eq('id', 1).maybeSingle();
        if (error) throw error;
        return data;
    },
    async save(payload = {}) {
        const clean = {
            id: 1,
            whatsapp_number: String(payload.whatsapp_number || '').trim().slice(0, 40),
            instagram_url: safeHttpUrl(payload.instagram_url || '', { maxLength: 2048 }) || null,
            tiktok_url: safeHttpUrl(payload.tiktok_url || '', { maxLength: 2048 }) || null,
            address: String(payload.address || '').trim().slice(0, 300),
            weekday_hours: String(payload.weekday_hours || '').trim().slice(0, 120),
            weekend_hours: String(payload.weekend_hours || '').trim().slice(0, 120),
            delivery_pickup: Number.isFinite(Number(payload.delivery_pickup)) ? Math.max(0, Math.min(100000, Number(payload.delivery_pickup))) : 0,
            delivery_ganja: Number.isFinite(Number(payload.delivery_ganja)) ? Math.max(0, Math.min(100000, Number(payload.delivery_ganja))) : 0,
            delivery_region: Number.isFinite(Number(payload.delivery_region)) ? Math.max(0, Math.min(100000, Number(payload.delivery_region))) : 0,
            gift_wrap: Number.isFinite(Number(payload.gift_wrap)) ? Math.max(0, Math.min(100000, Number(payload.gift_wrap))) : 0
        };
        const { data, error } = await sb.from('site_settings').upsert(clean, { onConflict: 'id' }).select(SITE_SETTINGS_COLUMNS).single();
        if (error) throw error;
        return data;
    }
};
