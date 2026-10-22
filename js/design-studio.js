import { showToast } from './ui.js';
import { state as s, ctx } from './state.js';
import { storageService } from './services/storage-service.js';
import { inspectDesignFile } from './services/design-file-validation.js';
import { DESIGN_TEMPLATE_CATEGORIES, getCompatibleDesignTemplates, searchCompatibleDesignTemplates } from './design-templates.js';

// Logical coordinates keep older v3 customer layouts editable. The canvas is
// rendered at 4x resolution so PNG previews stay crisp without scaling uploads.
const CANVAS_W = 300;
const CANVAS_H = 240;
const PIXEL_RATIO = 4;
const PRINT = { x: 22, y: 22, w: 256, h: 196 };
const MAX_LAYERS = 30;
const FONT_MAP = {
    Klassik: 'Georgia, "Times New Roman", serif',
    Modern: '"Segoe UI", Arial, sans-serif',
    Qalın: 'Arial, "Segoe UI", sans-serif',
    Əlyazma: '"Segoe Script", "Comic Sans MS", cursive',
    'Operatorla seçim': 'Arial, sans-serif'
};
const COLOR_MAP = { Qara: '#30251a', Ağ: '#ffffff', Qızılı: '#b88919', Gümüşü: '#8b9299', Digər: '#333333' };
const DRAFT_PREFIX = 'f1DesignDraft:v1:';
const SAFE_MOTIFS = new Set(['heart', 'star', 'flower', 'divider']);
const SAFE_SHAPES = new Set(['rectangle', 'circle', 'line', 'border']);
const SAFE_BACKGROUNDS = new Set(['solid', 'dots', 'lines']);
let draftDatabasePromise = null;
let draftAssetsDatabasePromise = null;

function openDraftDatabase() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    if (!draftDatabasePromise) {
        draftDatabasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('f1-design-studio-drafts');
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('uploads')) db.createObjectStore('uploads', { keyPath: 'productId' });
            };
            request.onsuccess = () => {
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };
            request.onerror = () => reject(request.error || new Error('DRAFT_DB_OPEN_FAILED'));
            request.onblocked = () => reject(new Error('DRAFT_DB_BLOCKED'));
        }).catch(error => { draftDatabasePromise = null; throw error; });
    }
    return draftDatabasePromise;
}

