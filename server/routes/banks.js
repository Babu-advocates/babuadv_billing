const express = require('express');
const router = express.Router();
const { query } = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────
// Multer: Template Uploads
// ─────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024,
        fieldSize: 50 * 1024 * 1024
    }
});
const uploadTemplates = upload.fields([
    { name: 'template', maxCount: 1 },
    { name: 'excel_template', maxCount: 1 }
]);

const {
    getBankSplitMode, setBankSplitMode,
    getBankStartingInvoiceNo, setBankStartingInvoiceNo,
    getBankExcelTemplatePath, setBankExcelTemplatePath,
    getBankInvoiceSettings, setBankInvoiceSettings
} = require('../utils/bankConfigStore');
const {
    previewInvoiceNumber,
    normalizeResetMode,
    normalizeSeed,
    normalizeSeqWidth,
    getPeriodKey
} = require('../utils/invoiceNumber');

function parseInvoiceFields(body = {}) {
    const startingInvoiceNo = body.starting_invoice_no !== undefined
        ? String(body.starting_invoice_no).trim()
        : undefined;

    const invoiceResetMode = body.invoice_reset_mode !== undefined
        ? normalizeResetMode(body.invoice_reset_mode)
        : undefined;

    let invoiceSeed;
    if (body.invoice_seed !== undefined && body.invoice_seed !== null && body.invoice_seed !== '') {
        invoiceSeed = normalizeSeed(body.invoice_seed);
    }

    let invoiceSeqWidth;
    if (body.invoice_seq_width !== undefined) {
        // 0 = no padding; empty → default 4
        invoiceSeqWidth = body.invoice_seq_width === '' || body.invoice_seq_width === null
            ? 4
            : normalizeSeqWidth(body.invoice_seq_width);
    }

    return { startingInvoiceNo, invoiceResetMode, invoiceSeed, invoiceSeqWidth };
}

function buildInvoicePreview(bankLike) {
    const pattern = bankLike.starting_invoice_no || '';
    const seed = normalizeSeed(bankLike.invoice_seed);
    const resetMode = normalizeResetMode(bankLike.invoice_reset_mode);
    const seqWidth = normalizeSeqWidth(bankLike.invoice_seq_width);
    const now = new Date();

    const today = previewInvoiceNumber({
        pattern,
        seed,
        lastSeq: bankLike.invoice_last_seq,
        periodKey: bankLike.invoice_period_key,
        resetMode,
        seqWidth,
        now
    });

    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    const nextMonth = previewInvoiceNumber({
        pattern,
        seed,
        lastSeq: null,
        periodKey: null,
        resetMode,
        seqWidth,
        now: nextMonthDate,
        assumeFreshPeriod: true
    });

    return {
        today: today.invoiceNumber || null,
        next_month: nextMonth.invoiceNumber || null,
        period_key: today.periodKey,
        next_seq: today.nextSeq,
        reset_mode: resetMode
    };
}

function enrichBankRow(b) {
    const settings = getBankInvoiceSettings(b.id, b);
    const starting_invoice_no = getBankStartingInvoiceNo(b.id, b.starting_invoice_no);
    const enriched = {
        ...b,
        bill_split: getBankSplitMode(b.id, b.bill_split),
        starting_invoice_no,
        excel_template_path: getBankExcelTemplatePath(b.id, null),
        invoice_reset_mode: normalizeResetMode(settings.invoice_reset_mode),
        invoice_seed: normalizeSeed(settings.invoice_seed),
        invoice_seq_width: normalizeSeqWidth(settings.invoice_seq_width),
        invoice_last_seq: settings.invoice_last_seq ?? null,
        invoice_period_key: settings.invoice_period_key ?? null
    };
    enriched.invoice_preview = buildInvoicePreview(enriched);
    return enriched;
}

