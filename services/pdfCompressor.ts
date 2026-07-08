// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Converts a base64 string to a Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer ? new Uint8Array(bytes.buffer) : bytes;
}

/**
 * Compresses a PDF file if it exceeds the size threshold (default 8MB).
 * Returns the compressed File or the original File if no compression is needed.
 */
export async function compressPdfIfNeeded(
    file: File, 
    sizeThresholdBytes = 8 * 1024 * 1024,
    onProgress?: (progressText: string) => void
): Promise<File> {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return file;
    }

    if (file.size <= sizeThresholdBytes) {
        console.log(`[PDF Compressor] File size (${(file.size / 1024 / 1024).toFixed(2)}MB) is below threshold. Skipping compression.`);
        return file;
    }

    console.log(`[PDF Compressor] Compressing ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)...`);
    if (onProgress) onProgress("Initializing compression...");

    try {
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;

        const newPdfDoc = await PDFDocument.create();

        for (let i = 1; i <= totalPages; i++) {
            if (onProgress) {
                onProgress(`Compressing page ${i} of ${totalPages}...`);
            }
            console.log(`[PDF Compressor] Rendering page ${i}/${totalPages}...`);

            const page = await pdf.getPage(i);
            const nativeViewport = page.getViewport({ scale: 1.0 });
            const renderViewport = page.getViewport({ scale: 200 / 72 }); // 200 DPI

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = renderViewport.height;
            canvas.width = renderViewport.width;

            if (context) {
                await page.render({ canvasContext: context, viewport: renderViewport }).promise;
                // Convert canvas to JPEG at 80% quality
                const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                const jpegBase64 = jpegDataUrl.split(',')[1];
                const jpegBytes = base64ToUint8Array(jpegBase64);

                // Embed into new PDF
                const embeddedImage = await newPdfDoc.embedJpg(jpegBytes);
                const newPage = newPdfDoc.addPage([nativeViewport.width, nativeViewport.height]);
                newPage.drawImage(embeddedImage, {
                    x: 0,
                    y: 0,
                    width: nativeViewport.width,
                    height: nativeViewport.height
                });
            }
        }

        if (onProgress) onProgress("Saving compressed document...");
        const compressedPdfBytes = await newPdfDoc.save();

        const compressedFile = new File([compressedPdfBytes], file.name, {
            type: 'application/pdf',
            lastModified: Date.now()
        });

        console.log(`[PDF Compressor] Compression complete! New size: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB (saved ${(((file.size - compressedFile.size) / file.size) * 100).toFixed(1)}%)`);
        return compressedFile;
    } catch (error) {
        console.error("[PDF Compressor] Error during compression, falling back to original file:", error);
        return file;
    }
}
