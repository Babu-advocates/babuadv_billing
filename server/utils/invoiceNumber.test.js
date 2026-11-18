const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    getFinancialYearParts,
    getPeriodKey,
    expandPattern,
    allocateInvoiceNumber,
    previewInvoiceNumber,
    buildDefaultInvoiceNumber,
    hasTokens,
    hasSeqToken
} = require('./invoiceNumber');

const nov2026 = new Date(2026, 10, 18); // 18 Nov 2026
const jan2027 = new Date(2027, 0, 15);  // 15 Jan 2027
const apr2027 = new Date(2027, 3, 1);   // 1 Apr 2027
const oct2026 = new Date(2026, 9, 5);   // 5 Oct 2026

describe('getFinancialYearParts', () => {
    it('Nov 2026 is FY 26-27 / 2026-27', () => {
        const fy = getFinancialYearParts(nov2026);
        assert.equal(fy.short, '26-27');
        assert.equal(fy.full, '2026-27');
    });

    it('Jan 2027 stays in FY 26-27', () => {
        const fy = getFinancialYearParts(jan2027);
        assert.equal(fy.short, '26-27');
        assert.equal(fy.full, '2026-27');
    });

    it('Apr 2027 starts FY 27-28', () => {
        const fy = getFinancialYearParts(apr2027);
        assert.equal(fy.short, '27-28');
        assert.equal(fy.full, '2027-28');
    });
});

describe('getPeriodKey', () => {
    it('monthly uses YYYY-MM', () => {
        assert.equal(getPeriodKey(nov2026, 'monthly'), '2026-11');
        assert.equal(getPeriodKey(jan2027, 'monthly'), '2027-01');
    });

    it('yearly uses calendar year', () => {
        assert.equal(getPeriodKey(nov2026, 'yearly'), '2026');
        assert.equal(getPeriodKey(jan2027, 'yearly'), '2027');
    });

    it('financial_year uses FY-YYYY-YY', () => {
        assert.equal(getPeriodKey(nov2026, 'financial_year'), 'FY-2026-27');
        assert.equal(getPeriodKey(jan2027, 'financial_year'), 'FY-2026-27');
        assert.equal(getPeriodKey(apr2027, 'financial_year'), 'FY-2027-28');
    });

    it('continuous is ALL', () => {
        assert.equal(getPeriodKey(nov2026, 'continuous'), 'ALL');
        assert.equal(getPeriodKey(jan2027, 'continuous'), 'ALL');
    });
});

describe('expandPattern tokens', () => {
    it('expands month words, abbrev, numbers, years for Nov 2026', () => {
        // Bare {SEQ} uses default seqWidth 4 → 0017
        assert.equal(
            expandPattern('{SEQ}/{YYYY}/{MONTH}/MDU', { seq: 17, date: nov2026 }),
            '0017/2026/NOVEMBER/MDU'
        );
        assert.equal(
            expandPattern('{SEQ:4}/{YYYY}/{MON}/MAD', { seq: 17, date: nov2026 }),
            '0017/2026/NOV/MAD'
        );
        assert.equal(
            expandPattern('{SEQ}/AF/{MON}/{YY}', { seq: 211, date: nov2026 }),
            '0211/AF/NOV/26'
        );
        assert.equal(
            expandPattern('{SEQ}/{MM}/{YYYY}', { seq: 10, date: nov2026 }),
            '0010/11/2026'
        );
        assert.equal(
            expandPattern('{SEQ}/{FY}/{MON}', { seq: 10, date: nov2026 }),
            '0010/26-27/NOV'
        );
        assert.equal(
            expandPattern('BABU/{SEQ}/{YYYY}', { seq: 13, date: nov2026 }),
            'BABU/0013/2026'
        );
    });

    it('supports custom seqWidth and no padding', () => {
        assert.equal(
            expandPattern('{SEQ}/{YYYY}', { seq: 17, date: nov2026, seqWidth: 5 }),
            '00017/2026'
        );
        assert.equal(
            expandPattern('{SEQ}/{YYYY}', { seq: 17, date: nov2026, seqWidth: 0 }),
            '17/2026'
        );
        // Token override beats bank width
        assert.equal(
            expandPattern('{SEQ:3}/{YYYY}', { seq: 17, date: nov2026, seqWidth: 6 }),
            '017/2026'
        );
    });

    it('Jan 2027 shows JANUARY / 2027 / FY still 26-27', () => {
        assert.equal(
            expandPattern('{SEQ}/{YYYY}/{MONTH}/MDU', { seq: 1, date: jan2027, seqWidth: 0 }),
            '1/2027/JANUARY/MDU'
        );
        assert.equal(
            expandPattern('{SEQ}/{FY_FULL}/{Mon}', { seq: 5, date: jan2027, seqWidth: 0 }),
            '5/2026-27/Jan'
        );
    });

    it('literal patterns without tokens are unchanged', () => {
        assert.equal(expandPattern('37/2026', { seq: 99, date: nov2026 }), '37/2026');
        assert.equal(hasTokens('37/2026'), false);
        assert.equal(hasSeqToken('{SEQ}/{YYYY}'), true);
        assert.equal(hasSeqToken('{YYYY}/{MONTH}'), false);
    });
});

