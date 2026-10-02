import { showToast } from './ui.js';
import { realtimeService } from './services/realtime-service.js';
import { state as s, ctx } from './state.js';
import { ADMIN_API } from './admin-shared.js';
import { initDashboard as initAdminDashboard } from './admin-dashboard.js';
import { initProducts as initAdminProducts } from './admin-products.js';
import { initOrders as initAdminOrders } from './admin-orders.js';
import { initCustomers as initAdminCustomers } from './admin-customers.js';
import { initReviews as initAdminReviews } from './admin-reviews.js';
export function initAdmin() {
    initAdminDashboard();
    initAdminProducts();
    initAdminOrders();
    initAdminCustomers();
    initAdminReviews();
        function isAdminUser(){ return !!s.authUser && (s.authUser.role === "admin" || s.authUser.isAdmin === true); }
        function setAdminRealtimeStatus(state, text){
            const el=document.getElementById("adminRealtimeStatus"); if(!el)return;
            const dot=el.querySelector(".admin-realtime-dot");
            if(dot){dot.classList.toggle("on",state==="on");dot.classList.toggle("err",state==="err");}
            el.lastChild.textContent=text;
        }
        function updateAdminNotifBadge(){
            ["adminNotifBadge","adminSidebarOrderBadge","adminTopNotifBadge"].forEach(id=>{
                const el=document.getElementById(id); if(!el)return;
                el.textContent=String(s.adminUnreadOrders);
                el.classList.toggle("hidden",s.adminUnreadOrders<=0);
            });
        }
        function playAdminNotificationSound(){
            try{
                const C=window.AudioContext||window.webkitAudioContext; if(!C)return;
                const ctx=new C(), osc=ctx.createOscillator(), gain=ctx.createGain();
                osc.type="sine"; osc.frequency.value=880;
                gain.gain.setValueAtTime(0.0001,ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.08,ctx.currentTime+0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.28);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+0.3);
                setTimeout(()=>ctx.close().catch(()=>{}),500);
            }catch(_){}
        }
        function stopAdminRealtime(){
            if(s.adminRealtimeChannel){
                realtimeService.removeChannel(s.adminRealtimeChannel).catch(()=>{});
                s.adminRealtimeChannel=null;
            }
            ctx.setAdminRealtimeStatus("off","Canlı sifariş bildirişləri söndürülüb.");
        }
        async function startAdminRealtime(){
            if(!ctx.isAdminUser()) { ctx.stopAdminRealtime(); return; }
            if(s.adminRealtimeChannel) return;
            ctx.setAdminRealtimeStatus("","Canlı sifariş bildirişləri qoşulur...");
            s.adminRealtimeChannel=realtimeService.createAdminOrdersChannel({
                onInsert: async payload=>{
                    const order=payload.new||{};
                    s.adminUnreadOrders+=1; ctx.updateAdminNotifBadge();
                    const code=order.order_code||`#${order.id||"?"}`;
                    const customer=order.customer_name||"Yeni müştəri";
                    ctx.playAdminNotificationSound();
                    showToast(`🔔 Yeni sifariş: ${code} · ${customer}`);
                    if("Notification" in window && Notification.permission==="granted"){
                        try{new Notification("F1 Studio — Yeni sifariş",{body:`${code} · ${customer}`});}catch(_){}
                    }
                    await ctx.loadAdminOrders();
                    await ctx.loadAdminDashboard();
                },
                onUpdate: async payload=>{
                    if(payload.old?.status!==payload.new?.status){
                        await ctx.loadAdminOrders();
                        await ctx.loadAdminDashboard();
                    }
                }
            });
            s.adminRealtimeChannel.subscribe(status=>{
                    if(status==="SUBSCRIBED") ctx.setAdminRealtimeStatus("on","🟢 Canlı sifariş bildirişləri aktivdir.");
                    else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT") ctx.setAdminRealtimeStatus("err",`🔴 Canlı bildiriş xətası: ${status}`);
                });
        }
        async function enableAdminDesktopNotifications(){
            if(!ctx.isAdminUser()) return showToast("Admin girişiniz olmalıdır.");
            if(!("Notification" in window)) return showToast("Bu brauzer masaüstü bildirişlərini dəstəkləmir.");
            try{
                const permission=await Notification.requestPermission();
                showToast(permission==="granted"?"✅ Masaüstü bildirişləri aktiv edildi.":"Bildiriş icazəsi verilmədi.");
            }catch(_){showToast("Bildiriş icazəsi alına bilmədi.");}
        }
        function updateAdminButton(){
            const visible=ctx.isAdminUser();
            const btn=document.getElementById("adminBtn"); if(btn) btn.style.display=visible?"inline-block":"none";
            const mobile=document.getElementById("mobileAdminBtn"); if(mobile) mobile.style.display=visible?"block":"none";
        }
        let adminScrollSnapshot = null;
        function lockAdminBackgroundScroll(){
            if(adminScrollSnapshot) return;
            const body=document.body;
            const scrollY=window.scrollY||window.pageYOffset||0;
            const isMobile=window.matchMedia("(max-width: 760px)").matches;
            adminScrollSnapshot={
                scrollY,
                position:body.style.position,
                top:body.style.top,
                width:body.style.width,
                paddingRight:body.style.paddingRight
            };
            const scrollbarWidth=Math.max(0,window.innerWidth-document.documentElement.clientWidth);
            body.classList.add("f1-admin-modal-open");
            if(isMobile){
                body.style.position="fixed";
                body.style.top=`-${scrollY}px`;
                body.style.width="100%";
            }else if(scrollbarWidth){
                body.style.paddingRight=`${scrollbarWidth}px`;
            }
        }
        function unlockAdminBackgroundScroll(){
            if(!adminScrollSnapshot) return;
            const snapshot=adminScrollSnapshot;
            const body=document.body;
            body.classList.remove("f1-admin-modal-open");
            body.style.position=snapshot.position;
            body.style.top=snapshot.top;
            body.style.width=snapshot.width;
            body.style.paddingRight=snapshot.paddingRight;
            adminScrollSnapshot=null;
            requestAnimationFrame(()=>window.scrollTo(0,snapshot.scrollY));
        }
        function openAdmin(){
            if(!ctx.isAdminUser()) return showToast("Admin panelinə giriş icazəniz yoxdur.");
            const adminMain=document.querySelector("#adminModal .admin-main");
            if(adminMain && !adminMain.hasAttribute("tabindex")) adminMain.setAttribute("tabindex","0");
            lockAdminBackgroundScroll();
            ctx.openDialog("adminModal", ".admin-main");
            const displayName=s.authUser.name||s.authUser.email||"istifadəçi";
            const profileName=document.getElementById("adminUserStatus"); if(profileName)profileName.textContent=`Aktiv admin: ${displayName}`;
            const avatar=document.getElementById("adminAvatarInitials");
            if(avatar){const parts=String(s.authUser.name||"").trim().split(/\\s+/).filter(Boolean);avatar.textContent=(parts.length>1?parts[0][0]+parts[parts.length-1][0]:(parts[0]||s.authUser.email||"A").slice(0,2)).toLocaleUpperCase("az-AZ");}
            const welcome=document.getElementById("adminWelcomeText"); if(welcome)welcome.textContent=`Xoş gəlmisiniz, ${(s.authUser.name||"").trim().split(/\\s+/)[0]||"Admin"}`;
            const date=document.getElementById("adminCurrentDate");
            if(date){const now=new Date();date.textContent=now.toLocaleDateString("az-AZ",{day:"numeric",month:"long",year:"numeric"});date.dateTime=now.toISOString();}
            document.querySelector("#adminModal .admin-shell")?.classList.remove("admin-sidebar-open","admin-sidebar-collapsed");
            ctx.updateAdminNotifBadge();
            ctx.switchAdminView("dashboard");
            ctx.loadAdminDashboard();
            ctx.loadSiteSettings(true);
        }
        function closeAdmin(){
            ctx.closeDialog?.("adminModal");
            unlockAdminBackgroundScroll();
        }
        function toggleAdminSidebar(){
            const shell=document.querySelector("#adminModal .admin-shell");
            if(!shell)return;
            const button=document.getElementById("adminSidebarToggle");
            const mobile=window.matchMedia("(max-width: 900px)").matches;
            const className=mobile?"admin-sidebar-open":"admin-sidebar-collapsed";
            const toggled=shell.classList.toggle(className);
            const expanded=mobile?toggled:!toggled;
            button?.setAttribute("aria-expanded",String(expanded));
        }
        function switchAdminView(view){
            document.querySelectorAll("[data-admin-view]").forEach(b=>b.classList.toggle("active",b.dataset.adminView===view));
            document.querySelectorAll(".admin-view").forEach(v=>v.classList.toggle("active",v.id===`adminView-${view}`));
            const shell=document.querySelector("#adminModal .admin-shell");
            if(window.matchMedia("(max-width: 900px)").matches){
                shell?.classList.remove("admin-sidebar-open");
                document.getElementById("adminSidebarToggle")?.setAttribute("aria-expanded","false");
            }
            if(view==="products") ctx.loadAdminProducts();
            if(view==="orders") { s.adminUnreadOrders=0; ctx.updateAdminNotifBadge(); ctx.loadAdminOrders(); }
            if(view==="reviews") ctx.loadAdminReviews();
            if(view==="customers") ctx.loadAdminCustomers();
            if(view==="settings") ctx.loadSiteSettings(true);
        }
        async function adminApi(path, options={}){
            if(!ctx.isAdminUser()) throw new Error("ADMIN_REQUIRED");
            return ctx.api(path, options);
        }
        async function loadAdminDashboard(){
            const dashboard=document.getElementById("adminView-dashboard"),status=document.getElementById("adminApiStatus");
            if(dashboard)dashboard.setAttribute("aria-busy","true");
            if(status)status.textContent="Dashboard məlumatları yüklənir...";
            try{
                const [p,o,r]=await Promise.all([
                    ctx.adminApi(ADMIN_API.products), ctx.adminApi(ADMIN_API.orders), ctx.adminApi(ADMIN_API.reviews)
                ]);
                const ps=Array.isArray(p.products)?p.products:[];
                const os=Array.isArray(o.orders)?o.orders:[];
                const rs=Array.isArray(r.reviews)?r.reviews:[];
                s.adminProducts=ps; s.adminOrders=os; s.adminReviews=rs;
                ctx.renderAdminDashboardStats(ps,os,rs);
                if(status)status.textContent="Supabase admin bağlantısı işləkdir.";
            }catch(e){
                if(dashboard)dashboard.setAttribute("aria-busy","false");
                if(status)status.textContent="Dashboard məlumatlarını yükləmək mümkün olmadı. Sessiyanı və bağlantını yoxlayın.";
                console.error("Admin dashboard load failed:",e);
            }
        }
    Object.assign(ctx, {
        isAdminUser, setAdminRealtimeStatus, updateAdminNotifBadge, playAdminNotificationSound,
        stopAdminRealtime, startAdminRealtime, enableAdminDesktopNotifications, updateAdminButton,
        openAdmin, closeAdmin, switchAdminView, toggleAdminSidebar, adminApi
    });
}
