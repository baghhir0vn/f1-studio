/* Activate the screenshot-matched hero only if its image actually exists. */
(() => {
  const hero = document.querySelector('#home .hero-giftique .hero-art img');
  if (!hero) return;
  const path = 'assets/reference/f1-studio-sunlit-hero.avif';
  const probe = new Image();
  probe.onload = () => {
    hero.src = path;
    hero.alt = 'Fərdi hədiyyələr: fincan, taxta lövhə, hədiyyə qutusu və işıqlı ürək';
    document.body.classList.add('hero-sunlit-ready');
  };
  probe.onerror = () => {}; // Keep the existing reference hero until the asset is uploaded.
  probe.src = path;
})();
