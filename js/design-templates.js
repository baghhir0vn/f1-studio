// Local, structured starter compositions. Add templates here without touching
// the editor: each entry declares its compatibility and its editable layers.
// Product IDs are the stable catalog identifiers currently available; category
// names are presentation/filter metadata, never a compatibility fallback.
export const DESIGN_TEMPLATES = [
    {
        id: 'lipa-nameplate', title: 'Lipa nömrəsi', description: 'Nömrə və qısa mətn üçün', category: 'Lipa', tags: ['nömrə','minimal'],
        productIds: [1, 2],
        layers: [
            { type: 'text', text: 'NÖMRƏNİ DAXİL ET', x: 150, y: 112, font: 'Qalın', size: 24, color: '#30251a', weight: 700, align: 'center', lineHeight: 1.2, boxWidth: 236, boxHeight: 35 },
            { type: 'text', text: 'QISA MƏTN', x: 150, y: 154, font: 'Modern', size: 13, color: '#30251a', weight: 500, align: 'center', lineHeight: 1.2, boxWidth: 220, boxHeight: 24 }
        ]
    },
    {
        id: 'lipa-minimal', title: 'Lipa · minimal', description: 'Sadə, mərkəzlənmiş yazı', category: 'Lipa', tags: ['sadə','minimal'],
        productIds: [1, 2],
        layers: [{ type: 'text', text: 'MƏTNİNİ DAXİL ET', x: 150, y: 128, font: 'Modern', size: 23, color: '#30251a', weight: 600, align: 'center', lineHeight: 1.2, boxWidth: 236, boxHeight: 34 }]
    },
    {
        id: 'desk-name', title: 'Masaüstü dəsti · ad və vəzifə', description: 'Masaüstü dəstində fərdi yazı üçün', category: 'Masaüstü dəsti', tags: ['ofis','ad','vəzifə'],
        productIds: [6],
        layers: [
            { type: 'text', text: 'AD SOYAD', x: 150, y: 105, font: 'Qalın', size: 25, color: '#30251a', weight: 700, align: 'center', boxWidth: 232, boxHeight: 38 },
            { type: 'ornament', motif: 'divider', x: 150, y: 145, color: '#b88919', scale: 1 },
            { type: 'text', text: 'VƏZİFƏ / ŞİRKƏT', x: 150, y: 168, font: 'Modern', size: 14, color: '#30251a', weight: 500, align: 'center', boxWidth: 232, boxHeight: 26 }
        ]
    },
    {
        id: 'desk-office', title: 'Masaüstü dəsti · minimal', description: 'Qısa ofis yazısı', category: 'Masaüstü dəsti', tags: ['ofis','sadə'],
        productIds: [6],
        layers: [{ type: 'text', text: 'OFİS YAZISI', x: 150, y: 120, font: 'Modern', size: 22, color: '#30251a', weight: 600, align: 'center', boxWidth: 232, boxHeight: 36 }]
    },
    {
        id: 'domino-gift', title: 'Domino qutusu · hədiyyə yazısı', description: 'Qutu üzərində ad və qısa təbrik üçün', category: 'Domino qutusu', tags: ['taxta','ad','təbrik'],
        productIds: [4],
        layers: [
            { type: 'text', text: 'AD / AİLƏ ADI', x: 150, y: 112, font: 'Əlyazma', size: 27, color: '#30251a', weight: 600, align: 'center', boxWidth: 224, boxHeight: 42 },
            { type: 'ornament', motif: 'divider', x: 150, y: 151, color: '#b88919', scale: 0.82 },
            { type: 'text', text: 'TƏBRİK QEYDİ', x: 150, y: 177, font: 'Modern', size: 13, color: '#30251a', weight: 500, align: 'center', boxWidth: 224, boxHeight: 22 }
        ]
    },
    {
        id: 'lighter-engraving', title: 'Alışqan · qısa həkk yazısı', description: 'Ad, tarix və ya qısa söz üçün', category: 'Alışqan', tags: ['həkk','ad','qısa'],
        productIds: [3],
        layers: [{ type: 'text', text: 'QISA YAZI', x: 150, y: 120, font: 'Modern', size: 20, color: '#30251a', weight: 600, align: 'center', boxWidth: 224, boxHeight: 32 }]
    },
    {
        id: 'clock-engraving', title: 'Divar saatı · ad və tarix', description: 'Saat dizaynı üçün ad, tarix və dekor qatı', category: 'Divar saatı', tags: ['saat','ad','tarix'],
        productIds: [7],
        layers: [
            { type: 'text', text: 'ADLAR', x: 150, y: 107, font: 'Əlyazma', size: 27, color: '#30251a', weight: 600, align: 'center', boxWidth: 224, boxHeight: 42 },
            { type: 'ornament', motif: 'heart', x: 150, y: 150, color: '#b88919', scale: 0.8 },
            { type: 'text', text: 'TARİX', x: 150, y: 180, font: 'Modern', size: 15, color: '#30251a', weight: 500, align: 'center', boxWidth: 224, boxHeight: 24 }
        ]
    },
    {
        id: 'watch-engraving', title: 'Qol saatı · fərdi yazı', description: 'Modelə uyğun qısa fərdi yazı', category: 'Qol saatı', tags: ['saat','ad','qısa'],
        productIds: [8],
        layers: [
            { type: 'text', text: 'AD / İNİSİAL', x: 150, y: 116, font: 'Modern', size: 20, color: '#30251a', weight: 600, align: 'center', boxWidth: 200, boxHeight: 32 },
            { type: 'ornament', motif: 'divider', x: 150, y: 150, color: '#b88919', scale: 0.72 }
        ]
    },
    {
        id: 'print-event', title: 'Tədbir / elan', description: 'Başlıq və məlumat üçün', category: 'Banner', tags: ['elan','tədbir','məlumat'],
        productIds: [10],
        layers: [
            { type: 'text', text: 'ELAN BAŞLIĞI', x: 150, y: 92, font: 'Qalın', size: 28, color: '#30251a', weight: 700, align: 'center', boxWidth: 232, boxHeight: 42 },
            { type: 'ornament', motif: 'divider', x: 150, y: 130, color: '#b88919', scale: 1 },
            { type: 'text', text: 'TARİX / MƏLUMAT', x: 150, y: 160, font: 'Modern', size: 16, color: '#30251a', weight: 500, align: 'center', boxWidth: 232, boxHeight: 28 }
        ]
    },
    {
        id: 'print-personal', title: 'Fərdi yazı', description: 'Stiker və brelok üçün', category: 'Stiker / brelok', tags: ['ad','fərdi','qısa'],
        productIds: [11],
        layers: [
            { type: 'text', text: 'AD / QISA SÖZ', x: 150, y: 118, font: 'Qalın', size: 24, color: '#30251a', weight: 700, align: 'center', boxWidth: 232, boxHeight: 38 },
            { type: 'ornament', motif: 'star', x: 150, y: 70, color: '#b88919', scale: 1 }
        ]
    },
    {
        id: 'model-label', title: 'Maket · ad lövhəsi', description: 'Maket üçün ad və başlıq', category: 'Maket', tags: ['model','ad','qeyd'],
        productIds: [12],
        layers: [
            { type: 'text', text: 'OBYEKTİN ADI', x: 150, y: 108, font: 'Qalın', size: 22, color: '#30251a', weight: 700, align: 'center', boxWidth: 232, boxHeight: 36 },
            { type: 'text', text: 'TARİX / QEYD', x: 150, y: 151, font: 'Modern', size: 15, color: '#30251a', weight: 500, align: 'center', boxWidth: 232, boxHeight: 26 }
        ]
    }
];

export const DESIGN_TEMPLATE_CATEGORIES = [...new Set(DESIGN_TEMPLATES.map(template => template.category))];

export function getCompatibleDesignTemplates(product) {
    if (!product || product.customizable === false) return [];
    const id = Number(product.id);
    if (!Number.isSafeInteger(id) || id <= 0) return [];
    return DESIGN_TEMPLATES.filter(template => {
        return Array.isArray(template.productIds) && template.productIds.includes(id);
    });
}

export function searchCompatibleDesignTemplates(product, { query = '', category = '' } = {}) {
    const needle = String(query || '').trim().toLocaleLowerCase('az');
    return getCompatibleDesignTemplates(product).filter(template => {
        if (category && template.category !== category) return false;
        if (!needle) return true;
        const haystack = [template.title, template.description, template.category, ...(template.tags || [])]
            .join(' ').toLocaleLowerCase('az');
        return haystack.includes(needle);
    });
}