describe('allocateInvoiceNumber reset modes', () => {
    it('monthly: same period increments; new month resets to seed', () => {
        const pattern = '{SEQ}/{YYYY}/{MONTH}/MDU';
        const first = allocateInvoiceNumber({
            pattern,
            seed: 17,
            lastSeq: null,
            periodKey: null,
            resetMode: 'monthly',
            seqWidth: 0,
            now: nov2026
        });
        assert.equal(first.invoiceNumber, '17/2026/NOVEMBER/MDU');
        assert.equal(first.nextSeq, 17);
        assert.equal(first.claimed, true);
        assert.equal(first.periodKey, '2026-11');

        const second = allocateInvoiceNumber({
            pattern,
            seed: 17,
            lastSeq: first.nextSeq,
            periodKey: first.periodKey,
            resetMode: 'monthly',
            seqWidth: 0,
            now: nov2026
        });
        assert.equal(second.invoiceNumber, '18/2026/NOVEMBER/MDU');
        assert.equal(second.nextSeq, 18);

        const nextMonth = allocateInvoiceNumber({
            pattern,
            seed: 17,
            lastSeq: 41,
            periodKey: '2026-10',
            resetMode: 'monthly',
            seqWidth: 0,
            now: nov2026
        });
        assert.equal(nextMonth.invoiceNumber, '17/2026/NOVEMBER/MDU');
        assert.equal(nextMonth.nextSeq, 17);
        assert.equal(nextMonth.periodKey, '2026-11');
    });

    it('yearly: resets on calendar year change', () => {
        const pattern = '{SEQ}/{YYYY}';
        const endOfYear = allocateInvoiceNumber({
            pattern,
            seed: 1,
            lastSeq: 50,
            periodKey: '2026',
            resetMode: 'yearly',
            seqWidth: 0,
            now: nov2026
        });
        assert.equal(endOfYear.nextSeq, 51);
        assert.equal(endOfYear.invoiceNumber, '51/2026');

        const newYear = allocateInvoiceNumber({
            pattern,
            seed: 1,
            lastSeq: 50,
            periodKey: '2026',
            resetMode: 'yearly',
            seqWidth: 0,
            now: jan2027
        });
        assert.equal(newYear.nextSeq, 1);
        assert.equal(newYear.invoiceNumber, '1/2027');
        assert.equal(newYear.periodKey, '2027');
    });

    it('financial_year: Jan stays in same FY period; Apr resets', () => {
        const pattern = '{SEQ}/{FY}';
        const nov = allocateInvoiceNumber({
            pattern,
            seed: 10,
            lastSeq: null,
            periodKey: null,
            resetMode: 'financial_year',
            seqWidth: 0,
            now: nov2026
        });
        assert.equal(nov.periodKey, 'FY-2026-27');
        assert.equal(nov.invoiceNumber, '10/26-27');

        const jan = allocateInvoiceNumber({
            pattern,
            seed: 10,
            lastSeq: 15,
            periodKey: 'FY-2026-27',
            resetMode: 'financial_year',
            seqWidth: 0,
            now: jan2027
        });
        assert.equal(jan.nextSeq, 16);
        assert.equal(jan.invoiceNumber, '16/26-27');
        assert.equal(jan.periodKey, 'FY-2026-27');

        const apr = allocateInvoiceNumber({
            pattern,
            seed: 10,
            lastSeq: 99,
            periodKey: 'FY-2026-27',
            resetMode: 'financial_year',
            seqWidth: 0,
            now: apr2027
        });
        assert.equal(apr.nextSeq, 10);
        assert.equal(apr.invoiceNumber, '10/27-28');
        assert.equal(apr.periodKey, 'FY-2027-28');
    });

    it('continuous: never resets across months/years', () => {
        const pattern = '{SEQ}/{MON}/{YY}';
        const a = allocateInvoiceNumber({
            pattern,
            seed: 5,
            lastSeq: null,
            periodKey: null,
            resetMode: 'continuous',
            seqWidth: 0,
            now: oct2026
        });
        assert.equal(a.nextSeq, 5);
        assert.equal(a.periodKey, 'ALL');

        const b = allocateInvoiceNumber({
            pattern,
            seed: 5,
            lastSeq: 5,
            periodKey: 'ALL',
            resetMode: 'continuous',
            seqWidth: 0,
            now: jan2027
        });
        assert.equal(b.nextSeq, 6);
        assert.equal(b.invoiceNumber, '6/JAN/27');
        assert.equal(b.periodKey, 'ALL');
    });

    it('literal pattern does not claim sequence', () => {
        const result = allocateInvoiceNumber({
            pattern: '37/2026',
            seed: 1,
            lastSeq: 9,
            periodKey: '2026-11',
            resetMode: 'monthly',
            now: nov2026
        });
        assert.equal(result.invoiceNumber, '37/2026');
        assert.equal(result.claimed, false);
        assert.equal(result.nextSeq, null);
    });

    it('date-only tokens expand without claiming sequence', () => {
        const result = allocateInvoiceNumber({
            pattern: 'INV/{YYYY}/{MONTH}',
            seed: 1,
            lastSeq: null,
            periodKey: null,
            resetMode: 'monthly',
            now: nov2026
        });
        assert.equal(result.invoiceNumber, 'INV/2026/NOVEMBER');
        assert.equal(result.claimed, false);
        assert.equal(result.nextSeq, null);
    });
});

