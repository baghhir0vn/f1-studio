import { sb } from '../config.js';
import { getProfileForUser } from './profile-service.js';
function getPasswordResetRedirect() {
    const origin = window.location.origin;
    return /^https?:\/\//i.test(origin) ? `${origin}/` : null;
}
export const authService = {
    onAuthStateChange(callback) { return sb.auth.onAuthStateChange(callback); },
    async getUser() { return sb.auth.getUser(); },
    async resetPassword(email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) throw new Error('INVALID_AUTH_INPUT');
        const redirectTo = getPasswordResetRedirect();
        const options = redirectTo ? { redirectTo } : {};
        return sb.auth.resetPasswordForEmail(cleanEmail, options);
    },
    async updatePassword(password) {
        const cleanPassword = String(password || '');
        if (cleanPassword.length < 8 || cleanPassword.length > 128) throw new Error('INVALID_AUTH_INPUT');
        return sb.auth.updateUser({ password: cleanPassword });
    },
    async register({ name, phone, email, password }) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanName = String(name || '').trim().slice(0, 80);
        const cleanPhone = String(phone || '').trim().slice(0, 40);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('INVALID_AUTH_INPUT');
        if (cleanName.length < 2) throw new Error('INVALID_AUTH_INPUT');
        if (String(password || '').length < 8 || String(password || '').length > 128) throw new Error('INVALID_AUTH_INPUT');
        const { data, error } = await sb.auth.signUp({
            email: cleanEmail,
            password,
            options: { data: { name: cleanName, phone: cleanPhone } }
        });
        if (error) throw error;
        const profile = data.user ? await getProfileForUser(data.user) : null;
        return { user: profile, session: data.session };
    },
    async login(email, password) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!cleanEmail || String(password || '').length > 128) throw new Error('INVALID_AUTH_INPUT');
        const { data, error } = await sb.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        return { user: await getProfileForUser(data.user), session: data.session };
    },
    async logout() {
        const { error } = await sb.auth.signOut();
        if (error) throw error;
        return { ok: true };
    },
    async getCurrentProfile() {
        const { data } = await sb.auth.getUser();
        if (!data.user) throw new Error('AUTH_REQUIRED');
        return { user: await getProfileForUser(data.user) };
    },
    getProfileForUser
};
