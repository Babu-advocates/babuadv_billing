const express = require('express');
const router = express.Router();
const supabase = require('../db_supabase');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for Template Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });
const uploadTemplates = upload.fields([
    { name: 'template', maxCount: 1 },
    { name: 'excel_template', maxCount: 1 }
]);

const { getBankSplitMode, setBankSplitMode, getBankStartingInvoiceNo, setBankStartingInvoiceNo, getBankExcelTemplatePath, setBankExcelTemplatePath } = require('../utils/bankConfigStore');

// GET all banks with their pricing
router.get('/', async (req, res) => {
    try {
        let banks = null;
        let error = null;

        // Try selecting with bill_split, starting_invoice_no, excel_template_path and column_key first
        const resWithColKey = await supabase
            .from('banks')
            .select(`
                id,
                name,
                template_path,
                excel_template_path,
                bill_split,
                starting_invoice_no,
                pricing (
                    category,
                    price,
                    column_key
                )
            `);

        if (resWithColKey.error) {
            // Fall back to query without extra columns if not in Supabase schema
            const resFallback = await supabase
                .from('banks')
                .select(`
                    id,
                    name,
                    template_path,
                    pricing (
                        category,
                        price
                    )
                `);
            banks = resFallback.data;
            error = resFallback.error;
        } else {
            banks = resWithColKey.data;
        }

        if (error) throw error;

        // Merge bill_split, starting_invoice_no and excel_template_path fallbacks
        if (banks) {
            banks = banks.map(b => ({
                ...b,
                bill_split: getBankSplitMode(b.id, b.bill_split),
                starting_invoice_no: getBankStartingInvoiceNo(b.id, b.starting_invoice_no),
                excel_template_path: getBankExcelTemplatePath(b.id, b.excel_template_path)
            }));
        }

        res.json(banks || []);
    } catch (err) {
        console.error("Error fetching banks:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET download uploaded DOCX template for a bank institution
router.get('/:id/template', async (req, res) => {
    const { id } = req.params;

    try {
        const { data: bank, error } = await supabase
            .from('banks')
            .select('id, name, template_path')
            .eq('id', id)
            .single();

        if (error || !bank) {
            return res.status(404).json({ error: 'Bank institution not found' });
        }

        if (!bank.template_path) {
            return res.status(404).json({ error: 'No template uploaded for this bank institution' });
        }

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

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Template file not found on server' });
        }

        const safeName = bank.name.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
        const ext = path.extname(bank.template_path) || '.docx';
        const downloadFilename = `${safeName}_Template${ext}`;

        res.download(filePath, downloadFilename);
    } catch (err) {
        console.error('Error serving bank template download:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET download uploaded Excel template for a bank institution
router.get('/:id/excel-template', async (req, res) => {
    const { id } = req.params;

    try {
        const { data: bank, error } = await supabase
            .from('banks')
            .select('id, name, excel_template_path')
            .eq('id', id)
            .single();

        const excelPath = getBankExcelTemplatePath(id, bank?.excel_template_path);

        if (!excelPath) {
            return res.status(404).json({ error: 'No Excel template uploaded for this bank institution' });
        }

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

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Excel template file not found on server' });
        }

        const safeName = bank ? bank.name.trim().replace(/[^a-zA-Z0-9_\-]/g, '_') : 'Bank';
        const ext = path.extname(excelPath) || '.xlsx';
        const downloadFilename = `${safeName}_Template${ext}`;

        res.download(filePath, downloadFilename);
    } catch (err) {
        console.error('Error serving bank Excel template download:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE remove Excel template for a bank
router.delete('/:id/excel-template', async (req, res) => {
    const { id } = req.params;
    try {
        setBankExcelTemplatePath(id, '');
        try {
            await supabase.from('banks').update({ excel_template_path: null }).eq('id', id);
        } catch (e) { /* ignore if column doesn't exist yet */ }
        res.json({ message: 'Excel template removed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create a new bank (with optional DOCX or Excel template)
router.post('/', uploadTemplates, async (req, res) => {
    const { name, bill_split, starting_invoice_no, template_data, excel_template_data } = req.body;
    
    let docxTemplatePath = req.files && req.files['template'] ? req.files['template'][0].filename : (template_data || null);
    let excelTemplatePath = req.files && req.files['excel_template'] ? req.files['excel_template'][0].filename : (excel_template_data || null);

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Bank name is required' });
    }

    const trimmedName = name.trim();
    const splitMode = bill_split || 'bank';
    const startingInvoiceNo = starting_invoice_no !== undefined ? String(starting_invoice_no).trim() : '';

    try {
        // Check if bank with same name exists
        const { data: existing } = await supabase
            .from('banks')
            .select('id, name, template_path, excel_template_path')
            .ilike('name', trimmedName);

        if (existing && existing.length > 0) {
            const bankId = existing[0].id;
            const updates = {};
            if (docxTemplatePath) updates.template_path = docxTemplatePath;
            if (excelTemplatePath) updates.excel_template_path = excelTemplatePath;

            if (Object.keys(updates).length > 0) {
                try {
                    await supabase.from('banks').update(updates).eq('id', bankId);
                } catch (e) {
                    if (updates.template_path) await supabase.from('banks').update({ template_path: updates.template_path }).eq('id', bankId);
                }
                setBankSplitMode(bankId, splitMode);
                setBankStartingInvoiceNo(bankId, startingInvoiceNo);
                if (excelTemplatePath) setBankExcelTemplatePath(bankId, excelTemplatePath);

                const { data: updated } = await supabase.from('banks').select('*').eq('id', bankId);
                return res.status(200).json({
                    ...updated[0],
                    bill_split: splitMode,
                    starting_invoice_no: startingInvoiceNo,
                    excel_template_path: getBankExcelTemplatePath(bankId, updated[0]?.excel_template_path)
                });
            }
            return res.status(400).json({ error: `A bank institution named "${trimmedName}" already exists.` });
        }

        let newBank = null;
        try {
            const { data, error } = await supabase
                .from('banks')
                .insert([{ name: trimmedName, template_path: docxTemplatePath, excel_template_path: excelTemplatePath, bill_split: splitMode, starting_invoice_no: startingInvoiceNo }])
                .select();
            if (error) throw error;
            newBank = data[0];
        } catch (dbErr) {
            const { data, error } = await supabase
                .from('banks')
                .insert([{ name: trimmedName, template_path: docxTemplatePath }])
                .select();
            if (error) throw error;
            newBank = data[0];
        }

        setBankSplitMode(newBank.id, splitMode);
        setBankStartingInvoiceNo(newBank.id, startingInvoiceNo);
        if (excelTemplatePath) setBankExcelTemplatePath(newBank.id, excelTemplatePath);

        res.status(201).json({
            ...newBank,
            bill_split: splitMode,
            starting_invoice_no: startingInvoiceNo,
            excel_template_path: getBankExcelTemplatePath(newBank.id, newBank.excel_template_path)
        });
    } catch (err) {
        console.error('Error saving bank:', err);
        res.status(500).json({ error: err.message || 'Failed to save bank' });
    }
});

// PUT update bank (name or template or excel_template or bill_split or starting_invoice_no)
router.put('/:id', uploadTemplates, async (req, res) => {
    const { id } = req.params;
    const { name, bill_split, starting_invoice_no, template_data, excel_template_data } = req.body;

    let docxTemplatePath = req.files && req.files['template'] ? req.files['template'][0].filename : (template_data || undefined);
    let excelTemplatePath = req.files && req.files['excel_template'] ? req.files['excel_template'][0].filename : (excel_template_data || undefined);

    const updates = {};
    if (name) updates.name = name;
    if (docxTemplatePath) updates.template_path = docxTemplatePath;
    if (excelTemplatePath !== undefined) updates.excel_template_path = excelTemplatePath;
    if (bill_split) {
        updates.bill_split = bill_split;
        setBankSplitMode(id, bill_split);
    }
    if (starting_invoice_no !== undefined) {
        updates.starting_invoice_no = String(starting_invoice_no).trim();
        setBankStartingInvoiceNo(id, String(starting_invoice_no).trim());
    }
    if (excelTemplatePath !== undefined) {
        setBankExcelTemplatePath(id, excelTemplatePath);
    }

    if (Object.keys(updates).length === 0) {
        return res.json({ message: 'No changes provided' });
    }

    try {
        let updatedBank = null;
        try {
            const { data, error } = await supabase
                .from('banks')
                .update(updates)
                .eq('id', id)
                .select();
            if (error) throw error;
            updatedBank = data[0];
        } catch (dbErr) {
            // Fallback if extra columns don't exist in Supabase table
            const fallbackUpdates = { ...updates };
            delete fallbackUpdates.bill_split;
            delete fallbackUpdates.starting_invoice_no;
            delete fallbackUpdates.excel_template_path;

            if (Object.keys(fallbackUpdates).length > 0) {
                const { data, error } = await supabase
                    .from('banks')
                    .update(fallbackUpdates)
                    .eq('id', id)
                    .select();
                if (error) throw error;
                updatedBank = data[0];
            } else {
                const { data } = await supabase.from('banks').select('*').eq('id', id);
                updatedBank = data ? data[0] : { id };
            }
        }

        const finalSplit = getBankSplitMode(id, updatedBank?.bill_split || bill_split);
        const finalStartingInvoiceNo = getBankStartingInvoiceNo(id, updatedBank?.starting_invoice_no || starting_invoice_no);
        const finalExcelTemplate = getBankExcelTemplatePath(id, updatedBank?.excel_template_path || excelTemplatePath);

        res.json({
            message: 'Bank updated successfully',
            bank: {
                ...updatedBank,
                bill_split: finalSplit,
                starting_invoice_no: finalStartingInvoiceNo,
                excel_template_path: finalExcelTemplate
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST/PUT Update pricing for a bank
router.post('/:id/pricing', async (req, res) => {
    const { id } = req.params;
    const { category, price, column_key } = req.body;

    if (!category || price === undefined) {
        return res.status(400).json({ error: 'Category and price are required' });
    }

    try {
        const payload = {
            bank_id: id,
            category: category.trim(),
            price: parseFloat(price)
        };
        if (column_key !== undefined && column_key !== null) {
            payload.column_key = column_key.trim() || null;
        }

        // Try upserting with column_key first
        let { error } = await supabase
            .from('pricing')
            .upsert(payload, { onConflict: 'bank_id, category' });

        if (error && error.message && error.message.includes('column_key')) {
            // Fallback to upsert without column_key if column doesn't exist in Supabase table
            delete payload.column_key;
            const resFallback = await supabase
                .from('pricing')
                .upsert(payload, { onConflict: 'bank_id, category' });
            error = resFallback.error;
        }

        if (error) throw error;
        res.json({ message: 'Pricing updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE single pricing category entry for a bank
router.delete('/:id/pricing', async (req, res) => {
    const { id } = req.params;
    const category = req.query.category || req.body?.category;

    if (!category) {
        return res.status(400).json({ error: 'Category is required' });
    }

    try {
        const { error } = await supabase
            .from('pricing')
            .delete()
            .eq('bank_id', id)
            .ilike('category', category.trim());

        if (error) throw error;
        res.json({ message: 'Pricing entry deleted successfully' });
    } catch (err) {
        console.error('Error deleting pricing entry:', err);
        res.status(500).json({ error: err.message });
    }
});



// DELETE bank
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Delete pricing first
        const { error: pError } = await supabase
            .from('pricing')
            .delete()
            .eq('bank_id', id);

        if (pError) throw pError;

        // Then delete bank
        const { error: bError } = await supabase
            .from('banks')
            .delete()
            .eq('id', id);

        if (bError) throw bError;

        res.json({ message: 'Bank deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
