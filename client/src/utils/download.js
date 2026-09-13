import { SERVER_URL } from '../api';

/**
 * Downloads a file reliably by fetching it as a Blob first.
 * This completely avoids browser PDF viewer interception, popup blockers,
 * and the "0 B • Starting... / Canceled" stall in Chromium/Brave.
 */
export async function downloadFile(url, fallbackFilename) {
    if (!url || url === '#') return;

    // Resolve full server URL if relative
    let fullUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('DATA:')) {
        fullUrl = url.startsWith('/') ? `${SERVER_URL}${url}` : `${SERVER_URL}/${url}`;
    }

    // Handle Base64 Data URI if present
    if (fullUrl.startsWith('DATA:')) {
        try {
            const parts = fullUrl.slice(5).split(':');
            const originalName = parts.length > 1 ? parts[0] : (fallbackFilename || 'document');
            const base64Str = parts.length > 1 ? parts.slice(1).join(':') : parts[0];

            const byteCharacters = atob(base64Str);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const mimeType = originalName.endsWith('.pdf')
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            const blob = new Blob([byteArray], { type: mimeType });

            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = originalName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            return;
        } catch (err) {
            console.error('Error decoding Base64 file download:', err);
        }
    }

    const cleanFilename = fallbackFilename || decodeURIComponent(fullUrl.split('/').pop().split('?')[0]) || 'download';

    try {
        const res = await fetch(fullUrl);
        if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);

        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = cleanFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
        console.warn('Blob fetch download failed, falling back to direct anchor:', err);
        const a = document.createElement('a');
        a.href = fullUrl;
        a.download = cleanFilename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}
