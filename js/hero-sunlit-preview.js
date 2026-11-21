/* Preview-only reference hero. Do not modify the production branch. */
(() => {
  const image = document.querySelector('#home .hero-giftique .hero-art img');
  if (!image) return;

  const url = new URL('assets/reference/f1-studio-sunlit-hero.avif', document.baseURI).href;
  const alt = 'Fərdi hədiyyələr: fincan, taxta lövhə, hədiyyə qutusu və işıqlı ürək';
  const probe = new Image();

  probe.onload = () => {
    const sync = () => {
      if (image.src !== url) image.src = url;
      if (image.alt !== alt) image.alt = alt;
    };
    sync();
    document.body.classList.add('hero-sunlit-ready');

    /* Site-content can asynchronously apply Supabase hero slides.
       Keep the reference hero stable only on this Preview branch. */
    if (typeof MutationObserver === 'function') {
      new MutationObserver(sync).observe(image, {
        attributes: true, attributeFilter: ['src', 'alt']
      });
    }
  };
  probe.onerror = () => {}; /* Preserve the original hero if the asset is unavailable. */
  probe.src = url;
})();
