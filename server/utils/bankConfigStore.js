const fs = require('fs');
const path = require('path');
const configFilePath = path.join(__dirname, '../uploads/bank_config.json');

function loadBankConfig() {
    try {
        if (fs.existsSync(configFilePath)) {
            const raw = fs.readFileSync(configFilePath, 'utf8');
            return JSON.parse(raw) || {};
        }
    } catch (e) {
        console.error('Error loading bank_config.json:', e);
    }
    return {};
}

function saveBankConfig(config) {
    try {
        const dir = path.dirname(configFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving bank_config.json:', e);
    }
}

function getBankSplitMode(bankId, supabaseBillSplit) {
    if (supabaseBillSplit) return supabaseBillSplit;
    const config = loadBankConfig();
    return config[bankId]?.bill_split || 'bank';
}

function setBankSplitMode(bankId, billSplit) {
    const config = loadBankConfig();
    if (!config[bankId]) config[bankId] = {};
    config[bankId].bill_split = billSplit;
    saveBankConfig(config);
}

function getBankStartingInvoiceNo(bankId, supabaseVal) {
    if (supabaseVal !== undefined && supabaseVal !== null && String(supabaseVal).trim() !== '') return supabaseVal;
    const config = loadBankConfig();
    return config[bankId]?.starting_invoice_no || '';
}

function setBankStartingInvoiceNo(bankId, startingInvoiceNo) {
    const config = loadBankConfig();
    if (!config[bankId]) config[bankId] = {};
    config[bankId].starting_invoice_no = startingInvoiceNo;
    saveBankConfig(config);
}

function getBankExcelTemplatePath(bankId, supabaseVal) {
    if (supabaseVal !== undefined && supabaseVal !== null && String(supabaseVal).trim() !== '') return supabaseVal;
    const config = loadBankConfig();
    return config[bankId]?.excel_template_path || '';
}

function setBankExcelTemplatePath(bankId, excelTemplatePath) {
    const config = loadBankConfig();
    if (!config[bankId]) config[bankId] = {};
    config[bankId].excel_template_path = excelTemplatePath;
    saveBankConfig(config);
}

function getBankInvoiceSettings(bankId, dbRow = {}) {
    const config = loadBankConfig();
    const entry = config[bankId] || {};

    const resetFromDb = dbRow.invoice_reset_mode;
    const seedFromDb = dbRow.invoice_seed;
    const widthFromDb = dbRow.invoice_seq_width;

    return {
        invoice_reset_mode: (resetFromDb && String(resetFromDb).trim())
            || entry.invoice_reset_mode
            || 'monthly',
        invoice_seed: (seedFromDb !== undefined && seedFromDb !== null && seedFromDb !== '')
            ? seedFromDb
            : (entry.invoice_seed !== undefined ? entry.invoice_seed : 1),
        invoice_seq_width: (widthFromDb !== undefined && widthFromDb !== null && widthFromDb !== '')
            ? widthFromDb
            : (entry.invoice_seq_width !== undefined && entry.invoice_seq_width !== null && entry.invoice_seq_width !== ''
                ? entry.invoice_seq_width
                : 4),
        invoice_last_seq: dbRow.invoice_last_seq !== undefined ? dbRow.invoice_last_seq : (entry.invoice_last_seq ?? null),
        invoice_period_key: dbRow.invoice_period_key !== undefined && dbRow.invoice_period_key !== null
            ? dbRow.invoice_period_key
            : (entry.invoice_period_key || null)
    };
}

function setBankInvoiceSettings(bankId, {
    invoice_reset_mode,
    invoice_seed,
    invoice_seq_width
} = {}) {
    const config = loadBankConfig();
    if (!config[bankId]) config[bankId] = {};
    if (invoice_reset_mode !== undefined) config[bankId].invoice_reset_mode = invoice_reset_mode;
    if (invoice_seed !== undefined) config[bankId].invoice_seed = invoice_seed;
    if (invoice_seq_width !== undefined) config[bankId].invoice_seq_width = invoice_seq_width;
    saveBankConfig(config);
}

module.exports = {
    loadBankConfig,
    saveBankConfig,
    getBankSplitMode,
    setBankSplitMode,
    getBankStartingInvoiceNo,
    setBankStartingInvoiceNo,
    getBankExcelTemplatePath,
    setBankExcelTemplatePath,
    getBankInvoiceSettings,
    setBankInvoiceSettings
};
