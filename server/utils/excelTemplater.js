const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

/**
 * Fills an Excel template (.xlsx) with templateData (same schema as docxtemplater).
 *
 * @param {string} templatePath - File name in uploads/ or base64 DATA: string
 * @param {object} data - templateData object containing scalars & opinions array
 * @returns {Buffer} - Buffer of the generated filled Excel file
 */
function fillExcelTemplate(templatePath, data) {
    let workbook;

    if (templatePath.startsWith('DATA:')) {
        const parts = templatePath.slice(5).split(':');
        const base64Str = parts.length > 1 ? parts.slice(1).join(':') : parts[0];
        const buffer = Buffer.from(base64Str, 'base64');
        workbook = xlsx.read(buffer, { type: 'buffer', cellStyles: true, cellFormulas: true, cellDates: true, cellNF: true });
    } else {
        const filePath = path.join(__dirname, '../uploads', templatePath);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Excel template file not found at ${filePath}`);
        }
        workbook = xlsx.readFile(filePath, { cellStyles: true, cellFormulas: true, cellDates: true, cellNF: true });
    }

    const opinions = data.opinions || data.items || [];

    // Helper to resolve tag value against an object
    function getTagValue(obj, tag) {
        if (!tag || !obj) return undefined;
        const cleanTag = tag.trim();

        // 1. Direct match
        if (obj[cleanTag] !== undefined && obj[cleanTag] !== null) return obj[cleanTag];

        // 2. Exact match case-insensitive
        const lowerTag = cleanTag.toLowerCase();
        const directKey = Object.keys(obj).find(k => k.toLowerCase() === lowerTag);
        if (directKey) return obj[directKey];

        // 3. Normalized match (remove spaces, underscores, dots)
        const normTarget = lowerTag.replace(/[\s_\-.]+/g, '');
        const normKey = Object.keys(obj).find(k => k.toLowerCase().replace(/[\s_\-.]+/g, '') === normTarget);
        if (normKey) return obj[normKey];

        return undefined;
    }

    // Helper to perform string/value replacement for a single cell string value
    function replacePlaceholdersInString(str, scope) {
        if (typeof str !== 'string') return str;

        // Check if cell is ONLY a single placeholder e.g. "{{GRAND_TOTAL}}" or "{{Amount}}"
        const singleMatch = str.trim().match(/^\{\{\s*([^{}]+)\s*\}\}$/);
        if (singleMatch) {
            const tagName = singleMatch[1];
            const val = getTagValue(scope, tagName);
            if (val !== undefined && val !== null) {
                return val; // Preserve numeric / primitive type
            }
            return '';
        }

        // Replace embedded placeholders inside text string e.g. "Total Amount: {{GRAND_TOTAL}} Rupees"
        return str.replace(/\{\{\s*([^{}]+)\s*\}\}/g, (match, tagName) => {
            const val = getTagValue(scope, tagName);
            return val !== undefined && val !== null ? String(val) : '';
        });
    }

    // Iterate over all sheets in workbook
    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet || !sheet['!ref']) return;

        const range = xlsx.utils.decode_range(sheet['!ref']);

        // Step 1: Detect {{#opinions}} and {{/opinions}} row markers
        let startRow = -1;
        let endRow = -1;

        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddr = xlsx.utils.encode_cell({ r, c });
                const cell = sheet[cellAddr];
                if (cell && typeof cell.v === 'string') {
                    if (cell.v.includes('{{#opinions}}') || cell.v.includes('{{#opinions')) {
                        startRow = r;
                    }
                    if (cell.v.includes('{{/opinions}}') || cell.v.includes('{{/opinions')) {
                        endRow = r;
                    }
                }
            }
        }

        // Handle Repeating Opinions Table if markers present
        if (startRow !== -1 && endRow !== -1 && endRow >= startRow) {
            // Clear marker cells
            for (let c = range.s.c; c <= range.e.c; c++) {
                const startAddr = xlsx.utils.encode_cell({ r: startRow, c });
                if (sheet[startAddr]) delete sheet[startAddr];

                const endAddr = xlsx.utils.encode_cell({ r: endRow, c });
                if (sheet[endAddr]) delete sheet[endAddr];
            }

            // Pattern rows are between startRow + 1 and endRow - 1
            const patternStart = startRow + 1;
            const patternEnd = endRow - 1;

            // Extract pattern row templates
            const patternRows = [];
            if (patternEnd >= patternStart) {
                for (let pr = patternStart; pr <= patternEnd; pr++) {
                    const rowCells = [];
                    for (let c = range.s.c; c <= range.e.c; c++) {
                        const addr = xlsx.utils.encode_cell({ r: pr, c });
                        if (sheet[addr]) {
                            rowCells.push({ col: c, cell: { ...sheet[addr] } });
                            delete sheet[addr]; // clear pattern cell from sheet
                        }
                    }
                    patternRows.push(rowCells);
                }
            }

            // Save footer/trailing rows below endRow
            const footerRows = [];
            for (let r = endRow + 1; r <= range.e.r; r++) {
                const rowCells = [];
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const addr = xlsx.utils.encode_cell({ r, c });
                    if (sheet[addr]) {
                        rowCells.push({ col: c, cell: { ...sheet[addr] } });
                        delete sheet[addr];
                    }
                }
                footerRows.push({ origRow: r, cells: rowCells });
            }

            // Write repeated opinion rows starting at startRow
            let currentRow = startRow;

            if (patternRows.length > 0 && opinions.length > 0) {
                opinions.forEach((op, opIdx) => {
                    patternRows.forEach((pRow) => {
                        pRow.forEach(({ col, cell }) => {
                            const newAddr = xlsx.utils.encode_cell({ r: currentRow, c: col });
                            const newCell = { ...cell };

                            if (typeof newCell.v === 'string') {
                                const replaced = replacePlaceholdersInString(newCell.v, { ...data, ...op, 'S.No': opIdx + 1, 'S. No': opIdx + 1, 'S.NO': opIdx + 1 });
                                if (typeof replaced === 'number') {
                                    newCell.v = replaced;
                                    newCell.t = 'n';
                                    delete newCell.w;
                                } else {
                                    newCell.v = String(replaced);
                                    newCell.t = 's';
                                    delete newCell.w;
                                }
                            }

                            sheet[newAddr] = newCell;
                        });
                        currentRow++;
                    });
                });
            }

            // Re-write footer rows starting right after the repeated opinion rows
            footerRows.forEach(({ cells }) => {
                cells.forEach(({ col, cell }) => {
                    const newAddr = xlsx.utils.encode_cell({ r: currentRow, c: col });
                    sheet[newAddr] = cell;
                });
                currentRow++;
            });

            // Update sheet range reference
            range.e.r = Math.max(range.e.r, currentRow - 1);
            sheet['!ref'] = xlsx.utils.encode_range(range);
        }

        // Step 2: Global Replacement for all remaining cells (scalars, invoice details, grand totals, etc.)
        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddr = xlsx.utils.encode_cell({ r, c });
                const cell = sheet[cellAddr];
                if (!cell || typeof cell.v !== 'string') continue;

                if (cell.v.includes('{{')) {
                    const replaced = replacePlaceholdersInString(cell.v, data);
                    if (typeof replaced === 'number') {
                        cell.v = replaced;
                        cell.t = 'n';
                        delete cell.w;
                    } else if (typeof replaced === 'boolean') {
                        cell.v = replaced;
                        cell.t = 'b';
                        delete cell.w;
                    } else {
                        cell.v = String(replaced);
                        cell.t = 's';
                        delete cell.w;
                    }
                }
            }
        }
    });

    // Write modified workbook to buffer
    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
    fillExcelTemplate
};
