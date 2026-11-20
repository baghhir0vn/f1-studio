import { sb } from '../config.js';

function unwrap(result) {
    if (result?.error) throw result.error;
    if (!result?.data) throw new Error('MFA_RESPONSE_INVALID');
    return result.data;
}
export const adminMfaService = {
    async assurance() {
        return unwrap(await sb.auth.mfa.getAuthenticatorAssuranceLevel());
    },
    async factors() {
        const data = unwrap(await sb.auth.mfa.listFactors());
        return (Array.isArray(data.totp) ? data.totp : [])
            .filter(factor => factor?.status === 'verified' && typeof factor.id === 'string');
    },
    async startEnrollment() {
        const data = unwrap(await sb.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'F1 Studio Admin TOTP'
        }));
        if (!data.id || !data.totp?.qr_code || !data.totp?.secret) {
            throw new Error('MFA_ENROLLMENT_INVALID');
        }
        return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
    },
    async verify(factorId, code) {
        if (typeof factorId !== 'string' || !/^[a-f0-9-]{36}$/i.test(factorId)
            || typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) {
            throw new Error('MFA_CODE_INVALID');
        }
        const challenge = unwrap(await sb.auth.mfa.challenge({ factorId }));
        if (!challenge.id) throw new Error('MFA_CHALLENGE_INVALID');
        unwrap(await sb.auth.mfa.verify({ factorId, challengeId: challenge.id, code }));
        const assurance = await this.assurance();
        if (assurance.currentLevel !== 'aal2') throw new Error('MFA_ASSURANCE_NOT_UPGRADED');
        return assurance;
    }
};
