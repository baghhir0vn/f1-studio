/* Optional ambient soundtrack. No autoplay, analytics or third-party scripts. */
(() => {
  'use strict';
  if (document.getElementById('f1Ambient')) return;
  const tracks = [
    { title: 'Royal Elegance · Nocturne Op. 9 No. 2', author: 'Frédéric Chopin · Peter Johnston', url: 'https://upload.wikimedia.org/wikipedia/commons/0/04/Chopin_Nocturne_No._2_in_E_Flat_Major%2C_Op._9.ogg', license: 'CC0', page: 'https://commons.wikimedia.org/wiki/File:Chopin_Nocturne_No._2_in_E_Flat_Major,_Op._9.ogg' },
    { title: 'Moonlight Serenity · Clair de Lune', author: 'Claude Debussy · Laurens Goedhart', url: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg', license: 'CC BY 3.0', page: 'https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg' }
  ];
  const storageKey = 'f1-ambient-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) {}
  let selected = saved.track === 1 ? 1 : 0;
  let volume = Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 0.28;
  let playing = false;
  let current = null;
  let animation = 0;
  let switching = false;
  const root = document.createElement('aside');
  root.className = 'f1-ambient';
  root.id = 'f1Ambient';
  root.setAttribute('aria-label', 'F1 Studio fon musiqisi');
  root.innerHTML = `
    <button class="f1-ambient-toggle" type="button" aria-expanded="false" aria-controls="f1AmbientPanel">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l11-2v12M9 18c0 3-6 3-6 0s6-3 6 0Zm11-2c0 3-6 3-6 0s6-3 6 0Z"/></svg><span>♫ Musiqi</span>
    </button>
    <section id="f1AmbientPanel" class="f1-ambient-panel" hidden aria-label="Musiqi ayarları">
      <h2 class="f1-ambient-title">F1 STUDIO · AMBIENCE</h2>
      <p class="f1-ambient-subtitle">Zərif klassik musiqi</p>
      <label class="f1-ambient-field">Atmosfer
        <select id="f1AmbientTrack">
          <option value="0">Royal Elegance — Chopin</option>
          <option value="1">Moonlight Serenity — Debussy</option>
        </select>
      </label>
      <label class="f1-ambient-field">Səs səviyyəsi
        <input id="f1AmbientVolume" type="range" min="0" max="100" step="1" aria-label="Musiqi səsi">
      </label>
      <div class="f1-ambient-actions">
        <button type="button" class="f1-ambient-play" id="f1AmbientPlay">▶ Səsləndir</button>
        <button type="button" class="f1-ambient-close" id="f1AmbientClose" aria-label="Musiqi panelini bağla">Bağla</button>
      </div>
      <p class="f1-ambient-status" role="status" aria-live="polite" id="f1AmbientStatus">Musiqi yalnız istəyinizlə başlayır.</p>
      <small class="f1-ambient-credit" id="f1AmbientCredit"></small>
    </section>`;
  document.body.append(root);
  const toggle = root.querySelector('.f1-ambient-toggle');
  const panel = root.querySelector('.f1-ambient-panel');
  const select = root.querySelector('#f1AmbientTrack');
  const slider = root.querySelector('#f1AmbientVolume');
  const play = root.querySelector('#f1AmbientPlay');
  const close = root.querySelector('#f1AmbientClose');
  const status = root.querySelector('#f1AmbientStatus');
  const credit = root.querySelector('#f1AmbientCredit');
  select.value = String(selected);
  slider.value = String(Math.round(volume * 100));
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify({ track: selected, volume })); } catch (_) {} };
  const updateCredit = () => {
    const t = tracks[selected];
    credit.replaceChildren();
    credit.append(document.createTextNode(t.author + ' · ' + t.license + ' · '));
    const a = document.createElement('a');
    a.href = t.page; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = 'Mənbə və lisenziya';
    credit.append(a);
  };
  const updateControls = () => {
    play.textContent = playing ? 'Ⅱ Dayandır' : '▶ Səsləndir';
    toggle.dataset.active = String(playing);
    toggle.querySelector('span').textContent = playing ? '♫ Musiqi açıq' : '♫ Musiqi';
  };
  const cancelFade = () => { if (animation) cancelAnimationFrame(animation); animation = 0; };
  const fade = (audio, from, to, duration, done) => {
    const start = performance.now();
    const tick = now => {
      const ratio = Math.min(1, (now - start) / duration);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * ratio));
      if (ratio < 1) animation = requestAnimationFrame(tick);
      else { animation = 0; if (done) done(); }
    };
    animation = requestAnimationFrame(tick);
  };
  const makeAudio = index => {
    const audio = new Audio();
    audio.preload = 'none'; audio.loop = true; audio.src = tracks[index].url; audio.volume = 0;
    audio.addEventListener('error', () => {
      if (audio !== current) return;
      cancelFade(); audio.pause(); current = null; playing = false; switching = false;
      status.textContent = 'Musiqi yüklənmədi. İnterneti yoxlayıb yenidən sınayın.';
      updateControls();
    });
    return audio;
  };
  const start = async () => {
    if (switching) return;
    cancelFade();
    const audio = makeAudio(selected);
    current = audio;
    status.textContent = 'Musiqi yüklənir…';
    try {
      await audio.play();
      if (current !== audio) { audio.pause(); return; }
      playing = true;
      updateControls();
      status.textContent = 'Musiqi səslənir.';
      fade(audio, 0, volume, 750);
    } catch (_) {
      if (current === audio) { current = null; playing = false; updateControls(); }
      status.textContent = 'Səsləndirmək üçün düyməyə yenidən toxunun.';
    }
  };
  const stop = () => {
    if (!current) { playing = false; updateControls(); return; }
    const audio = current;
    cancelFade();
    current = null; playing = false; switching = false; updateControls();
    status.textContent = 'Musiqi dayandırılıb.';
    fade(audio, audio.volume, 0, 420, () => { audio.pause(); audio.removeAttribute('src'); audio.load(); });
  };
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });
  close.addEventListener('click', () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
  play.addEventListener('click', () => { if (playing) stop(); else start(); });
  select.addEventListener('change', async () => {
    selected = Number(select.value) === 1 ? 1 : 0; save(); updateCredit();
    if (!playing || !current) return;
    const old = current;
    cancelFade();
    switching = true;
    old.pause(); old.removeAttribute('src'); old.load();
    current = null; playing = false; switching = false;
    updateControls();
    await start();
  });
  slider.addEventListener('input', () => {
    volume = Number(slider.value) / 100; save();
    if (current && playing) { cancelFade(); current.volume = volume; }
  });
  document.addEventListener('visibilitychange', () => {
    // User-selected music continues while navigating page sections, including tab switches.
  });
  updateCredit(); updateControls();
})();
