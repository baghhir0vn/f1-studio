import { sb } from '../config.js';
import { getProfileForUser } from './profile-service.js';
import { isSafeCustomerAvatarPath } from '../security.js';
function getPasswordResetRedirect() {
    const origin = window.location.origin;
    return /^https?:\/\//i.test(origin) ? `${origin}/` : null;
}

const AUTH_DIAGNOSTIC_HOST = "f1studio-nine.vercel.app";
const AUTH_DIAGNOSTIC_FIELDS = ["name", "message", "code", "status", "statusCode", "error", "error_description"];

export function isAuthDiagnosticEnabled() {
    return typeof window !== "undefined" && window.location.hostname === AUTH_DIAGNOSTIC_HOST;
}

function redactAuthDiagnosticValue(value) {
    if (value === undefined || value === null) return value;
    if (typeof value === "number" || typeof value === "boolean") return value;
    let text;
    try {
        text = typeof value === "string" ? value : JSON.stringify(value);
    } catch (_) {
        text = String(value);
    }
    return String(text ?? "")
        .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
        .replace(/(access_token|refresh_token|id_token|token|api[_-]?key|password)["']?\s*[:=]\s*["']?[^"'&\s,;]+/gi, "$1=[REDACTED]")
        .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_TOKEN]")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
        .slice(0, 500);
}

export function getAuthDiagnosticMetadata(error) {
    const metadata = {};
    for (const field of AUTH_DIAGNOSTIC_FIELDS) {
        let value;
        try {
            value = error?.[field];
        } catch (_) {
            value = "[unavailable]";
        }
        metadata[field] = redactAuthDiagnosticValue(value);
    }
    return metadata;
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
    async resendSignupConfirmation(email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) throw new Error('INVALID_AUTH_INPUT');
        const redirectTo = getPasswordResetRedirect();
        const options = redirectTo ? { emailRedirectTo: redirectTo } : {};
        const { error } = await sb.auth.resend({ type: 'signup', email: cleanEmail, options });
        if (error) throw error;
        return { ok: true };
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
        // With email confirmation enabled, Supabase returns a user but no session.
        // Do not query the RLS-protected profiles table as an anonymous user; the
        // caller only needs the session to distinguish immediate login from confirmation.
        const profile = data.session && data.user ? await getProfileForUser(data.user) : null;
        return { user: profile, session: data.session };
    },
    async login(email, password) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!cleanEmail || String(password || '').length > 128) throw new Error('INVALID_AUTH_INPUT');
        const diagnosticEnabled = isAuthDiagnosticEnabled();
        if (diagnosticEnabled) console.info("[AUTH DIAGNOSTIC] Supabase request started");

        let authResult;
        try {
            authResult = await sb.auth.signInWithPassword({ email: cleanEmail, password });
        } catch (error) {
            if (diagnosticEnabled) {
                console.error("[AUTH DIAGNOSTIC] Supabase request rejected", getAuthDiagnosticMetadata(error));
            }
            throw error;
        }

        const { data, error } = authResult;
        if (diagnosticEnabled) {
            console.info("[AUTH DIAGNOSTIC] Supabase response received", error
                ? getAuthDiagnosticMetadata(error)
                : { name: undefined, message: undefined, code: undefined, status: undefined, statusCode: undefined, error: undefined, error_description: undefined, hasUser: Boolean(data?.user), hasSession: Boolean(data?.session) });
        }
        if (error) throw error;
        return { user: await getProfileForUser(data.user), session: data.session };
    },
    async updateProfileAvatar({ avatarPath = null, avatarTemplate = null } = {}) {
        const { data: currentData, error: currentError } = await sb.auth.getUser();
        const currentUser = currentData?.user;
        if (currentError || !currentUser?.id) throw new Error('AUTH_REQUIRED');
        const templateIds = new Set(['portrait-1', 'portrait-2', 'portrait-3', 'portrait-4', 'portrait-5', 'portrait-6']);
        const cleanPath = typeof avatarPath === 'string' ? avatarPath : '';
        const cleanTemplate = typeof avatarTemplate === 'string' ? avatarTemplate : '';
        if (cleanPath && !isSafeCustomerAvatarPath(cleanPath, currentUser.id)) throw new Error('INVALID_AVATAR_PATH');
        if (!cleanPath && !templateIds.has(cleanTemplate)) throw new Error('INVALID_AVATAR_TEMPLATE');
        const metadata = currentUser.user_metadata && typeof currentUser.user_metadata === 'object' ? currentUser.user_metadata : {};
        const { data, error } = await sb.auth.updateUser({
            data: {
                ...metadata,
                profile_avatar_path: cleanPath || null,
                profile_avatar_template: cleanPath ? null : cleanTemplate
            }
        });
        if (error || !data?.user) throw error || new Error('AVATAR_UPDATE_FAILED');
        return { user: await getProfileForUser(data.user) };
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
