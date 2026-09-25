import { sb } from '../config.js';

export const realtimeService = {
    createSiteSettingsChannel(handlers = {}) {
        const channel = sb.channel('f1-site-settings-live');
        if (handlers.onInsert) channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'site_settings' }, handlers.onInsert);
        if (handlers.onUpdate) channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_settings', filter: 'id=eq.1' }, handlers.onUpdate);
        return channel;
    },
    createAdminOrdersChannel(handlers) {
        const channel = sb.channel('f1-admin-orders-live');
        if (handlers.onInsert) channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, handlers.onInsert);
        if (handlers.onUpdate) channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, handlers.onUpdate);
        return channel;
    },
    removeChannel(channel) {
        return channel ? sb.removeChannel(channel) : Promise.resolve();
    }
};
