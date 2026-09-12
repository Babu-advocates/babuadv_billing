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
    getBankExcelTemplatePath, setBankExcelTemplatePath
} = require('../utils/bankConfigStore');

// ─────────────────────────────────────────────
// GET /api/banks — All banks with their pricing
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
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

        const banks = result.rows.map(b => ({
            ...b,
            bill_split: getBankSplitMode(b.id, b.bill_split),
            starting_invoice_no: getBankStartingInvoiceNo(b.id, b.starting_invoice_no),
            excel_template_path: getBankExcelTemplatePath(b.id, null)
        }));

        res.json(banks);
    } catch (err) {
        console.error('Error fetching banks:', err);
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
    const { name, bill_split, starting_invoice_no, template_data, excel_template_data } = req.body;
    let docxTemplatePath = req.files && req.files['template'] ? req.files['template'][0].filename : (template_data || null);
    let excelTemplatePath = req.files && req.files['excel_template'] ? req.files['excel_template'][0].filename : (excel_template_data || null);

    if (!name || !name.trim()) return res.status(400).json({ error: 'Bank name is required' });

    const trimmedName = name.trim();
    const splitMode = bill_split || 'bank';
    const startingInvoiceNo = starting_invoice_no !== undefined ? String(starting_invoice_no).trim() : '';

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

            if (updates.length > 0) {
                vals.push(bankId);
                await query(`UPDATE public.banks SET ${updates.join(', ')} WHERE id = $${idx}`, vals);
            }

            setBankSplitMode(bankId, splitMode);
            setBankStartingInvoiceNo(bankId, startingInvoiceNo);
            if (excelTemplatePath) setBankExcelTemplatePath(bankId, excelTemplatePath);

            const updated = await query('SELECT * FROM public.banks WHERE id = $1', [bankId]);
            return res.status(200).json({
                ...updated.rows[0],
                bill_split: splitMode,
                starting_invoice_no: startingInvoiceNo,
                excel_template_path: getBankExcelTemplatePath(bankId, null)
            });
        }

        const result = await query(
            `INSERT INTO public.banks (name, template_path, bill_split, starting_invoice_no)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [trimmedName, docxTemplatePath, splitMode, startingInvoiceNo]
        );
        const newBank = result.rows[0];

        setBankSplitMode(newBank.id, splitMode);
        setBankStartingInvoiceNo(newBank.id, startingInvoiceNo);
        if (excelTemplatePath) setBankExcelTemplatePath(newBank.id, excelTemplatePath);

        res.status(201).json({
            ...newBank,
            bill_split: splitMode,
            starting_invoice_no: startingInvoiceNo,
            excel_template_path: getBankExcelTemplatePath(newBank.id, null)
        });
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
    const { name, bill_split, starting_invoice_no, template_data, excel_template_data } = req.body;

    let docxTemplatePath = req.files && req.files['template'] ? req.files['template'][0].filename : (template_data || undefined);
    let excelTemplatePath = req.files && req.files['excel_template'] ? req.files['excel_template'][0].filename : (excel_template_data || undefined);

    const setClauses = [];
    const vals = [];
    let idx = 1;

    if (name) { setClauses.push(`name = $${idx++}`); vals.push(name); }
    if (docxTemplatePath) { setClauses.push(`template_path = $${idx++}`); vals.push(docxTemplatePath); }
    if (bill_split) { setClauses.push(`bill_split = $${idx++}`); vals.push(bill_split); setBankSplitMode(id, bill_split); }
    if (starting_invoice_no !== undefined) {
        const sInvNo = String(starting_invoice_no).trim();
        setClauses.push(`starting_invoice_no = $${idx++}`); vals.push(sInvNo);
        setBankStartingInvoiceNo(id, sInvNo);
    }
    if (excelTemplatePath !== undefined) setBankExcelTemplatePath(id, excelTemplatePath);

    try {
        let updatedBank;
        if (setClauses.length > 0) {
            vals.push(id);
            const result = await query(
                `UPDATE public.banks SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
                vals
            );
            updatedBank = result.rows[0];
        } else {
            const result = await query('SELECT * FROM public.banks WHERE id = $1', [id]);
            updatedBank = result.rows[0];
        }

        res.json({
            message: 'Bank updated successfully',
            bank: {
                ...updatedBank,
                bill_split: getBankSplitMode(id, updatedBank?.bill_split),
                starting_invoice_no: getBankStartingInvoiceNo(id, updatedBank?.starting_invoice_no),
                excel_template_path: getBankExcelTemplatePath(id, null)
            }
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
