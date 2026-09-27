const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

async function convertDocxToPdf(docxPath, pdfPath) {
    return new Promise((resolve, reject) => {
        const absDocx = path.resolve(docxPath);
        const absPdf = path.resolve(pdfPath);
        const outDir = path.dirname(absPdf);

        // Windows: Use MS Word COM automation via VBScript
        if (process.platform === 'win32') {
            const tempVbsName = `convert_${Date.now()}_${Math.random().toString(36).substring(7)}.vbs`;
            const vbsScriptPath = path.join(__dirname, tempVbsName);

            const vbsContent = `
On Error Resume Next
Set objWord = CreateObject("Word.Application")
If Err.Number <> 0 Then
    WScript.Echo "Error launching Word: " & Err.Description
    WScript.Quit(1)
End If

objWord.Visible = False
objWord.DisplayAlerts = 0

' Open in ReadOnly mode (True) to prevent file-lock conflicts if the file is open elsewhere
Set objDoc = objWord.Documents.Open("${absDocx.replace(/"/g, '""')}", False, True)
If Err.Number <> 0 Then
    WScript.Echo "Error opening document: " & Err.Description
    objWord.Quit
    WScript.Quit(1)
End If

objDoc.SaveAs "${absPdf.replace(/"/g, '""')}", 17
If Err.Number <> 0 Then
    WScript.Echo "Error saving PDF: " & Err.Description
    objDoc.Close False
    objWord.Quit
    WScript.Quit(1)
End If

objDoc.Close False
objWord.Quit
WScript.Echo "SUCCESS"
`;

            fs.writeFileSync(vbsScriptPath, vbsContent, 'utf8');

            exec(`cscript //Nologo "${vbsScriptPath}"`, { timeout: 25000 }, (error, stdout, stderr) => {
                try {
                    if (fs.existsSync(vbsScriptPath)) fs.unlinkSync(vbsScriptPath);
                } catch (e) {}

                if (error || !fs.existsSync(pdfPath)) {
                    console.error("VBScript DOCX to PDF conversion error:", stdout || stderr || error);
                    reject(error || new Error(`PDF conversion failed: ${stdout || stderr}`));
                } else {
                    resolve(pdfPath);
                }
            });
            return;
        }

        // Linux / Docker / macOS: Use LibreOffice (soffice / libreoffice)
        const os = require('os');
        const tempProfileDir = path.join(os.tmpdir(), `lo_prof_${Date.now()}_${Math.random().toString(36).substring(7)}`);
        const userInstallationUri = `file://${tempProfileDir.replace(/\\/g, '/')}`;

        const cleanUpTempProfile = () => {
            try {
                if (fs.existsSync(tempProfileDir)) {
                    fs.rmSync(tempProfileDir, { recursive: true, force: true });
                }
            } catch (cleanupErr) {}
        };

        const runLibreOffice = (bin, filter) => {
            return new Promise((resolveRun, rejectRun) => {
                const filterArg = filter ? `:${filter}` : '';
                const cmd = `${bin} --headless --invisible --nodefault --nofirststartwizard --norestore "-env:UserInstallation=${userInstallationUri}" --convert-to "pdf${filterArg}" --outdir "${outDir}" "${absDocx}"`;

                exec(cmd, {
                    timeout: 90000,
                    maxBuffer: 20 * 1024 * 1024,
                    cwd: outDir,
                    env: {
                        ...process.env,
                        HOME: os.tmpdir(),
                        // svp = Server Virtual Pixel: truly headless, no X11 required
                        SAL_USE_VCLPLUGIN: 'svp',
                        // Explicitly unset DISPLAY so LibreOffice does NOT attempt X11
                        DISPLAY: '',
                        // Disable any dbus/AT-SPI accessibility that might try to connect to a display
                        NO_AT_BRIDGE: '1'
                    }
                }, (error, stdout, stderr) => {
                    const parsedDocx = path.parse(absDocx);
                    const generatedPdf = path.join(outDir, `${parsedDocx.name}.pdf`);

                    if (fs.existsSync(generatedPdf) && fs.statSync(generatedPdf).size > 0) {
                        if (path.resolve(generatedPdf) !== absPdf) {
                            try {
                                if (fs.existsSync(absPdf)) fs.unlinkSync(absPdf);
                                fs.renameSync(generatedPdf, absPdf);
                            } catch (renameErr) {
                                console.error("Error renaming LibreOffice PDF output:", renameErr);
                            }
                        }
                        return resolveRun(pdfPath);
                    }

                    if (fs.existsSync(absPdf) && fs.statSync(absPdf).size > 0) {
                        return resolveRun(pdfPath);
                    }

                    const outMsg = (stderr || stdout || (error ? error.message : '')).trim();
                    rejectRun(new Error(outMsg || 'Generated PDF file not found or 0 bytes'));
                });
            });
        };

        // Try primary execution with soffice, fallback to writer filter, then libreoffice binary
        runLibreOffice('soffice', '')
            .catch((err1) => {
                console.warn("Retrying LibreOffice conversion with explicit writer_pdf_Export filter:", err1.message);
                return runLibreOffice('soffice', 'writer_pdf_Export');
            })
            .catch((err2) => {
                console.warn("Retrying with libreoffice binary command:", err2.message);
                return runLibreOffice('libreoffice', '');
            })
            .then((result) => {
                cleanUpTempProfile();
                resolve(result);
            })
            .catch((finalErr) => {
                cleanUpTempProfile();
                console.error("LibreOffice PDF conversion produced an empty or missing file:", finalErr.message);
                reject(new Error(`LibreOffice PDF conversion produced an empty or missing file: ${finalErr.message}`));
            });
    });
}

module.exports = { convertDocxToPdf };
