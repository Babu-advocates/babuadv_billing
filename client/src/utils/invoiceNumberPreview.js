/**
 * Client-side mirror of server invoice token expansion for live Bank Manager preview.
 * Keep in sync with server/utils/invoiceNumber.js token catalog.
 */

const MONTH_NAMES_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export const DEFAULT_SEQ_WIDTH = 4;

export const INVOICE_TOKEN_CHIPS = [
    '{SEQ}',
    '{SEQ:4}',
    '{SEQ:5}',
    '{MONTH}',
    '{MON}',
    '{MM}',
    '{YYYY}',
    '{YY}',
    '{FY}',
    '{FY_FULL}'
];

export const INVOICE_RESET_MODES = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Calendar year' },
    { value: 'financial_year', label: 'Financial year (Apr–Mar)' },
    { value: 'continuous', label: 'Never (continuous)' }
];

/** Sequence digit width options shown in Bank Manager. */
export const INVOICE_SEQ_WIDTH_OPTIONS = [
    { value: 0, label: 'No padding (17)' },
    { value: 2, label: '2 digits (17 → 17)' },
    { value: 3, label: '3 digits (017)' },
    { value: 4, label: '4 digits (0017)' },
    { value: 5, label: '5 digits (00017)' },
    { value: 6, label: '6 digits (000017)' }
];

function getFinancialYearParts(date) {
    const month = date.getMonth();
    const year = date.getFullYear();
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;
    return {
        short: `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`,
        full: `${startYear}-${String(endYear).slice(-2)}`
    };
}

function buildDateTokens(date) {
    const monthIndex = date.getMonth();
    const fullName = MONTH_NAMES_FULL[monthIndex];
    const abbr = fullName.slice(0, 3);
    const year = date.getFullYear();
    const fy = getFinancialYearParts(date);
    const monthNum = monthIndex + 1;
    return {
        YYYY: String(year),
        YY: String(year).slice(-2),
        MM: String(monthNum).padStart(2, '0'),
        M: String(monthNum),
        MONTH: fullName.toUpperCase(),
        Month: fullName,
        MON: abbr.toUpperCase(),
        Mon: abbr,
        FY: fy.short,
        FY_FULL: fy.full
    };
}

function hasTokens(pattern) {
    return /\{[A-Za-z0-9:_]+\}/.test(String(pattern || ''));
}

function formatSeq(seq, widthFromToken, defaultWidth) {
    if (seq === null || seq === undefined) return '';
    const n = Number(seq);
    if (!Number.isFinite(n)) return '';
    const width = widthFromToken != null ? widthFromToken : defaultWidth;
    if (width && width > 0) return String(Math.trunc(n)).padStart(width, '0');
    return String(Math.trunc(n));
}

export function expandInvoicePattern(pattern, { seq = 1, date = new Date(), seqWidth = DEFAULT_SEQ_WIDTH } = {}) {
    const pat = String(pattern || '');
    if (!pat) return '';
    if (!hasTokens(pat)) return pat;

    const tokens = buildDateTokens(date);
    const defaultWidth = Number(seqWidth) || 0;
    return pat.replace(/\{([A-Za-z0-9:_]+)\}/g, (match, rawKey) => {
        const seqMatch = /^SEQ(?::(\d+))?$/i.exec(rawKey);
        if (seqMatch) {
            const tokenWidth = seqMatch[1] ? parseInt(seqMatch[1], 10) : null;
            return formatSeq(seq, tokenWidth, defaultWidth);
        }
        if (Object.prototype.hasOwnProperty.call(tokens, rawKey)) return tokens[rawKey];
        const upper = rawKey.toUpperCase();
        if (upper === 'YYYY') return tokens.YYYY;
        if (upper === 'YY') return tokens.YY;
        if (upper === 'MM') return tokens.MM;
        if (upper === 'M') return tokens.M;
        if (upper === 'MONTH') return tokens.MONTH;
        if (upper === 'MON') return tokens.MON;
        if (upper === 'FY') return tokens.FY;
        if (upper === 'FY_FULL') return tokens.FY_FULL;
        return match;
    });
}

export function previewInvoicePattern(pattern, seed = 1, seqWidth = DEFAULT_SEQ_WIDTH) {
    const now = new Date();
    const seq = Math.max(1, parseInt(seed, 10) || 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    return {
        today: expandInvoicePattern(pattern, { seq, date: now, seqWidth }),
        next_month: expandInvoicePattern(pattern, { seq: 1, date: nextMonth, seqWidth }),
        isStatic: Boolean(pattern) && !hasTokens(pattern)
    };
}

export function resetModeLabel(mode) {
    const found = INVOICE_RESET_MODES.find(m => m.value === mode);
    return found ? found.label : 'Monthly';
}