// ─────────────────────────────────────────────
// GET /api/banks — All banks with their pricing
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT
                b.id, b.name, b.template_path, b.bill_split, b.starting_invoice_no,
                b.invoice_seed, b.invoice_last_seq, b.invoice_period_key,
                b.invoice_reset_mode, b.invoice_seq_width,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'category', p.category,
                            'price', p.price,
                            'column_key', p.column_key
                        ) ORDER BY p.category
                    ) FILTER (WHERE p.category IS NOT NULL),
                    '[]'
                ) AS pricing,
                NULL::text AS excel_template_path
            FROM public.banks b
            LEFT JOIN public.pricing p ON b.id = p.bank_id
            GROUP BY b.id
            ORDER BY b.name ASC
        `);

        const banks = result.rows.map(enrichBankRow);
        res.json(banks);
    } catch (err) {
        // Fallback SELECT if migration 005 columns are missing
        if (err.message && /invoice_seed|invoice_reset_mode|column/i.test(err.message)) {
            try {
                const result = await query(`
                    SELECT
                        b.id, b.name, b.template_path, b.bill_split, b.starting_invoice_no,
                        COALESCE(
                            json_agg(
                                json_build_object(
                                    'category', p.category,
                                    'price', p.price,
                                    'column_key', p.column_key
                                ) ORDER BY p.category
                            ) FILTER (WHERE p.category IS NOT NULL),
                            '[]'
                        ) AS pricing,
                        NULL::text AS excel_template_path
                    FROM public.banks b
                    LEFT JOIN public.pricing p ON b.id = p.bank_id
                    GROUP BY b.id
                    ORDER BY b.name ASC
                `);
                const banks = result.rows.map(enrichBankRow);
                return res.json(banks);
            } catch (fallbackErr) {
                console.error('Error fetching banks (fallback):', fallbackErr);
                return res.status(500).json({ error: fallbackErr.message });
            }
        }
        console.error('Error fetching banks:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/banks/:id/invoice-preview — Live preview helper
// ─────────────────────────────────────────────
router.get('/:id/invoice-preview', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query('SELECT * FROM public.banks WHERE id = $1 LIMIT 1', [id]);
        const bank = result.rows[0];
        if (!bank) return res.status(404).json({ error: 'Bank institution not found' });

        const pattern = req.query.pattern !== undefined
            ? String(req.query.pattern)
            : getBankStartingInvoiceNo(id, bank.starting_invoice_no);
        const settings = getBankInvoiceSettings(id, bank);
        const seed = req.query.seed !== undefined ? normalizeSeed(req.query.seed) : normalizeSeed(settings.invoice_seed);
        const resetMode = req.query.reset_mode !== undefined
            ? normalizeResetMode(req.query.reset_mode)
            : normalizeResetMode(settings.invoice_reset_mode);

        const preview = buildInvoicePreview({
            starting_invoice_no: pattern,
            invoice_seed: seed,
            invoice_reset_mode: resetMode,
            invoice_seq_width: settings.invoice_seq_width,
            invoice_last_seq: settings.invoice_last_seq,
            invoice_period_key: settings.invoice_period_key
        });

        res.json({
            pattern,
            seed,
            reset_mode: resetMode,
            period_key_now: getPeriodKey(new Date(), resetMode),
            ...preview
        });
    } catch (err) {
        console.error('Error building invoice preview:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/banks/:id/template — Download DOCX template
// ─────────────────────────────────────────────
router.get('/:id/template', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query(
            'SELECT id, name, template_path FROM public.banks WHERE id = $1 LIMIT 1',
            [id]
        );
        const bank = result.rows[0];

        if (!bank) return res.status(404).json({ error: 'Bank institution not found' });
        if (!bank.template_path) return res.status(404).json({ error: 'No template uploaded for this bank institution' });

        if (bank.template_path.startsWith('DATA:')) {
            const parts = bank.template_path.slice(5).split(':');
            const originalName = parts.length > 1 ? parts[0] : `${bank.name}_Template.docx`;
            const base64Str = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
            const buffer = Buffer.from(base64Str, 'base64');
            const safeName = bank.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
            const downloadFilename = originalName.endsWith('.docx') ? originalName : `${safeName}_Template.docx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
            return res.send(buffer);
        }

        const filePath = path.join(__dirname, '../uploads', bank.template_path);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Template file not found on server' });

        const safeName = bank.name.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
        const ext = path.extname(bank.template_path) || '.docx';
        res.download(filePath, `${safeName}_Template${ext}`);
    } catch (err) {
        console.error('Error serving bank template download:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/banks/:id/excel-template — Download Excel template
// ─────────────────────────────────────────────
router.get('/:id/excel-template', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query('SELECT id, name FROM public.banks WHERE id = $1 LIMIT 1', [id]);
        const bank = result.rows[0];

        const excelPath = getBankExcelTemplatePath(id, null);
        if (!excelPath) return res.status(404).json({ error: 'No Excel template uploaded for this bank institution' });

        if (excelPath.startsWith('DATA:')) {
            const parts = excelPath.slice(5).split(':');
            const originalName = parts.length > 1 ? parts[0] : `${bank ? bank.name : 'Bank'}_Template.xlsx`;
            const base64Str = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
            const buffer = Buffer.from(base64Str, 'base64');
            const safeName = bank ? bank.name.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : 'Bank';
            const downloadFilename = originalName.endsWith('.xlsx') ? originalName : `${safeName}_Template.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
            return res.send(buffer);
        }

        const filePath = path.join(__dirname, '../uploads', excelPath);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Excel template file not found on server' });

        const safeName = bank ? bank.name.trim().replace(/[^a-zA-Z0-9_\-]/g, '_') : 'Bank';
        const ext = path.extname(excelPath) || '.xlsx';
        res.download(filePath, `${safeName}_Template${ext}`);
    } catch (err) {
        console.error('Error serving bank Excel template download:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/banks/:id/excel-template
// ─────────────────────────────────────────────
router.delete('/:id/excel-template', async (req, res) => {
    const { id } = req.params;
    try {
        setBankExcelTemplatePath(id, '');
        res.json({ message: 'Excel template removed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// POST /api/banks — Create a new bank
// ─────────────────────────────────────────────
router.post('/', uploadTemplates, async (req, res) => {
    const { name, bill_split, template_data, excel_template_data } = req.body;
    let docxTemplatePath = req.files && req.files['template'] ? req.files['template'][0].filename : (template_data || null);
    let excelTemplatePath = req.files && req.files['excel_template'] ? req.files['excel_template'][0].filename : (excel_template_data || null);

    if (!name || !name.trim()) return res.status(400).json({ error: 'Bank name is required' });

    const trimmedName = name.trim();
    const splitMode = bill_split || 'bank';
    const {
        startingInvoiceNo = '',
        invoiceResetMode = 'monthly',
        invoiceSeed = 1,
        invoiceSeqWidth = 4
    } = parseInvoiceFields(req.body);

    try {
        // Check if bank with same name already exists
        const existing = await query(
            'SELECT id FROM public.banks WHERE LOWER(name) = LOWER($1) LIMIT 1',
            [trimmedName]
        );

        if (existing.rows.length > 0) {
            const bankId = existing.rows[0].id;
            const updates = [];
            const vals = [];
            let idx = 1;

            if (docxTemplatePath) { updates.push(`template_path = $${idx++}`); vals.push(docxTemplatePath); }
            updates.push(`bill_split = $${idx++}`); vals.push(splitMode);
            updates.push(`starting_invoice_no = $${idx++}`); vals.push(startingInvoiceNo);
            updates.push(`invoice_reset_mode = $${idx++}`); vals.push(invoiceResetMode);
            updates.push(`invoice_seed = $${idx++}`); vals.push(invoiceSeed);
            updates.push(`invoice_seq_width = $${idx++}`); vals.push(invoiceSeqWidth);

            vals.push(bankId);
            try {
                await query(`UPDATE public.banks SET ${updates.join(', ')} WHERE id = $${idx}`, vals);
            } catch (updErr) {
                // Migration not applied — update only legacy columns
                if (updErr.message && /invoice_seed|invoice_reset_mode|column/i.test(updErr.message)) {
                    const legacy = [];
                    const legacyVals = [];
                    let li = 1;
                    if (docxTemplatePath) { legacy.push(`template_path = $${li++}`); legacyVals.push(docxTemplatePath); }
                    legacy.push(`bill_split = $${li++}`); legacyVals.push(splitMode);
                    legacy.push(`starting_invoice_no = $${li++}`); legacyVals.push(startingInvoiceNo);
                    legacyVals.push(bankId);
                    await query(`UPDATE public.banks SET ${legacy.join(', ')} WHERE id = $${li}`, legacyVals);
                } else {
                    throw updErr;
                }
            }

            setBankSplitMode(bankId, splitMode);
            setBankStartingInvoiceNo(bankId, startingInvoiceNo);
            setBankInvoiceSettings(bankId, {
                invoice_reset_mode: invoiceResetMode,
                invoice_seed: invoiceSeed,
                invoice_seq_width: invoiceSeqWidth
            });
            if (excelTemplatePath) setBankExcelTemplatePath(bankId, excelTemplatePath);

            const updated = await query('SELECT * FROM public.banks WHERE id = $1', [bankId]);
            return res.status(200).json(enrichBankRow(updated.rows[0]));
        }

        let newBank;
        try {
            const result = await query(
                `INSERT INTO public.banks
                    (name, template_path, bill_split, starting_invoice_no, invoice_reset_mode, invoice_seed, invoice_seq_width)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [trimmedName, docxTemplatePath, splitMode, startingInvoiceNo, invoiceResetMode, invoiceSeed, invoiceSeqWidth]
            );
            newBank = result.rows[0];
        } catch (insErr) {
            if (insErr.message && /invoice_seed|invoice_reset_mode|column/i.test(insErr.message)) {
                const result = await query(
                    `INSERT INTO public.banks (name, template_path, bill_split, starting_invoice_no)
                     VALUES ($1, $2, $3, $4) RETURNING *`,
                    [trimmedName, docxTemplatePath, splitMode, startingInvoiceNo]
                );
                newBank = result.rows[0];
            } else {
                throw insErr;
            }
        }

        setBankSplitMode(newBank.id, splitMode);
        setBankStartingInvoiceNo(newBank.id, startingInvoiceNo);
        setBankInvoiceSettings(newBank.id, {
            invoice_reset_mode: invoiceResetMode,
            invoice_seed: invoiceSeed,
            invoice_seq_width: invoiceSeqWidth
        });
        if (excelTemplatePath) setBankExcelTemplatePath(newBank.id, excelTemplatePath);

        res.status(201).json(enrichBankRow(newBank));
    } catch (err) {
        console.error('Error saving bank:', err);
        res.status(500).json({ error: err.message || 'Failed to save bank' });
    }
});

