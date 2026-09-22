import { escapeHTML, money, isValidPhone, showToast } from './ui.js';
import { authService } from './services/auth-service.js';
import { state as s, ctx } from './state.js';
import { getProfileForUser } from './services/profile-service.js';

export function initAuth() {
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
        if (s.authUser) {
            document.getElementById("profileName").value = s.authUser.name || "";
            document.getElementById("profilePhone").value = s.authUser.phone || "";
            document.getElementById("profileEmail").value = s.authUser.email || "";
        } else {
            ["profileName","profilePhone","profileEmail","profilePassword"].forEach(id => document.getElementById(id).value = "");
        }
        await ctx.renderProfile();
        ctx.openDialog("loginModal", "#profileName");
    }
    
    function closeLogin() { ctx.closeDialog("loginModal"); }
    
    function showForgotPassword(){
        const panel=document.getElementById("passwordResetPanel");
        const recovery=document.getElementById("passwordRecoveryPanel");
        if(recovery) recovery.classList.remove("open");
        if(panel) panel.classList.add("open");
        const email=document.getElementById("profileEmail")?.value.trim();
        const resetEmail=document.getElementById("resetEmail");
        if(resetEmail && email) resetEmail.value=email;
    }
    
    function hideForgotPassword(){
        document.getElementById("passwordResetPanel")?.classList.remove("open");
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
        document.getElementById("passwordResetPanel")?.classList.remove("open");
        document.getElementById("passwordRecoveryPanel")?.classList.add("open");
        document.getElementById("profilePassword")?.setAttribute("disabled","disabled");
        document.getElementById("profileName")?.setAttribute("disabled","disabled");
        document.getElementById("profilePhone")?.setAttribute("disabled","disabled");
        document.getElementById("profileEmail")?.setAttribute("disabled","disabled");
        document.getElementById("forgotPasswordBtn")?.setAttribute("disabled","true");
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
            ["profilePassword","profileName","profilePhone","profileEmail"].forEach(id=>document.getElementById(id)?.removeAttribute("disabled"));
            document.getElementById("forgotPasswordBtn")?.removeAttribute("disabled");
            document.getElementById("passwordRecoveryPanel")?.classList.remove("open");
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
        try {
            const data=await ctx.api("/api/auth/register",{method:"POST",body:JSON.stringify({name,phone,email,password})});
            if(data?.session && data?.user){
                s.authUser=data.user; s.profile=s.authUser;
                await ctx.renderProfile(); await ctx.startAdminRealtime();
                showToast("Hesab yaradıldı və giriş edildi.");
            }else{
                s.authUser=null; s.profile=null;
                await ctx.renderProfile();
                showToast("✅ Hesab yaradıldı. E-poçtunuza gələn təsdiq keçidini açın, sonra giriş edin.");
            }
        } catch(e) {
            showToast(e.message === "EMAIL_EXISTS" ? "Bu email artıq qeydiyyatdadır." : "Qeydiyyat alınmadı.");
        }
    }
    
    async function loginAccount() {
        if(s.passwordRecoveryMode) return showToast("Əvvəlcə yeni şifrənizi təyin edin.");
        const email=document.getElementById("profileEmail").value.trim(), password=document.getElementById("profilePassword").value;
        if(!/^\S+@\S+\.\S+$/.test(email) || password.length<8) return showToast("Email və şifrəni düzgün daxil edin.");
        try {
            const data=await ctx.api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});
            if(data?.user?.blocked){ await ctx.api("/api/auth/logout",{method:"POST"}).catch(()=>{}); s.authUser=null; s.profile=null; await ctx.renderProfile(); return showToast("Bu hesab bloklanıb. Adminlə əlaqə saxlayın."); }
            s.authUser=data.user; s.profile=s.authUser; await ctx.renderProfile(); await ctx.startAdminRealtime(); showToast("Giriş edildi.");
        } catch(e) {        showToast("Email və ya şifrə yanlışdır.");
        }
    }
    
    async function logoutProfile() {
        await ctx.api("/api/auth/logout",{method:"POST"}).catch(()=>{});
        s.authUser=null; s.profile=null; s.orders=[]; s.passwordRecoveryMode=false;
        ctx.stopAdminRealtime(); s.adminUnreadOrders=0; ctx.updateAdminNotifBadge();
        document.getElementById("passwordRecoveryPanel")?.classList.remove("open");
        ["profilePassword","profileName","profilePhone","profileEmail"].forEach(id=>document.getElementById(id)?.removeAttribute("disabled"));
        ctx.renderProfile();
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
        await ctx.renderOrderHistory();
    }
    
    async function renderOrderHistory() {
        const box=document.getElementById("orderHistory"); if(!box) return;
        if(!s.authUser){ box.innerHTML='<div class="form-help">Sifariş tarixçəsini görmək üçün hesaba daxil olun.</div>'; return; }
        try { const data=await ctx.api("/api/me/orders"); s.orders=data.orders||[]; } catch (_) { s.orders=[]; }
        if(!s.orders.length){ box.innerHTML='<div class="form-help">Hələ sifariş yoxdur.</div>'; return; }
        const labels={pending_confirmation:'WhatsApp təsdiqi gözlənilir',confirmed:'Təsdiqləndi',preparing:'Hazırlanır',ready:'Hazırdır',shipped:'Göndərildi',completed:'Tamamlandı',cancelled:'Ləğv edildi'};
        box.innerHTML='<h4 style="margin:0 0 10px;">Sifariş tarixçəsi</h4>'+s.orders.slice(0,20).map(o=>{
            const items=(o.items||[]).map(i=>`${escapeHTML(i.name||i.product_name||"Məhsul")} × ${Number(i.qty)}`).join(', ');
            return `<div class="order-row"><b>${escapeHTML(o.orderCode||o.order_code||"")}</b> · ${escapeHTML(o.createdAt ? new Date(o.createdAt).toLocaleString("az-AZ") : "") }<br><span style="color:var(--muted)">${escapeHTML(labels[o.status]||o.status)}</span><br><span style="color:var(--muted)">${items}</span><br><b>${money(o.total_cents/100)}</b></div>`;
        }).join("");
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
    renderOrderHistory
    });
}
