const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function cleanMessageValue(value, maxLength = 200) {
    return String(value ?? '')
        .replace(CONTROL_CHARACTERS, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

export function normalizeProductWhatsAppNumber(value) {
    const raw = String(value ?? '').trim();
    if (!raw || !/^[+\d\s().-]+$/.test(raw)) return '';

    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = `994${digits.slice(1)}`;
    else if (digits.length === 9) digits = `994${digits}`;

    return /^\d{8,15}$/.test(digits) ? digits : '';
}

export function buildPublicProductUrl(product, siteUrl) {
    const productId = String(product?.id ?? '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(productId)) return '';

    try {
        const configuredSite = new URL(String(siteUrl ?? ''));
        const hostname = configuredSite.hostname.toLowerCase();
        const isLocalHost = hostname === 'localhost'
            || hostname.endsWith('.localhost')
            || /^127(?:\.\d{1,3}){3}$/.test(hostname)
            || hostname === '[::1]';
        if (configuredSite.protocol !== 'https:' || configuredSite.username || configuredSite.password || isLocalHost) return '';

        const productUrl = new URL('/', configuredSite.origin);
        productUrl.searchParams.set('product', productId);
        return productUrl.href;
    } catch (_) {
        return '';
    }
}

export function buildProductCustomizationWhatsAppLink(product, whatsappNumber, productUrl = '') {
    const phone = normalizeProductWhatsAppNumber(whatsappNumber);
    const name = cleanMessageValue(product?.name, 160);
    if (!phone || !name) return null;

    const code = cleanMessageValue(product?.code ?? product?.productCode ?? product?.product_code ?? product?.sku, 80);
    const rawPrice = product?.price;
    const priceNumber = Number(rawPrice);
    const hasPrice = rawPrice !== null && rawPrice !== undefined && String(rawPrice).trim() !== '' && Number.isFinite(priceNumber) && priceNumber >= 0;
    const price = hasPrice ? `${priceNumber.toFixed(2)} ₼` : 'Qiymət dəqiqləşdirilir';

    const safeProductUrl = (() => {
        if (!productUrl) return '';
        try {
            const parsed = new URL(productUrl);
            const hostname = parsed.hostname.toLowerCase();
            const isLocalHost = hostname === 'localhost'
                || hostname.endsWith('.localhost')
                || /^127(?:\.\d{1,3}){3}$/.test(hostname)
                || hostname === '[::1]';
            return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !isLocalHost ? parsed.href : '';
        } catch (_) {
            return '';
        }
    })();

    const lines = [
        'Salam! F1 Studio saytından aşağıdakı məhsulu fərdiləşdirmək istəyirəm.',
        '',
        `Məhsul: ${name}`
    ];
    if (code) lines.push(`Məhsul kodu: ${code}`);
    lines.push(`Qiymət: ${price}`);
    if (safeProductUrl) lines.push(`Məhsulun linki: ${safeProductUrl}`);
    lines.push(
        '',
        'Fərdiləşdirmə istəyim:',
        '[Burada istəyimi sizinlə dəqiqləşdirmək istəyirəm.]',
        '',
        'Zəhmət olmasa, bu məhsulun hansı dəyişikliklərlə hazırlana biləcəyini, yekun qiymətini və hazırlanma müddətini bildirərdiniz.',
        '',
        'Təşəkkür edirəm!'
    );

    const message = lines.join('\n');
    return {
        phone,
        message,
        url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    };
}