// ─────────────────────────────────────────────
// PUT /api/banks/:id — Update bank
// ─────────────────────────────────────────────
router.put('/:id', uploadTemplates, async (req, res) => {
    const { id } = req.params;
    const { name, bill_split, template_data, excel_template_data } = req.body;

    let docxTemplatePath = req.files && req.files['template'] ? req.files['template'][0].filename : (template_data || undefined);
    let excelTemplatePath = req.files && req.files['excel_template'] ? req.files['excel_template'][0].filename : (excel_template_data || undefined);

    const {
        startingInvoiceNo,
        invoiceResetMode,
        invoiceSeed,
        invoiceSeqWidth
    } = parseInvoiceFields(req.body);

    const setClauses = [];
    const vals = [];
    let idx = 1;

    if (name) { setClauses.push(`name = $${idx++}`); vals.push(name); }
    if (docxTemplatePath) { setClauses.push(`template_path = $${idx++}`); vals.push(docxTemplatePath); }
    if (bill_split) { setClauses.push(`bill_split = $${idx++}`); vals.push(bill_split); setBankSplitMode(id, bill_split); }
    if (startingInvoiceNo !== undefined) {
        setClauses.push(`starting_invoice_no = $${idx++}`); vals.push(startingInvoiceNo);
        setBankStartingInvoiceNo(id, startingInvoiceNo);
    }
    if (invoiceResetMode !== undefined) {
        setClauses.push(`invoice_reset_mode = $${idx++}`); vals.push(invoiceResetMode);
    }
    if (invoiceSeed !== undefined) {
        setClauses.push(`invoice_seed = $${idx++}`); vals.push(invoiceSeed);
    }
    if (invoiceSeqWidth !== undefined) {
        setClauses.push(`invoice_seq_width = $${idx++}`); vals.push(invoiceSeqWidth);
    }
    if (excelTemplatePath !== undefined) setBankExcelTemplatePath(id, excelTemplatePath);

    if (invoiceResetMode !== undefined || invoiceSeed !== undefined || invoiceSeqWidth !== undefined) {
        setBankInvoiceSettings(id, {
            invoice_reset_mode: invoiceResetMode,
            invoice_seed: invoiceSeed,
            invoice_seq_width: invoiceSeqWidth
        });
    }

    try {
        let updatedBank;
        if (setClauses.length > 0) {
            vals.push(id);
            try {
                const result = await query(
                    `UPDATE public.banks SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
                    vals
                );
                updatedBank = result.rows[0];
            } catch (updErr) {
                if (updErr.message && /invoice_seed|invoice_reset_mode|column/i.test(updErr.message)) {
                    // Retry without new invoice columns
                    const legacyClauses = [];
                    const legacyVals = [];
                    let li = 1;
                    if (name) { legacyClauses.push(`name = $${li++}`); legacyVals.push(name); }
                    if (docxTemplatePath) { legacyClauses.push(`template_path = $${li++}`); legacyVals.push(docxTemplatePath); }
                    if (bill_split) { legacyClauses.push(`bill_split = $${li++}`); legacyVals.push(bill_split); }
                    if (startingInvoiceNo !== undefined) {
                        legacyClauses.push(`starting_invoice_no = $${li++}`);
                        legacyVals.push(startingInvoiceNo);
                    }
                    if (legacyClauses.length > 0) {
                        legacyVals.push(id);
                        const result = await query(
                            `UPDATE public.banks SET ${legacyClauses.join(', ')} WHERE id = $${li} RETURNING *`,
                            legacyVals
                        );
                        updatedBank = result.rows[0];
                    } else {
                        const result = await query('SELECT * FROM public.banks WHERE id = $1', [id]);
                        updatedBank = result.rows[0];
                    }
                } else {
                    throw updErr;
                }
            }
        } else {
            const result = await query('SELECT * FROM public.banks WHERE id = $1', [id]);
            updatedBank = result.rows[0];
        }

        res.json({
            message: 'Bank updated successfully',
            bank: enrichBankRow(updatedBank || { id })
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// POST /api/banks/:id/pricing — Upsert pricing entry
// ─────────────────────────────────────────────
router.post('/:id/pricing', async (req, res) => {
    const { id } = req.params;
    const { category, price, column_key } = req.body;

    if (!category || price === undefined) return res.status(400).json({ error: 'Category and price are required' });

    try {
        await query(
            `INSERT INTO public.pricing (bank_id, category, price, column_key)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT ON CONSTRAINT pricing_bank_category_unique
             DO UPDATE SET price = EXCLUDED.price, column_key = EXCLUDED.column_key`,
            [id, category.trim(), parseFloat(price), column_key ? column_key.trim() || null : null]
        );
        res.json({ message: 'Pricing updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/banks/:id/pricing — Delete pricing entry
// ─────────────────────────────────────────────
router.delete('/:id/pricing', async (req, res) => {
    const { id } = req.params;
    const category = req.query.category || req.body?.category;

    if (!category) return res.status(400).json({ error: 'Category is required' });

    try {
        await query(
            'DELETE FROM public.pricing WHERE bank_id = $1 AND LOWER(category) = LOWER($2)',
            [id, category.trim()]
        );
        res.json({ message: 'Pricing entry deleted successfully' });
    } catch (err) {
        console.error('Error deleting pricing entry:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/banks/:id — Delete bank + cascade pricing
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // ON DELETE CASCADE handles pricing rows automatically
        await query('DELETE FROM public.banks WHERE id = $1', [id]);
        res.json({ message: 'Bank deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
