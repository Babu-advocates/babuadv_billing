/**
 * Dynamic invoice number engine.
 * Pattern tokens resolve from a given date (usually server "now" at bill generation).
 * Sequence auto-increments with per-bank reset: monthly | yearly | financial_year | continuous.
 */

const RESET_MODES = Object.freeze(['monthly', 'yearly', 'financial_year', 'continuous']);

const MONTH_NAMES_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function normalizeResetMode(mode) {
    const m = String(mode || 'monthly').trim().toLowerCase();
    return RESET_MODES.includes(m) ? m : 'monthly';
}

function normalizeSeed(seed) {
    const n = parseInt(seed, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
}

/** Default sequence zero-pad width when bank has not set one (4 → 0017). */
const DEFAULT_SEQ_WIDTH = 4;

/**
 * Normalize sequence digit width.
 * Returns 0 for no padding, 1–12 for zero-pad width.
 * Empty / null / invalid → default 4 (unless allowDefault is false → null).
 */
function normalizeSeqWidth(width, { allowDefault = true } = {}) {
    if (width === 0 || width === '0' || String(width).trim().toLowerCase() === 'none') return 0;
    if (width === undefined || width === null || width === '') {
        return allowDefault ? DEFAULT_SEQ_WIDTH : null;
    }
    const n = parseInt(width, 10);
    if (!Number.isFinite(n) || n < 0 || n > 12) {
        return allowDefault ? DEFAULT_SEQ_WIDTH : null;
    }
    return n;
}

/** India financial year: April–March. */
function getFinancialYearParts(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const month = d.getMonth(); // 0-based
    const year = d.getFullYear();
    const startYear = month >= 3 ? year : year - 1; // Apr (3) starts new FY
    const endYear = startYear + 1;
    const startShort = String(startYear).slice(-2);
    const endShort = String(endYear).slice(-2);
    return {
        startYear,
        endYear,
        short: `${startShort}-${endShort}`,
        full: `${startYear}-${endShort}`
    };
}

function getPeriodKey(date = new Date(), resetMode = 'monthly') {
    const d = date instanceof Date ? date : new Date(date);
    const mode = normalizeResetMode(resetMode);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');

    if (mode === 'continuous') return 'ALL';
    if (mode === 'yearly') return String(y);
    if (mode === 'financial_year') {
        const fy = getFinancialYearParts(d);
        return `FY-${fy.full}`;
    }
    // monthly (default)
    return `${y}-${m}`;
}

function buildDateTokens(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const monthIndex = d.getMonth();
    const fullName = MONTH_NAMES_FULL[monthIndex];
    const abbr = fullName.slice(0, 3);
    const year = d.getFullYear();
    const fy = getFinancialYearParts(d);
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

function hasSeqToken(pattern) {
    return /\{SEQ(?::\d+)?\}/i.test(String(pattern || ''));
}

function formatSeq(seq, widthFromToken, defaultWidth) {
    if (seq === null || seq === undefined) return '';
    const n = Number(seq);
    if (!Number.isFinite(n)) return '';
    // Token width (e.g. {SEQ:5}) wins; else bank setting (0 = no pad, default 4)
    const width = widthFromToken != null ? widthFromToken : defaultWidth;
    if (width && width > 0) return String(Math.trunc(n)).padStart(width, '0');
    return String(Math.trunc(n));
}

/**
 * Expand pattern tokens. Unknown `{TOKEN}` left unchanged.
 */
function expandPattern(pattern, { seq = null, date = new Date(), seqWidth = null } = {}) {
    const pat = String(pattern || '');
    if (!pat) return '';
    if (!hasTokens(pat)) return pat;

    const tokens = buildDateTokens(date);
    const defaultWidth = normalizeSeqWidth(seqWidth);

    return pat.replace(/\{([A-Za-z0-9:_]+)\}/g, (match, rawKey) => {
        const seqMatch = /^SEQ(?::(\d+))?$/i.exec(rawKey);
        if (seqMatch) {
            const tokenWidth = seqMatch[1] ? parseInt(seqMatch[1], 10) : null;
            return formatSeq(seq, tokenWidth, defaultWidth);
        }

        if (Object.prototype.hasOwnProperty.call(tokens, rawKey)) {
            return tokens[rawKey];
        }

        // Case-insensitive fallback for date tokens (except Month/Mon casing variants)
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

/**
 * Allocate the next invoice number for a bank pattern.
 * Literal patterns (no `{…}` tokens) are returned unchanged and do not claim a sequence.
 */
function allocateInvoiceNumber({
    pattern,
    seed = 1,
    lastSeq = null,
    periodKey = null,
    resetMode = 'monthly',
    seqWidth = null,
    now = new Date()
} = {}) {
    const pat = String(pattern || '').trim();
    const date = now instanceof Date ? now : new Date(now);
    const mode = normalizeResetMode(resetMode);
    const seedNum = normalizeSeed(seed);
    const currentPeriod = getPeriodKey(date, mode);

    if (!pat) {
        return {
            invoiceNumber: '',
            nextSeq: null,
            periodKey: currentPeriod,
            claimed: false,
            resetMode: mode
        };
    }

    if (!hasTokens(pat)) {
        return {
            invoiceNumber: pat,
            nextSeq: null,
            periodKey: currentPeriod,
            claimed: false,
            resetMode: mode
        };
    }

    let nextSeq = null;
    let claimed = false;

    if (hasSeqToken(pat)) {
        claimed = true;
        if (periodKey !== currentPeriod) {
            nextSeq = seedNum;
        } else {
            nextSeq = (lastSeq == null ? seedNum - 1 : Number(lastSeq)) + 1;
            if (!Number.isFinite(nextSeq) || nextSeq < 1) nextSeq = seedNum;
        }
    }

    const invoiceNumber = expandPattern(pat, {
        seq: nextSeq,
        date,
        seqWidth
    });

    return {
        invoiceNumber,
        nextSeq,
        periodKey: currentPeriod,
        claimed,
        resetMode: mode
    };
}

/**
 * Preview without persisting. Uses seed as the sequence shown for a fresh period,
 * or lastSeq+1 when previewing the same period.
 */
function previewInvoiceNumber({
    pattern,
    seed = 1,
    lastSeq = null,
    periodKey = null,
    resetMode = 'monthly',
    seqWidth = null,
    now = new Date(),
    assumeFreshPeriod = false
} = {}) {
    const date = now instanceof Date ? now : new Date(now);
    const mode = normalizeResetMode(resetMode);
    const currentPeriod = getPeriodKey(date, mode);
    const effectivePeriodKey = assumeFreshPeriod ? null : periodKey;

    return allocateInvoiceNumber({
        pattern,
        seed,
        lastSeq: assumeFreshPeriod ? null : lastSeq,
        periodKey: effectivePeriodKey,
        resetMode: mode,
        seqWidth,
        now: date
    });
}

/** Default invoice string when bank has no pattern configured. */
function buildDefaultInvoiceNumber(bankName, date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const prefix = String(bankName || 'BNK').substring(0, 3).toUpperCase() || 'BNK';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}/${m}/${prefix}`;
}

module.exports = {
    RESET_MODES,
    DEFAULT_SEQ_WIDTH,
    normalizeResetMode,
    normalizeSeed,
    normalizeSeqWidth,
    getFinancialYearParts,
    getPeriodKey,
    buildDateTokens,
    hasTokens,
    hasSeqToken,
    expandPattern,
    allocateInvoiceNumber,
    previewInvoiceNumber,
    buildDefaultInvoiceNumber
};
