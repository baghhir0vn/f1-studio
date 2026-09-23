import { showToast } from './ui.js?v=59.2';
import { state as s, ctx } from './state.js?v=59.2';
import { storageService } from './services/storage-service.js?v=59.2';
const CANVAS_W = 300;
const CANVAS_H = 240;
const PRINT = { x: 22, y: 22, w: 256, h: 196 };
const DEFAULTS = {
    image: { x: 150, y: 105, scale: 1, rotation: 0, visible: true },
    text: { x: 150, y: 185, scale: 1, rotation: 0, fontSize: 28, align: 'center', visible: true }
};
const FONT_MAP = {
    Klassik: 'Georgia',
    Modern: 'Inter, Arial, sans-serif',
    Qalın: 'Arial Black, Arial, sans-serif',
    Əlyazma: 'cursive',
    'Operatorla seçim': 'Arial, sans-serif'
};
const COLOR_MAP = { Qara: '#111', Ağ: '#fff', Qızılı: '#b88919', Gümüşü: '#8b9299', Digər: '#333' };
const DRAFT_PREFIX = 'f1DesignDraft:v1:';
export function initDesignStudio() {
    const studio = {
        canvas: null,
        ctx: null,
        image: null,
        imageKey: '',
        images: new Map(),
        selected: 'image',
        order: ['image', 'text'],
        elements: {
            image: { ...DEFAULTS.image },
            text: { ...DEFAULTS.text, font: 'Klassik', color: '#111', text: '' }
        },
        drag: null,
        pointers: new Map(),
        pinch: null,
        history: [],
        future: [],
        historyTimer: null,
        suppressHistory: false
    };
    const canvas = () => document.getElementById('designCanvas');
    const el = id => document.getElementById(id);
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const active = () => studio.elements[studio.selected];
    function snapshot() {
        return {
            selected: studio.selected,
            order: [...studio.order],
            imageKey: studio.imageKey,
            image: { ...studio.elements.image },
            text: { ...studio.elements.text }
        };
    }
    function restoreSnapshot(snap) {
        if (!snap) return;
        studio.selected = snap.selected === 'text' ? 'text' : 'image';
        studio.order = Array.isArray(snap.order) ? [...snap.order].filter(x => x === 'image' || x === 'text') : ['image', 'text'];
        if (!studio.order.includes('image')) studio.order.unshift('image');
        if (!studio.order.includes('text')) studio.order.push('text');
        studio.elements.image = { ...DEFAULTS.image, ...(snap.image || {}) };
        studio.elements.text = { ...DEFAULTS.text, font: 'Klassik', color: '#111', text: '', ...(snap.text || {}) };
        studio.imageKey = String(snap.imageKey || '');
        studio.image = studio.images.get(studio.imageKey) || null;
        applyTextControls();
        draw();
    }
    function pushHistory(label = '') {
        if (studio.suppressHistory) return;
        const current = snapshot();
        const last = studio.history.at(-1);
        if (last && JSON.stringify(last.snapshot) === JSON.stringify(current)) return;
        studio.history.push({ label, snapshot: current });
        if (studio.history.length > 60) studio.history.shift();
        studio.future = [];
    }
    function queueHistory(label = 'Dəyişiklik') {
        clearTimeout(studio.historyTimer);
        studio.historyTimer = setTimeout(() => pushHistory(label), 350);
    }
    function ensureHistoryBaseline() {
        if (!studio.history.length) pushHistory('Başlanğıc');
    }
    function undo() {
        clearTimeout(studio.historyTimer);
        ensureHistoryBaseline();
        if (studio.history.length <= 1) return showToast('↩️ Geri qaytarılacaq dəyişiklik yoxdur.');
        const current = studio.history.pop();
        studio.future.push(current);
        studio.suppressHistory = true;
        restoreSnapshot(studio.history.at(-1).snapshot);
        studio.suppressHistory = false;
        showToast('↩️ Son dəyişiklik geri qaytarıldı.');
    }
    function redo() {
        clearTimeout(studio.historyTimer);
        const next = studio.future.pop();
        if (!next) return showToast('↪️ Yenidən ediləcək dəyişiklik yoxdur.');
        studio.suppressHistory = true;
        restoreSnapshot(next.snapshot);
        studio.suppressHistory = false;
        studio.history.push(next);
        showToast('↪️ Dəyişiklik yenidən tətbiq edildi.');
    }
    function point(event) {
        const c = canvas();
        const r = c.getBoundingClientRect();
        return { x: (event.clientX - r.left) * (c.width / r.width), y: (event.clientY - r.top) * (c.height / r.height) };
    }
    function imageMetrics(imageEl) {
        if (!studio.image) return null;
        const maxBase = 190;
        const ratio = Math.min(1, maxBase / Math.max(1, studio.image.width, studio.image.height));
        const w = studio.image.width * ratio * imageEl.scale;
        const h = studio.image.height * ratio * imageEl.scale;
        return { w, h };
    }
    function rotatePoint(x, y, cx, cy, deg) {
        const r = -deg * Math.PI / 180;
        const dx = x - cx, dy = y - cy;
        return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
    }
    function hitImage(p) {
        const item = studio.elements.image;
        if (!item.visible || !studio.image) return false;
        const m = imageMetrics(item);
        const q = rotatePoint(p.x, p.y, item.x, item.y, item.rotation);
        return Math.abs(q.x - item.x) <= m.w / 2 + 8 && Math.abs(q.y - item.y) <= m.h / 2 + 8;
    }
    function textMetrics() {
        const t = studio.elements.text;
        const g = studio.ctx;
        const text = String(t.text || '').slice(0, 80);
        g.save();
        g.font = `700 ${Math.round(t.fontSize * t.scale)}px ${FONT_MAP[t.font] || FONT_MAP.Klassik}`;
        const width = Math.max(20, g.measureText(text || 'Mətn').width);
        g.restore();
        return { width, height: Math.max(28, t.fontSize * t.scale * 1.25) };
    }
    function hitText(p) {
        const t = studio.elements.text;
        if (!t.visible || !String(t.text || '').trim()) return false;
        const m = textMetrics();
        const q = rotatePoint(p.x, p.y, t.x, t.y, t.rotation);
        return Math.abs(q.x - t.x) <= m.width / 2 + 10 && Math.abs(q.y - t.y) <= m.height / 2 + 10;
    }
    function drawSelection(g, type) {
        const item = studio.elements[type];
        if (!item.visible) return;
        g.save();
        g.translate(item.x, item.y);
        g.rotate(item.rotation * Math.PI / 180);
        g.strokeStyle = '#b88919';
        g.lineWidth = 2;
        g.setLineDash([5, 4]);
        if (type === 'image') {
            const m = imageMetrics(item);
            g.strokeRect(-m.w / 2 - 5, -m.h / 2 - 5, m.w + 10, m.h + 10);
        } else {
            const m = textMetrics();
            g.strokeRect(-m.width / 2 - 8, -m.height / 2 - 6, m.width + 16, m.height + 12);
        }
        g.restore();
    }
    function drawElement(g, type) {
        const item = studio.elements[type];
        if (!item.visible) return;
        g.save();
        g.translate(item.x, item.y);
        g.rotate(item.rotation * Math.PI / 180);
        if (type === 'image') {
            if (!studio.image) { g.restore(); return; }
            const m = imageMetrics(item);
            g.drawImage(studio.image, -m.w / 2, -m.h / 2, m.w, m.h);
        } else if (String(item.text || '').trim()) {
            const text = String(item.text).slice(0, 80);
            g.fillStyle = item.color || '#111';
            g.font = `700 ${Math.round(item.fontSize * item.scale)}px ${FONT_MAP[item.font] || FONT_MAP.Klassik}`;
            g.textAlign = item.align || 'center';
            g.textBaseline = 'middle';
            const x = item.align === 'left' ? 0 : item.align === 'right' ? 0 : 0;
            g.shadowColor = item.color === '#fff' ? 'rgba(0,0,0,.32)' : 'transparent';
            g.shadowBlur = item.color === '#fff' ? 2 : 0;
            g.fillText(text, x, 0);
        }
        g.restore();
    }
    function draw() {
        const c = canvas();
        if (!c) return;
        const g = c.getContext('2d');
        studio.canvas = c;
        studio.ctx = g;
        g.clearRect(0, 0, c.width, c.height);
        g.fillStyle = '#f7f1ed';
        g.fillRect(0, 0, c.width, c.height);
        g.save();
        g.fillStyle = 'rgba(255,255,255,.45)';
        g.fillRect(PRINT.x, PRINT.y, PRINT.w, PRINT.h);
        g.strokeStyle = '#d9c9c0';
        g.lineWidth = 1.5;
        g.setLineDash([6, 5]);
        g.strokeRect(PRINT.x, PRINT.y, PRINT.w, PRINT.h);
        g.setLineDash([]);
        g.fillStyle = 'rgba(0,0,0,.38)';
        g.font = '10px Arial, sans-serif';
        g.textAlign = 'left';
        g.fillText('ÇAP SAHƏSİ', PRINT.x + 7, PRINT.y + 14);
        g.restore();
        for (const type of studio.order) drawElement(g, type);
        drawSelection(g, studio.selected);
        updateStatus();
    }
    function updateStatus() {
        const status = el('designSelectionStatus');
        if (!status) return;
        const item = active();
        const label = studio.selected === 'image' ? 'Şəkil' : 'Mətn';
        const hidden = !item?.visible || (studio.selected === 'image' && !studio.image) || (studio.selected === 'text' && !String(item?.text || '').trim());
        status.textContent = `${label} seçilib${hidden ? ' · əlavə edilməyib' : ''}`;
    }
    function syncFormToState({ history = true } = {}) {
        const t = studio.elements.text;
        t.text = String(el('customText')?.value || '').trim().slice(0, 80);
        t.font = el('customFont')?.value || 'Klassik';
        const c = el('customColor')?.value || 'Qara';
        t.color = COLOR_MAP[c] || '#111';
        t.fontSize = clamp(Number(el('customFontSize')?.value || 28), 12, 72);
        t.align = ['left', 'center', 'right'].includes(el('customTextAlign')?.value) ? el('customTextAlign').value : 'center';
        if (history) queueHistory('Mətn parametri');
        draw();
    }
    function applyTextControls() {
        const t = studio.elements.text;
        if (el('customText')) el('customText').value = t.text || '';
        if (el('customFont')) el('customFont').value = t.font || 'Klassik';
        const reverseColor = Object.entries(COLOR_MAP).find(([, v]) => v === t.color)?.[0] || 'Digər';
        if (el('customColor')) el('customColor').value = reverseColor;
        if (el('customFontSize')) el('customFontSize').value = String(t.fontSize || 28);
        if (el('customTextAlign')) el('customTextAlign').value = t.align || 'center';
        const sizeLabel = el('customFontSizeValue');
        if (sizeLabel) sizeLabel.textContent = `${t.fontSize || 28}px`;
    }
    function select(type, { history = true } = {}) {
        if (!['image', 'text'].includes(type)) return;
        studio.selected = type;
        if (history) pushHistory('Element seçildi');
        draw();
    }
    function pointerDistance() {
        const pts = [...studio.pointers.values()];
        if (pts.length < 2) return 0;
        return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
    function down(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        studio.pointers.set(event.pointerId, point(event));
        const c = canvas();
        if (studio.pointers.size >= 2) {
            studio.drag = null;
            const distance = pointerDistance();
            if (distance > 0) {
                const item = active();
                if (item && (studio.selected !== 'image' || studio.image)) {
                    studio.pinch = { startDistance: distance, startScale: Number(item.scale || 1) };
                    pushHistory('İki barmaq ilə ölçü');
                }
            }
            c?.setPointerCapture?.(event.pointerId);
            event.preventDefault();
            return;
        }
        const p = point(event);
        const hitTop = [...studio.order].reverse().find(type => type === 'text' ? hitText(p) : hitImage(p));
        if (!hitTop) {
            studio.drag = null;
            draw();
            return;
        }
        select(hitTop, { history: false });
        const item = active();
        studio.drag = { dx: p.x - item.x, dy: p.y - item.y };
        c?.setPointerCapture?.(event.pointerId);
        pushHistory('Element hərəkəti');
        event.preventDefault();
    }
    function move(event) {
        if (studio.pointers.has(event.pointerId)) studio.pointers.set(event.pointerId, point(event));
        if (studio.pointers.size >= 2 && studio.pinch) {
            const distance = pointerDistance();
            if (distance > 0) {
                const item = active();
                const min = studio.selected === 'text' ? 0.5 : 0.25;
                item.scale = clamp(studio.pinch.startScale * (distance / studio.pinch.startDistance), min, 3);
                draw();
            }
            event.preventDefault();
            return;
        }
        if (!studio.drag) return;
        const p = point(event);
        const item = active();
        item.x = clamp(p.x - studio.drag.dx, 10, CANVAS_W - 10);
        item.y = clamp(p.y - studio.drag.dy, 10, CANVAS_H - 10);
        draw();
    }
    function up(event) {
        studio.pointers.delete(event.pointerId);
        if (studio.pointers.size < 2) studio.pinch = null;
        studio.drag = null;
    }
    function loadImageObject(img, key) {
        studio.images.set(key, img);
        studio.imageKey = key;
        studio.image = img;
        studio.elements.image.visible = true;
        studio.selected = 'image';
        studio.elements.image.x = 150;
        studio.elements.image.y = 105;
        studio.elements.image.scale = 1;
        studio.elements.image.rotation = 0;
        pushHistory('Şəkil əlavə edildi');
        draw();
    }
    function loadFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            studio.image = null;
            studio.imageKey = '';
            studio.elements.image.visible = false;
            draw();
            return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const key = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            loadImageObject(img, key);
            URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
    }
    async function loadExistingImageFromPath(path) {
        if (!path) return;
        try {
            const url = await storageService.createCustomerDesignSignedUrl(path, 900);
            const img = new Image();
            img.onload = () => {
                const key = `stored-${path}`;
                studio.images.set(key, img);
                studio.imageKey = key;
                studio.image = img;
                studio.elements.image.visible = true;
                draw();
            };
            img.src = url;
        } catch (error) {
            console.error('F1 Design Studio existing image error:', error);
            showToast('Mövcud dizayn önizləməsi açıla bilmədi.');
        }
    }
    function zoom(delta) {
        const item = active();
        if (!item) return;
        if (studio.selected === 'image' && !studio.image) return showToast('Əvvəlcə şəkil əlavə edin.');
        item.scale = clamp(Number(item.scale || 1) + Number(delta || 0), studio.selected === 'text' ? 0.5 : 0.25, 3);
        pushHistory('Ölçü');
        draw();
    }
    function rotate(delta) {
        const item = active();
        if (!item) return;
        item.rotation = ((Number(item.rotation || 0) + Number(delta || 0)) % 360 + 360) % 360;
        pushHistory('Fırlatma');
        draw();
    }
    function setFontSize(value) {
        const n = clamp(Number(value) || 28, 12, 72);
        studio.elements.text.fontSize = n;
        if (el('customFontSize')) el('customFontSize').value = String(n);
        if (el('customFontSizeValue')) el('customFontSizeValue').textContent = `${n}px`;
        if (studio.selected === 'text') pushHistory('Şrift ölçüsü');
        draw();
    }
    function bringForward() {
        const i = studio.order.indexOf(studio.selected);
        if (i < 0 || i === studio.order.length - 1) return;
        [studio.order[i], studio.order[i + 1]] = [studio.order[i + 1], studio.order[i]];
        pushHistory('Qat irəli');
        draw();
    }
    function sendBackward() {
        const i = studio.order.indexOf(studio.selected);
        if (i <= 0) return;
        [studio.order[i], studio.order[i - 1]] = [studio.order[i - 1], studio.order[i]];
        pushHistory('Qat geri');
        draw();
    }
    function deleteElement() {
        const item = active();
        if (!item) return;
        if (studio.selected === 'text') {
            if (!String(item.text || '').trim()) return;
            item.text = '';
            if (el('customText')) el('customText').value = '';
        } else {
            if (!studio.image) return;
            item.visible = false;
        }
        pushHistory('Element silindi');
        draw();
    }
    function draftKey(productId = s.customProductId) {
        return productId ? `${DRAFT_PREFIX}${String(productId)}` : '';
    }
    function saveDraft(layout) {
        const key = draftKey();
        if (!key || !layout) return;
        try { localStorage.setItem(key, JSON.stringify(layout)); } catch (_) {}
    }
    function loadDraft(productId = s.customProductId) {
        const key = draftKey(productId);
        if (!key) return null;
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }
    function clearDraft(productId = s.customProductId) {
        const key = draftKey(productId);
        if (!key) return;
        try { localStorage.removeItem(key); } catch (_) {}
    }
    function discardDraft() {
        clearDraft();
        reset();
        showToast('🗑️ Bu məhsul üçün saxlanmış qaralama silindi.');
    }
    function reset() {
        clearTimeout(studio.historyTimer);
        studio.suppressHistory = true;
        studio.selected = 'image';
        studio.order = ['image', 'text'];
        studio.elements.image = { ...DEFAULTS.image };
        studio.elements.text = { ...DEFAULTS.text, font: 'Klassik', color: '#111', text: '' };
        studio.image = null;
        studio.imageKey = '';
        studio.history = [];
        studio.future = [];
        s.customDesignLayout = null;
        applyTextControls();
        studio.suppressHistory = false;
        pushHistory('Sıfırla');
        draw();
    }
    function selectNext() {
        select(studio.selected === 'image' ? 'text' : 'image');
    }
    function selectPrev() {
        select(studio.selected === 'image' ? 'text' : 'image');
    }
    function centerSelected() {
        const item = active();
        if (!item || !item.visible) return;
        item.x = PRINT.x + PRINT.w / 2;
        item.y = PRINT.y + PRINT.h / 2;
        pushHistory('Element mərkəzləndi');
        draw();
    }
    function fitSelectedToPrint() {
        const item = active();
        if (!item || !item.visible) return;
        if (studio.selected === 'image') {
            if (!studio.image) return showToast('Əvvəlcə şəkil əlavə edin.');
            const m = imageMetrics({ ...item, scale: 1 });
            const maxW = PRINT.w - 16, maxH = PRINT.h - 24;
            item.scale = clamp(Math.min(maxW / Math.max(1, m.w), maxH / Math.max(1, m.h)), 0.25, 3);
        } else {
            item.scale = clamp(Math.min(1.4, (PRINT.w - 22) / Math.max(20, textMetrics().width)), 0.5, 3);
        }
        item.x = PRINT.x + PRINT.w / 2;
        item.y = PRINT.y + PRINT.h / 2;
        pushHistory('Çap sahəsinə sığdırıldı');
        draw();
    }
    function saveLayout({ silent = false, persistDraft = true } = {}) {
        clearTimeout(studio.historyTimer);
        const layout = {
            version: 3,
            canvas: { width: CANVAS_W, height: CANVAS_H },
            selected: studio.selected,
            order: [...studio.order],
            image: {
                x: Math.round(studio.elements.image.x),
                y: Math.round(studio.elements.image.y),
                scale: Number(studio.elements.image.scale.toFixed(2)),
                rotation: Math.round(studio.elements.image.rotation),
                visible: !!studio.elements.image.visible
            },
            text: {
                text: String(studio.elements.text.text || '').slice(0, 80),
                x: Math.round(studio.elements.text.x),
                y: Math.round(studio.elements.text.y),
                scale: Number(studio.elements.text.scale.toFixed(2)),
                rotation: Math.round(studio.elements.text.rotation),
                font: studio.elements.text.font,
                color: studio.elements.text.color,
                fontSize: Math.round(studio.elements.text.fontSize),
                align: studio.elements.text.align,
                visible: !!studio.elements.text.visible
            }
        };
        s.customDesignLayout = layout;
        if (persistDraft) saveDraft(layout);
        if (!silent) showToast('🎨 Dizayn quruluşu yadda saxlanıldı.');
        return layout;
    }
    function restoreLayout(layout) {
        if (!layout || typeof layout !== 'object') return;
        clearTimeout(studio.historyTimer);
        studio.suppressHistory = true;
        const image = layout.image || {};
        const text = layout.text || {};
        studio.selected = layout.selected === 'text' ? 'text' : 'image';
        studio.order = Array.isArray(layout.order) ? layout.order.filter(x => x === 'image' || x === 'text') : ['image', 'text'];
        if (!studio.order.includes('image')) studio.order.unshift('image');
        if (!studio.order.includes('text')) studio.order.push('text');
        studio.elements.image = {
            ...DEFAULTS.image,
            x: clamp(Number(image.x) || 150, 10, CANVAS_W - 10),
            y: clamp(Number(image.y) || 105, 10, CANVAS_H - 10),
            scale: clamp(Number(image.scale) || 1, 0.25, 3),
            rotation: Number(image.rotation) || 0,
            visible: image.visible !== false
        };
        studio.elements.text = {
            ...DEFAULTS.text,
            text: String(text.text || '').slice(0, 80),
            x: clamp(Number(text.x) || 150, 10, CANVAS_W - 10),
            y: clamp(Number(text.y) || 185, 10, CANVAS_H - 10),
            scale: clamp(Number(text.scale) || 1, 0.5, 3),
            rotation: Number(text.rotation) || 0,
            font: text.font || 'Klassik',
            color: text.color || '#111',
            fontSize: clamp(Number(text.fontSize) || 28, 12, 72),
            align: ['left', 'center', 'right'].includes(text.align) ? text.align : 'center',
            visible: text.visible !== false
        };
        applyTextControls();
        studio.suppressHistory = false;
        studio.history = [];
        studio.future = [];
        pushHistory('Layout bərpa edildi');
        draw();
    }
    function onKeyDown(event) {
        if (!document.getElementById('customModal')?.classList.contains('show')) return;
        if (event.target?.matches?.('input, textarea, select')) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            event.shiftKey ? redo() : undo();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            redo();
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            deleteElement();
        } else if (event.key === 'Tab') {
            event.preventDefault();
            selectNext();
        } else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
            const item = active();
            if (!item || !item.visible) return;
            event.preventDefault();
            const step = event.shiftKey ? 10 : 2;
            if (event.key === 'ArrowLeft') item.x = clamp(item.x - step, 10, CANVAS_W - 10);
            if (event.key === 'ArrowRight') item.x = clamp(item.x + step, 10, CANVAS_W - 10);
            if (event.key === 'ArrowUp') item.y = clamp(item.y - step, 10, CANVAS_H - 10);
            if (event.key === 'ArrowDown') item.y = clamp(item.y + step, 10, CANVAS_H - 10);
            queueHistory('Klaviatura ilə hərəkət');
            draw();
        }
    }
    const c = canvas();
    c?.addEventListener('pointerdown', down);
    c?.addEventListener('pointermove', move);
    c?.addEventListener('pointerup', up);
    c?.addEventListener('pointercancel', up);
    c?.addEventListener('dblclick', event => {
        const p = point(event);
        if (hitText(p)) select('text');
        else if (hitImage(p)) select('image');
    });
    ['customText', 'customFont', 'customColor', 'customFontSize', 'customTextAlign'].forEach(id => {
        el(id)?.addEventListener('input', () => syncFormToState());
        el(id)?.addEventListener('change', () => syncFormToState());
    });
    el('customImage')?.addEventListener('change', event => loadFile(event.target.files?.[0]));
    document.addEventListener('keydown', onKeyDown);
    Object.assign(ctx, {
        drawDesignStudio: draw,
        syncDesignStudio: () => syncFormToState({ history: false }),
        resetDesignStudio: reset,
        saveDesignLayout: saveLayout,
        zoomDesign: zoom,
        rotateDesign: rotate,
        deleteDesignElement: deleteElement,
        selectNextDesignElement: selectNext,
        selectPrevDesignElement: selectPrev,
        restoreDesignLayout: restoreLayout,
        exportDesignPreview: () => {
            const c = canvas();
            if (!c) return;
            saveLayout();
            const a = document.createElement('a');
            a.download = 'f1-studio-design-preview.png';
            a.href = c.toDataURL('image/png');
            a.click();
        },
        undoDesign: undo,
        redoDesign: redo,
        bringDesignElementForward: bringForward,
        sendDesignElementBackward: sendBackward,
        setDesignFontSize: setFontSize,
        centerDesignElement: centerSelected,
        fitDesignElementToPrint: fitSelectedToPrint,
        loadExistingDesignIntoStudio: loadExistingImageFromPath,
        loadDesignDraft: loadDraft,
        clearDesignDraft: clearDraft,
        discardDesignDraft: discardDraft
    });
    requestAnimationFrame(() => {
        ensureHistoryBaseline();
        draw();
    });
}
