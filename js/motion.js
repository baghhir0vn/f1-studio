const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function initReveal(){
    const items = [...document.querySelectorAll('.reveal')];
    if(!items.length) return;
    if(reduceMotion() || !('IntersectionObserver' in window)){
        items.forEach(el=>el.classList.add('active'));
        return;
    }
    const observed = new WeakSet();
    let revealIndex = 0;
    const observer = new IntersectionObserver((entries, obs)=>{
        entries.forEach(entry=>{
            if(!entry.isIntersecting) return;
            const el=entry.target;
            el.classList.add('active');
            obs.unobserve(el);
            if(el.classList.contains('product')){
                window.setTimeout(()=>{
                    el.classList.remove('reveal','active');
                    el.style.removeProperty('--reveal-delay');
                }, 1100);
            }
        });
    }, {rootMargin:'0px 0px -8% 0px', threshold:0.08});
    const watchNode = node=>{
        if(!(node instanceof Element)) return;
        const candidates=[];
        if(node.matches('.reveal,.product')) candidates.push(node);
        candidates.push(...node.querySelectorAll('.reveal,.product'));
        candidates.forEach(el=>{
            if(el.classList.contains('product')) el.classList.add('reveal');
            if(!el.classList.contains('reveal') || observed.has(el)) return;
            observed.add(el);
            el.style.setProperty('--reveal-delay', Math.min(revealIndex * 35, 210) + 'ms');
            revealIndex++;
            observer.observe(el);
        });
    };
    items.forEach(watchNode);
    document.documentElement.classList.add('f1-motion-ready');
    const additions=new MutationObserver(records=>{
        records.forEach(record=>record.addedNodes.forEach(watchNode));
    });
    additions.observe(document.body,{childList:true,subtree:true});
}
function initModalMotion(){
    document.addEventListener('transitionend', event=>{
        const modal = event.target?.closest?.('.modal,.modal-center');
        if(!modal || event.propertyName !== 'opacity' || !modal.classList.contains('open')) return;
        const first = modal.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])');
        if(first && !modal.contains(document.activeElement)) first.focus();
    });
}
function initPointerPress(){
    document.addEventListener('pointerdown', event=>{
        const el = event.target?.closest?.('button,.btn,a,.cat,.target-chip,.chip,.fav-btn');
        if(!el || el.disabled) return;
        el.classList.add('is-pressing');
    }, {passive:true});
    const clear = event=>event.target?.closest?.('.is-pressing')?.classList.remove('is-pressing');
    document.addEventListener('pointerup', clear, {passive:true});
    document.addEventListener('pointercancel', clear, {passive:true});
    document.addEventListener('pointerleave', clear, {passive:true});
}
function initMotion(){
    initReveal();
    initModalMotion();
    initPointerPress();
}
export { initMotion };