export function initDesignStudio() {
    const studio = {
        canvas: null,
        ctx: null,
        layers: [], // back-to-front
        selectedId: '',
        images: new Map(),
        uploadFile: null,
        attachmentFile: null,
        pendingFiles: new Map(),
        drag: null,
        pointers: new Map(),
        pinch: null,
        history: [],
        future: [],
        historyTimer: null,
        historyPendingLabel: '',
        autosaveTimer: null,
        suppressHistory: false,
        imageLoadToken: 0,
        replaceLayerId: '',
        idCounter: 0,
        qrCache: new Map(),
        mode: 'product',
        templatePreviewId: '',
        outputView: 'canvas',
        mockupUrl: ''
    };

    const $ = id => document.getElementById(id);
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const active = () => studio.layers.find(layer => layer.id === studio.selectedId) || null;
    const imageFor = layer => layer?.type === 'image' ? studio.images.get(layer.assetKey) || null : null;
    const currentUploadFile = () => studio.attachmentFile || studio.pendingFiles.values().next().value || studio.uploadFile || null;
    function updateUploadStatus() {
        const status = $('customImageName');
        if (!status) return;
        const attachment = studio.attachmentFile || (s.customExistingUploads || []).find(upload => upload.purpose === 'attachment');
        const imageLayers = studio.layers.filter(layer => layer.type === 'image');
        const imageCount = imageLayers.length;
        const names = imageLayers.map(layer => layer.name).filter(Boolean);
        const summaries = [];
        if (imageCount) summaries.push(`${imageCount} şəkil${names.length ? ` · ${[...new Set(names)].slice(0, 3).join(', ')}` : ''}`);
        if (attachment) summaries.push(`PDF: ${attachment.name || 'sifariş əlavəsi'}`);
        status.textContent = summaries.join(' · ') || 'Fayl seçilməyib';
    }
    const selectedName = layer => {
        if (!layer) return 'Heç nə seçilməyib';
        if (layer.label) return layer.label;
        if (layer.type === 'text') return `Mətn · ${layer.text.trim().slice(0, 24) || 'Yeni mətn'}`;
        if (layer.type === 'image') return 'Şəkil / logo';
        if (layer.type === 'qr') return `QR kod · ${String(layer.content || '').trim().slice(0, 18) || 'Məzmun daxil edin'}`;
        if (layer.type === 'shape') return `Forma · ${({ rectangle: 'Düzbucaqlı', circle: 'Dairə', line: 'Xətt', border: 'Çərçivə' })[layer.shape] || 'Forma'}`;
        if (layer.type === 'background') return `Fon · ${({ solid: 'Açıq', dots: 'Nöqtəli', lines: 'Xətli' })[layer.pattern] || 'Sadə'}`;
        return `Dekor · ${({ heart: 'Ürək', star: 'Ulduz', flower: 'Gül', divider: 'Xətt' })[layer.motif] || 'Element'}`;
    };
    const nextId = type => `${type}-${Date.now().toString(36)}-${(++studio.idCounter).toString(36)}`;

    function snapshot() {
        return {
            selectedId: studio.selectedId,
            layers: studio.layers.map(layer => ({ ...layer })),
            uploadFile: studio.uploadFile,
            attachmentFile: studio.attachmentFile,
            pendingFiles: new Map(studio.pendingFiles),
            images: new Map(studio.images),
            existingImageName: s.customExistingImageName || '',
            existingImageUrl: s.customExistingImageUrl || '',
            existingImagePath: s.customExistingImagePath || '',
            existingUploads: (s.customExistingUploads || []).map(upload => ({ ...upload }))
        };
    }

    function historySignature(value) {
        const file = value?.uploadFile;
        const attachment = value?.attachmentFile;
        return JSON.stringify({
            selectedId: value?.selectedId,
            layers: value?.layers,
            existingImageName: value?.existingImageName,
            existingImagePath: value?.existingImagePath,
            existingUploads: value?.existingUploads,
            upload: file ? [file.name, file.type, file.size, file.lastModified] : null,
            attachment: attachment ? [attachment.name, attachment.type, attachment.size, attachment.lastModified] : null,
            pendingFiles: [...(value?.pendingFiles || [])].map(([id, pending]) => [id, pending?.name, pending?.type, pending?.size, pending?.lastModified])
        });
    }

    function setImageInputFile(file) {
        const input = $('customImage');
        if (!input) return;
        if (!file) { input.value = ''; return; }
        if (typeof DataTransfer === 'undefined') return;
        try {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
        } catch (error) {
            console.warn('F1 Design Studio fayl seçimi geri bərpa olunmadı:', error);
        }
    }

function openDraftAssetsDatabase() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    if (!draftAssetsDatabasePromise) {
        draftAssetsDatabasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('f1-design-studio-assets', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('assets')) {
                    const assets = db.createObjectStore('assets', { keyPath: 'key' });
                    assets.createIndex('productId', 'productId', { unique: false });
                }
            };
            request.onsuccess = () => {
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };
            request.onerror = () => reject(request.error || new Error('DRAFT_ASSET_DB_OPEN_FAILED'));
            request.onblocked = () => reject(new Error('DRAFT_ASSET_DB_BLOCKED'));
        }).catch(error => { draftAssetsDatabasePromise = null; throw error; });
    }
    return draftAssetsDatabasePromise;
}

    function restoreSnapshot(snap) {
        if (!snap || !Array.isArray(snap.layers)) return;
        studio.layers = snap.layers.slice(0, MAX_LAYERS).map(layer => ({ ...layer }));
        studio.selectedId = studio.layers.some(layer => layer.id === snap.selectedId) ? snap.selectedId : studio.layers.at(-1)?.id || '';
        studio.uploadFile = snap.uploadFile || null;
        studio.attachmentFile = snap.attachmentFile || null;
        studio.pendingFiles = new Map(snap.pendingFiles || []);
        studio.images = new Map(snap.images || studio.images);
        s.customExistingImageName = snap.existingImageName || '';
        s.customExistingImageUrl = snap.existingImageUrl || '';
        s.customExistingImagePath = snap.existingImagePath || '';
        s.customExistingUploads = (snap.existingUploads || []).map(upload => ({ ...upload }));
        setImageInputFile(studio.uploadFile);
        updateUploadStatus();
        const attachmentFile = studio.attachmentFile || (studio.uploadFile?.type === 'application/pdf' ? studio.uploadFile : null);
        if (attachmentFile) storeDraftUpload(attachmentFile).catch(error => console.warn('F1 Design Studio qaralama əlavəsi bərpa olunmadı:', error));
        else {
            removeDraftUpload().catch(error => console.warn('F1 Design Studio qaralama faylı silinmədi:', error));
        }
        Promise.all([...studio.pendingFiles].map(([id, file]) => storeDraftImage(file, id)))
            .catch(error => console.warn('F1 Design Studio şəkil qaralaması bərpa olunmadı:', error));
        syncInspector();
        draw();
        renderLayers();
        ctx.updateCustomizationPreview?.();
        scheduleAutosave();
    }

    function pushHistory(label = '') {
        if (studio.suppressHistory) return;
        const current = snapshot();
        const last = studio.history.at(-1);
        if (last && historySignature(last.snapshot) === historySignature(current)) return;
        studio.history.push({ label, snapshot: current });
        if (studio.history.length > 80) studio.history.shift();
        studio.future = [];
    }

    function queueHistory(label = 'Dəyişiklik') {
        clearTimeout(studio.historyTimer);
        studio.historyPendingLabel = label;
        studio.historyTimer = setTimeout(() => flushQueuedHistory(), 260);
    }

    function flushQueuedHistory({ save = true } = {}) {
        if (studio.historyTimer === null && !studio.historyPendingLabel) return false;
        clearTimeout(studio.historyTimer);
        studio.historyTimer = null;
        const label = studio.historyPendingLabel || 'Dəyişiklik';
        studio.historyPendingLabel = '';
        pushHistory(label);
        if (save) saveLayout({ silent: true });
        return true;
    }

    function discardQueuedHistory() {
        clearTimeout(studio.historyTimer);
        studio.historyTimer = null;
        studio.historyPendingLabel = '';
    }

    function ensureHistoryBaseline() {
        if (!studio.history.length) pushHistory('Başlanğıc');
    }

    function undo() {
        flushQueuedHistory({ save: false });
        ensureHistoryBaseline();
        if (studio.history.length <= 1) return showToast('Geri qaytarılacaq dəyişiklik yoxdur.');
        const current = studio.history.pop();
        studio.future.push(current);
        studio.suppressHistory = true;
        restoreSnapshot(studio.history.at(-1).snapshot);
        studio.suppressHistory = false;
        showToast('Son dəyişiklik geri qaytarıldı.');
    }

    function redo() {
        flushQueuedHistory({ save: false });
        const next = studio.future.pop();
        if (!next) return showToast('Yenidən ediləcək dəyişiklik yoxdur.');
        studio.suppressHistory = true;
        restoreSnapshot(next.snapshot);
        studio.suppressHistory = false;
        studio.history.push(next);
        showToast('Dəyişiklik yenidən tətbiq edildi.');
    }

    function canvasPoint(event) {
        const c = $('designCanvas');
        const rect = c.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * (CANVAS_W / rect.width),
            y: (event.clientY - rect.top) * (CANVAS_H / rect.height)
        };
    }

    function rotatePoint(x, y, cx, cy, deg) {
        const r = -deg * Math.PI / 180;
        const dx = x - cx, dy = y - cy;
        return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
    }

    function imageMetrics(layer) {
        const img = imageFor(layer);
        if (!img) return null;
        const crop = clamp(Number(layer.crop) || 0, 0, .4);
        const width = (img.naturalWidth || img.width) * (1 - crop * 2);
        const height = (img.naturalHeight || img.height) * (1 - crop * 2);
        const ratio = Math.min(1, 200 / Math.max(1, width, height));
        return { w: width * ratio * layer.scale, h: height * ratio * layer.scale, sx: (img.naturalWidth || img.width) * crop, sy: (img.naturalHeight || img.height) * crop, sw: width, sh: height };
    }

    function textFont(layer) {
        const requestedWeight = Number(layer.fontWeight);
        const weight = [400, 500, 600, 700, 800].includes(requestedWeight) ? requestedWeight : (layer.bold === false ? 400 : 700);
        const style = layer.italic === true ? 'italic ' : '';
        return `${style}${weight} ${Math.round(layer.fontSize * layer.scale)}px ${FONT_MAP[layer.font] || FONT_MAP.Klassik}`;
    }

    function textLineWidth(line, layer, g = studio.ctx) {
        const spacing = clamp(Number(layer.letterSpacing) || 0, -2, 10) * layer.scale;
        return g.measureText(line || 'Mətn').width + Math.max(0, Array.from(line || 'Mətn').length - 1) * spacing;
    }

    function wrappedTextLines(layer, g = studio.ctx) {
        g.save();
        g.font = textFont(layer);
        const maxWidth = clamp(Number(layer.boxWidth) || 236, 30, PRINT.w - 12);
        const lines = [];
        for (const raw of String(layer.text || '').slice(0, 80).split('\n').slice(0, 8)) {
            const words = raw.split(/\s+/).filter(Boolean);
            if (!words.length) { lines.push(''); continue; }
            let line = '';
            for (const word of words) {
                const candidate = line ? `${line} ${word}` : word;
                if (line && textLineWidth(candidate, layer, g) > maxWidth) {
                    lines.push(line); line = '';
                }
                if (textLineWidth(word, layer, g) <= maxWidth) {
                    line = line ? `${line} ${word}` : word;
                    continue;
                }
                for (const char of Array.from(word)) {
                    const test = line + char;
                    if (line && textLineWidth(test, layer, g) > maxWidth) { lines.push(line); line = char; }
                    else line = test;
                }
            }
            if (line) lines.push(line);
            if (lines.length >= 8) break;
        }
        g.restore();
        return lines.slice(0, 8);
    }

    function textMetrics(layer) {
        const g = studio.ctx;
        g.save();
        const width = clamp(Number(layer.boxWidth) || 220, 20, PRINT.w);
        const height = clamp(Number(layer.boxHeight) || 48, 20, PRINT.h);
        g.restore();
        return { width, height, w: width, h: height };
    }

    function fittedTextLayout(layer, g) {
        const boxWidth = clamp(Number(layer.boxWidth) || 220, 30, PRINT.w);
        const boxHeight = clamp(Number(layer.boxHeight) || 48, 20, PRINT.h);
        const lineHeight = clamp(Number(layer.lineHeight) || 1.2, .8, 2);
        let fit = 1, lines = [];
        for (let attempt = 0; attempt < 3; attempt++) {
            const probe = { ...layer, scale: layer.scale * fit };
            g.font = textFont(probe);
            lines = wrappedTextLines(probe, g);
            const widest = Math.max(1, ...lines.map(line => textLineWidth(line, probe, g)));
            const fontSize = layer.fontSize * layer.scale * fit;
            const contentHeight = Math.max(1, lines.length) * fontSize * lineHeight;
            const next = fit * Math.min(1, boxWidth / widest, boxHeight / contentHeight);
            if (Math.abs(next - fit) < .005) break;
            fit = Math.max(.12, next);
        }
        const finalLayer = { ...layer, scale: layer.scale * fit };
        g.font = textFont(finalLayer);
        lines = wrappedTextLines(finalLayer, g);
        return { lines, fit, fontSize: layer.fontSize * layer.scale * fit, lineHeight, boxWidth, boxHeight, layer: finalLayer };
    }

    function layerBounds(layer) {
        if (layer.type === 'image') return imageMetrics(layer);
        if (layer.type === 'text') return textMetrics(layer);
        if (layer.type === 'shape') return { w: clamp(Number(layer.width) || 80, 8, PRINT.w) * layer.scale, h: clamp(Number(layer.height) || 52, 8, PRINT.h) * layer.scale };
        if (layer.type === 'background') return { w: PRINT.w, h: PRINT.h };
        if (layer.type === 'qr') { const side = clamp(Number(layer.size) || 96, 48, 160) * layer.scale; return { w: side, h: side }; }
        const size = layer.motif === 'divider' ? 72 : 42;
        return { w: size * layer.scale, h: size * layer.scale };
    }

    function constrainLayerToWorkArea(layer) {
        if (!layer) return;
        if (layer.type === 'background') {
            layer.x = PRINT.x + PRINT.w / 2;
            layer.y = PRINT.y + PRINT.h / 2;
            return;
        }
        const bounds = layerBounds(layer);
        if (!bounds) return;
        const angle = (Number(layer.rotation) || 0) * Math.PI / 180;
        const halfWidth = (Math.abs(Math.cos(angle)) * bounds.w + Math.abs(Math.sin(angle)) * bounds.h) / 2;
        const halfHeight = (Math.abs(Math.sin(angle)) * bounds.w + Math.abs(Math.cos(angle)) * bounds.h) / 2;
        const insetX = Math.min(halfWidth, PRINT.w / 2);
        const insetY = Math.min(halfHeight, PRINT.h / 2);
        layer.x = clamp(Number(layer.x) || PRINT.x + PRINT.w / 2, PRINT.x + insetX, PRINT.x + PRINT.w - insetX);
        layer.y = clamp(Number(layer.y) || PRINT.y + PRINT.h / 2, PRINT.y + insetY, PRINT.y + PRINT.h - insetY);
    }

    function hitLayer(layer, point) {
        if (!layer || !layer.visible || layer.locked) return false;
        if (layer.type === 'image' && !imageFor(layer)) return false;
        if (layer.type === 'text' && !String(layer.text || '').trim()) return false;
        const bounds = layerBounds(layer);
        if (!bounds) return false;
        const p = rotatePoint(point.x, point.y, layer.x, layer.y, layer.rotation);
        return Math.abs(p.x - layer.x) <= bounds.w / 2 + 7 && Math.abs(p.y - layer.y) <= bounds.h / 2 + 7;
    }

    function drawHeart(g, size, color) {
        g.beginPath();
        g.moveTo(0, size * .32);
        g.bezierCurveTo(-size * .08, size * .18, -size * .5, -size * .08, -size * .32, -size * .36);
        g.bezierCurveTo(-size * .2, -size * .53, -size * .02, -size * .45, 0, -size * .3);
        g.bezierCurveTo(size * .05, -size * .48, size * .28, -size * .53, size * .4, -size * .34);
        g.bezierCurveTo(size * .56, -size * .08, size * .12, size * .25, 0, size * .32);
        g.closePath();
        g.fillStyle = color;
        g.fill();
    }

    function drawMotif(g, layer) {
        const size = (layer.motif === 'divider' ? 56 : 28) * layer.scale;
        const color = layer.color || COLOR_MAP.Qızılı;
        g.save();
        g.globalAlpha = clamp(Number(layer.opacity ?? 1), 0, 1);
        g.translate(layer.x, layer.y);
        g.rotate(layer.rotation * Math.PI / 180);
        g.fillStyle = color;
        g.strokeStyle = color;
        g.lineWidth = 1.5;
        if (layer.motif === 'heart') drawHeart(g, size, color);
        else if (layer.motif === 'star') {
            g.beginPath();
            for (let i = 0; i < 10; i++) {
                const radius = i % 2 ? size * .23 : size * .5;
                const angle = -Math.PI / 2 + i * Math.PI / 5;
                const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
                i ? g.lineTo(x, y) : g.moveTo(x, y);
            }
            g.closePath(); g.fill();
        } else if (layer.motif === 'flower') {
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3;
                g.beginPath();
                g.ellipse(Math.cos(a) * size * .2, Math.sin(a) * size * .2, size * .15, size * .27, a, 0, Math.PI * 2);
                g.fill();
            }
            g.beginPath(); g.arc(0, 0, size * .1, 0, Math.PI * 2); g.fill();
        } else {
            g.beginPath(); g.moveTo(-size, 0); g.lineTo(-size * .28, 0); g.moveTo(size * .28, 0); g.lineTo(size, 0); g.stroke();
            drawHeart(g, size * .55, color);
        }
        g.restore();
    }

    function getQrMatrix(content) {
        const value = String(content || '').trim().slice(0, 512);
        if (!value || typeof window.qrcode !== 'function' || typeof TextEncoder === 'undefined') return null;
        if (studio.qrCache.has(value)) return studio.qrCache.get(value);
        try {
            const encoder = window.qrcode(0, 'M');
            // qrcode-generator defaults to a single-byte mapping. Supply UTF-8
            // bytes so Azerbaijani text is encoded consistently as QR byte data.
            window.qrcode.stringToBytes = input => Array.from(new TextEncoder().encode(input));
            encoder.addData(value, 'Byte');
            encoder.make();
            const count = encoder.getModuleCount();
            const matrix = Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, col) => encoder.isDark(row, col)));
            studio.qrCache.set(value, matrix);
            if (studio.qrCache.size > 24) studio.qrCache.delete(studio.qrCache.keys().next().value);
            return matrix;
        } catch (_) {
            studio.qrCache.set(value, null);
            return null;
        }
    }

    function drawBasicShape(g, layer) {
        const width = clamp(Number(layer.width) || 80, 8, PRINT.w) * layer.scale;
        const height = clamp(Number(layer.height) || 52, 8, PRINT.h) * layer.scale;
        const strokeWidth = clamp(Number(layer.strokeWidth) || 2, 1, 12);
        g.beginPath();
        if (layer.shape === 'circle') g.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
        else if (layer.shape === 'line') { g.moveTo(-width / 2, 0); g.lineTo(width / 2, 0); }
        else {
            const inset = strokeWidth / 2;
            g.rect(-width / 2 + inset, -height / 2 + inset, Math.max(1, width - strokeWidth), Math.max(1, height - strokeWidth));
        }
        if (layer.filled && ['rectangle', 'circle'].includes(layer.shape)) {
            g.fillStyle = layer.fillColor || '#d8c8aa';
            g.fill();
        }
        if (!layer.filled || ['line', 'border'].includes(layer.shape)) {
            g.strokeStyle = layer.strokeColor || layer.fillColor || '#30251a';
            g.lineWidth = strokeWidth;
            g.stroke();
        } else if (layer.strokeWidth > 0 && layer.strokeColor) {
            g.strokeStyle = layer.strokeColor;
            g.lineWidth = strokeWidth;
            g.stroke();
        }
    }

    function drawBackground(g, layer) {
        const x = -PRINT.w / 2, y = -PRINT.h / 2;
        g.fillStyle = layer.fillColor || '#f5f3ef';
        g.fillRect(x, y, PRINT.w, PRINT.h);
        if (layer.pattern === 'dots') {
            g.fillStyle = layer.patternColor || '#c6bba9';
            for (let py = y + 8; py < y + PRINT.h; py += 12) {
                for (let px = x + 8; px < x + PRINT.w; px += 12) {
                    g.beginPath(); g.arc(px, py, .65, 0, Math.PI * 2); g.fill();
                }
            }
        } else if (layer.pattern === 'lines') {
            g.strokeStyle = layer.patternColor || '#c6bba9';
            g.lineWidth = .5;
            for (let py = y + 8; py < y + PRINT.h; py += 10) {
                g.beginPath(); g.moveTo(x, py); g.lineTo(x + PRINT.w, py); g.stroke();
            }
        }
    }

    function drawQr(g, layer) {
        const matrix = getQrMatrix(layer.content);
        if (!matrix) return;
        const quietZone = 4;
        const count = matrix.length;
        const moduleCount = count + quietZone * 2;
        const side = clamp(Number(layer.size) || 96, 48, 160) * layer.scale;
        const unit = side / moduleCount;
        const start = -side / 2;
        g.fillStyle = layer.backgroundColor || '#ffffff';
        g.fillRect(start, start, side, side);
        g.fillStyle = layer.foregroundColor || '#111111';
        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (!matrix[row][col]) continue;
                const left = start + (col + quietZone) * unit;
                const top = start + (row + quietZone) * unit;
                g.fillRect(left, top, Math.ceil(unit + .08), Math.ceil(unit + .08));
            }
        }
    }

    function drawLayer(g, layer) {
        if (!layer.visible) return;
        g.save();
        g.globalAlpha = clamp(Number(layer.opacity ?? 1), 0, 1);
        g.translate(layer.x, layer.y);
        g.rotate(layer.rotation * Math.PI / 180);
        if (layer.type === 'image') {
            const img = imageFor(layer), m = imageMetrics(layer);
            if (img && m) g.drawImage(img, m.sx, m.sy, m.sw, m.sh, -m.w / 2, -m.h / 2, m.w, m.h);
        } else if (layer.type === 'text') {
            const layout = fittedTextLayout(layer, g);
            const { lines, fontSize, lineHeight, boxWidth, boxHeight } = layout;
            g.fillStyle = layer.color || COLOR_MAP.Qara;
            g.font = textFont(layout.layer);
            g.textAlign = layer.align || 'center';
            g.textBaseline = 'top';
            const x = layer.align === 'left' ? -boxWidth / 2 : layer.align === 'right' ? boxWidth / 2 : 0;
            const effectColor = /^#[0-9a-f]{6}$/i.test(layer.effectColor || '') ? layer.effectColor : '#3b2114';
            const contentHeight = fontSize * lineHeight * lines.length;
            const top = layer.verticalAlign === 'top' ? -boxHeight / 2 : layer.verticalAlign === 'bottom' ? boxHeight / 2 - contentHeight : -contentHeight / 2;
            const spacing = clamp(Number(layer.letterSpacing) || 0, -2, 10) * layer.scale * layout.fit;
            lines.forEach((line, index) => {
                const y = top + index * fontSize * lineHeight;
                const width = textLineWidth(line, layer, g);
                const textX = x;
                const startX = layer.align === 'left' ? x : layer.align === 'right' ? x - width : x - width / 2;
                if (layer.effect === 'shadow') {
                    g.shadowColor = `${effectColor}88`;
                    g.shadowBlur = Math.max(1, fontSize * .12);
                    g.shadowOffsetX = fontSize * .06;
                    g.shadowOffsetY = fontSize * .08;
                } else if (layer.effect === 'outline') {
                    g.lineJoin = 'round';
                    g.lineWidth = Math.max(1, fontSize * .055);
                    g.strokeStyle = effectColor;
                }
                if (spacing === 0) {
                    if (layer.effect === 'outline') g.strokeText(line, textX, y, boxWidth);
                    g.fillText(line, textX, y, boxWidth);
                } else {
                    let cursor = startX;
                    g.textAlign = 'left';
                    for (const char of Array.from(line)) {
                        if (layer.effect === 'outline') g.strokeText(char, cursor, y);
                        g.fillText(char, cursor, y);
                        cursor += g.measureText(char).width + spacing;
                    }
                    g.textAlign = layer.align || 'center';
                }
                g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
                if (layer.underline) {
                    const left = startX;
                    const right = left + width;
                    const underlineY = y + fontSize * .95;
                    g.beginPath(); g.moveTo(left, underlineY); g.lineTo(right, underlineY);
                    g.strokeStyle = layer.color || COLOR_MAP.Qara;
                    g.lineWidth = Math.max(.8, fontSize * .045); g.stroke();
                }
            });
        } else if (layer.type === 'ornament') {
            g.restore();
            drawMotif(g, layer);
            return;
        } else if (layer.type === 'shape') {
            drawBasicShape(g, layer);
        } else if (layer.type === 'background') {
            drawBackground(g, layer);
        } else if (layer.type === 'qr') {
            drawQr(g, layer);
        }
        g.restore();
    }

    function drawSelection(g, layer) {
        if (!layer?.visible || (layer.type === 'image' && !imageFor(layer))) return;
        const bounds = layerBounds(layer);
        if (!bounds) return;
        g.save();
        g.translate(layer.x, layer.y);
        g.rotate(layer.rotation * Math.PI / 180);
        g.strokeStyle = '#d4a44d';
        g.lineWidth = 1.4;
        g.setLineDash([3, 2]);
        g.strokeRect(-bounds.w / 2 - 4, -bounds.h / 2 - 4, bounds.w + 8, bounds.h + 8);
        g.setLineDash([]);
        [[-bounds.w/2-4,-bounds.h/2-4],[bounds.w/2+4,-bounds.h/2-4],[-bounds.w/2-4,bounds.h/2+4],[bounds.w/2+4,bounds.h/2+4]].forEach(([x,y])=>{g.beginPath();g.arc(x,y,1.6,0,Math.PI*2);g.fillStyle='#fff';g.fill();g.stroke();});
        g.restore();
    }

    function drawArtwork(canvas) {
        if (!canvas) return;
        const g = canvas.getContext('2d');
        if (!g) return;
        g.clearRect(0, 0, canvas.width, canvas.height);
        const previousContext = studio.ctx;
        studio.ctx = g;
        g.save();
        g.scale(canvas.width / PRINT.w, canvas.height / PRINT.h);
        g.translate(-PRINT.x, -PRINT.y);
        g.beginPath(); g.rect(PRINT.x, PRINT.y, PRINT.w, PRINT.h); g.clip();
        for (const layer of studio.layers) drawLayer(g, layer);
        g.restore();
        studio.ctx = previousContext;
    }

    function syncProductMockup() {
        const image = $('designMockupImage');
        const fallback = $('designMockupFallback');
        const stage = $('designMockupStage');
        const url = String(s.customProductContext?.image || '').trim();
        if (!image || !stage) return;
        const productName = s.customProductContext?.name || $('customProductName')?.textContent?.split(' · ')[0] || 'Seçilmiş məhsul';
        image.alt = `${productName} üzərində dizaynın təxmini simulyasiyası`;
        if (studio.mockupUrl !== url) {
            studio.mockupUrl = url;
            image.onload = () => { image.hidden = false; if (fallback) fallback.hidden = true; };
            image.onerror = () => { image.hidden = true; if (fallback) fallback.hidden = false; };
            if (url) image.src = url;
            else { image.removeAttribute('src'); image.hidden = true; }
        }
        if (!url && fallback) fallback.hidden = false;
        const productNameNode = $('designMockupName');
        if (productNameNode) productNameNode.textContent = productName;
    }

    function showOutputView(view = 'canvas') {
        if (!['canvas', 'mockup', 'artwork'].includes(view)) return;
        studio.outputView = view;
        const canvasStage = document.querySelector('#customModal .design-canvas-stage');
        const disclaimer = document.querySelector('#customModal .ds-canvas-disclaimer');
        const mockupPanel = $('designMockupPanel'), artworkPanel = $('designArtworkPanel');
        if (canvasStage) canvasStage.hidden = view !== 'canvas';
        if (disclaimer) disclaimer.hidden = view !== 'canvas';
        if (mockupPanel) mockupPanel.hidden = view !== 'mockup';
        if (artworkPanel) artworkPanel.hidden = view !== 'artwork';
        document.querySelectorAll('#customModal .ds-output-switch [data-action="showDesignOutput"]').forEach(button => {
            const selected = JSON.parse(button.dataset.actionArgs || '[""]')[0] === view;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
        if (view === 'mockup') syncProductMockup();
    }

    function updateOutputPreviews() {
        drawArtwork($('designArtworkCanvas'));
        drawArtwork($('designMockupCanvas'));
        syncProductMockup();
    }

    function draw({ exportMode = false } = {}) {
        const c = $('designCanvas');
        if (!c) return;
        studio.layers.forEach(constrainLayerToWorkArea);
        const g = c.getContext('2d');
        studio.canvas = c;
        studio.ctx = g;
        g.clearRect(0, 0, c.width, c.height);
        g.save();
        g.scale(PIXEL_RATIO, PIXEL_RATIO);
        g.fillStyle = '#e7e8e8';
        g.fillRect(0, 0, CANVAS_W, CANVAS_H);
        g.fillStyle = '#f5f3ef';
        g.fillRect(8, 8, CANVAS_W - 16, CANVAS_H - 16);
        g.shadowColor = 'rgba(0,0,0,.12)';
        g.shadowBlur = 5;
        g.fillStyle = '#fffdfa';
        g.fillRect(PRINT.x, PRINT.y, PRINT.w, PRINT.h);
        g.shadowColor = 'transparent'; g.shadowBlur = 0;
        g.strokeStyle = '#b9b0a1'; g.lineWidth = .7; g.setLineDash([3, 2]);
        g.strokeRect(PRINT.x, PRINT.y, PRINT.w, PRINT.h); g.setLineDash([]);
        if (!exportMode) {
            g.fillStyle = '#8a8379'; g.font = '5px Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
            g.fillText('NÜMUNƏ İŞ SAHƏSİ · ÖLÇÜ VERİLMƏYİB', PRINT.x + 3, PRINT.y + 3);
        }
        g.save(); g.beginPath(); g.rect(PRINT.x, PRINT.y, PRINT.w, PRINT.h); g.clip();
        for (const layer of studio.layers) drawLayer(g, layer);
        g.restore();
        if (!exportMode) drawSelection(g, active());
        g.restore();
        updateOutputPreviews();
        updateStatus();
    }

    function getDesignPreviewData() {
        const source = $('designCanvas');
        if (!source) return '';
        const preview = document.createElement('canvas');
        const previewCtx = preview.getContext('2d');
        if (!previewCtx) return '';
        const sizes = [
            { width: 160, height: 128, quality: 0.48 },
            { width: 128, height: 102, quality: 0.4 },
            { width: 96, height: 77, quality: 0.34 }
        ];
        try {
            draw({ exportMode: true });
            for (const size of sizes) {
                preview.width = size.width;
                preview.height = size.height;
                previewCtx.drawImage(source, 0, 0, size.width, size.height);
                const data = preview.toDataURL('image/jpeg', size.quality);
                if (data.length <= 7000) return data;
            }
        } catch (error) {
            console.warn('F1 Design Studio cart preview could not be generated:', error);
        } finally {
            draw();
        }
        return '';
    }

    function updateStatus() {
        const layer = active();
        const status = $('designSelectionStatus');
        if (status) status.textContent = layer ? `${selectedName(layer)}${layer.requiresInput ? ' · mətninizi daxil edin' : ''}${layer.locked ? ' · kilidli' : ''}` : 'Element seçilməyib';
        const name = $('designSelectedName');
        if (name) name.textContent = selectedName(layer);
        const zoom = $('designZoomValue');
        if (zoom) zoom.textContent = `${Math.round((layer?.scale || 1) * 100)}%`;
        const count = $('designLayerCount');
        if (count) count.textContent = String(studio.layers.length);
    }

    function setSaveState(text, saved = false) {
        const node = $('designSaveState');
        if (!node) return;
        node.textContent = text;
        node.classList.toggle('is-saved', saved);
    }

    function draftKey(productId = s.customProductId) {
        return productId ? `${DRAFT_PREFIX}${String(productId)}` : '';
    }

    function saveDraft(layout) {
        const key = draftKey();
        if (!key || !layout) return;
        try {
            const packed = JSON.stringify(layout);
            if (packed.length > 26000) throw new Error('DRAFT_TOO_LARGE');
            localStorage.setItem(key, packed);
            setSaveState('Qaralama yadda saxlanıldı', true);
        } catch (error) {
            setSaveState('Qaralama saxlanmadı', false);
            console.warn('F1 Design Studio qaralaması saxlanmadı:', error);
            if (error?.message === 'DRAFT_TOO_LARGE') showToast('Dizayn qaralaması çox böyükdür. Bəzi qatları silib yenidən saxlayın.');
        }
    }

    async function storeDraftUpload(file, productId = s.customProductId) {
        if (!file || !productId || s.customEditingLineId) return false;
        const db = await openDraftDatabase();
        if (!db) return false;
        const blob = file.slice(0, file.size, file.type);
        return new Promise((resolve, reject) => {
            const tx = db.transaction('uploads', 'readwrite');
            tx.objectStore('uploads').put({ productId: String(productId), name: String(file.name || 'dizayn-fayli').slice(0, 180), type: file.type, size: file.size, lastModified: Number(file.lastModified) || Date.now(), blob });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('DRAFT_UPLOAD_SAVE_FAILED'));
            tx.onabort = () => reject(tx.error || new Error('DRAFT_UPLOAD_SAVE_FAILED'));
        });
    }

    async function readDraftUpload(productId = s.customProductId) {
        if (!productId) return null;
        const db = await openDraftDatabase();
        if (!db) return null;
        return new Promise((resolve, reject) => {
            const tx = db.transaction('uploads', 'readonly');
            const request = tx.objectStore('uploads').get(String(productId));
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('DRAFT_UPLOAD_READ_FAILED'));
        });
    }

    async function removeDraftUpload(productId = s.customProductId) {
        if (!productId || s.customEditingLineId) return;
        const db = await openDraftDatabase();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction('uploads', 'readwrite');
            tx.objectStore('uploads').delete(String(productId));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('DRAFT_UPLOAD_DELETE_FAILED'));
        });
    }

    async function storeDraftImage(file, layerId, productId = s.customProductId) {
        if (!file || !layerId || !productId || s.customEditingLineId) return false;
        const db = await openDraftAssetsDatabase();
        if (!db) return false;
        const blob = file.slice(0, file.size, file.type);
        const id = String(layerId).slice(0, 48);
        return new Promise((resolve, reject) => {
            const tx = db.transaction('assets', 'readwrite');
            tx.objectStore('assets').put({ key: `${String(productId)}:${id}`, productId: String(productId), layerId: id, name: String(file.name || 'dizayn-sekli').slice(0, 180), type: file.type, size: file.size, lastModified: Number(file.lastModified) || Date.now(), blob });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('DRAFT_IMAGE_SAVE_FAILED'));
            tx.onabort = () => reject(tx.error || new Error('DRAFT_IMAGE_SAVE_FAILED'));
        });
    }

    async function readDraftImages(productId = s.customProductId) {
        if (!productId) return [];
        const db = await openDraftAssetsDatabase();
        if (!db) return [];
        return new Promise((resolve, reject) => {
            const tx = db.transaction('assets', 'readonly');
            const request = tx.objectStore('assets').index('productId').getAll(String(productId));
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('DRAFT_IMAGES_READ_FAILED'));
        });
    }

    async function removeDraftImage(productId, layerId) {
        if (!productId || !layerId || s.customEditingLineId) return;
        const db = await openDraftAssetsDatabase();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction('assets', 'readwrite');
            tx.objectStore('assets').delete(`${String(productId)}:${String(layerId).slice(0, 48)}`);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('DRAFT_IMAGE_DELETE_FAILED'));
        });
    }

    async function removeDraftImages(productId = s.customProductId) {
        const records = await readDraftImages(productId);
        if (!records.length || s.customEditingLineId) return;
        const db = await openDraftAssetsDatabase();
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction('assets', 'readwrite');
            const store = tx.objectStore('assets');
            records.forEach(record => store.delete(record.key));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('DRAFT_IMAGES_DELETE_FAILED'));
        });
    }

    async function restoreDraftImages(productId = s.customProductId) {
        try {
            const records = await readDraftImages(productId);
            if (String(s.customProductId) !== String(productId) || typeof File === 'undefined') return false;
            let restored = false;
            for (const layer of studio.layers.filter(item => item.type === 'image')) {
                if (imageFor(layer)) continue;
                const record = records.find(item => item.layerId === layer.id || (layer.sourceLayerId && item.layerId === layer.sourceLayerId));
                if (!record) continue;
                const file = new File([record.blob], record.name || 'dizayn-sekli', { type: record.type || '', lastModified: record.lastModified || Date.now() });
                await loadFile(file, { targetLayerId: layer.id, fromDraft: true, quiet: true });
                restored = !!imageFor(layer) || restored;
            }
            return restored;
        } catch (error) {
            console.warn('F1 Design Studio yerli şəkil qaralaması bərpa edilmədi:', error);
            return false;
        }
    }

    async function restoreDraftUpload(productId = s.customProductId) {
        try {
            const record = await readDraftUpload(productId);
            if (!record || String(s.customProductId) !== String(productId) || typeof File === 'undefined') return false;
            const file = new File([record.blob], record.name || 'dizayn-fayli', { type: record.type || '', lastModified: record.lastModified || Date.now() });
            studio.uploadFile = file;
            if (file.type === 'application/pdf') studio.attachmentFile = file;
            setImageInputFile(file);
            const status = $('customImageName');
            if (status) status.textContent = `Qaralamadan bərpa edildi: ${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
            if (file.type === 'application/pdf') return true;
            if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                const placeholder = studio.layers.find(layer => layer.type === 'image' && !imageFor(layer));
                const loaded = await loadFile(file, { targetLayerId: placeholder?.id || '', fromDraft: true, quiet: true });
                if (loaded === 'image') {
                    const layer = studio.layers.find(item => item.type === 'image' && item.assetKey && studio.pendingFiles.get(item.id) === file);
                    const persisted = layer ? await storeDraftImage(file, layer.id, productId) : false;
                    if (persisted) await removeDraftUpload(productId);
                    return true;
                }
            }
            studio.uploadFile = null;
            setImageInputFile(null);
            if (studio.attachmentFile === file) studio.attachmentFile = null;
            return false;
        } catch (error) {
            console.warn('F1 Design Studio yerli fayl qaralaması bərpa edilmədi:', error);
            return false;
        }
    }

    function scheduleAutosave() {
        if (!s.customProductId || s.customEditingLineId) return;
        setSaveState('Yadda saxlanılır…', false);
        clearTimeout(studio.autosaveTimer);
        studio.autosaveTimer = setTimeout(() => saveLayout({ silent: true }), 650);
    }

    function loadDraft(productId = s.customProductId) {
        const key = draftKey(productId);
        if (!key) return null;
        try {
            const raw = localStorage.getItem(key);
            if (!raw || raw.length > 26000) return null;
            const value = JSON.parse(raw);
            return value && typeof value === 'object' ? value : null;
        } catch (_) { return null; }
    }

    function clearDraft(productId = s.customProductId) {
        if (s.customEditingLineId) return;
        const key = draftKey(productId);
        if (key) { try { localStorage.removeItem(key); } catch (_) {} }
        removeDraftUpload(productId).catch(error => console.warn('F1 Design Studio yerli fayl qaralaması silinmədi:', error));
        removeDraftImages(productId).catch(error => console.warn('F1 Design Studio yerli şəkil qaralaması silinmədi:', error));
    }

    function saveLayout({ silent = false, persistDraft = true } = {}) {
        flushQueuedHistory({ save: false });
        clearTimeout(studio.autosaveTimer);
        const layers = studio.layers.slice(0, MAX_LAYERS).map(layer => {
            if (layer.type !== 'image') return { ...layer };
            const { assetKey, ...safeLayer } = layer;
            return { ...safeLayer, uploadId: layer.id };
        });
        const image = layers.find(layer => layer.type === 'image');
        const text = layers.find(layer => layer.type === 'text');
        const selectedUpload = currentUploadFile() || $('customImage')?.files?.[0];
        const layout = {
            version: 4,
            canvas: { width: CANVAS_W, height: CANVAS_H },
            selectedId: studio.selectedId,
            orderIds: layers.map(layer => layer.id),
            upload: selectedUpload ? { name: String(selectedUpload.name || '').slice(0, 180), type: String(selectedUpload.type || '').slice(0, 80), size: Math.max(0, Math.min(10 * 1024 * 1024, Number(selectedUpload.size) || 0)) } : (s.customExistingImageName ? { name: String(s.customExistingImageName).slice(0, 180), type: '', size: 0 } : null),
            uploads: layers.filter(layer => layer.type === 'image').map(layer => {
                const file = studio.pendingFiles.get(layer.id);
                return { layerId: layer.id, name: String(file?.name || layer.name || 'Şəkil').slice(0, 180), type: String(file?.type || '').slice(0, 80), size: Math.max(0, Math.min(10 * 1024 * 1024, Number(file?.size) || 0)) };
            }),
            // v3 compatibility fields are retained for cart, order and older admin views.
            selected: active()?.type === 'text' ? 'text' : 'image',
            order: ['image', 'text'],
            image: image ? { x: image.x, y: image.y, scale: image.scale, rotation: image.rotation, visible: image.visible } : { x: 150, y: 105, scale: 1, rotation: 0, visible: false },
            text: text ? { text: text.text, x: text.x, y: text.y, scale: text.scale, rotation: text.rotation, font: text.font, color: text.color, fontSize: text.fontSize, fontWeight: text.fontWeight, align: text.align, verticalAlign: text.verticalAlign, lineHeight: text.lineHeight, letterSpacing: text.letterSpacing, boxWidth: text.boxWidth, boxHeight: text.boxHeight, opacity: text.opacity, bold: text.bold !== false, italic: text.italic === true, underline: text.underline === true, effect: text.effect || 'none', effectColor: text.effectColor || '#3b2114', visible: text.visible } : { text: '', x: 150, y: 185, scale: 1, rotation: 0, font: 'Klassik', color: COLOR_MAP.Qara, fontSize: 28, fontWeight: 700, align: 'center', verticalAlign: 'middle', lineHeight: 1.2, letterSpacing: 0, boxWidth: 220, boxHeight: 48, opacity: 1, bold: true, italic: false, underline: false, effect: 'none', effectColor: '#3b2114', visible: false },
            layers
        };
        s.customDesignLayout = layout;
        if (persistDraft && !s.customEditingLineId) saveDraft(layout);
        if (!silent) showToast('Dizayn qaralaması bu məhsul üçün saxlanıldı.');
        return layout;
    }

    function colorValue() {
        const name = $('customColor')?.value || 'Qara';
        return COLOR_MAP[name] || COLOR_MAP.Qara;
    }

    function elementPrimaryColor(layer) {
        if (layer?.type === 'ornament') return layer.color || '#b88919';
        if (layer?.type === 'shape' || layer?.type === 'background') return layer.fillColor || '#d8c8aa';
        if (layer?.type === 'qr') return layer.foregroundColor || '#111111';
        return layer?.color || '#30251a';
    }

    function elementAccentColor(layer) {
        if (layer?.type === 'shape') return layer.strokeColor || '#30251a';
        if (layer?.type === 'background') return layer.patternColor || '#c6bba9';
        if (layer?.type === 'qr') return layer.backgroundColor || '#ffffff';
        return '#ffffff';
    }

    function setFieldVisible(id, visible) {
        const field = $(id);
        if (field) field.hidden = !visible;
    }

    function syncInspector() {
        const layer = active();
        const textLayer = layer?.type === 'text' ? layer : null;
        const shapeLayer = layer?.type === 'shape' ? layer : null;
        const backgroundLayer = layer?.type === 'background' ? layer : null;
        const qrLayer = layer?.type === 'qr' ? layer : null;
        const styledLayer = ['ornament', 'shape', 'background', 'qr'].includes(layer?.type);
        const textInput = $('customText');
        if (textInput) {
            textInput.value = textLayer?.text || '';
            textInput.disabled = !textLayer || textLayer.locked;
            textInput.placeholder = textLayer?.requiresInput ? 'Şablon nümunəsini öz mətninizlə əvəz edin' : textLayer ? 'Mətni daxil edin' : 'Mətn qatını seçin və ya əlavə edin';
        }
        const controlsEnabled = layer?.type === 'text' && !layer.locked;
        const imageEnabled = layer?.type === 'image' && !layer.locked;
        const editable = !!layer && !layer.locked;
        ['customFont', 'customFontSize', 'customFontWeight', 'customTextAlign', 'customTextVerticalAlign', 'customTextLineHeight', 'customTextLetterSpacing', 'customTextBoxWidth', 'customTextBoxHeight', 'customTextBold', 'customTextItalic', 'customTextUnderline', 'customTextEffect', 'customTextEffectColor'].forEach(id => { if ($(id)) $(id).disabled = !controlsEnabled; });
        ['designImageCrop', 'designElementOpacity'].forEach(id => { if ($(id)) $(id).disabled = !(controlsEnabled || imageEnabled || (styledLayer && editable)); });
        ['designElementX', 'designElementY', 'designElementWidth', 'designElementHeight', 'designShapeKind', 'designShapeFill', 'designShapeStrokeWidth', 'designBackgroundPattern', 'designQrContent', 'designElementColor', 'designElementAccentColor'].forEach(id => { if ($(id)) $(id).disabled = !editable; });
        if ($('designImageCropField')) $('designImageCropField').hidden = !imageEnabled;
        setFieldVisible('designImageReplaceField', imageEnabled);
        setFieldVisible('designQrContentField', !!qrLayer);
        setFieldVisible('designShapeKindField', !!shapeLayer);
        setFieldVisible('designElementWidthField', !!shapeLayer);
        setFieldVisible('designElementHeightField', !!shapeLayer);
        setFieldVisible('designShapeFillField', !!shapeLayer && ['rectangle', 'circle'].includes(shapeLayer.shape));
        setFieldVisible('designShapeStrokeField', !!shapeLayer);
        setFieldVisible('designBackgroundPatternField', !!backgroundLayer);
        setFieldVisible('designElementColorField', !!textLayer || styledLayer);
        setFieldVisible('designElementAccentField', !!shapeLayer || !!backgroundLayer || !!qrLayer);
        if ($('designElementColorLabel')) $('designElementColorLabel').textContent = qrLayer ? 'Kodun rəngi' : shapeLayer ? 'İç rəngi' : backgroundLayer ? 'Fon rəngi' : 'Element rəngi';
        if ($('designElementAccentLabel')) $('designElementAccentLabel').textContent = qrLayer ? 'QR fonu' : shapeLayer ? 'Kontur rəngi' : 'Tekstura rəngi';
        if ($('designImageCrop')) $('designImageCrop').value = String(Math.round(clamp(Number(layer?.crop) || 0, 0, .4) * 100));
        if ($('designImageCropValue')) $('designImageCropValue').textContent = `${Math.round(clamp(Number(layer?.crop) || 0, 0, .4) * 100)}%`;
        if ($('designElementOpacity')) $('designElementOpacity').value = String(Math.round(clamp(Number(layer?.opacity ?? 1), 0, 1) * 100));
        if ($('designElementOpacityValue')) $('designElementOpacityValue').textContent = `${Math.round(clamp(Number(layer?.opacity ?? 1), 0, 1) * 100)}%`;
        if ($('designElementX')) $('designElementX').value = String(Math.round(Number(layer?.x) || 0));
        if ($('designElementY')) $('designElementY').value = String(Math.round(Number(layer?.y) || 0));
        if ($('designElementWidth')) $('designElementWidth').value = String(Math.round(Number(shapeLayer?.width) || 80));
        if ($('designElementHeight')) $('designElementHeight').value = String(Math.round(Number(shapeLayer?.height) || 52));
        if ($('designShapeKind')) $('designShapeKind').value = shapeLayer?.shape || 'rectangle';
        if ($('designShapeFill')) $('designShapeFill').value = String(shapeLayer?.filled !== false);
        if ($('designShapeStrokeWidth')) $('designShapeStrokeWidth').value = String(Math.round(Number(shapeLayer?.strokeWidth) || 2));
        if ($('designBackgroundPattern')) $('designBackgroundPattern').value = backgroundLayer?.pattern || 'solid';
        if ($('designQrContent')) $('designQrContent').value = qrLayer?.content || '';
        if ($('designQrStatus') && qrLayer) {
            $('designQrStatus').textContent = !window.qrcode ? 'QR mühərriki yüklənməyib; şəbəkəni yoxlayıb səhifəni yeniləyin.'
                : !String(qrLayer.content || '').trim() ? 'Link və ya mətn daxil edin. Boş məzmun üçün QR nümunəsi yaradılmır.'
                    : getQrMatrix(qrLayer.content) ? 'QR kod daxil etdiyiniz məzmundan yaradılıb.' : 'Məzmun tutumu aşıldı və ya kod yaradıla bilmədi; mətni qısaldın.';
        }
        if ($('customColor')) $('customColor').disabled = !(controlsEnabled || (styledLayer && editable));
        if (textLayer) {
            if ($('customFont')) $('customFont').value = textLayer.font || 'Klassik';
            if ($('customFontSize')) $('customFontSize').value = String(textLayer.fontSize || 28);
            if ($('customFontSizeValue')) $('customFontSizeValue').textContent = `${textLayer.fontSize || 28}px`;
            if ($('customFontWeight')) $('customFontWeight').value = String([400, 500, 600, 700, 800].includes(Number(textLayer.fontWeight)) ? Number(textLayer.fontWeight) : (textLayer.bold === false ? 400 : 700));
            if ($('customTextAlign')) $('customTextAlign').value = textLayer.align || 'center';
            if ($('customTextVerticalAlign')) $('customTextVerticalAlign').value = textLayer.verticalAlign || 'middle';
            if ($('customTextLineHeight')) $('customTextLineHeight').value = String(textLayer.lineHeight || 1.2);
            if ($('customTextLetterSpacing')) $('customTextLetterSpacing').value = String(textLayer.letterSpacing || 0);
            if ($('customTextBoxWidth')) $('customTextBoxWidth').value = String(textLayer.boxWidth || 220);
            if ($('customTextBoxHeight')) $('customTextBoxHeight').value = String(textLayer.boxHeight || 48);
            if ($('customTextBold')) $('customTextBold').checked = textLayer.bold !== false;
            if ($('customTextItalic')) $('customTextItalic').checked = textLayer.italic === true;
            if ($('customTextUnderline')) $('customTextUnderline').checked = textLayer.underline === true;
            if ($('customTextEffect')) $('customTextEffect').value = ['none', 'shadow', 'outline'].includes(textLayer.effect) ? textLayer.effect : 'none';
            if ($('customTextEffectColor')) $('customTextEffectColor').value = /^#[0-9a-f]{6}$/i.test(textLayer.effectColor || '') ? textLayer.effectColor : '#3b2114';
        }
        const colorLayer = styledLayer ? layer : textLayer;
        if (colorLayer && $('customColor')) {
            const primaryColor = elementPrimaryColor(colorLayer);
            const colorName = Object.entries(COLOR_MAP).find(([, value]) => value.toLowerCase() === String(primaryColor).toLowerCase())?.[0] || 'Digər';
            $('customColor').value = colorName;
        }
        if ($('designElementColor') && (colorLayer || textLayer)) $('designElementColor').value = elementPrimaryColor(colorLayer || textLayer);
        if ($('designElementAccentColor') && (shapeLayer || backgroundLayer || qrLayer)) $('designElementAccentColor').value = elementAccentColor(layer);
        updateStatus();
    }

    function selectLayer(id, { history = true } = {}) {
        if (!studio.layers.some(layer => layer.id === id)) return;
        studio.selectedId = id;
        syncInspector(); draw(); renderLayers();
        if (history) pushHistory('Qat seçildi');
    }

    function renderLayers() {
        const list = $('designLayersList');
        if (!list) return;
        list.replaceChildren();
        if (!studio.layers.length) {
            const empty = document.createElement('div');
            empty.className = 'ds-empty-layers';
            empty.textContent = 'Başlamaq üçün mətn, şəkil və ya dekor əlavə edin.';
            list.append(empty);
            updateStatus();
            return;
        }
        [...studio.layers].reverse().forEach(layer => {
            const row = document.createElement('div');
            row.className = `ds-layer-row${layer.id === studio.selectedId ? ' is-selected' : ''}`;
            row.dataset.layerId = layer.id;
            row.draggable = true;
            row.setAttribute('role', 'listitem');
            const visibility = document.createElement('button');
            visibility.type = 'button'; visibility.className = 'ds-layer-visibility';
            visibility.dataset.layerCommand = 'visibility'; visibility.dataset.layerId = layer.id;
            visibility.setAttribute('aria-label', layer.visible ? 'Qatı gizlət' : 'Qatı göstər');
            visibility.textContent = layer.visible ? '◉' : '○';
            const select = document.createElement('button');
            select.type = 'button'; select.className = 'ds-layer-select';
            select.dataset.layerCommand = 'select'; select.dataset.layerId = layer.id;
            const typeIcon = ({ text: 'T', image: '▧', ornament: '♡', shape: '◇', background: '▤', qr: '▦' })[layer.type] || '◇';
            select.textContent = `${typeIcon}  ${selectedName(layer)}`;
            select.title = selectedName(layer);
            const rename = document.createElement('button');
            rename.type = 'button'; rename.className = 'ds-layer-rename';
            rename.dataset.layerCommand = 'rename'; rename.dataset.layerId = layer.id;
            rename.setAttribute('aria-label', `${selectedName(layer)} qatının adını dəyiş`);
            rename.textContent = '✎';
            const lock = document.createElement('button');
            lock.type = 'button'; lock.className = 'ds-layer-lock';
            lock.dataset.layerCommand = 'lock'; lock.dataset.layerId = layer.id;
            lock.setAttribute('aria-label', layer.locked ? 'Qat kilidini aç' : 'Qatı kilidlə');
            lock.textContent = layer.locked ? '▣' : '⌑';
            row.append(visibility, select, rename, lock);
            list.append(row);
        });
        updateStatus();
    }

    function renameLayer(id) {
        const layer = studio.layers.find(item => item.id === id);
        const row = [...($('designLayersList')?.querySelectorAll('.ds-layer-row') || [])].find(item => item.dataset.layerId === id);
        const select = row?.querySelector('.ds-layer-select');
        if (!layer || !row || !select) return;
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'ds-layer-rename-input';
        input.maxLength = 40; input.setAttribute('aria-label', 'Qatın yeni adı');
        input.value = layer.label || selectedName(layer);
        select.replaceWith(input);
        input.focus(); input.select();
        let finished = false;
        const finish = commit => {
            if (finished) return;
            finished = true;
            if (commit) {
                const name = input.value.trim().slice(0, 40);
                if (name && name !== (layer.label || selectedName({ ...layer, label: '' }))) {
                    layer.label = name;
                    studio.selectedId = id;
                    syncInspector(); draw(); renderLayers();
                    pushHistory('Qatın adı dəyişdi'); scheduleAutosave();
                    return;
                }
            }
            renderLayers();
        };
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); finish(true); }
            if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        });
        input.addEventListener('blur', () => finish(true), { once: true });
    }

    function finishLayerReorder() {
        const list = $('designLayersList');
        if (!list) return;
        const topToBottom = [...list.querySelectorAll('.ds-layer-row')].map(row => row.dataset.layerId);
        const backToFront = topToBottom.reverse();
        if (backToFront.length !== studio.layers.length || backToFront.every((id, index) => id === studio.layers[index].id)) return;
        flushQueuedHistory({ save: false });
        const byId = new Map(studio.layers.map(layer => [layer.id, layer]));
        studio.layers = backToFront.map(id => byId.get(id)).filter(Boolean);
        pushHistory('Qatlar yenidən sıralandı');
        draw(); renderLayers(); scheduleAutosave();
    }

    function addTextElement(text = 'Sənin yazın', options = {}) {
        if (studio.layers.length >= MAX_LAYERS) return showToast(`Bir dizaynda ən çox ${MAX_LAYERS} qat ola bilər.`);
        const font = options.font || $('customFont')?.value || 'Klassik';
        const fontSize = options.fontSize || Number($('customFontSize')?.value || 28);
        const align = options.align || $('customTextAlign')?.value || 'center';
        const fontWeight = [400, 500, 600, 700, 800].includes(Number(options.fontWeight)) ? Number(options.fontWeight) : null;
        const bold = options.bold ?? (fontWeight ? fontWeight >= 700 : ($('customTextBold')?.checked ?? true));
        const italic = options.italic ?? ($('customTextItalic')?.checked ?? false);
        const underline = options.underline ?? ($('customTextUnderline')?.checked ?? false);
        const effect = options.effect || $('customTextEffect')?.value || 'none';
        const effectColor = /^#[0-9a-f]{6}$/i.test(options.effectColor || '') ? options.effectColor : ($('customTextEffectColor')?.value || '#3b2114');
        const textValue = String(text).slice(0, 80);
        const probe = { type: 'text', text: textValue, font, fontSize, scale: options.scale ?? 1, align, bold, italic, fontWeight: fontWeight || (bold ? 700 : 400), boxWidth: options.boxWidth, boxHeight: options.boxHeight, lineHeight: options.lineHeight, letterSpacing: options.letterSpacing };
        const bounds = textMetrics(probe);
        const minX = PRINT.x + 8 + bounds.w / 2;
        const maxX = PRINT.x + PRINT.w - 8 - bounds.w / 2;
        const minY = PRINT.y + 8 + bounds.h / 2;
        const maxY = PRINT.y + PRINT.h - 8 - bounds.h / 2;
        const candidates = studio.layers.some(layer => layer.type === 'text' && layer.visible)
            ? [{x:150,y:55},{x:150,y:120},{x:150,y:185},{x:95,y:85},{x:205,y:85},{x:95,y:155},{x:205,y:155},{x:125,y:55},{x:175,y:185}]
            : [{x:150,y:120}];
        const points = candidates.map(point => ({
            x: minX <= maxX ? clamp(point.x, minX, maxX) : 150,
            y: minY <= maxY ? clamp(point.y, minY, maxY) : 120
        }));
        const score = point => studio.layers.reduce((total, layer) => {
            if (layer.type !== 'text' || !layer.visible) return total;
            const other = layerBounds(layer);
            if (!other) return total;
            const overlapX = (bounds.w + other.w) / 2 - Math.abs(point.x - layer.x);
            const overlapY = (bounds.h + other.h) / 2 - Math.abs(point.y - layer.y);
            return total + (overlapX > 5 && overlapY > 5 ? overlapX * overlapY : 0);
        }, 0);
        const position = points.reduce((best, point) => score(point) < score(best) ? point : best, points[0]);
        const layer = {
            id: nextId('text'), type: 'text', name: options.name || 'Mətn', text: textValue,
            x: options.x ?? position.x, y: options.y ?? position.y, scale: options.scale ?? 1, rotation: clamp(Number(options.rotation) || 0, -360, 360),
            font, color: options.color || colorValue(), opacity: clamp(Number(options.opacity ?? 1), 0, 1),
            fontSize, fontWeight: fontWeight || (bold ? 700 : 400), align,
            verticalAlign: ['top', 'middle', 'bottom'].includes(options.verticalAlign) ? options.verticalAlign : 'middle',
            lineHeight: clamp(Number(options.lineHeight) || 1.2, .8, 2),
            letterSpacing: clamp(Number(options.letterSpacing) || 0, -2, 10),
            boxWidth: clamp(Number(options.boxWidth) || 236, 30, PRINT.w),
            boxHeight: clamp(Number(options.boxHeight) || 48, 20, PRINT.h),
            bold, italic, underline, effect, effectColor, visible: true, locked: false
        };
        studio.layers.push(layer); studio.selectedId = layer.id;
        syncInspector(); draw(); renderLayers(); pushHistory('Mətn əlavə edildi'); scheduleAutosave();
        if (text === 'Sənin yazın') { $('customText')?.focus(); $('customText')?.select(); }
    }

    function addDateElement() {
        addTextElement('Tarixi daxil et', { font: 'Modern', fontSize: 18, y: 174, color: COLOR_MAP.Qızılı });
        showToast('Tarix qatını seçib sağ paneldə dəyişə bilərsiniz.');
    }

    function addOrnament(motif = 'heart', options = {}) {
        if (!SAFE_MOTIFS.has(motif)) return;
        if (studio.layers.length >= MAX_LAYERS) return showToast(`Bir dizaynda ən çox ${MAX_LAYERS} qat ola bilər.`);
        const layer = { id: nextId('ornament'), type: 'ornament', motif, x: options.x ?? 150, y: options.y ?? 70, scale: options.scale ?? 1, rotation: clamp(Number(options.rotation) || 0, -360, 360), opacity: clamp(Number(options.opacity ?? 1), 0, 1), color: options.color || COLOR_MAP.Qızılı, visible: true, locked: false };
        studio.layers.push(layer); studio.selectedId = layer.id;
        syncInspector(); draw(); renderLayers(); pushHistory('Dekor əlavə edildi'); scheduleAutosave();
    }

    function addShape(shape = 'rectangle') {
        if (!SAFE_SHAPES.has(shape)) return;
        if (studio.layers.length >= MAX_LAYERS) return showToast(`Bir dizaynda ən çox ${MAX_LAYERS} qat ola bilər.`);
        const filled = ['rectangle', 'circle'].includes(shape);
        const layer = {
            id: nextId('shape'), type: 'shape', shape, name: 'Forma',
            x: 150, y: 120, width: shape === 'line' ? 142 : 86, height: shape === 'line' ? 12 : 58,
            scale: 1, rotation: 0, opacity: 1, filled,
            fillColor: '#d8c8aa', strokeColor: '#30251a', strokeWidth: 2,
            visible: true, locked: false
        };
        studio.layers.push(layer); studio.selectedId = layer.id;
        syncInspector(); draw(); renderLayers(); pushHistory('Forma əlavə edildi'); scheduleAutosave();
    }

    function addBackground(pattern = 'solid') {
        if (!SAFE_BACKGROUNDS.has(pattern)) return;
        let layer = studio.layers.find(item => item.type === 'background');
        if (!layer && studio.layers.length >= MAX_LAYERS) return showToast(`Bir dizaynda ən çox ${MAX_LAYERS} qat ola bilər.`);
        if (layer) {
            Object.assign(layer, { pattern, fillColor: '#f5f3ef', patternColor: '#c6bba9', visible: true, locked: false });
        } else {
            layer = {
                id: nextId('background'), type: 'background', name: 'Fon', pattern,
                x: 150, y: 120, scale: 1, rotation: 0, opacity: 1,
                fillColor: '#f5f3ef', patternColor: '#c6bba9', visible: true, locked: false
            };
            // Backgrounds sit behind every editable object regardless of when
            // they are added; users can still reorder them from the layer list.
            studio.layers.unshift(layer);
        }
        studio.selectedId = layer.id;
        syncInspector(); draw(); renderLayers(); pushHistory('Kətan fonu dəyişdi'); scheduleAutosave();
    }

    function addQrElement() {
        if (typeof window.qrcode !== 'function') return showToast('QR generatori yüklənmədi. Bağlantını yoxlayıb səhifəni yeniləyin.');
        if (studio.layers.length >= MAX_LAYERS) return showToast(`Bir dizaynda ən çox ${MAX_LAYERS} qat ola bilər.`);
        const layer = {
            id: nextId('qr'), type: 'qr', name: 'QR kod', content: '', size: 96,
            x: 150, y: 120, scale: 1, rotation: 0, opacity: 1,
            foregroundColor: '#111111', backgroundColor: '#ffffff', visible: true, locked: false
        };
        studio.layers.push(layer); studio.selectedId = layer.id;
        syncInspector(); draw(); renderLayers(); pushHistory('QR kod obyekti əlavə edildi'); scheduleAutosave();
        $('designQrContent')?.focus();
        showToast('QR kod üçün faktiki linki və ya mətni sağ paneldə daxil edin.');
    }

    function templateLayer(item, template) {
        if (item.type === 'ornament') return {
            id: nextId('ornament'), type: 'ornament', motif: SAFE_MOTIFS.has(item.motif) ? item.motif : 'heart',
            x: clamp(Number(item.x) || 150, PRINT.x, PRINT.x + PRINT.w), y: clamp(Number(item.y) || 120, PRINT.y, PRINT.y + PRINT.h),
            scale: clamp(Number(item.scale) || 1, .25, 3), rotation: clamp(Number(item.rotation) || 0, -360, 360),
            opacity: clamp(Number(item.opacity ?? 1), 0, 1), color: /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : COLOR_MAP.Qızılı,
            visible: true, locked: false
        };
        if (item.type === 'shape' && SAFE_SHAPES.has(item.shape)) return {
            id: nextId('shape'), type: 'shape', shape: item.shape,
            x: clamp(Number(item.x) || 150, PRINT.x, PRINT.x + PRINT.w), y: clamp(Number(item.y) || 120, PRINT.y, PRINT.y + PRINT.h),
            width: clamp(Number(item.width) || 86, 8, PRINT.w), height: clamp(Number(item.height) || 58, 8, PRINT.h),
            scale: clamp(Number(item.scale) || 1, .25, 3), rotation: clamp(Number(item.rotation) || 0, -360, 360),
            opacity: clamp(Number(item.opacity ?? 1), 0, 1), filled: item.filled !== false,
            fillColor: /^#[0-9a-f]{6}$/i.test(item.fillColor || '') ? item.fillColor : '#d8c8aa',
            strokeColor: /^#[0-9a-f]{6}$/i.test(item.strokeColor || '') ? item.strokeColor : '#30251a',
            strokeWidth: clamp(Number(item.strokeWidth) || 2, 1, 12), visible: true, locked: false
        };
        if (item.type === 'background' && SAFE_BACKGROUNDS.has(item.pattern)) return {
            id: nextId('background'), type: 'background', pattern: item.pattern,
            x: 150, y: 120, scale: 1, rotation: 0, opacity: clamp(Number(item.opacity ?? 1), 0, 1),
            fillColor: /^#[0-9a-f]{6}$/i.test(item.fillColor || '') ? item.fillColor : '#f5f3ef',
            patternColor: /^#[0-9a-f]{6}$/i.test(item.patternColor || '') ? item.patternColor : '#c6bba9',
            visible: true, locked: false
        };
        if (item.type === 'qr') return {
            id: nextId('qr'), type: 'qr', content: String(item.content || '').trim().slice(0, 512), size: clamp(Number(item.size) || 96, 48, 160),
            x: clamp(Number(item.x) || 150, PRINT.x, PRINT.x + PRINT.w), y: clamp(Number(item.y) || 120, PRINT.y, PRINT.y + PRINT.h),
            scale: clamp(Number(item.scale) || 1, .25, 3), rotation: clamp(Number(item.rotation) || 0, -360, 360), opacity: clamp(Number(item.opacity ?? 1), 0, 1),
            foregroundColor: /^#[0-9a-f]{6}$/i.test(item.foregroundColor || '') ? item.foregroundColor : '#111111',
            backgroundColor: /^#[0-9a-f]{6}$/i.test(item.backgroundColor || '') ? item.backgroundColor : '#ffffff', visible: true, locked: false
        };
        const weight = [400, 500, 600, 700, 800].includes(Number(item.weight)) ? Number(item.weight) : 700;
        return {
            id: nextId('text'), type: 'text', name: `${template.title} · Mətn`, text: String(item.text || '').slice(0, 80),
            requiresInput: true, placeholderText: String(item.text || '').slice(0, 80),
            x: clamp(Number(item.x) || 150, PRINT.x, PRINT.x + PRINT.w), y: clamp(Number(item.y) || 120, PRINT.y, PRINT.y + PRINT.h),
            scale: clamp(Number(item.scale) || 1, .25, 3), rotation: clamp(Number(item.rotation) || 0, -360, 360),
            font: FONT_MAP[item.font] ? item.font : 'Klassik', color: /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : COLOR_MAP.Qara,
            fontSize: clamp(Number(item.size) || 28, 12, 72), fontWeight: weight, bold: weight >= 700, italic: item.italic === true,
            underline: item.underline === true, align: ['left','center','right'].includes(item.align) ? item.align : 'center',
            verticalAlign: ['top','middle','bottom'].includes(item.verticalAlign) ? item.verticalAlign : 'middle',
            lineHeight: clamp(Number(item.lineHeight) || 1.2, .8, 2), letterSpacing: clamp(Number(item.letterSpacing) || 0, -2, 10),
            boxWidth: clamp(Number(item.boxWidth) || 236, 30, PRINT.w), boxHeight: clamp(Number(item.boxHeight) || 48, 20, PRINT.h),
            opacity: clamp(Number(item.opacity ?? 1), 0, 1), effect: ['none','shadow','outline'].includes(item.effect) ? item.effect : 'none',
            effectColor: /^#[0-9a-f]{6}$/i.test(item.effectColor || '') ? item.effectColor : '#3b2114', visible: true, locked: false
        };
    }

    function paintTemplateThumbnail(template, canvas) {
        if (!canvas) return;
        const g = canvas.getContext('2d');
        if (!g) return;
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = '#f5f3ef'; g.fillRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = '#fffdfa'; g.fillRect(22, 22, 256, 196);
        g.strokeStyle = '#b9b0a1'; g.lineWidth = 1; g.setLineDash([4, 3]); g.strokeRect(22, 22, 256, 196); g.setLineDash([]);
        const previous = studio.ctx;
        studio.ctx = g;
        template.layers.forEach(item => drawLayer(g, templateLayer(item, template)));
        studio.ctx = previous;
    }

    function renderTemplateList() {
        const list = $('designTemplateList');
        if (!list) return;
        const product = ctx.getProduct(s.customProductId);
        const compatible = getCompatibleDesignTemplates(product);
        const categorySelect = $('designTemplateCategory');
        if (categorySelect) {
            const current = categorySelect.value;
            const categories = DESIGN_TEMPLATE_CATEGORIES.filter(category => compatible.some(template => template.category === category));
            categorySelect.replaceChildren(new Option('Bütün kateqoriyalar', ''));
            categories.forEach(category => categorySelect.add(new Option(category, category)));
            if (categories.includes(current)) categorySelect.value = current;
        }
        const filtered = searchCompatibleDesignTemplates(product, {
            query: $('designTemplateSearch')?.value || '', category: categorySelect?.value || ''
        });
        const compatibility = $('designTemplateCompatibility');
        if (compatibility) compatibility.textContent = product
            ? `Uyğun məhsul: ${product.name} · ${compatible.length} şablon`
            : 'Məhsul seçimi mövcud deyil';
        list.replaceChildren();

        filtered.forEach(template => {
            const card = document.createElement('article');
            card.className = 'ds-template-card';
            const thumb = document.createElement('canvas');
            thumb.className = 'ds-template-thumb';
            thumb.width = 300; thumb.height = 240;
            thumb.setAttribute('aria-label', `${template.title} şablonunun element qatları ilə kiçik önizləməsi`);
            paintTemplateThumbnail(template, thumb);
            const copy = document.createElement('div'); copy.className = 'ds-template-card-copy';
            const title = document.createElement('b');
            title.textContent = template.title;
            const description = document.createElement('small');
            description.textContent = template.description;
            const category = document.createElement('span'); category.className = 'ds-template-category'; category.textContent = template.category;
            const actions = document.createElement('div'); actions.className = 'ds-template-actions';
            const previewButton = document.createElement('button'); previewButton.type = 'button'; previewButton.dataset.templatePreview = template.id; previewButton.textContent = 'Önizləmə';
            const startButton = document.createElement('button'); startButton.type = 'button'; startButton.dataset.action = 'applyDesignTemplate'; startButton.dataset.actionArgs = JSON.stringify([template.id]); startButton.textContent = 'Şablondan başla';
            actions.append(previewButton, startButton);
            copy.append(title, description, category, actions);
            card.append(thumb, copy); list.append(card);
        });

        const empty = $('designTemplateEmpty');
        if (empty) {
            const productName = product?.name || 'Bu məhsul';
            empty.hidden = filtered.length > 0;
            empty.textContent = !compatible.length
                ? `${productName} üçün uyğun şablon yoxdur. Kataloqda məhsula aid editə olunan şablon tapılmadı; sərbəst dizayna başlaya bilərsiniz.`
                : 'Axtarışa uyğun şablon tapılmadı. Axtarış sözünü və ya kateqoriyanı dəyişin.';
        }
        const blank = document.querySelector('#designTemplatesPanel .ds-blank-template');
        if (blank) blank.hidden = product?.customizable === false;
        const preview = $('designTemplatePreview');
        const selected = filtered.find(template => template.id === studio.templatePreviewId);
        if (preview) preview.hidden = !selected;
        if (selected) {
            $('designTemplatePreviewTitle').textContent = selected.title;
            $('designTemplatePreviewDescription').textContent = `${selected.description} · ${selected.category}`;
            $('designTemplatePreviewLayers').textContent = `${selected.layers.length} redaktə olunan qat`;
            paintTemplateThumbnail(selected, $('designTemplatePreviewCanvas'));
        }
    }

    function hasCurrentDesign() {
        return studio.layers.length > 0 || !!studio.uploadFile || studio.pendingFiles.size > 0 || !!$('customImage')?.files?.length ||
            !!s.customExistingImageName || !!s.customExistingImagePath ||
            !!String($('customText')?.value || '').trim();
    }

    function syncModeControls() {
        document.querySelectorAll('#customModal .ds-mode-switch [data-action="setDesignMode"]').forEach(button => {
            const mode = JSON.parse(button.dataset.actionArgs || '[""]')[0];
            button.setAttribute('aria-pressed', String(mode === studio.mode));
        });
    }

    function setDesignMode(mode) {
        if (mode === 'product') {
            studio.mode = 'product';
            showLibrary('templates');
            syncModeControls();
            return;
        }
        if (mode !== 'free') return;
        // A mode switch only changes the tool library. Keep the current canvas and
        // draft intact; clearing it is a separate, explicit action below.
        studio.mode = 'free';
        showLibrary('elements');
        syncModeControls();
    }

    function applyTemplate(name) {
        if (name === 'free') {
            if (hasCurrentDesign() && !window.confirm('Mövcud dizayn dəyişiklikləri itəcək. Boş kətan yaratmaq istəyirsiniz?')) return;
            reset();
            studio.mode = 'free';
            const input = $('customImage');
            if (input) input.value = '';
            if ($('customImageName')) $('customImageName').textContent = 'Fayl seçilməyib';
            s.customExistingImageName = ''; s.customExistingImageUrl = ''; s.customExistingImagePath = '';
            clearDraft(s.customProductId);
            ctx.updateCustomizationPreview?.();
            saveLayout({ silent: true });
            showLibrary('elements');
            syncModeControls();
            showToast('Sərbəst dizayn üçün boş kətan hazırdır. Mətn, şəkil və dekor əlavə edə bilərsiniz.');
            return;
        }
        const product = ctx.getProduct(s.customProductId);
        const template = getCompatibleDesignTemplates(product).find(item => item.id === name);
        if (!template) return showToast('Bu şablon seçilmiş məhsula uyğun deyil.');
        if (hasCurrentDesign() && !window.confirm('Cari dizaynın qatları yeni şablonla əvəz ediləcək. Davam edilsin?')) return;
        flushQueuedHistory({ save: false });
        const previousDesign = snapshot();
        saveLayout({ silent: true });
        reset({ preserveHistory: false, persist: false });
        // Keep the pre-template design as the undo baseline. Reset clears the
        // editor history to prevent stale image references from leaking into a
        // new template, so restore only this safe checkpoint before recording
        // the new editable composition.
        studio.history = [{ label: 'Əvvəlki dizayn', snapshot: previousDesign }];
        studio.future = [];
        studio.mode = 'product';
        studio.layers = template.layers.slice(0, MAX_LAYERS).map(item => templateLayer(item, template));
        studio.selectedId = studio.layers.at(-1)?.id || '';
        studio.templatePreviewId = template.id;
        removeDraftImages(s.customProductId).catch(error => console.warn('F1 Design Studio köhnə şəkil qaralaması silinmədi:', error));
        updateUploadStatus();
        syncInspector(); draw(); renderLayers();
        pushHistory('Məhsula uyğun şablon tətbiq edildi');
        saveLayout({ silent: true });
        syncModeControls();
        showToast(`${template.title} şablonu kətana əlavə edildi. Mətn və qatları redaktə edə bilərsiniz.`);
    }

    function startPreviewedTemplate() {
        if (!studio.templatePreviewId) return;
        applyTemplate(studio.templatePreviewId);
    }

    function addImageElement() {
        const input = $('customImage');
        studio.replaceLayerId = '';
        if (input) { input.value = ''; input.click(); }
    }

    function replaceImageElement() {
        const layer = active();
        if (!layer || layer.type !== 'image' || layer.locked) return;
        studio.replaceLayerId = layer.id;
        const input = $('customImage');
        if (input) { input.value = ''; input.click(); }
    }

    async function loadDesignFiles(files, { dropPoint = null } = {}) {
        const selected = Array.from(files || []);
        const omitted = Math.max(0, selected.length - 9);
        let imagesAdded = 0, attachmentsAdded = 0, rejected = 0;
        let targetLayerId = studio.replaceLayerId;
        studio.replaceLayerId = '';
        for (const [index, file] of selected.slice(0, 9).entries()) {
            try {
                const point = dropPoint && !targetLayerId
                    ? { x: clamp(Number(dropPoint.x) + index * 8, 0, CANVAS_W), y: clamp(Number(dropPoint.y) + index * 8, 0, CANVAS_H) }
                    : dropPoint;
                const result = await loadFile(file, { targetLayerId, dropPoint: point, quiet: true });
                if (result === 'image') targetLayerId = '';
                if (result === 'image') imagesAdded++;
                else if (result === 'attachment') attachmentsAdded++;
                else rejected++;
            } catch (error) {
                rejected++;
                console.error('F1 Design Studio faylı əlavə edilmədi:', error);
                const status = $('customImageName');
                if (status) status.textContent = `Fayl əlavə edilmədi: ${String(file.name || 'fayl').slice(0, 100)} · mövcud dizayn qorunub`;
            }
        }
        const input = $('customImage');
        if (input) input.value = '';
        if (imagesAdded || attachmentsAdded || rejected || omitted) {
            const parts = [];
            if (imagesAdded) parts.push(`${imagesAdded} şəkil əlavə edildi`);
            if (attachmentsAdded) parts.push(`${attachmentsAdded} PDF sifariş əlavəsi saxlanıldı`);
            if (rejected) parts.push(`${rejected} fayl qəbul edilmədi`);
            if (omitted) parts.push(`${omitted} artıq fayl bu dəfə yoxlanmadı`);
            showToast(`${parts.join(' · ')}. Mövcud dizayn qorunur.`);
        }
    }

    async function loadFile(file, { targetLayerId = '', fromDraft = false, dropPoint = null, quiet = false } = {}) {
        if (!file) return;
        const status = $('customImageName');
        if (status) status.textContent = 'Fayl yoxlanılır…';
        let inspected;
        try { inspected = await inspectDesignFile(file); }
        catch (error) {
            const prior = currentUploadFile();
            if (status) status.textContent = prior ? `Əvvəlki fayl saxlanılıb: ${prior.name} · yeni fayl qəbul edilmədi` : 'Fayl qəbul edilmədi; əvvəlki dizayn qorunub';
            const messages = {
                DESIGN_FILE_TYPE: 'Faylın real məzmunu PNG, JPG, WEBP və ya PDF deyil.',
                DESIGN_FILE_TOO_LARGE: 'Dizayn faylı maksimum 10 MB ola bilər.',
                DESIGN_FILE_DIMENSIONS: 'Şəkil ölçüləri emal üçün həddən artıq böyükdür.',
                DESIGN_FILE_MALFORMED: 'Fayl zədələnib və ya şəkil kimi açıla bilmir.'
            };
            if (!quiet) showToast(messages[error?.message] || 'Fayl yoxlanmadı; mövcud dizayn qorunub.');
            return false;
        }
        if (inspected.attachmentOnly) {
            const existingAttachment = (s.customExistingUploads || []).find(upload => upload.purpose === 'attachment');
            if (!fromDraft && ((studio.attachmentFile && studio.attachmentFile !== file) || (existingAttachment && !studio.attachmentFile))) {
                if (!window.confirm('Əvvəlki PDF sifariş əlavəsi yeni faylla əvəz edilsin?')) {
                    if (status) status.textContent = 'Əvvəlki PDF sifariş əlavəsi saxlanıldı.';
                    return false;
                }
            }
            studio.attachmentFile = file;
            studio.uploadFile = file;
            storeDraftUpload(file).catch(error => console.warn('F1 Design Studio yerli fayl qaralaması saxlanmadı:', error));
            saveLayout({ silent: true });
            syncInspector(); draw(); renderLayers(); pushHistory('İstehsal faylı əlavə edildi'); scheduleAutosave();
            updateUploadStatus();
            ctx.updateCustomizationPreview?.();
            if (!quiet) showToast('PDF sifarişə əlavə edilən sənəddir; onu redaktə olunan şəkilə çevirmək mümkün deyil.');
            return 'attachment';
        }
        const token = ++studio.imageLoadToken;
        const url = URL.createObjectURL(file);
        const img = new Image();
        const loaded = await new Promise(resolve => {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        });
        URL.revokeObjectURL(url);
        if (!loaded || token !== studio.imageLoadToken) {
            if (status) status.textContent = studio.uploadFile ? `Əvvəlki fayl saxlanılıb: ${studio.uploadFile.name}` : 'Şəkil açıla bilmədi; dizayn qorunub';
            setImageInputFile(studio.uploadFile);
            if (!quiet) showToast('Şəkil faylı açıla bilmədi; mövcud dizayn qorunub.');
            return false;
        }
        const existingImageLayer = targetLayerId ? studio.layers.find(item => item.id === targetLayerId && item.type === 'image') : null;
        const imageCount = studio.layers.filter(item => item.type === 'image').length;
        if ((!existingImageLayer && studio.layers.length >= MAX_LAYERS) || (!existingImageLayer && imageCount >= 8)) {
            if (status) status.textContent = 'Şəkil limiti doludur; mövcud dizayn qorunub';
            if (!quiet) showToast(imageCount >= 8 ? 'Bir dizayna ən çox 8 şəkil qatı əlavə etmək olar.' : `Bir dizaynda ən çox ${MAX_LAYERS} qat ola bilər.`);
            return false;
        }
        let layer = existingImageLayer;
        const id = layer?.id || nextId('image');
        const assetKey = `local-${id}-${Date.now().toString(36)}`;
        studio.images.set(assetKey, img);
        const previousAssetKey = layer?.assetKey;
        if (layer) Object.assign(layer, { assetKey, visible: true, locked: false });
        else {
            layer = {
                id, type: 'image', name: file.name, assetKey,
                x: clamp(Number.isFinite(Number(dropPoint?.x)) ? Number(dropPoint.x) : 150, 0, CANVAS_W),
                y: clamp(Number.isFinite(Number(dropPoint?.y)) ? Number(dropPoint.y) : 120, 0, CANVAS_H),
                scale: 1, rotation: 0, crop: 0, opacity: 1, visible: true, locked: false
            };
            studio.layers.push(layer);
        }
        if (previousAssetKey && !studio.layers.some(item => item !== layer && item.type === 'image' && item.assetKey === previousAssetKey)) studio.images.delete(previousAssetKey);
        layer.name = file.name.slice(0, 90);
        studio.pendingFiles.set(layer.id, file);
        if (!studio.uploadFile || studio.uploadFile.type === 'application/pdf') studio.uploadFile = file;
        if (!fromDraft) storeDraftImage(file, layer.id).catch(error => {
            console.warn('F1 Design Studio yerli şəkil qaralaması saxlanmadı:', error);
            if (status) status.textContent = `Yalnız bu cihazda mövcuddur: ${file.name} · qaralama saxlanmadı`;
        });
        studio.selectedId = layer.id;
        if (status) status.textContent = `${imageCount + (existingImageLayer ? 0 : 1)} şəkil · ${inspected.width}×${inspected.height}px · cihazda saxlanıldı`;
        updateUploadStatus();
        syncInspector(); draw(); renderLayers(); pushHistory('Şəkil əlavə edildi'); scheduleAutosave();
        ctx.updateCustomizationPreview?.();
        if (!quiet) showToast('Şəkil kətana əlavə edildi. Hər şəkil sifariş zamanı şəxsi Storage-a ayrıca yüklənəcək.');
        return 'image';
    }

    async function loadExistingImageFromPath(path) {
        const layer = studio.layers.find(item => item.type === 'image');
        if (!path || !layer) return;
        return loadExistingImageUploads([{ layerId: layer.id, path, name: s.customExistingImageName || layer.name || 'Yüklənmiş şəkil', type: 'image/png' }]);
    }

    async function loadExistingImageUploads(uploads = []) {
        const loadedAssets = new Map();
        for (const layer of studio.layers.filter(item => item.type === 'image').slice(0, 8)) {
            if (imageFor(layer)) continue;
            const upload = (Array.isArray(uploads) ? uploads : []).find(item => item?.purpose !== 'attachment' && item?.path && (item.layerId === layer.id || item.layerId === layer.sourceLayerId || !item.layerId));
            if (!upload || upload.type === 'application/pdf') continue;
            try {
                let cached = loadedAssets.get(upload.path);
                if (!cached) {
                    const blob = await storageService.downloadCustomerDesign(upload.path);
                    const file = new File([blob], String(upload.name || layer.name || 'Yüklənmiş şəkil').slice(0, 180), { type: upload.type || blob.type || 'image/png' });
                    const inspected = await inspectDesignFile(file);
                    if (inspected.attachmentOnly) continue;
                    const url = URL.createObjectURL(file);
                    const img = new Image();
                    const loaded = await new Promise(resolve => { img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = url; });
                    URL.revokeObjectURL(url);
                    if (!loaded) throw new Error('DESIGN_FILE_MALFORMED');
                    cached = { assetKey: `stored-${layer.id}-${Date.now().toString(36)}`, img, name: file.name };
                    loadedAssets.set(upload.path, cached);
                }
                studio.images.set(cached.assetKey, cached.img);
                layer.assetKey = cached.assetKey;
                layer.name = cached.name.slice(0, 90);
            } catch (error) {
                console.error('F1 Design Studio private image restore error:', error);
                showToast('Saxlanmış şəkillərdən biri açılmadı. Fayl sifarişdə qorunub; onu yenidən seçə bilərsiniz.');
            }
        }
        updateUploadStatus();
        syncInspector(); draw(); renderLayers();
    }

    function updateSelected(mutator, label) {
        const layer = active();
        if (!layer || layer.locked) return;
        mutator(layer);
        draw(); renderLayers(); queueHistory(label); scheduleAutosave();
    }

    function syncFormToState({ history = true, sourceId = '' } = {}) {
        const input = $('customText');
        let layer = active();
        if (layer && ['ornament', 'shape', 'background', 'qr'].includes(layer.type)) {
            if (layer.locked) return;
            const primaryColor = sourceId === 'customColor' ? colorValue() : /^#[0-9a-f]{6}$/i.test($('designElementColor')?.value || '') ? $('designElementColor').value : elementPrimaryColor(layer);
            const accentColor = sourceId === 'designElementAccentColor' && /^#[0-9a-f]{6}$/i.test($('designElementAccentColor')?.value || '') ? $('designElementAccentColor').value : elementAccentColor(layer);
            if (layer.type === 'ornament') layer.color = primaryColor;
            if (layer.type === 'shape') {
                layer.shape = SAFE_SHAPES.has($('designShapeKind')?.value) ? $('designShapeKind').value : layer.shape;
                layer.width = clamp(Number($('designElementWidth')?.value) || layer.width || 80, 8, PRINT.w);
                layer.height = clamp(Number($('designElementHeight')?.value) || layer.height || 52, 8, PRINT.h);
                layer.filled = $('designShapeFill')?.value !== 'false';
                layer.strokeWidth = clamp(Number($('designShapeStrokeWidth')?.value) || 2, 1, 12);
                layer.fillColor = primaryColor;
                layer.strokeColor = accentColor;
            }
            if (layer.type === 'background') {
                layer.pattern = SAFE_BACKGROUNDS.has($('designBackgroundPattern')?.value) ? $('designBackgroundPattern').value : layer.pattern;
                layer.fillColor = primaryColor;
                layer.patternColor = accentColor;
            }
            if (layer.type === 'qr') {
                layer.content = String($('designQrContent')?.value || '').trim().slice(0, 512);
                layer.foregroundColor = primaryColor;
                layer.backgroundColor = accentColor;
            }
            draw(); renderLayers();
            if (sourceId === 'designQrContent') {
                if ($('designQrStatus')) $('designQrStatus').textContent = !String(layer.content || '').trim()
                    ? 'Link və ya mətn daxil edin. Boş məzmun üçün QR nümunəsi yaradılmır.'
                    : getQrMatrix(layer.content) ? 'QR kod daxil etdiyiniz məzmundan yaradılıb.' : 'Məzmun tutumu aşıldı və ya kod yaradıla bilmədi; mətni qısaldın.';
            } else syncInspector();
            if (history) queueHistory(layer.type === 'qr' ? 'QR kod dəyişdi' : layer.type === 'shape' ? 'Forma xüsusiyyəti' : layer.type === 'background' ? 'Fon xüsusiyyəti' : 'Dekor rəngi');
            scheduleAutosave();
            return;
        }
        if (input && (!layer || layer.type !== 'text')) layer = studio.layers.find(item => item.type === 'text');
        if (!layer && String(input?.value || '').trim()) {
            addTextElement(String(input.value).trim());
            return;
        }
        if (!layer || layer.type !== 'text' || layer.locked) return;
        const nextText = String(input?.value || '').slice(0, 80);
        if (layer.requiresInput && sourceId === 'customText' && nextText.trim().toLocaleLowerCase('az') !== String(layer.placeholderText || '').trim().toLocaleLowerCase('az')) {
            layer.requiresInput = false;
            layer.placeholderText = '';
        }
        layer.text = nextText;
        layer.font = $('customFont')?.value || layer.font || 'Klassik';
        layer.color = sourceId === 'designElementColor' && /^#[0-9a-f]{6}$/i.test($('designElementColor')?.value || '') ? $('designElementColor').value : colorValue();
        layer.fontSize = clamp(Number($('customFontSize')?.value || layer.fontSize || 28), 12, 72);
        layer.fontWeight = sourceId === 'customTextBold'
            ? ($('customTextBold')?.checked ? 700 : 400)
            : ([400,500,600,700,800].includes(Number($('customFontWeight')?.value)) ? Number($('customFontWeight').value) : (layer.bold ? 700 : 400));
        layer.align = ['left', 'center', 'right'].includes($('customTextAlign')?.value) ? $('customTextAlign').value : 'center';
        layer.verticalAlign = ['top','middle','bottom'].includes($('customTextVerticalAlign')?.value) ? $('customTextVerticalAlign').value : 'middle';
        layer.lineHeight = clamp(Number($('customTextLineHeight')?.value) || 1.2, .8, 2);
        layer.letterSpacing = clamp(Number($('customTextLetterSpacing')?.value) || 0, -2, 10);
        layer.boxWidth = clamp(Number($('customTextBoxWidth')?.value) || 220, 30, PRINT.w);
        layer.boxHeight = clamp(Number($('customTextBoxHeight')?.value) || 48, 20, PRINT.h);
        layer.bold = layer.fontWeight >= 700;
        if ($('customTextBold')) $('customTextBold').checked = layer.bold;
        if ($('customFontWeight')) $('customFontWeight').value = String(layer.fontWeight);
        layer.italic = $('customTextItalic')?.checked === true;
        layer.underline = $('customTextUnderline')?.checked === true;
        layer.effect = ['none', 'shadow', 'outline'].includes($('customTextEffect')?.value) ? $('customTextEffect').value : 'none';
        layer.effectColor = /^#[0-9a-f]{6}$/i.test($('customTextEffectColor')?.value || '') ? $('customTextEffectColor').value : '#3b2114';
        if ($('customFontSizeValue')) $('customFontSizeValue').textContent = `${layer.fontSize}px`;
        if ($('designElementColor')) $('designElementColor').value = layer.color;
        if (sourceId === 'customColor' && $('designElementColor')) $('designElementColor').value = layer.color;
        draw(); renderLayers();
        if (history) queueHistory('Mətn xüsusiyyəti');
        scheduleAutosave();
    }

    function normalizeStoredLayer(layer) {
        const type = ['text', 'image', 'ornament', 'shape', 'background', 'qr'].includes(layer?.type) ? layer.type : 'text';
        const cleanColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback;
        const common = {
            id: /^[A-Za-z0-9_-]{1,48}$/.test(String(layer.id || '')) ? String(layer.id) : nextId(type),
            type,
            ...(String(layer.label || '').trim() ? { label: String(layer.label).trim().slice(0, 40) } : {}),
            x: clamp(Number(layer.x) || 150, 0, CANVAS_W), y: clamp(Number(layer.y) || 120, 0, CANVAS_H),
            scale: clamp(Number(layer.scale) || 1, .25, 3), rotation: clamp(Number(layer.rotation) || 0, -360, 360),
            opacity: clamp(Number(layer.opacity ?? 1), 0, 1), visible: layer.visible !== false, locked: !!layer.locked
        };
        if (type === 'text') return {
            ...common, text: String(layer.text || '').slice(0, 80), requiresInput: layer.requiresInput === true, placeholderText: layer.requiresInput === true ? String(layer.placeholderText || layer.text || '').slice(0, 80) : '', font: FONT_MAP[layer.font] ? layer.font : 'Klassik',
            color: cleanColor(layer.color, COLOR_MAP.Qara), fontSize: clamp(Number(layer.fontSize) || 28, 12, 72),
            fontWeight: [400, 500, 600, 700, 800].includes(Number(layer.fontWeight)) ? Number(layer.fontWeight) : (layer.bold === false ? 400 : 700),
            align: ['left', 'center', 'right'].includes(layer.align) ? layer.align : 'center', verticalAlign: ['top', 'middle', 'bottom'].includes(layer.verticalAlign) ? layer.verticalAlign : 'middle',
            lineHeight: clamp(Number(layer.lineHeight) || 1.2, .8, 2), letterSpacing: clamp(Number(layer.letterSpacing) || 0, -2, 10),
            boxWidth: clamp(Number(layer.boxWidth) || 220, 30, PRINT.w), boxHeight: clamp(Number(layer.boxHeight) || 48, 20, PRINT.h),
            bold: layer.bold !== false, italic: layer.italic === true, underline: layer.underline === true,
            effect: ['none', 'shadow', 'outline'].includes(layer.effect) ? layer.effect : 'none', effectColor: cleanColor(layer.effectColor, '#3b2114')
        };
        if (type === 'image') return { ...common, name: String(layer.name || 'Şəkil').slice(0, 90), assetKey: '', sourceLayerId: /^[A-Za-z0-9_-]{1,48}$/.test(String(layer.sourceLayerId || '')) ? String(layer.sourceLayerId) : '', crop: clamp(Number(layer.crop) || 0, 0, .4) };
        if (type === 'ornament') return { ...common, motif: SAFE_MOTIFS.has(layer.motif) ? layer.motif : 'heart', color: cleanColor(layer.color, COLOR_MAP.Qızılı) };
        if (type === 'shape') return {
            ...common, shape: SAFE_SHAPES.has(layer.shape) ? layer.shape : 'rectangle',
            width: clamp(Number(layer.width) || 80, 8, PRINT.w), height: clamp(Number(layer.height) || 52, 8, PRINT.h),
            filled: layer.filled !== false, fillColor: cleanColor(layer.fillColor, '#d8c8aa'), strokeColor: cleanColor(layer.strokeColor, '#30251a'),
            strokeWidth: clamp(Number(layer.strokeWidth) || 2, 1, 12)
        };
        if (type === 'background') return {
            ...common, pattern: SAFE_BACKGROUNDS.has(layer.pattern) ? layer.pattern : 'solid',
            fillColor: cleanColor(layer.fillColor, '#f5f3ef'), patternColor: cleanColor(layer.patternColor, '#c6bba9')
        };
        return {
            ...common, content: String(layer.content || '').trim().slice(0, 512), size: clamp(Number(layer.size) || 96, 48, 160),
            foregroundColor: cleanColor(layer.foregroundColor, '#111111'), backgroundColor: cleanColor(layer.backgroundColor, '#ffffff')
        };
    }

    function restoreLayout(layout) {
        if (!layout || typeof layout !== 'object') return;
        discardQueuedHistory();
        studio.suppressHistory = true;
        if (Number(layout.version) >= 4 && Array.isArray(layout.layers)) {
            studio.layers = layout.layers.slice(0, MAX_LAYERS).map(normalizeStoredLayer);
            studio.selectedId = studio.layers.some(layer => layer.id === layout.selectedId) ? layout.selectedId : studio.layers.at(-1)?.id || '';
        } else {
            studio.layers = [];
            const image = layout.image || {};
            const text = layout.text || {};
            if (image.visible !== false) studio.layers.push({ id: nextId('image'), type: 'image', name: 'Yüklənmiş fayl', assetKey: '', x: clamp((Number(image.x) || 150), 0, CANVAS_W), y: clamp((Number(image.y) || 105), 0, CANVAS_H), scale: clamp(Number(image.scale) || 1, .25, 3), rotation: Number(image.rotation) || 0, crop: clamp(Number(image.crop) || 0, 0, .4), opacity: clamp(Number(image.opacity ?? 1), 0, 1), visible: true, locked: false });
            if (String(text.text || '').trim()) studio.layers.push({ id: nextId('text'), type: 'text', name: 'Mətn', text: String(text.text).slice(0, 80), x: clamp(Number(text.x) || 150, 0, CANVAS_W), y: clamp(Number(text.y) || 185, 0, CANVAS_H), scale: clamp(Number(text.scale) || 1, .5, 3), rotation: Number(text.rotation) || 0, font: FONT_MAP[text.font] ? text.font : 'Klassik', color: /^#[0-9a-f]{3,8}$/i.test(text.color || '') ? text.color : COLOR_MAP.Qara, fontSize: clamp(Number(text.fontSize) || 28, 12, 72), fontWeight: [400,500,600,700,800].includes(Number(text.fontWeight)) ? Number(text.fontWeight) : (text.bold === false ? 400 : 700), align: ['left','center','right'].includes(text.align) ? text.align : 'center', verticalAlign: ['top','middle','bottom'].includes(text.verticalAlign) ? text.verticalAlign : 'middle', lineHeight: clamp(Number(text.lineHeight) || 1.2, .8, 2), letterSpacing: clamp(Number(text.letterSpacing) || 0, -2, 10), boxWidth: clamp(Number(text.boxWidth) || 220, 30, PRINT.w), boxHeight: clamp(Number(text.boxHeight) || 48, 20, PRINT.h), opacity: clamp(Number(text.opacity ?? 1), 0, 1), bold: text.bold !== false, italic: text.italic === true, underline: text.underline === true, effect: ['none','shadow','outline'].includes(text.effect) ? text.effect : 'none', effectColor: /^#[0-9a-f]{6}$/i.test(text.effectColor || '') ? text.effectColor : '#3b2114', visible: text.visible !== false, locked: false });
            studio.selectedId = studio.layers.length ? studio.layers.at(-1).id : '';
        }
        syncInspector();
        studio.suppressHistory = false;
        studio.history = []; studio.future = [];
        pushHistory('Dizayn bərpa edildi');
        draw(); renderLayers();
    }

    function zoom(delta) {
        updateSelected(layer => { layer.scale = clamp(Number(layer.scale || 1) + Number(delta || 0), .25, 3); }, 'Ölçü dəyişdi');
    }

    function rotate(delta) {
        updateSelected(layer => { layer.rotation = clamp((Number(layer.rotation || 0) + Number(delta || 0)) % 360, -360, 360); }, 'Element fırlandı');
    }

    function setFontSize(value) {
        updateSelected(layer => { if (layer.type === 'text') layer.fontSize = clamp(Number(value) || 28, 12, 72); }, 'Mətn ölçüsü');
        if ($('customFontSizeValue')) $('customFontSizeValue').textContent = `${clamp(Number(value) || 28, 12, 72)}px`;
    }

    function moveLayer(delta) {
        const index = studio.layers.findIndex(layer => layer.id === studio.selectedId);
        const next = index + delta;
        if (index < 0 || next < 0 || next >= studio.layers.length) return;
        [studio.layers[index], studio.layers[next]] = [studio.layers[next], studio.layers[index]];
        pushHistory('Qat sırası dəyişdi'); draw(); renderLayers(); scheduleAutosave();
    }

    function deleteLayer() {
        const layer = active();
        if (!layer) return;
        studio.layers = studio.layers.filter(item => item.id !== layer.id);
        if (layer.type === 'image') {
            studio.pendingFiles.delete(layer.id);
            removeDraftImage(s.customProductId, layer.id).catch(error => console.warn('F1 Design Studio yerli şəkil qaralaması silinmədi:', error));
            if (layer.assetKey && !studio.layers.some(item => item.type === 'image' && item.assetKey === layer.assetKey)) studio.images.delete(layer.assetKey);
        }
        if (layer.type === 'image' && !studio.layers.some(item => item.type === 'image')) {
            const input = $('customImage');
            if (input) input.value = '';
            const retainedAttachment = (s.customExistingUploads || []).some(upload => upload.purpose === 'attachment');
            studio.uploadFile = studio.attachmentFile || studio.pendingFiles.values().next().value || null;
            if (!retainedAttachment && !studio.attachmentFile) {
                s.customExistingImageName = ''; s.customExistingImageUrl = ''; s.customExistingImagePath = '';
                removeDraftUpload(s.customProductId).catch(error => console.warn('F1 Design Studio yerli fayl qaralaması silinmədi:', error));
            }
            updateUploadStatus();
            ctx.updateCustomizationPreview?.();
        }
        studio.uploadFile = studio.attachmentFile || studio.pendingFiles.values().next().value || null;
        studio.selectedId = studio.layers.at(-1)?.id || '';
        updateUploadStatus();
        syncInspector(); draw(); renderLayers(); pushHistory('Qat silindi'); scheduleAutosave();
    }

    function removeDesignUpload() {
        if (!studio.uploadFile && !studio.pendingFiles.size && !s.customExistingImageName && !s.customExistingImagePath && !(s.customExistingUploads || []).length) {
            return showToast('Silinəcək şəkil və ya fayl yoxdur.');
        }
        studio.layers = studio.layers.filter(layer => layer.type !== 'image');
        studio.images.clear();
        studio.pendingFiles.clear();
        studio.attachmentFile = null;
        studio.uploadFile = null;
        setImageInputFile(null);
        s.customExistingImageName = ''; s.customExistingImageUrl = ''; s.customExistingImagePath = '';
        s.customExistingUploads = [];
        updateUploadStatus();
        studio.selectedId = studio.layers.at(-1)?.id || '';
        syncInspector(); draw(); renderLayers(); pushHistory('Şəkil və fayl silindi');
        removeDraftUpload().catch(error => console.warn('F1 Design Studio qaralama faylı silinmədi:', error));
        removeDraftImages().catch(error => console.warn('F1 Design Studio qaralama şəkilləri silinmədi:', error));
        scheduleAutosave();
        ctx.updateCustomizationPreview?.();
        showToast('Yüklənmiş şəkil və fayl dizayndan silindi.');
    }

    function duplicateLayer() {
        const layer = active();
        if (!layer) return;
        if (studio.layers.length >= MAX_LAYERS) return showToast(`Bir dizaynda ən çox ${MAX_LAYERS} qat ola bilər.`);
        if (layer.type === 'image' && studio.layers.filter(item => item.type === 'image').length >= 8) return showToast('Bir dizayna ən çox 8 şəkil qatı əlavə etmək olar.');
        const copy = { ...layer, id: nextId(layer.type), x: clamp(layer.x + 8, 0, CANVAS_W), y: clamp(layer.y + 8, 0, CANVAS_H), locked: false };
        if (layer.type === 'image') {
            copy.sourceLayerId = layer.sourceLayerId || layer.id;
            const file = studio.pendingFiles.get(layer.id);
            if (file) {
                studio.pendingFiles.set(copy.id, file);
                storeDraftImage(file, copy.id).catch(error => console.warn('F1 Design Studio yerli şəkil qaralaması saxlanmadı:', error));
            }
        }
        studio.layers.push(copy);
        studio.selectedId = copy.id;
        updateUploadStatus();
        syncInspector(); draw(); renderLayers(); pushHistory('Qat çoxaldıldı'); scheduleAutosave();
    }

    function toggleLock() {
        const layer = active();
        if (!layer) return;
        layer.locked = !layer.locked;
        syncInspector(); renderLayers(); pushHistory('Qat kilidi dəyişdi'); scheduleAutosave();
    }

    function bringForward() { moveLayer(1); }
    function sendBackward() { moveLayer(-1); }
    function centerSelected() { updateSelected(layer => { layer.x = PRINT.x + PRINT.w / 2; layer.y = PRINT.y + PRINT.h / 2; }, 'Element mərkəzləndi'); }

    function fitSelectedToPrint() {
        const layer = active();
        if (!layer || layer.locked) return;
        const bounds = layerBounds(layer);
        if (!bounds) return showToast('Şəkil önizləmək üçün əvvəlcə PNG, JPG və ya WEBP yükləyin.');
        layer.scale = clamp(Math.min((PRINT.w - 18) / Math.max(1, bounds.w), (PRINT.h - 22) / Math.max(1, bounds.h), 1), .25, 3);
        layer.x = PRINT.x + PRINT.w / 2; layer.y = PRINT.y + PRINT.h / 2;
        pushHistory('Çap sahəsinə sığdırıldı'); draw(); renderLayers(); scheduleAutosave();
    }

    function toggleVisibility(id = studio.selectedId) {
        const layer = studio.layers.find(item => item.id === id);
        if (!layer) return;
        layer.visible = !layer.visible;
        pushHistory('Qat görünüşü dəyişdi'); draw(); renderLayers(); scheduleAutosave();
    }

    function discardDraft() {
        if (hasCurrentDesign() && !window.confirm('Bu məhsulun saxlanmış və hazırkı dizaynı silinəcək. Davam edilsin?')) return;
        clearDraft(); reset({ preserveHistory: false, persist: false });
        ctx.updateCustomizationPreview?.();
        showToast('Bu məhsul üçün saxlanmış qaralama silindi.');
    }

    function resetDesignFromUser() {
        if (hasCurrentDesign() && !window.confirm('Hazırkı dizayn dəyişiklikləri itəcək. Bütün dizaynı sıfırlamaq istəyirsiniz?')) return;
        reset({ persist: false });
        clearDraft();
        ctx.updateCustomizationPreview?.();
        showToast('Dizayn sıfırlandı.');
    }

    function reset({ preserveHistory = !!s.customProductId && $('customModal')?.classList.contains('open'), persist = true } = {}) {
        studio.imageLoadToken += 1;
        if (preserveHistory) flushQueuedHistory({ save: false });
        else { discardQueuedHistory(); studio.history = []; studio.future = []; studio.images.clear(); }
        clearTimeout(studio.autosaveTimer);
        studio.layers = []; studio.selectedId = '';
        studio.uploadFile = null;
        studio.attachmentFile = null;
        studio.pendingFiles.clear();
        studio.images.clear();
        studio.templatePreviewId = '';
        setImageInputFile(null);
        if ($('designTemplateSearch')) $('designTemplateSearch').value = '';
        if ($('designTemplateCategory')) $('designTemplateCategory').value = '';
        if ($('customText')) $('customText').value = '';
        if ($('customFont')) $('customFont').value = 'Klassik';
        if ($('customColor')) $('customColor').value = 'Qara';
        if ($('customFontSize')) $('customFontSize').value = '28';
        if ($('customTextAlign')) $('customTextAlign').value = 'center';
        if ($('customFontSizeValue')) $('customFontSizeValue').textContent = '28px';
        if ($('customTextBold')) $('customTextBold').checked = true;
        if ($('customTextItalic')) $('customTextItalic').checked = false;
        if ($('customTextUnderline')) $('customTextUnderline').checked = false;
        if ($('customTextEffect')) $('customTextEffect').value = 'none';
        if ($('customTextEffectColor')) $('customTextEffectColor').value = '#3b2114';
        if ($('customFontWeight')) $('customFontWeight').value = '700';
        if ($('customTextVerticalAlign')) $('customTextVerticalAlign').value = 'middle';
        if ($('customTextLineHeight')) $('customTextLineHeight').value = '1.2';
        if ($('customTextLetterSpacing')) $('customTextLetterSpacing').value = '0';
        if ($('customTextBoxWidth')) $('customTextBoxWidth').value = '220';
        if ($('customTextBoxHeight')) $('customTextBoxHeight').value = '48';
        if ($('designElementOpacity')) $('designElementOpacity').value = '100';
        if ($('designImageCrop')) $('designImageCrop').value = '0';
        if ($('customImageName')) $('customImageName').textContent = 'Fayl seçilməyib';
        s.customExistingImageName = ''; s.customExistingImageUrl = ''; s.customExistingImagePath = '';
        s.customExistingUploads = [];
        s.customDesignLayout = null;
        syncInspector(); draw(); renderLayers(); pushHistory('Dizayn sıfırlandı');
        setSaveState('Qaralama hazırdır', false);
        removeDraftUpload().catch(error => console.warn('F1 Design Studio qaralama faylı silinmədi:', error));
        if (persist && s.customProductId) saveLayout({ silent: true });
        ctx.updateCustomizationPreview?.();
    }

    function selectNext() {
        if (!studio.layers.length) return;
        const i = studio.layers.findIndex(layer => layer.id === studio.selectedId);
        selectLayer(studio.layers[(i + 1 + studio.layers.length) % studio.layers.length].id);
    }

    function selectPrev() {
        if (!studio.layers.length) return;
        const i = studio.layers.findIndex(layer => layer.id === studio.selectedId);
        selectLayer(studio.layers[(i - 1 + studio.layers.length) % studio.layers.length].id);
    }

    function toggleInspectorTab(tab) {
        const properties = $('designInspectorProperties'), style = $('designInspectorStyle');
        if (properties) properties.hidden = tab !== 'properties';
        if (style) style.hidden = tab !== 'style';
        document.querySelectorAll('.ds-inspector-tabs button').forEach(button => button.classList.toggle('is-active', button.dataset.actionArgs?.includes(tab)));
    }

    function exportDesignArtwork() {
        const canvas = $('designArtworkCanvas');
        if (!canvas) return;
        try {
            saveLayout({ silent: true });
            updateOutputPreviews();
            const dataUrl = canvas.toDataURL('image/png');
            if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('PNG_EXPORT_FAILED');
            const anchor = document.createElement('a');
            anchor.download = 'f1-studio-artwork-preview-4x.png';
            anchor.href = dataUrl;
            anchor.click();
            showToast('Şəffaf fonlu artwork endirildi. Bu 4× piksel önizləməsidir; fiziki ölçü və istehsal spesifikasiyası deyil.');
        } catch (error) {
            console.error('F1 Design Studio artwork export error:', error);
            showToast('Artwork PNG hazırlana bilmədi. Qaralamanı saxlayıb yenidən cəhd edin.');
        }
    }

    function showLibrary(which = 'elements') {
        const templates = which === 'templates';
        if ($('designElementsPanel')) $('designElementsPanel').hidden = templates;
        if ($('designTemplatesPanel')) $('designTemplatesPanel').hidden = !templates;
        if ($('designLibraryTitle')) $('designLibraryTitle').textContent = templates ? 'Şablonlar' : 'Elementlər';
        if (templates) renderTemplateList();
        document.querySelectorAll('.ds-toolrail button[data-action="showDesignLibrary"]').forEach(button => button.classList.toggle('is-active', button.dataset.actionArgs?.includes(which)));
    }

    function pointerDistance() {
        const points = [...studio.pointers.values()];
        return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }

    function down(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const c = $('designCanvas');
        studio.pointers.set(event.pointerId, canvasPoint(event));
        if (studio.pointers.size >= 2) {
            studio.drag = null;
            const layer = active(), distance = pointerDistance();
            if (layer && !layer.locked && distance > 0) studio.pinch = { startDistance: distance, startScale: layer.scale };
            c?.setPointerCapture?.(event.pointerId); event.preventDefault(); return;
        }
        const point = canvasPoint(event);
        const top = [...studio.layers].reverse().find(layer => hitLayer(layer, point));
        if (!top) { studio.drag = null; draw(); return; }
        selectLayer(top.id, { history: false });
        studio.drag = { dx: point.x - top.x, dy: point.y - top.y };
        c?.setPointerCapture?.(event.pointerId);
        pushHistory('Element hərəkəti'); event.preventDefault();
    }

    function move(event) {
        if (studio.pointers.has(event.pointerId)) studio.pointers.set(event.pointerId, canvasPoint(event));
        if (studio.pointers.size >= 2 && studio.pinch) {
            const distance = pointerDistance(), layer = active();
            if (distance > 0 && layer) {
                layer.scale = clamp(studio.pinch.startScale * (distance / studio.pinch.startDistance), .25, 3);
                draw();
            }
            event.preventDefault(); return;
        }
        if (!studio.drag) return;
        const point = canvasPoint(event), layer = active();
        if (!layer || layer.locked) return;
        const snap = $('designSnap')?.checked;
        const rawX = clamp(point.x - studio.drag.dx, 0, CANVAS_W), rawY = clamp(point.y - studio.drag.dy, 0, CANVAS_H);
        layer.x = snap ? Math.round(rawX / 2) * 2 : rawX;
        layer.y = snap ? Math.round(rawY / 2) * 2 : rawY;
        draw();
    }

    function up(event) {
        const dragged = !!studio.drag, pinched = !!studio.pinch;
        studio.pointers.delete(event.pointerId);
        if (studio.pointers.size < 2) studio.pinch = null;
        studio.drag = null;
        if (dragged || pinched) {
            pushHistory(pinched ? 'İki barmaqla ölçü' : 'Element hərəkəti');
            syncInspector(); renderLayers(); scheduleAutosave();
        }
    }

    function onKeyDown(event) {
        if (!$('customModal')?.classList.contains('open')) return;
        const target = event.target;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
        if (target?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
        if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteLayer(); return; }
        if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
            const layer = active(); if (!layer || layer.locked) return;
            event.preventDefault();
            const step = event.shiftKey ? 10 : 2;
            if (event.key === 'ArrowLeft') layer.x = clamp(layer.x - step, 0, CANVAS_W);
            if (event.key === 'ArrowRight') layer.x = clamp(layer.x + step, 0, CANVAS_W);
            if (event.key === 'ArrowUp') layer.y = clamp(layer.y - step, 0, CANVAS_H);
            if (event.key === 'ArrowDown') layer.y = clamp(layer.y + step, 0, CANVAS_H);
            queueHistory('Klaviatura ilə hərəkət'); draw(); scheduleAutosave();
        }
    }

    const c = $('designCanvas');
    c?.addEventListener('pointerdown', down);
    c?.addEventListener('pointermove', move);
    c?.addEventListener('pointerup', up);
    c?.addEventListener('pointercancel', up);
    c?.addEventListener('dblclick', event => {
        const point = canvasPoint(event);
        const top = [...studio.layers].reverse().find(layer => hitLayer(layer, point));
        if (top) selectLayer(top.id);
    });
    const canvasStage = document.querySelector('#customModal .design-canvas-stage');
    canvasStage?.addEventListener('dragover', event => {
        if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
        event.preventDefault(); canvasStage.classList.add('is-drop-target');
    });
    canvasStage?.addEventListener('dragleave', event => { if (!canvasStage.contains(event.relatedTarget)) canvasStage.classList.remove('is-drop-target'); });
    canvasStage?.addEventListener('drop', event => {
        const files = [...(event.dataTransfer?.files || [])];
        if (!files.length) return;
        event.preventDefault(); canvasStage.classList.remove('is-drop-target');
        // A canceled file picker must not leave a stale "replace selected
        // image" target that changes the meaning of a later canvas drop.
        studio.replaceLayerId = '';
        void loadDesignFiles(files, { dropPoint: canvasPoint(event) });
    });
    ['customText', 'customFont', 'customColor', 'customFontSize', 'customFontWeight', 'customTextAlign', 'customTextVerticalAlign', 'customTextLineHeight', 'customTextLetterSpacing', 'customTextBoxWidth', 'customTextBoxHeight', 'customTextBold', 'customTextItalic', 'customTextUnderline', 'customTextEffect', 'customTextEffectColor', 'designElementColor', 'designElementAccentColor', 'designShapeKind', 'designElementWidth', 'designElementHeight', 'designShapeFill', 'designShapeStrokeWidth', 'designBackgroundPattern', 'designQrContent'].forEach(id => {
        $(id)?.addEventListener('input', event => syncFormToState({ sourceId: event.target.id }));
        $(id)?.addEventListener('change', event => syncFormToState({ sourceId: event.target.id }));
    });
    ['designElementX','designElementY'].forEach(id => $(id)?.addEventListener('input', event => {
        const layer = active(); if (!layer || layer.locked) return;
        const field = event.target.id === 'designElementX' ? 'x' : 'y';
        layer[field] = clamp(Number(event.target.value) || 0, 0, field === 'x' ? CANVAS_W : CANVAS_H);
        draw(); renderLayers(); queueHistory('Element mövqeyi'); scheduleAutosave();
    }));
    $('designElementOpacity')?.addEventListener('input', event => {
        const layer = active(); if (!layer || layer.locked) return;
        layer.opacity = clamp(Number(event.target.value) / 100, 0, 1);
        if ($('designElementOpacityValue')) $('designElementOpacityValue').textContent = `${Math.round(layer.opacity * 100)}%`;
        draw(); queueHistory('Element şəffaflığı'); scheduleAutosave();
    });
    $('designImageCrop')?.addEventListener('input', event => {
        const layer = active(); if (layer?.type !== 'image' || layer.locked) return;
        layer.crop = clamp(Number(event.target.value) / 100, 0, .4);
        if ($('designImageCropValue')) $('designImageCropValue').textContent = `${Math.round(layer.crop * 100)}%`;
        draw(); queueHistory('Şəkil kəsimi'); scheduleAutosave();
    });
    $('designTemplateSearch')?.addEventListener('input', renderTemplateList);
    $('designTemplateCategory')?.addEventListener('change', renderTemplateList);
    $('designTemplateList')?.addEventListener('click', event => {
        const button = event.target.closest('[data-template-preview]');
        if (!button) return;
        studio.templatePreviewId = button.dataset.templatePreview || '';
        renderTemplateList();
    });
    $('designLayersList')?.addEventListener('click', event => {
        const button = event.target.closest('[data-layer-command]');
        if (!button) return;
        const { layerId, layerCommand } = button.dataset;
        if (layerCommand === 'select') selectLayer(layerId);
        if (layerCommand === 'visibility') toggleVisibility(layerId);
        if (layerCommand === 'rename') { selectLayer(layerId); renameLayer(layerId); }
        if (layerCommand === 'lock') {
            const layer = studio.layers.find(item => item.id === layerId);
            if (layer) { layer.locked = !layer.locked; pushHistory('Qat kilidi dəyişdi'); syncInspector(); renderLayers(); scheduleAutosave(); }
        }
    });
    $('designLayersList')?.addEventListener('dragstart', event => {
        const row = event.target.closest('.ds-layer-row');
        if (!row || event.target.closest('button,input')) { event.preventDefault(); return; }
        row.classList.add('is-dragging');
        studio.draggedLayerId = row.dataset.layerId || '';
        if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', studio.draggedLayerId); }
    });
    $('designLayersList')?.addEventListener('dragover', event => {
        const list = $('designLayersList'), target = event.target.closest('.ds-layer-row');
        if (!list || !target || !studio.draggedLayerId || target.dataset.layerId === studio.draggedLayerId) return;
        event.preventDefault();
        list.querySelectorAll('.is-drop-before,.is-drop-after').forEach(row => row.classList.remove('is-drop-before', 'is-drop-after'));
        const after = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
        target.classList.add(after ? 'is-drop-after' : 'is-drop-before');
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    $('designLayersList')?.addEventListener('drop', event => {
        const list = $('designLayersList'), target = event.target.closest('.ds-layer-row');
        const dragged = list?.querySelector(`.ds-layer-row[data-layer-id="${studio.draggedLayerId}"]`);
        if (!list || !target || !dragged || dragged === target) return;
        event.preventDefault();
        const after = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
        list.insertBefore(dragged, after ? target.nextSibling : target);
        list.querySelectorAll('.is-drop-before,.is-drop-after,.is-dragging').forEach(row => row.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging'));
        studio.draggedLayerId = '';
        finishLayerReorder();
    });
    $('designLayersList')?.addEventListener('dragend', () => {
        $('designLayersList')?.querySelectorAll('.is-drop-before,.is-drop-after,.is-dragging').forEach(row => row.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging'));
        studio.draggedLayerId = '';
    });
    document.addEventListener('keydown', onKeyDown);

    Object.assign(ctx, {
        drawDesignStudio: draw,
        syncDesignStudio: () => { syncInspector(); draw(); renderLayers(); renderTemplateList(); },
        resetDesignStudio: reset,
        saveDesignLayout: options => saveLayout(options || {}),
        zoomDesign: zoom,
        rotateDesign: rotate,
        deleteDesignElement: deleteLayer,
        duplicateDesignElement: duplicateLayer,
        selectNextDesignElement: selectNext,
        selectPrevDesignElement: selectPrev,
        restoreDesignLayout: restoreLayout,
        loadDesignFile: loadFile,
        loadDesignFiles,
        replaceDesignImage: replaceImageElement,
        getDesignUploadFile: () => studio.uploadFile || $('customImage')?.files?.[0] || null,
        getDesignUploadFiles: () => new Map(studio.pendingFiles),
        getDesignAttachmentFile: () => studio.attachmentFile,
        exportDesignPreview: () => {
            const c = $('designCanvas');
            if (!c) return;
            try {
                saveLayout({ silent: true });
                draw({ exportMode: true });
                const dataUrl = c.toDataURL('image/png');
                if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('PNG_EXPORT_FAILED');
                const anchor = document.createElement('a');
                anchor.download = 'f1-studio-design-preview.png';
                anchor.href = dataUrl;
                anchor.click();
                showToast('Önizləmə PNG faylı endirildi. Bu fayl istehsal ölçüsü təsdiqi deyil.');
            } catch (error) {
                console.error('F1 Design Studio PNG export error:', error);
                showToast('PNG önizləməsi hazırlana bilmədi. Dizaynı yadda saxlayıb yenidən cəhd edin.');
            } finally {
                draw();
            }
        },
        getDesignPreviewData,
        undoDesign: undo,
        redoDesign: redo,
        bringDesignElementForward: bringForward,
        sendDesignElementBackward: sendBackward,
        setDesignFontSize: setFontSize,
        addDesignText: () => addTextElement(),
        addDesignDate: addDateElement,
        addDesignOrnament: addOrnament,
        addDesignShape: addShape,
        addDesignBackground: addBackground,
        addDesignQr: addQrElement,
        isDesignQrRenderable: content => !!getQrMatrix(content),
        applyDesignTemplate: applyTemplate,
        showDesignLibrary: showLibrary,
        setDesignMode,
        showDesignOutput: showOutputView,
        startDesignTemplatePreview: startPreviewedTemplate,
        exportDesignArtwork,
        hasUnsavedDesign: hasCurrentDesign,
        showInspectorTab: toggleInspectorTab,
        toggleDesignLayerLock: toggleLock,
        addDesignImage: addImageElement,
        removeDesignUpload,
        centerDesignElement: centerSelected,
        fitDesignElementToPrint: fitSelectedToPrint,
        loadExistingDesignIntoStudio: loadExistingImageFromPath,
        loadExistingDesignUploadsIntoStudio: loadExistingImageUploads,
        loadDesignDraft: loadDraft,
        clearDesignDraft: clearDraft,
        restoreDraftUpload,
        restoreDraftImages,
        discardDesignDraft: discardDraft,
        resetDesignFromUser
    });

    requestAnimationFrame(() => {
        if (!studio.history.length) pushHistory('Başlanğıc');
        draw(); renderLayers();
    });
}
