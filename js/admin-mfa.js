import { CONFIG } from './config.js';
import { state as s, ctx } from './state.js';
import { showToast } from './ui.js';
import { adminMfaService } from './services/admin-mfa-service.js';

const isAdminProfile = () => s.authUser?.role === 'admin' && s.authUser?.blocked !== true;
const byId = id => document.getElementById(id);
const show = (id, visible) => { const el = byId(id); if (el) el.hidden = !visible; };
const setStatus = (text, isError = false) => {
    const el = byId('adminMfaStatus');
    if (el) { el.textContent = text; el.dataset.error = isError ? 'true' : 'false'; }
};

export function initAdminMfa() {
    let pendingFactorId = null;
    let stage = 'loading';
    let busy = false;
    let accountId = null;
    let managed = false;
    let checkVersion = 0;

    function resetSensitiveUi() {
        pendingFactorId = null;
        const qr = byId('adminMfaQr');
        if (qr) { qr.removeAttribute('src'); qr.hidden = true; }
        const secret = byId('adminMfaSecret');
        if (secret) secret.textContent = '';
        const code = byId('adminMfaCode');
        if (code) code.value = '';
        show('adminMfaSetupDetails', false);
        show('adminMfaCodeRow', false);
    }
    function setBusy(value) {
        busy = value;
        ['adminMfaStart', 'adminMfaSubmit', 'adminMfaAddBackup'].forEach(id => {
            const button = byId(id);
            if (button) button.disabled = value;
        });
    }
    function renderStage(next) {
        stage = next;
        show('adminMfaSetup', next === 'setup');
        show('adminMfaStart', next === 'setup');
        show('adminMfaChallenge', next === 'challenge');
        show('adminMfaSecured', next === 'secured');
        show('adminMfaRetry', next === 'error');
        if (next !== 'enrolling') show('adminMfaCodeRow', next === 'challenge');
    }
    function refreshAdminControls(assured) {
        s.adminMfaAssured = Boolean(assured && isAdminProfile());
        ctx.updateAdminButton?.();
        if (!s.adminMfaAssured) ctx.stopAdminRealtime?.();
    }
    function closeAdminMfa() {
        // Closing the prompt NEVER grants admin access.
        // The DB AAL2 policy will enforce MFA when the release is approved.
        ++checkVersion; // Invalidate any pending enrollment/verification callbacks.
        setBusy(false);
        resetSensitiveUi();
        managed = false;
        ctx.closeDialog?.('adminMfaModal');
    }
    async function checkAdminMfa({ prompt = true } = {}) {
        if (CONFIG.adminMfaEnabled !== true) return;
        const userId = s.authUser?.id || null;
        const version = ++checkVersion;
        accountId = userId;
        setBusy(false);
        resetSensitiveUi();
        if (!isAdminProfile()) {
            refreshAdminControls(false);
            ctx.closeDialog?.('adminMfaModal');
            return;
        }
        refreshAdminControls(false);
        renderStage('loading');
        setStatus('İkinci mərhələ yoxlanılır...');
        try {
            const [assurance, verifiedFactors] = await Promise.all([
                adminMfaService.assurance(), adminMfaService.factors()
            ]);
            if (version !== checkVersion || userId !== s.authUser?.id) return; // Reject stale account/session responses.
            if (assurance.currentLevel === 'aal2' && verifiedFactors.length) {
                refreshAdminControls(true);
                renderStage('secured');
                setStatus('Admin iki mərhələli təsdiqdən keçib.');
                if (!managed) ctx.closeDialog?.('adminMfaModal');
                await ctx.startAdminRealtime?.();
                return;
            }
            refreshAdminControls(false);
            if (verifiedFactors.length) {
                const select = byId('adminMfaFactor');
                if (select) {
                    select.replaceChildren(...verifiedFactors.map((factor, i) => {
                        const option = document.createElement('option');
                        option.value = factor.id;
                        option.textContent = factor.friendly_name || `Təsdiqləyici cihaz ${i + 1}`;
                        return option;
                    }));
                }
                renderStage('challenge');
                setStatus('Authenticator tətbiqinizdəki 6 rəqəmli kodu daxil edin.');
            } else {
                renderStage('setup');
                setStatus('Admin girişini qorumaq üçün authenticator tətbiqi qoşun.');
            }
            if (prompt) ctx.openDialog?.('adminMfaModal', '#adminMfaStart');
        } catch {
            if (version !== checkVersion || userId !== s.authUser?.id) return;
            refreshAdminControls(false);
            renderStage('error');
            setStatus('MFA vəziyyəti yoxlanılmadı. Yenidən cəhd edin.', true);
            if (prompt) ctx.openDialog?.('adminMfaModal', '#adminMfaRetryButton');
        }
    }
    async function openAdminMfaManager() {
        if (CONFIG.adminMfaEnabled !== true || !isAdminProfile()) return;
        managed = true;
        ctx.openDialog?.('adminMfaModal', '#adminMfaClose');
        await checkAdminMfa({ prompt: false });
    }
    async function promptAdminMfa() {
        if (CONFIG.adminMfaEnabled !== true || !isAdminProfile()) return;
        managed = false;
        ctx.closeDialog?.('loginModal');
        ctx.openDialog?.('adminMfaModal', '#adminMfaClose');
        await checkAdminMfa({ prompt: false });
    }
    async function startAdminMfaEnrollment() {
        if (!isAdminProfile() || busy) return;
        // Once a factor is pending, do not create additional unused secrets on repeated clicks.
        if (pendingFactorId) return;
        const userId = s.authUser?.id;
        const version = checkVersion;
        setBusy(true);
        try {
            const result = await adminMfaService.startEnrollment();
            if (version !== checkVersion || userId !== s.authUser?.id || userId !== accountId) return;
            pendingFactorId = result.factorId;
            const qr = byId('adminMfaQr');
            if (qr) {
                // Supabase returns a data: SVG QR image; never interpolate SVG into HTML.
                if (!/^data:image\/svg\+xml[;,]/i.test(result.qr)) throw new Error('MFA_QR_INVALID');
                qr.src = result.qr;
                qr.hidden = false;
            }
            const secret = byId('adminMfaSecret');
            if (secret) secret.textContent = result.secret;
            show('adminMfaSetup', true);
            show('adminMfaSetupDetails', true);
            show('adminMfaCodeRow', true);
            show('adminMfaStart', false);
            stage = 'enrolling';
            setStatus('QR-ni telefonunuzdakı authenticator tətbiqi ilə skan edin. Sonra 6 rəqəmli kodu daxil edin.');
            byId('adminMfaCode')?.focus();
        } catch {
            if (version !== checkVersion || userId !== s.authUser?.id) return;
            resetSensitiveUi();
            show('adminMfaStart', true);
            setStatus('QR yaradılmadı. Yenidən cəhd edin.', true);
        } finally { if (version === checkVersion) setBusy(false); }
    }
    async function submitAdminMfaCode() {
        if (!isAdminProfile() || busy) return;
        const code = (byId('adminMfaCode')?.value || '').trim();
        if (!/^[0-9]{6}$/.test(code)) {
            setStatus('Tam 6 rəqəmli təsdiq kodu daxil edin.', true);
            return;
        }
        const factorId = stage === 'enrolling'
            ? pendingFactorId : byId('adminMfaFactor')?.value;
        if (!factorId) return setStatus('MFA cihazı seçilməyib.', true);
        const userId = s.authUser?.id;
        const version = checkVersion;
        setBusy(true);
        try {
            await adminMfaService.verify(factorId, code);
            if (version !== checkVersion || userId !== s.authUser?.id || userId !== accountId) return;
            resetSensitiveUi();
            refreshAdminControls(true);
            renderStage('secured');
            setStatus('İki mərhələli təsdiq uğurla tamamlandı. Admin girişi aktivdir.');
            await ctx.startAdminRealtime?.();
            showToast('🔐 Admin MFA təsdiqləndi.');
            if (!managed) closeAdminMfa();
        } catch {
            if (version !== checkVersion || userId !== s.authUser?.id) return;
            const el = byId('adminMfaCode');
            if (el) el.value = '';
            setStatus('Kod qəbul edilmədi və ya vaxtı bitdi. Yeni kodla təkrar yoxlayın.', true);
        } finally { if (version === checkVersion) setBusy(false); }
    }
    async function addAdminMfaBackup() {
        if (!isAdminProfile() || !s.adminMfaAssured || busy) return;
        // Requires already-verified MFA. Use a DIFFERENT device for redundancy.
        ++checkVersion;
        resetSensitiveUi();
        renderStage('setup');
        show('adminMfaStart', true);
        setStatus('İkinci, ayrıca cihaz əlavə edin. Hər iki cihazı bir yerdə saxlamayın.');
    }
    function resetAdminMfaState() {
        accountId = null;
        ++checkVersion;
        managed = false;
        setBusy(false);
        resetSensitiveUi();
        refreshAdminControls(false);
        ctx.closeDialog?.('adminMfaModal');
    }
    Object.assign(ctx, {
        checkAdminMfa,
        promptAdminMfa,
        openAdminMfaManager,
        closeAdminMfa,
        startAdminMfaEnrollment,
        submitAdminMfaCode,
        addAdminMfaBackup,
        resetAdminMfaState
    });
}
