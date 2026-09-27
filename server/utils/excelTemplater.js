const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

/**
 * Fills an Excel template (.xlsx) with templateData.
 *
 * Placeholder formats supported in Excel cells:
 *   {{FieldName}}   double braces (preferred)
 *   {FieldName}     single brace  (also supported)
 *
 * Loop markers (put each in its own dedicated row, any column):
 *   {{#opinions}} or {#opinions}   - start of repeating rows
 *   {{/opinions}} or {/opinions}   - end of repeating rows
 *   Also works: {{#items}}, {{#rows}}, {{#data}}
 *
 * If NO loop markers are found but opinion-specific placeholders exist,
 * those rows are auto-detected and repeated for each opinion.
 *
 * @param {string} templatePath - File in uploads/ or base64 DATA: string
 * @param {object} data         - templateData (same schema as docxtemplater)
 * @returns {Buffer}            - Filled Excel workbook as buffer
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    function getTagValue(obj, tag) {
        if (!tag || !obj) return undefined;
        const cleanTag = tag.trim();
        if (obj[cleanTag] !== undefined && obj[cleanTag] !== null) return obj[cleanTag];
        const lowerTag = cleanTag.toLowerCase();
        const directKey = Object.keys(obj).find(k => k.toLowerCase() === lowerTag);
        if (directKey) return obj[directKey];
        const normTarget = lowerTag.replace(/[\s_\-./]+/g, '');
        const normKey = Object.keys(obj).find(k => k.toLowerCase().replace(/[\s_\-./]+/g, '') === normTarget);
        if (normKey) return obj[normKey];
        return undefined;
    }

    function replacePlaceholders(str, scope) {
        if (typeof str !== 'string') return str;

        // Whole-cell double brace: {{tag}}
        const dbl = str.trim().match(/^\{\{\s*([^{}#\/][^{}]*?)\s*\}\}$/);
        if (dbl) {
            const val = getTagValue(scope, dbl[1]);
            return (val !== undefined && val !== null) ? val : '';
        }
        // Whole-cell single brace: {tag}
        const sgl = str.trim().match(/^\{([^{}#\/][^{}]*?)\}$/);
        if (sgl) {
            const val = getTagValue(scope, sgl[1]);
            return (val !== undefined && val !== null) ? val : '';
        }
        // Embedded {{tag}} replacements
        let result = str.replace(/\{\{\s*([^{}#\/][^{}]*?)\s*\}\}/g, (_, t) => {
            const val = getTagValue(scope, t);
            return (val !== undefined && val !== null) ? String(val) : '';
        });
        // Embedded {tag} replacements
        result = result.replace(/\{([^{}#\/][^{}]*?)\}/g, (_, t) => {
            const val = getTagValue(scope, t);
            return (val !== undefined && val !== null) ? String(val) : '';
        });
        return result;
    }

    function applyValue(cell, replaced) {
        if (typeof replaced === 'number') {
            cell.v = replaced; cell.t = 'n'; delete cell.w;
        } else if (typeof replaced === 'boolean') {
            cell.v = replaced; cell.t = 'b'; delete cell.w;
        } else {
            cell.v = String(replaced); cell.t = 's'; delete cell.w;
        }
    }

    function hasPlaceholder(v) {
        return typeof v === 'string' && /\{[^{}]+\}/.test(v);
    }

    function isLoopStart(v) {
        return typeof v === 'string' && /\{#(opinions|items|rows|data)\b/i.test(v);
    }

    function isLoopEnd(v) {
        return typeof v === 'string' && /\{\/(opinions|items|rows|data)\b/i.test(v);
    }

    const OPINION_FIELDS = [
        'amount', 'lan no', 'application type', 'borrower', 'applicant',
        'client name', 'client_name', 's.no', 's. no', 'submission date',
        'bank application', 'property', 'address', 'branch name', 'vetting',
        'account no', 'accountno', 'file no', 'fileno', 'borrower / applicant',
        'customer_name', 'customer name'
    ];

    // ── Process each sheet ────────────────────────────────────────────────────

    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet || !sheet['!ref']) return;

        const range = xlsx.utils.decode_range(sheet['!ref']);

        // Step 1: Find explicit loop markers
        let startRow = -1;
        let endRow   = -1;

        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = sheet[xlsx.utils.encode_cell({ r, c })];
                if (!cell) continue;
                const v = String(cell.v || '');
                if (isLoopStart(v)) startRow = r;
                if (isLoopEnd(v))   endRow   = r;
            }
        }

        // Step 2: Auto-detect loop rows if no explicit markers
        if (startRow === -1 && opinions.length > 0) {
            for (let r = range.s.r; r <= range.e.r; r++) {
                let rowHasOpinionField = false;
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const cell = sheet[xlsx.utils.encode_cell({ r, c })];
                    if (!cell || typeof cell.v !== 'string') continue;
                    const v = cell.v.toLowerCase();
                    if (hasPlaceholder(cell.v) && OPINION_FIELDS.some(f => v.includes(f))) {
                        rowHasOpinionField = true;
                        break;
                    }
                }
                if (rowHasOpinionField) {
                    startRow = r - 1;
                    endRow   = r + 1;
                    // Extend to cover all contiguous pattern rows
                    for (let rr = r + 1; rr <= range.e.r; rr++) {
                        let rowHasAny = false;
                        for (let c = range.s.c; c <= range.e.c; c++) {
                            const cell = sheet[xlsx.utils.encode_cell({ rr, c })];
                            if (!cell || typeof cell.v !== 'string') continue;
                            const lv = cell.v.toLowerCase();
                            if (hasPlaceholder(cell.v) &&
                                !lv.includes('grand_total') && !lv.includes('grand total') &&
                                !lv.includes('in_words') && !lv.includes('invoice') &&
                                !lv.includes('total_vetting') && !lv.includes('total_lsr')) {
                                rowHasAny = true;
                                break;
                            }
                        }
                        if (rowHasAny) { endRow = rr + 1; }
                        else           { break; }
                    }
                    break;
                }
            }
        }

        // Step 3: Expand repeating rows
        if (startRow !== -1 && endRow !== -1 && endRow >= startRow && opinions.length > 0) {

            // Clear marker rows
            for (let c = range.s.c; c <= range.e.c; c++) {
                const sa = xlsx.utils.encode_cell({ r: startRow, c });
                if (sheet[sa]) delete sheet[sa];
                const ea = xlsx.utils.encode_cell({ r: endRow, c });
                if (sheet[ea]) delete sheet[ea];
            }

            const patternStart = startRow + 1;
            const patternEnd   = endRow   - 1;

            // Extract pattern rows
            const patternRows = [];
            if (patternEnd >= patternStart) {
                for (let pr = patternStart; pr <= patternEnd; pr++) {
                    const rowCells = [];
                    for (let c = range.s.c; c <= range.e.c; c++) {
                        const addr = xlsx.utils.encode_cell({ r: pr, c });
                        if (sheet[addr]) {
                            rowCells.push({ col: c, cell: { ...sheet[addr] } });
                            delete sheet[addr];
                        }
                    }
                    patternRows.push(rowCells);
                }
            }

            // Save footer rows
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
                footerRows.push({ cells: rowCells });
            }

            // Write repeated rows
            let currentRow = startRow;
            if (patternRows.length > 0) {
                opinions.forEach((op, opIdx) => {
                    const rowScope = {
                        ...data, ...op,
                        'S.No': opIdx + 1, 'S. No': opIdx + 1,
                        'S.NO': opIdx + 1, 'sno': opIdx + 1,
                        'Serial No': opIdx + 1,
                    };
                    patternRows.forEach(pRow => {
                        pRow.forEach(({ col, cell }) => {
                            const newAddr = xlsx.utils.encode_cell({ r: currentRow, c: col });
                            const newCell = { ...cell };
                            if (typeof newCell.v === 'string') {
                                applyValue(newCell, replacePlaceholders(newCell.v, rowScope));
                            }
                            sheet[newAddr] = newCell;
                        });
                        currentRow++;
                    });
                });
            }

            // Re-write footer rows
            footerRows.forEach(({ cells }) => {
                cells.forEach(({ col, cell }) => {
                    sheet[xlsx.utils.encode_cell({ r: currentRow, c: col })] = cell;
                });
                currentRow++;
            });

            range.e.r = Math.max(range.e.r, currentRow - 1);
            sheet['!ref'] = xlsx.utils.encode_range(range);
        }

        // Step 4: Replace all remaining scalar placeholders
        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddr = xlsx.utils.encode_cell({ r, c });
                const cell = sheet[cellAddr];
                if (!cell || typeof cell.v !== 'string') continue;
                if (!hasPlaceholder(cell.v)) continue;
                applyValue(cell, replacePlaceholders(cell.v, data));
            }
        }
    });

    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { fillExcelTemplate };
