import { state as s, ctx } from './state.js';

let lastFocusedElement = null;
let initialized = false;

export function openDialog(id, focusSelector){
    lastFocusedElement=document.activeElement;
    const el=document.getElementById(id);
    if(!el) return;
    el.classList.add('open');
    requestAnimationFrame(()=>document.querySelector(`#${id} ${focusSelector||'button,input,select,textarea'}`)?.focus());
}

export function closeDialog(id){
    const el=document.getElementById(id); if(!el)return;
    el.classList.remove('open');
    if(id==='loginModal' && !s.passwordRecoveryMode){
        ['profilePassword','profileName','profilePhone','profileEmail'].forEach(x=>document.getElementById(x)?.removeAttribute('disabled'));
    }
    requestAnimationFrame(()=>lastFocusedElement?.focus());
}

function closeBackdropModal(id){
    const map={modal:'closeCart',productModal:'closeProductModal',customModal:'closeCustomModal',loginModal:'closeLogin',adminModal:'closeAdmin',privacyModal:'closeLegal',termsModal:'closeLegal',returnsModal:'closeLegal'};
    if(id==='privacyModal') return ctx.closeLegal('privacy');
    if(id==='termsModal') return ctx.closeLegal('terms');
    if(id==='returnsModal') return ctx.closeLegal('returns');
    if(map[id] && ctx[map[id]]) return ctx[map[id]]();
}

export function initModalManager(){
    if(initialized) return;
    initialized = true;
    ctx.openDialog=openDialog;
    ctx.closeDialog=closeDialog;
    document.addEventListener('click', function(event){
        if(event.target?.classList?.contains('modal') || event.target?.classList?.contains('modal-center')){
            closeBackdropModal(event.target.id);
        }
    });
    document.addEventListener('keydown', e=>{
        if(e.key==='Escape'){
            ['closeCart','closeProductModal','closeCustomModal','closeLogin','closeAdmin'].forEach(fn=>ctx[fn]?.());
            ctx.closeLegal?.('privacy');ctx.closeLegal?.('terms');ctx.closeLegal?.('returns');
            return;
        }
        if(e.key!=='Tab') return;
        const openModal=[...document.querySelectorAll('.modal.open,.modal-center.open')].pop();
        if(!openModal)return;
        const focusables=[...openModal.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
        if(!focusables.length)return;
        const first=focusables[0],last=focusables[focusables.length-1];
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    });
}
