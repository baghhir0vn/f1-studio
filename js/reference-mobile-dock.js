const mobileDock = document.querySelector('.f1-mobile-dock');

if (mobileDock) {
  const links = [...mobileDock.querySelectorAll('[data-nav-target]')];
  const setActive = (target) => {
    links.forEach((link) => {
      const active = link.dataset.navTarget === target;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  const sections = [
    [document.querySelector('.hero-giftique'), 'home'],
    [document.querySelector('#categories'), 'categories'],
    [document.querySelector('#products'), 'categories']
  ].filter(([element]) => element);

  if ('IntersectionObserver' in window && sections.length) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) {
        const section = sections.find(([element]) => element === visible.target);
        if (section) setActive(section[1]);
      }
    }, { rootMargin: '-30% 0px -58% 0px', threshold: [0, 0.2, 0.5, 0.8] });

    sections.forEach(([element]) => observer.observe(element));
  }

  const hashTarget = window.location.hash;
  if (hashTarget === '#categories' || hashTarget === '#products') setActive('categories');
  else setActive('home');
}
