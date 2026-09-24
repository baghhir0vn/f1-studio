const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function initReveal(){
    const items = [...document.querySelectorAll('.reveal')];
    if(!items.length) return;
    if(reduceMotion() || !('IntersectionObserver' in window)){
        items.forEach(el=>el.classList.add('active'));
        return;
    }
    const observer = new IntersectionObserver((entries, obs)=>{
        entries.forEach(entry=>{
            if(!entry.isIntersecting) return;
            entry.target.classList.add('active');
            obs.unobserve(entry.target);
        });
    }, {rootMargin:'0px 0px -8% 0px', threshold:0.08});
    items.forEach((el, index)=>{
        el.style.setProperty('--reveal-delay', `${Math.min(index * 35, 210)}ms`);
        observer.observe(el);
    });
    // Activate elements already visible on first paint. This prevents a reveal
    // animation from leaving the homepage blank on hosts/browsers where the
    // first IntersectionObserver callback is delayed or skipped.
    requestAnimationFrame(() => {
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        items.forEach(el => {
            if (el.getBoundingClientRect().top < viewportH - 20) el.classList.add('active');
        });
    });
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

function initHeaderScroll(){
    const nav = document.querySelector('header .nav');
    if(!nav) return;
    const update = () => nav.classList.toggle('scrolled', window.scrollY > 10);
    update();
    window.addEventListener('scroll', update, {passive:true});
}

function initMotion(){
    document.documentElement.classList.add('f1-motion-ready');
    initReveal();
    initModalMotion();
    initPointerPress();
    initHeaderScroll();
}

export { initMotion };