describe('preview and default', () => {
    it('preview assumes fresh period when requested', () => {
        const preview = previewInvoiceNumber({
            pattern: '{SEQ}/{MON}',
            seed: 3,
            lastSeq: 40,
            periodKey: '2026-11',
            resetMode: 'monthly',
            seqWidth: 0,
            now: nov2026,
            assumeFreshPeriod: true
        });
        assert.equal(preview.nextSeq, 3);
        assert.equal(preview.invoiceNumber, '3/NOV');
    });

    it('allocate defaults bare {SEQ} to 4-digit padding', () => {
        const r = allocateInvoiceNumber({
            pattern: '{SEQ}/{YYYY}',
            seed: 17,
            lastSeq: null,
            periodKey: null,
            resetMode: 'monthly',
            now: nov2026
        });
        assert.equal(r.invoiceNumber, '0017/2026');
    });

    it('buildDefaultInvoiceNumber uses YYYY/MM/prefix', () => {
        assert.equal(buildDefaultInvoiceNumber('AXIS CHENNAI', nov2026), '2026/11/AXI');
    });
});

describe('sequential allocate uniqueness', () => {
    it('two sequential allocates in same period get distinct seqs', () => {
        const pattern = '{SEQ:4}/AF/{MON}/{YY}';
        let lastSeq = null;
        let periodKey = null;
        const nums = [];
        for (let i = 0; i < 3; i++) {
            const r = allocateInvoiceNumber({
                pattern,
                seed: 211,
                lastSeq,
                periodKey,
                resetMode: 'monthly',
                now: nov2026
            });
            nums.push(r.invoiceNumber);
            lastSeq = r.nextSeq;
            periodKey = r.periodKey;
        }
        assert.deepEqual(nums, [
            '0211/AF/NOV/26',
            '0212/AF/NOV/26',
            '0213/AF/NOV/26'
        ]);
    });
});
