import { state as s, ctx } from './state.js?v=59.2';
const focusStack = [];
let initialized = false;
const dialogSelector = '.modal, .modal-center';
function getDialog(id){ return document.getElementById(id); }
function isVisible(el){
    if(!el) return false;
    const style = window.getComputedStyle(el);
    return el.classList.contains('open') && style.visibility !== 'hidden' && style.display !== 'none';
}
function getFocusable(dialog){
    if(!dialog) return [];
    return [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(el => el.offsetParent !== null || el === document.activeElement);
}
function syncDialogAccessibility(){
    document.querySelectorAll(dialogSelector).forEach(dialog=>{
        const open = dialog.classList.contains('open');
        dialog.setAttribute('aria-hidden', open ? 'false' : 'true');
        dialog.inert = !open;
    });
}
function closeFromOutsideClick(id){
    const map={modal:'closeCart',productModal:'closeProductModal',customModal:'closeCustomModal',loginModal:'closeLogin',adminModal:'closeAdmin'};
    if(id==='privacyModal') return ctx.closeLegal?.('privacy');
    if(id==='termsModal') return ctx.closeLegal?.('terms');
    if(id==='returnsModal') return ctx.closeLegal?.('returns');
    if(map[id] && ctx[map[id]]) return ctx[map[id]]();
}
function pushFocusOrigin(id){
    const current = focusStack[focusStack.length-1];
    if(current?.id === id) return;
    focusStack.push({ id, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null });
}
function removeFocusOrigin(id){
    const index = focusStack.map(item=>item.id).lastIndexOf(id);
    if(index >= 0) focusStack.splice(index,1);
}
function restoreFocus(opener){
    if(opener && document.contains(opener) && !opener.disabled){
        requestAnimationFrame(()=>opener.focus());
    }
}
export function openDialog(id, focusSelector){
    const el = getDialog(id);
    if(!el) return;
    pushFocusOrigin(id);
    el.classList.add('open');
    syncDialogAccessibility();
    requestAnimationFrame(()=>{
        const target = focusSelector ? el.querySelector(focusSelector) : null;
        (target || getFocusable(el)[0])?.focus();
    });
}
export function closeDialog(id){
    const el = getDialog(id);
    if(!el) return;
    const entryIndex = focusStack.map(item=>item.id).lastIndexOf(id);
    const entry = entryIndex >= 0 ? focusStack.splice(entryIndex,1)[0] : null;
    el.classList.remove('open');
    if(id==='loginModal' && !s.passwordRecoveryMode){
        ['profilePassword','profileName','profilePhone','profileEmail'].forEach(x=>getDialog(id)?.querySelector(`#${x}`)?.removeAttribute('disabled'));
    }
    syncDialogAccessibility();
    const stillOpen = [...document.querySelectorAll(dialogSelector)].filter(isVisible).pop();
    if(stillOpen){
        requestAnimationFrame(()=>getFocusable(stillOpen)[0]?.focus());
    }else if(entry?.opener){
        restoreFocus(entry.opener);
    }
}
function handleEscape(){
    const openDialogs = [...document.querySelectorAll(dialogSelector)].filter(isVisible);
    const top = openDialogs[openDialogs.length-1];
    if(!top) return;
    const map={modal:'closeCart',productModal:'closeProductModal',customModal:'closeCustomModal',loginModal:'closeLogin',adminModal:'closeAdmin'};
    if(top.id==='privacyModal') return ctx.closeLegal?.('privacy');
    if(top.id==='termsModal') return ctx.closeLegal?.('terms');
    if(top.id==='returnsModal') return ctx.closeLegal?.('returns');
    const fn=map[top.id];
    if(fn && ctx[fn]) ctx[fn]();
}
export function initModalManager(){
    if(initialized) return;
    initialized = true;
    ctx.openDialog=openDialog;
    ctx.closeDialog=closeDialog;
    document.querySelectorAll(dialogSelector).forEach(dialog=>dialog.setAttribute('aria-hidden', dialog.classList.contains('open') ? 'false' : 'true'));
    syncDialogAccessibility();
    document.addEventListener('click', event=>{
        const target = event.target;
        if(target?.classList?.contains('modal') || target?.classList?.contains('modal-center')) closeFromOutsideClick(target.id);
    });
    document.addEventListener('keydown', e=>{
        if(e.key==='Escape'){
            e.preventDefault();
            handleEscape();
            return;
        }
        if(e.key!=='Tab') return;
        const openModal=[...document.querySelectorAll(dialogSelector)].filter(isVisible).pop();
        if(!openModal) return;
        const focusables=getFocusable(openModal);
        if(!focusables.length) return;
        const first=focusables[0], last=focusables[focusables.length-1];
        if(e.shiftKey && (document.activeElement===first || !openModal.contains(document.activeElement))){
            e.preventDefault();
            last.focus();
        }else if(!e.shiftKey && document.activeElement===last){
            e.preventDefault();
            first.focus();
        }
    });
    const observer = new MutationObserver(()=>syncDialogAccessibility());
    document.querySelectorAll(dialogSelector).forEach(dialog=>observer.observe(dialog,{attributes:true,attributeFilter:['class']}));
}
