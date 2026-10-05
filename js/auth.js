import { escapeHTML, money, isValidPhone, showToast } from './ui.js';
import { authService, getAuthDiagnosticMetadata, isAuthDiagnosticEnabled } from './services/auth-service.js';
import { state as s, ctx } from './state.js';
import { getProfileForUser } from './services/profile-service.js';
import { CONFIG } from './config.js';
import { storageService } from './services/storage-service.js';
import { isCustomerDesignPathOwnedBy } from './security.js';
export function initAuth() {
    const authModes = {
        login: ["login-submit", "register-switch", "forgot"],
        register: ["register-submit", "login-switch"],
        reset: ["reset-panel"],
        recovery: ["recovery-panel"],
        account: ["logout", "account-status", "account-history"]
    };
    let authPanelMode = "login";
    let authSubmissionInProgress = false;
    function setAuthPanelMode(mode = "login") {
        if (!Object.prototype.hasOwnProperty.call(authModes, mode)) mode = "login";
        authPanelMode = mode;
        const modal = document.getElementById("loginModal");
        if (modal) {
            modal.dataset.authMode = mode;
            modal.classList.remove("auth-mode-login", "auth-mode-register", "auth-mode-reset", "auth-mode-recovery", "auth-mode-account");
            modal.classList.add("auth-mode-" + mode);
            const visible = new Set(authModes[mode]);
            modal.querySelectorAll("[data-auth-element]").forEach(element => {
                const shown = visible.has(element.dataset.authElement);
                element.hidden = !shown;
                element.setAttribute("aria-hidden", String(!shown));
            });
            modal.querySelectorAll("[data-auth-field]").forEach(field => {
                const modes = (field.dataset.authField || "").split(/\s+/);
                const shown = modes.includes(mode);
                field.hidden = !shown;
                field.disabled = !shown || mode === "account";
                field.setAttribute("aria-hidden", String(!shown));
                if (field.id === "profilePassword") field.autocomplete = mode === "register" ? "new-password" : "current-password";
            });
        }
        document.getElementById("passwordResetPanel")?.classList.toggle("open", mode === "reset");
        document.getElementById("passwordRecoveryPanel")?.classList.toggle("open", mode === "recovery");
    }
    function setAuthSubmissionBusy(busy) {
        document.querySelectorAll('#loginModal [data-auth-element="register-submit"], #loginModal [data-auth-element="login-submit"]').forEach(button => {
            if (busy) {
                if (!button.dataset.authIdleLabel) button.dataset.authIdleLabel = button.textContent.trim();
                button.disabled = true;
                button.setAttribute("aria-busy", "true");
                button.textContent = button.dataset.authElement === "login-submit" ? "Giriş edilir..." : "Hesab yaradılır...";
            } else {
                button.disabled = false;
                button.removeAttribute("aria-busy");
                if (button.dataset.authIdleLabel) {
                    button.textContent = button.dataset.authIdleLabel;
                    delete button.dataset.authIdleLabel;
                }
            }
        });
    }
    function showRegisterForm() {
        if (authSubmissionInProgress) return;
        setAuthPanelMode("register");
        requestAnimationFrame(() => document.getElementById("profileName")?.focus());
    }
    function showLoginForm() {
        if (authSubmissionInProgress) return;
        setAuthPanelMode("login");
        requestAnimationFrame(() => document.getElementById("profileEmail")?.focus());
    }
    function getAuthFailureMessage(error, flow) {
        const message = String(error?.message || "").toLowerCase();
        const code = String(error?.code || "").toLowerCase();
        const signature = code + " " + message;

        // Log non-sensitive error metadata only; never log form values or credentials.
        console.error("F1 " + flow + " request failed", {
            code: error?.code || null,
            status: Number(error?.status) || null,
            name: error?.name || null
        });

        if (/email.?not.?confirmed|email_not_confirmed/.test(signature)) {
            return "E-poçt ünvanınız təsdiqlənməyib. Qeydiyyat e-poçtundakı keçidi açın, sonra yenidən daxil olun.";
        }
        if (flow === "register" && /already registered|user already exists|email_exists/.test(signature)) {
            return "Bu e-poçt ilə hesab artıq mövcud ola bilər. Daxil olun və ya şifrəni sıfırlayın.";
        }
        if (/failed to fetch|fetch failed|network|timeout|timed out/.test(message)) {
            return "Serverlə əlaqə qurulmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.";
        }
        if (flow === "login" && /invalid login credentials|invalid_credentials/.test(signature)) {
            return "Email və ya şifrə yanlışdır.";
        }
        if (flow === "register" && /weak password|password.*at least|password.*too short/.test(message)) {
            return "Şifrə çox zəifdir. Ən azı 8 simvol və daha güclü şifrə seçin.";
        }
        return flow === "register"
            ? "Qeydiyyat alınmadı. Məlumatları yoxlayıb bir az sonra yenidən cəhd edin."
            : "Giriş alınmadı. E-poçt və şifrəni yoxlayıb yenidən cəhd edin.";
    }

    function formatAuthDiagnosticValue(value) {
        return value === undefined ? "undefined" : value === null ? "null" : String(value).slice(0, 500);
    }

    function showLoginAuthDiagnostic(error) {
        if (!isAuthDiagnosticEnabled()) return;
        const details = getAuthDiagnosticMetadata(error);
        console.error("[AUTH DIAGNOSTIC] Login error metadata", details);

        const toast = document.getElementById("toast");
        if (!toast) return;
        let block = toast.querySelector(".auth-diagnostic");
        if (!block) {
            toast.appendChild(document.createElement("br"));
            block = document.createElement("pre");
            block.className = "auth-diagnostic";
            Object.assign(block.style, {
                whiteSpace: "pre-wrap",
                textAlign: "left",
                fontSize: "12px",
                lineHeight: "1.45",
                maxWidth: "min(80vw, 520px)",
                maxHeight: "180px",
                overflow: "auto",
                margin: "8px 0 0",
                padding: "8px 10px",
                borderRadius: "8px",
                background: "rgba(0, 0, 0, 0.08)"
            });
            toast.appendChild(block);
        }
        block.textContent = [
            "AUTH DIAGNOSTIC",
            `Name: ${formatAuthDiagnosticValue(details.name)}`,
            `Code: ${formatAuthDiagnosticValue(details.code)}`,
            `Status: ${formatAuthDiagnosticValue(details.status)}`,
            `Message: ${formatAuthDiagnosticValue(details.message)}`
        ].join("\n");
        clearTimeout(window.__toastTimer);
        window.__toastTimer = setTimeout(() => {
            toast.classList.remove("show");
            block.remove();
        }, 30000);
    }

    function submitAuthForm() {
        if (authPanelMode === "login") return loginAccount();
        if (authPanelMode === "register") return registerAccount();
        if (authPanelMode === "reset") return sendPasswordResetEmail();
        if (authPanelMode === "recovery") return updatePasswordFromRecovery();
    }

    setAuthPanelMode("login");
    authService.onAuthStateChange((event) => {
        if(event === "PASSWORD_RECOVERY"){
            s.passwordRecoveryMode = true;
            setTimeout(() => { ctx.openPasswordRecovery(); }, 0);
        }
    });
    async function openLogin() {
        if(s.passwordRecoveryMode){
            ctx.openPasswordRecovery();
            return;
        }
        setAuthPanelMode(s.authUser ? "account" : "login");
        if (s.authUser) {
            document.getElementById("profileName").value = s.authUser.name || "";
            document.getElementById("profilePhone").value = s.authUser.phone || "";
            document.getElementById("profileEmail").value = s.authUser.email || "";
        } else {
            ["profileName","profilePhone","profileEmail","profilePassword"].forEach(id => {
                const field = document.getElementById(id);
                if (field) field.value = "";
            });
        }
        await ctx.renderProfile();
        ctx.openDialog("loginModal", s.authUser ? "#logoutBtn" : "#profileEmail");
    }
    function closeLogin() {
        ctx.closeDialog("loginModal");
        if (!s.passwordRecoveryMode) {
            setAuthPanelMode(s.authUser ? "account" : "login");
            ["resetEmail","newPassword","newPasswordConfirm","profilePassword"].forEach(id => {
                const field = document.getElementById(id);
                if (field) field.value = "";
            });
        }
    }
    function showForgotPassword() {
        if (authSubmissionInProgress || s.authUser) return;
        setAuthPanelMode("reset");
        const email = document.getElementById("profileEmail")?.value.trim();
        const resetEmail = document.getElementById("resetEmail");
        if (resetEmail && email) resetEmail.value = email;
        requestAnimationFrame(() => document.getElementById("resetEmail")?.focus());
    }
    function hideForgotPassword() {
        setAuthPanelMode(s.authUser ? "account" : "login");
        requestAnimationFrame(() => document.getElementById("profileEmail")?.focus());
    }
    async function sendPasswordResetEmail(){
        const email=document.getElementById("resetEmail")?.value.trim();
        if(!/^\S+@\S+\.\S+$/.test(email)) return showToast("Düzgün e-poçt ünvanı daxil edin.");
        try{
            await ctx.api("/api/auth/reset-password",{method:"POST",body:JSON.stringify({email})});
            ctx.hideForgotPassword();
            showToast("📧 Əgər bu email hesabınıza bağlıdırsa, şifrə yeniləmə keçidi göndərildi.");
        }catch(e){
            console.error("Password reset request error",e);        showToast("Şifrə yeniləmə emaili göndərilə bilmədi. Supabase email ayarlarını yoxlayın.");
        }
    }
    function openPasswordRecovery(){
        setAuthPanelMode("recovery");
        ctx.openDialog("loginModal", "#newPassword");
        const status=document.getElementById("profileStatus");
        if(status) status.textContent="Şifrənizi yeniləmək üçün yeni şifrəni daxil edin.";
    }
    async function updatePasswordFromRecovery(){
        const password=document.getElementById("newPassword")?.value||"";
        const confirm=document.getElementById("newPasswordConfirm")?.value||"";
        if(password.length<8) return showToast("Yeni şifrə ən azı 8 simvol olmalıdır.");
        if(password!==confirm) return showToast("Yeni şifrələr eyni deyil.");
        try{
            const data=await ctx.api("/api/auth/update-password",{method:"POST",body:JSON.stringify({password})});
            if(data?.user){
                try{ s.authUser=await getProfileForUser(data.user); s.profile=s.authUser; }catch(_){}
            }
            s.passwordRecoveryMode=false;
            ["newPassword","newPasswordConfirm"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
            setAuthPanelMode(s.authUser ? "account" : "login");
            await ctx.renderProfile();
            await ctx.startAdminRealtime();
            showToast("✅ Şifrəniz uğurla yeniləndi.");
        }catch(e){
            console.error("Password update error",e);
            showToast("Şifrə yenilənmədi. Keçidin vaxtı bitmiş və ya etibarsız ola bilər.");
        }
    }
    async function registerAccount() {
        if (authSubmissionInProgress) return;
        const name=document.getElementById("profileName").value.trim(), phone=document.getElementById("profilePhone").value.trim(), email=document.getElementById("profileEmail").value.trim(), password=document.getElementById("profilePassword").value;
        if(name.length<2 || !isValidPhone(phone) || !/^\S+@\S+\.\S+$/.test(email) || password.length<8) return showToast("Ad, telefon, düzgün email və ən azı 8 simvolluq şifrə daxil edin.");
        authSubmissionInProgress = true;
        setAuthSubmissionBusy(true);
        try {
            try {
                const data=await ctx.api("/api/auth/register",{method:"POST",body:JSON.stringify({name,phone,email,password})});
                if(data?.session && data?.user){
                    s.authUser=data.user; s.profile=s.authUser;
                    await ctx.renderProfile(); await ctx.startAdminRealtime();
                    closeLogin();
                    showToast("Hesab yaradıldı və giriş edildi.");
                }else{
                    s.authUser=null; s.profile=null;
                    document.getElementById("profilePassword").value = "";
                    await ctx.renderProfile();
                    setAuthPanelMode("login");
                    showToast("✅ Hesab yaradıldı. E-poçtunuza gələn təsdiq keçidini açın, sonra giriş edin.");
                }
            } catch(e) {
                showToast(getAuthFailureMessage(e, "register"));
            }
        } finally {
            authSubmissionInProgress = false;
            setAuthSubmissionBusy(false);
        }
    }
    async function loginAccount() {
        if(s.passwordRecoveryMode) return showToast("Əvvəlcə yeni şifrənizi təyin edin.");
        if (authSubmissionInProgress) return;
        const email=document.getElementById("profileEmail").value.trim(), password=document.getElementById("profilePassword").value;
        if(!/^\S+@\S+\.\S+$/.test(email) || password.length<8) return showToast("Email və şifrəni düzgün daxil edin.");
        authSubmissionInProgress = true;
        setAuthSubmissionBusy(true);
        try {
            try {
                const data=await ctx.api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});
                if (isAuthDiagnosticEnabled()) {
                    console.info("[AUTH DIAGNOSTIC] Login result processed", {
                        resultKeys: Object.keys(data || {}),
                        hasUser: Boolean(data?.user),
                        hasSession: Boolean(data?.session)
                    });
                }
                if(data?.user?.blocked){
                    await ctx.api("/api/auth/logout",{method:"POST"}).catch(()=>{});
                    s.authUser=null; s.profile=null;
                    await ctx.renderProfile();
                    setAuthPanelMode("login");
                    return showToast("Bu hesab bloklanıb. Adminlə əlaqə saxlayın.");
                }
                s.authUser=data.user; s.profile=s.authUser;
                if (isAuthDiagnosticEnabled()) {
                    console.info("[AUTH DIAGNOSTIC] Session and account state updated", {
                        hasUser: Boolean(s.authUser),
                        hasSession: Boolean(data?.session)
                    });
                }
                await ctx.renderProfile(); await ctx.startAdminRealtime();
                closeLogin();
                showToast("Giriş edildi.");
            } catch(e) {
                showToast(getAuthFailureMessage(e, "login"));
                showLoginAuthDiagnostic(e);
            }
        } finally {
            authSubmissionInProgress = false;
            setAuthSubmissionBusy(false);
        }
    }
    async function logoutProfile() {
        await ctx.api("/api/auth/logout",{method:"POST"}).catch(()=>{});
        s.authUser=null; s.profile=null; s.orders=[]; s.passwordRecoveryMode=false;
        ctx.stopAdminRealtime(); s.adminUnreadOrders=0; ctx.updateAdminNotifBadge();
        ["resetEmail","newPassword","newPasswordConfirm","profileName","profilePhone","profileEmail","profilePassword"].forEach(id=>{
            const field=document.getElementById(id); if(field) field.value="";
        });
        setAuthPanelMode("login");
        await ctx.renderProfile();
        showToast("Hesabdan çıxıldı.");
    }
    async function loadCurrentUser() {
        try {
            const data=await ctx.api("/api/me");
            if(data?.user?.blocked){ await ctx.api("/api/auth/logout",{method:"POST"}).catch(()=>{}); s.authUser=null; s.profile=null; ctx.stopAdminRealtime(); await ctx.renderProfile(); showToast("Bu hesab bloklanıb. Adminlə əlaqə saxlayın."); return; }
            s.authUser=data.user; s.profile=data.user; await ctx.renderProfile(); await ctx.startAdminRealtime();
        } catch (_) { s.authUser=null; s.profile=null; ctx.stopAdminRealtime(); await ctx.renderProfile(); }
    }
    async function renderProfile() {
        const modal=document.getElementById("loginModal");
        if (!modal?.classList.contains("open") && !s.passwordRecoveryMode) setAuthPanelMode(s.authUser ? "account" : "login");
        const status=document.getElementById("profileStatus"), logout=document.getElementById("logoutBtn");
        status.textContent=s.authUser ? `Aktiv hesab: ${s.authUser.name} (${s.authUser.email})` : "Hesaba giriş edilməyib.";
        logout.style.display=s.authUser ? "block" : "none";
        const forgot=document.getElementById("forgotPasswordBtn");
        if(forgot) forgot.style.display=s.authUser ? "none" : "inline-block";
        const loginBtn=document.querySelector('.actions [data-action="openLogin"]');
        if (loginBtn) {
            const label = s.authUser ? "Hesabım" : "Giriş / Profil";
            loginBtn.setAttribute("aria-label", label);
            loginBtn.setAttribute("title", label);
        }
        ctx.updateAdminButton();
        await ctx.renderOrderHistory();
    }
    function customerOrderStatusLabel(status){
        return ({pending_confirmation:'Təsdiq gözləyir',confirmed:'Təsdiqləndi',preparing:'Hazırlanır',ready:'Hazırdır',shipped:'Göndərildi',completed:'Tamamlandı',cancelled:'Ləğv edildi'})[status] || status || 'Naməlum';
    }
    function openOrderWhatsApp(orderCode){
        const digits=String(CONFIG.whatsappNumber||'').replace(/\D/g,'');
        if(!digits) return showToast('WhatsApp nömrəsi hələ təyin edilməyib.');
        const code=String(orderCode||'').trim();
        const url=`https://wa.me/${digits}?text=${encodeURIComponent(`Salam! F1 Studio sifarişim barədə məlumat almaq istəyirəm. Sifariş kodu: ${code}`)}`;
        window.open(url,'_blank','noopener,noreferrer');
    }
    async function openCustomerDesign(path){
        const userId=s.authUser?.id||'';
        if(!isCustomerDesignPathOwnedBy(path,userId)) return showToast('Dizayn faylına giriş icazəsi yoxdur.');
        try{
            const url=await storageService.createCustomerDesignSignedUrl(path,900);
            window.open(url,'_blank','noopener,noreferrer');
        }catch(error){
            console.error('Customer design access error:',error);
            showToast('Dizayn faylı açıla bilmədi.');
        }
    }
    async function renderOrderHistory(){
        const box=document.getElementById("orderHistory"); if(!box) return;
        if(!s.authUser){ box.innerHTML='<div class="form-help">Sifariş tarixçəsini görmək üçün hesaba daxil olun.</div>'; return; }
        let loadError=false;
        try { const data=await ctx.api("/api/me/orders"); s.orders=data.orders||[]; } catch (error) {
            console.error('Customer order history error:', error);
            s.orders=[];
            loadError=true;
        }
        if(loadError){
            box.innerHTML='<div class="customer-order-error"><div><b>Sifarişlər yüklənmədi.</b><span>Bağlantını yoxlayıb yenidən cəhd edə bilərsən.</span></div><button type="button" class="order-wa-btn" data-action="renderOrderHistory">↻ Yenilə</button></div>';
            return;
        }
        if(!s.orders.length){ box.innerHTML='<div class="customer-cabinet-empty"><div><b>Hələ sifariş yoxdur.</b><span>Məhsul seçib səbətdən ilk sifarişini yarada bilərsən.</span></div><button type="button" class="order-wa-btn" data-action="renderOrderHistory">↻ Yenilə</button></div>'; return; }
        const active=s.orders.filter(o=>!['completed','cancelled'].includes(o.status)).length;
        const completed=s.orders.filter(o=>o.status==='completed').length;
        const total=s.orders.reduce((sum,o)=>sum+(Number(o.total_cents)||0),0)/100;
        const stages=['confirmed','preparing','ready','shipped','completed'];
        box.innerHTML=`<div class="customer-cabinet-head"><div><h4>🧾 Sifarişlərim</h4><span>${s.orders.length} sifariş · ${active} aktiv</span></div><div class="customer-cabinet-head-actions"><div class="customer-cabinet-stats"><span><b>${completed}</b> tamamlanan</span><span><b>${money(total)}</b> ümumi</span></div><button type="button" class="order-wa-btn" data-action="renderOrderHistory">↻ Yenilə</button></div></div>`+s.orders.slice(0,20).map(o=>{
            const code=escapeHTML(o.orderCode||o.order_code||'');
            const date=escapeHTML(o.createdAt ? new Date(o.createdAt).toLocaleString("az-AZ") : '');
            const items=(o.items||[]).map(i=>`${escapeHTML(i.name||i.product_name||'Məhsul')} × ${Number(i.qty)||1}`).join(', ');
            const activeIndex=stages.indexOf(o.status);
            const progress=(o.status==='pending_confirmation') ? 0 : (o.status==='cancelled' ? 0 : Math.max(0,Math.min(5,activeIndex+1)));
            const steps=stages.map((stage,idx)=>`<span class="customer-step ${o.status==='cancelled'?'cancelled':idx<progress?'done':idx===progress-1?'current':''}" title="${escapeHTML(customerOrderStatusLabel(stage))}"></span>`).join('');
            const designLinks=(o.items||[]).flatMap(i=>{const path=i.customization?.imagePath;if(!path||!isCustomerDesignPathOwnedBy(path,s.authUser?.id))return [];return [`<button type="button" class="order-design-link" data-action="openCustomerDesign" data-action-args='[${JSON.stringify(path)}]'>🎨 Dizayn faylına bax</button>`];}).join('');
            return `<article class="order-row customer-order-card"><div class="customer-order-top"><div><b>${code}</b><div class="customer-order-date">${date}</div></div><span class="customer-order-status ${o.status==='cancelled'?'is-cancelled':o.status==='completed'?'is-complete':''}">${escapeHTML(customerOrderStatusLabel(o.status))}</span></div><div class="customer-order-progress">${steps}</div><div class="customer-order-items">${items||'Məhsul məlumatı yoxdur'}</div><div class="customer-order-bottom"><b>${money((Number(o.total_cents)||0)/100)}</b><div class="customer-order-actions">${designLinks}<button type="button" class="order-wa-btn" data-action="openOrderWhatsApp" data-action-args='[${JSON.stringify(o.orderCode||o.order_code||'')}]'>💬 WhatsApp</button></div></div></article>`;
        }).join('');
    }
    Object.assign(ctx, {
    openLogin,
    closeLogin,
    showRegisterForm,
    showLoginForm,
    submitAuthForm,
    showForgotPassword,
    hideForgotPassword,
    sendPasswordResetEmail,
    openPasswordRecovery,
    updatePasswordFromRecovery,
    registerAccount,
    loginAccount,
    logoutProfile,
    loadCurrentUser,
    renderProfile,
    renderOrderHistory,
    openOrderWhatsApp,
    openCustomerDesign
    });
}
