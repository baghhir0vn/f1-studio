import { ctx } from './state.js';
function parseArgs(raw, event, el){
    if(!raw) return [];
    try{
        return JSON.parse(raw).map(v=>v && v.$==='event' ? event : v && v.$==='this' ? el : v);
    }catch(_){ return []; }
}
function invoke(name,args=[]){ const fn=ctx[name]; if(typeof fn==='function') return fn(...args); }
export function initEvents(){
    document.addEventListener('click', event=>{
        const el=event.target?.closest?.('[data-action],[data-actions]');
        if(!el) return;
        const single=el.dataset.action;
        if(single) invoke(single,parseArgs(el.dataset.actionArgs,event,el));
        const multiple=el.dataset.actions;
        if(multiple){ try { JSON.parse(multiple).forEach(([name,args])=>invoke(name,(args||[]).map(v=>v && v.$==='event'?event:v && v.$==='this'?el:v))); } catch(_){} }
    });
    document.addEventListener('input', event=>{
        const el=event.target?.closest?.('[data-input-action]');
        if(!el) return;
        invoke(el.dataset.inputAction,parseArgs(el.dataset.inputArgs,event,el));
    });
    document.addEventListener('change', event=>{
        const el=event.target?.closest?.('[data-change-action]');
        if(!el) return;
        invoke(el.dataset.changeAction,parseArgs(el.dataset.changeArgs,event,el));
    });
    document.addEventListener('submit', event=>{
        const el=event.target?.closest?.('[data-submit-action]');
        if(!el) return;
        event.preventDefault();
        invoke(el.dataset.submitAction,[event]);
    });
    document.addEventListener('keydown', event=>{
        if(event.key!=='Enter') return;
        const el=event.target?.closest?.('[data-enter-action]');
        if(el) invoke(el.dataset.enterAction,[event]);
    });
}
