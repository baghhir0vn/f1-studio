const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 12000;
const MAX_PIXELS = 40_000_000;

async function readPrefix(file, length = 16) {
    return new Uint8Array(await file.slice(0, length).arrayBuffer());
}

function detectType(bytes) {
    if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
    if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
    return '';
}

async function imageSize(file) {
    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        try { return { width: bitmap.width, height: bitmap.height }; }
        finally { bitmap.close?.(); }
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        const result = await new Promise((resolve, reject) => {
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => reject(new Error('DESIGN_FILE_MALFORMED'));
            img.src = url;
        });
        return result;
    } finally { URL.revokeObjectURL(url); }
}

/** Validate actual bytes and decoded dimensions; browser-provided MIME is only a hint. */
export async function inspectDesignFile(file) {
    if (!file || typeof file.slice !== 'function' || !Number.isFinite(Number(file.size)) || Number(file.size) < 1) {
        throw new Error('DESIGN_FILE_MALFORMED');
    }
    if (Number(file.size) > MAX_BYTES) throw new Error('DESIGN_FILE_TOO_LARGE');
    const type = detectType(await readPrefix(file));
    if (!type) throw new Error('DESIGN_FILE_TYPE');
    const declared = String(file.type || '').toLowerCase();
    if (declared && declared !== type && declared !== 'application/octet-stream') throw new Error('DESIGN_FILE_TYPE');
    if (type === 'application/pdf') return { type, width: 0, height: 0, attachmentOnly: true };
    let dimensions;
    try { dimensions = await imageSize(file); }
    catch (_) { throw new Error('DESIGN_FILE_MALFORMED'); }
    const { width, height } = dimensions;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
        throw new Error('DESIGN_FILE_DIMENSIONS');
    }
    return { type, width, height, attachmentOnly: false };
}

export function normalizeDesignFile(file, type) {
    if (!file || !type || String(file.type || '') === type) return file;
    return new File([file], file.name || `design.${type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'pdf'}`, {
        type, lastModified: Number(file.lastModified) || Date.now()
    });
}
