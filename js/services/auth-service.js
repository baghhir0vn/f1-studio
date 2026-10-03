import { sb } from '../config.js';
import { getProfileForUser } from './profile-service.js';

function getPasswordResetRedirect() {
    const origin = window.location.origin;
    return /^https?:\/\//i.test(origin) ? `${origin}/` : null;
}

function normalizeAuthError(error, flow) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    const detail = `${code} ${message}`;
    const status = Number(error?.status) || 0;
    let normalizedCode;

    if (/email_exists|user_already_exists|already registered|already exists/.test(detail)) {
        normalizedCode = 'EMAIL_EXISTS';
    } else if (/email_not_confirmed|email not confirmed/.test(detail)) {
        normalizedCode = 'EMAIL_NOT_CONFIRMED';
    } else if (status === 429 || /rate limit|too many requests/.test(detail)) {
        normalizedCode = 'AUTH_RATE_LIMITED';
    } else if (/authretryablefetcherror|failed to fetch|network|load failed|timeout/.test(detail)) {
        normalizedCode = 'AUTH_NETWORK_ERROR';
    } else if (flow === 'login' && /invalid login credentials|invalid credentials|invalid email or password/.test(detail)) {
        normalizedCode = 'INVALID_CREDENTIALS';
    } else {
        normalizedCode = flow === 'login' ? 'LOGIN_FAILED' : 'REGISTER_FAILED';
    }

    const normalized = new Error(normalizedCode);
    normalized.code = normalizedCode;
    normalized.status = status || undefined;
    normalized.cause = error;
    return normalized;
}

function profileFromAuthUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        name: user.user_metadata?.name || '',
        phone: user.user_metadata?.phone || '',
        email: user.email || '',
        role: 'customer',
        blocked: false
    };
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

        let response;
        try {
            response = await sb.auth.signUp({
                email: cleanEmail,
                password,
                options: { data: { name: cleanName, phone: cleanPhone } }
            });
        } catch (error) {
            throw normalizeAuthError(error, 'register');
        }

        const { data, error } = response;
        if (error) throw normalizeAuthError(error, 'register');

        // With email confirmation enabled Supabase returns a user but no session.
        // Do not query the authenticated-only profiles table until confirmation/login.
        let profile = profileFromAuthUser(data.user);
        if (data.user && data.session) {
            try {
                profile = await getProfileForUser(data.user) || profile;
            } catch (_) {
                // Auth creation succeeded. A newly created account is always a customer,
                // so metadata is a safe display fallback while the profile row becomes available.
                profile = profileFromAuthUser(data.user);
            }
        }
        return { user: profile, session: data.session };
    },
    async login(email, password) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!cleanEmail || String(password || '').length > 128) throw new Error('INVALID_AUTH_INPUT');

        let response;
        try {
            response = await sb.auth.signInWithPassword({ email: cleanEmail, password });
        } catch (error) {
            throw normalizeAuthError(error, 'login');
        }
        const { data, error } = response;
        if (error) throw normalizeAuthError(error, 'login');

        try {
            return { user: await getProfileForUser(data.user), session: data.session };
        } catch (profileError) {
            // Do not leave a partially authenticated session when role/block status
            // could not be verified from the profile row.
            await sb.auth.signOut().catch(() => {});
            const normalized = new Error('PROFILE_LOOKUP_FAILED');
            normalized.code = 'PROFILE_LOOKUP_FAILED';
            normalized.cause = profileError;
            throw normalized;
        }
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
