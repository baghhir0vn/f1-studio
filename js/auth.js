import { escapeHTML, money, isValidPhone, showToast } from './ui.js';
import { authService } from './services/auth-service.js?v=2';
import { state as s, ctx } from './state.js';
import { getProfileForUser } from './services/profile-service.js';
import { CONFIG } from './config.js';
import { storageService } from './services/storage-service.js';
import { isCustomerDesignPathOwnedBy } from './security.js';
export function initAuth() {
    function setAuthPanelMode(mode = "login") {
        const resetPanel = document.getElementById("passwordResetPanel");
        const recoveryPanel = document.getElementById("passwordRecoveryPanel");
        resetPanel?.classList.toggle("open", mode === "reset");
        recoveryPanel?.classList.toggle("open", mode === "recovery");
        ["profilePassword", "profileName", "profilePhone", "profileEmail"].forEach(id => {
            const field = document.getElementById(id);
            if (field) field.disabled = mode === "recovery";
        });
        const forgot = document.getElementById("forgotPasswordBtn");
        if (forgot) forgot.disabled = mode === "recovery";
    }
    setAuthPanelMode("login");

    let authSubmissionInProgress = false;
    function setAuthSubmissionBusy(busy) {
        document.querySelectorAll('#loginModal [data-action="registerAccount"], #loginModal [data-action="loginAccount"]').forEach(button => {
            if (busy) {
                if (!button.dataset.authIdleLabel) button.dataset.authIdleLabel = button.textContent.trim();
                button.disabled = true;
                button.setAttribute("aria-busy", "true");
                button.textContent = button.dataset.action === "loginAccount" ? "Giriş edilir..." : "Hesab yaradılır...";
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
        setAuthPanelMode("login");
        if (s.authUser) {
            ctx.openAccountPage?.();
            return;
        }
        ["profileName","profilePhone","profileEmail","profilePassword"].forEach(id => document.getElementById(id).value = "");
        await ctx.renderProfile();
        ctx.openDialog("loginModal", "#profileName");
    }
    function closeLogin() {
        ctx.closeDialog("loginModal");
        if (!s.passwordRecoveryMode) setAuthPanelMode("login");
    }
    function showForgotPassword(){
        setAuthPanelMode("reset");
        const email=document.getElementById("profileEmail")?.value.trim();
        const resetEmail=document.getElementById("resetEmail");
        if(resetEmail && email) resetEmail.value=email;
    }
    function hideForgotPassword(){
        setAuthPanelMode("login");
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
            setAuthPanelMode("login");
            await ctx.renderProfile();
            await ctx.startAdminRealtime();
            showToast("✅ Şifrəniz uğurla yeniləndi.");
        }catch(e){
            console.error("Password update error",e);
            showToast("Şifrə yenilənmədi. Keçidin vaxtı bitmiş və ya etibarsız ola bilər.");
        }
    }
    async function registerAccount() {
        const name=document.getElementById("profileName").value.trim(), phone=document.getElementById("profilePhone").value.trim(), email=document.getElementById("profileEmail").value.trim(), password=document.getElementById("profilePassword").value;
        if(name.length<2 || !isValidPhone(phone) || !/^\S+@\S+\.\S+$/.test(email) || password.length<8) return showToast("Ad, telefon, düzgün email və ən azı 8 simvolluq şifrə daxil edin.");
        if (authSubmissionInProgress) return;
        authSubmissionInProgress = true;
        setAuthSubmissionBusy(true);
        try {
            const data=await ctx.api("/api/auth/register",{method:"POST",body:JSON.stringify({name,phone,email,password})});
            if(data?.session && data?.user){
                s.authUser=data.user; s.profile=s.authUser;
                await ctx.renderProfile(); await ctx.startAdminRealtime();
                await ctx.closeLogin();
                ctx.openAccountPage?.();
                showToast("Hesab yaradıldı və giriş edildi.");
            }else{
                s.authUser=null; s.profile=null;
                await ctx.renderProfile();
                showToast("✅ Hesab yaradıldı. E-poçtunuza gələn təsdiq keçidini açın, sonra giriş edin.");
            }
        } catch(e) {
            const errorCode = e?.code || e?.message;
            const messages = {
                EMAIL_EXISTS: "Bu email artıq qeydiyyatdadır.",
                AUTH_RATE_LIMITED: "Çox cəhd edildi. Bir az gözləyib yenidən yoxlayın.",
                AUTH_NETWORK_ERROR: "Bağlantı xətası. İnterneti yoxlayıb yenidən cəhd edin.",
                REGISTER_FAILED: "Qeydiyyat tamamlanmadı. Məlumatları yoxlayıb yenidən cəhd edin."
            };
            showToast(messages[errorCode] || "Qeydiyyat alınmadı. Məlumatları yoxlayıb yenidən cəhd edin.");
        } finally {
            authSubmissionInProgress = false;
            setAuthSubmissionBusy(false);
        }
    }
    async function loginAccount() {
        if(s.passwordRecoveryMode) return showToast("Əvvəlcə yeni şifrənizi təyin edin.");
        const email=document.getElementById("profileEmail").value.trim(), password=document.getElementById("profilePassword").value;
        if(!/^\S+@\S+\.\S+$/.test(email) || password.length<8) return showToast("Email və şifrəni düzgün daxil edin.");
        if (authSubmissionInProgress) return;
        authSubmissionInProgress = true;
        setAuthSubmissionBusy(true);
        try {
            const data=await ctx.api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});
            if(data?.user?.blocked){ await ctx.api("/api/auth/logout",{method:"POST"}).catch(()=>{}); s.authUser=null; s.profile=null; await ctx.renderProfile(); return showToast("Bu hesab bloklanıb. Adminlə əlaqə saxlayın."); }
            s.authUser=data.user; s.profile=s.authUser; await ctx.renderProfile(); await ctx.startAdminRealtime(); await ctx.closeLogin(); ctx.openAccountPage?.(); showToast("Giriş edildi.");
        } catch(e) {
            const errorCode = e?.code || e?.message;
            const messages = {
                INVALID_CREDENTIALS: "Email və ya şifrə yanlışdır.",
                EMAIL_NOT_CONFIRMED: "Girişdən əvvəl e-poçt ünvanınızı təsdiqləyin.",
                AUTH_RATE_LIMITED: "Çox cəhd edildi. Bir az gözləyib yenidən yoxlayın.",
                AUTH_NETWORK_ERROR: "Bağlantı xətası. İnterneti yoxlayıb yenidən cəhd edin.",
                PROFILE_LOOKUP_FAILED: "Giriş təsdiqlənmədi: profil məlumatları təhlükəsiz yoxlanmadı. Bir az sonra yenidən cəhd edin.",
                LOGIN_FAILED: "Giriş tamamlanmadı. Məlumatları yoxlayıb yenidən cəhd edin."
            };
            showToast(messages[errorCode] || "Giriş zamanı xəta oldu. Bir az sonra yenidən cəhd edin.");
        } finally {
            authSubmissionInProgress = false;
            setAuthSubmissionBusy(false);
        }
    }
    async function logoutProfile() {
        await ctx.api("/api/auth/logout",{method:"POST"}).catch(()=>{});
        s.authUser=null; s.profile=null; s.orders=[]; s.passwordRecoveryMode=false;
        ctx.stopAdminRealtime(); s.adminUnreadOrders=0; ctx.updateAdminNotifBadge();
        setAuthPanelMode("login");
        s.accountShowAllOrders=false;
        ctx.renderProfile();
        if (window.location.hash === "#account") window.location.hash = "#home";
        ["profileName","profilePhone","profileEmail","profilePassword"].forEach(id => document.getElementById(id).value="");
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
        const status=document.getElementById("profileStatus"), logout=document.getElementById("logoutBtn");
        status.textContent=s.authUser ? `Aktiv hesab: ${s.authUser.name} (${s.authUser.email})` : "Hesaba giriş edilməyib.";
        logout.style.display=s.authUser ? "block" : "none";
        const forgot=document.getElementById("forgotPasswordBtn");
        if(forgot) forgot.style.display=s.authUser ? "none" : "inline-block";
        const loginBtn=document.querySelector('.actions .btn-login[data-action="openLogin"]');
        if (loginBtn) loginBtn.textContent=s.authUser ? `👤 ${s.authUser.name.split(" ")[0]}` : "👤 Giriş";
        ctx.updateAdminButton();
        s.accountAuthResolved = true;
        await ctx.renderOrderHistory();
        ctx.syncAccountRoute?.();
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
        if(!s.authUser){ s.accountOrdersFetched=false; s.accountOrdersLoadError=false; s.orders=[]; box.innerHTML='<div class="form-help">Sifariş tarixçəsini görmək üçün hesaba daxil olun.</div>'; return; }
        let loadError=false;
        s.accountOrdersFetched=false;
        s.accountOrdersLoadError=false;
        try { const data=await ctx.api("/api/me/orders"); s.orders=data.orders||[]; s.accountOrdersFetched=true; } catch (error) {
            console.error('Customer order history error:', error);
            s.orders=[];
            s.accountOrdersFetched=true;
            s.accountOrdersLoadError=true;
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
