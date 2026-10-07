import { sb } from '../config.js';
export async function getProfileForUser(user) {
    if (!user) return null;
    const { data, error } = await sb.from('profiles')
        .select('id,name,phone,email,role,blocked')
        .eq('id', user.id)
        .maybeSingle();
    if (error) throw error;
    const base = data || {
        id: user.id,
        name: user.user_metadata?.name || '',
        phone: user.user_metadata?.phone || '',
        email: user.email || '',
        role: 'customer',
        blocked: false
    };
    const metadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
    return {
        ...base,
        avatar_path: typeof metadata.profile_avatar_path === 'string' ? metadata.profile_avatar_path : '',
        avatar_template: typeof metadata.profile_avatar_template === 'string' ? metadata.profile_avatar_template : ''
    };
}
