import { sb } from './config.js';

export async function getProfileForUser(user) {
    if (!user) return null;
    const { data, error } = await sb.from('profiles')
        .select('id,name,phone,email,role,blocked')
        .eq('id', user.id)
        .maybeSingle();
    if (error) throw error;
    return data || {
        id: user.id,
        name: user.user_metadata?.name || '',
        phone: user.user_metadata?.phone || '',
        email: user.email || '',
        role: 'customer',
        blocked: false
    };
}
