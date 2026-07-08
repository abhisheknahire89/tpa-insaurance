// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Tesseract from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Converts a base64 string to an ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Converts a File to an ArrayBuffer
 */
export function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Extracts text from a PDF ArrayBuffer page-by-page
 */
export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
            
            fullText += `--- START OF PAGE ${i} ---\n${pageText}\n--- END OF PAGE ${i} ---\n\n`;
        }
        return fullText.trim();
    } catch (error) {
        console.error('[ocrService] Error extracting text from PDF:', error);
        throw error;
    }
}

/**
 * Extracts text from an image file/blob or base64 URL using Tesseract OCR
 */
export async function extractTextFromImage(source: File | Blob | string): Promise<string> {
    try {
        const result = await Tesseract.recognize(source, 'eng');
        return result.data.text;
    } catch (error) {
        console.error('[ocrService] Error running OCR on image:', error);
        throw error;
    }
}

/**
 * Extracts text from any document file (PDF or Image)
 */
export async function extractTextFromDocument(file: File): Promise<string> {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const arrayBuffer = await fileToArrayBuffer(file);
        let text = await extractTextFromPdf(arrayBuffer);
        
        // If the extracted text is empty or too short (scanned PDF), run OCR on the PDF pages
        if (text.replace(/---.*?---|\s/g, '').length < 50) {
            console.log('[ocrService] PDF text is empty. Falling back to page-by-page rendering & OCR...');
            text = await extractTextFromScannedPdf(arrayBuffer);
        }
        return text;
    } else {
        return await extractTextFromImage(file);
    }
}

import { WizardDocument } from '../components/PreAuthWizard/types';

/**
 * Extracts text from any WizardDocument (handles base64 PDFs and images)
 */
export async function extractTextFromWizardDocument(doc: WizardDocument): Promise<string> {
    const isPdf = doc.mimeType === 'application/pdf' || doc.fileName.toLowerCase().endsWith('.pdf');
    let cleanBase64 = doc.base64Data;
    if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
    }
    
    if (isPdf) {
        const arrayBuffer = base64ToArrayBuffer(cleanBase64);
        let text = await extractTextFromPdf(arrayBuffer);
        // Fallback to OCR if PDF contains no embedded text
        if (text.replace(/---.*?---|\s/g, '').length < 50) {
            console.log(`[ocrService] PDF text is empty for ${doc.fileName}. Falling back to OCR...`);
            text = await extractTextFromScannedPdf(arrayBuffer);
        }
        return text;
    } else {
        const prefix = `data:${doc.mimeType};base64,`;
        const dataUrl = doc.base64Data.startsWith('data:') ? doc.base64Data : `${prefix}${cleanBase64}`;
        return await extractTextFromImage(dataUrl);
    }
}

/**
 * OCR fallback for scanned PDFs: renders each page to a canvas and runs Tesseract OCR
 */
export async function extractTextFromScannedPdf(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            
            // Create a canvas to render the page
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            if (context) {
                await page.render({ canvasContext: context, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/png');
                console.log(`[ocrService] Running OCR on PDF Page ${i}...`);
                const pageText = await extractTextFromImage(dataUrl);
                fullText += `--- START OF PAGE ${i} (Scanned OCR) ---\n${pageText}\n--- END OF PAGE ${i} ---\n\n`;
            }
        }
        return fullText.trim();
    } catch (error) {
        console.error('[ocrService] Scanned PDF OCR failed:', error);
        return '';
    }
}

/**
 * Extracts pages as string array from a PDF ArrayBuffer
 */
export async function extractPagesFromPdf(arrayBuffer: ArrayBuffer): Promise<string[]> {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const pages: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
            pages.push(pageText);
        }
        return pages;
    } catch (error) {
        console.error('[ocrService] Error extracting pages from PDF:', error);
        throw error;
    }
}

/**
 * Extracts pages as string array from a scanned PDF ArrayBuffer using OCR
 */
export async function extractPagesFromScannedPdf(arrayBuffer: ArrayBuffer): Promise<string[]> {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const pages: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            if (context) {
                await page.render({ canvasContext: context, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/png');
                const pageText = await extractTextFromImage(dataUrl);
                pages.push(pageText);
            }
        }
        return pages;
    } catch (error) {
        console.error('[ocrService] Scanned pages extract failed:', error);
        return [];
    }
}

/**
 * Extracts pages as string array from a File (PDF or Image)
 */
export async function extractPagesFromDocument(file: File): Promise<string[]> {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const arrayBuffer = await fileToArrayBuffer(file);
        let pages = await extractPagesFromPdf(arrayBuffer);
        const totalTextLen = pages.join('').replace(/\s/g, '').length;
        if (totalTextLen < 50) {
            console.log('[ocrService] PDF pages are empty. Falling back to scanned PDF page OCR...');
            pages = await extractPagesFromScannedPdf(arrayBuffer);
        }
        return pages;
    } else {
        const text = await extractTextFromImage(file);
        return [text];
    }
}

/**
 * Extracts pages as string array from a WizardDocument
 */
export async function extractPagesFromWizardDocument(doc: WizardDocument): Promise<string[]> {
    const isPdf = doc.mimeType === 'application/pdf' || doc.fileName.toLowerCase().endsWith('.pdf');
    let cleanBase64 = doc.base64Data;
    if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
    }
    
    if (isPdf) {
        const arrayBuffer = base64ToArrayBuffer(cleanBase64);
        let pages = await extractPagesFromPdf(arrayBuffer);
        const totalTextLen = pages.join('').replace(/\s/g, '').length;
        if (totalTextLen < 50) {
            console.log(`[ocrService] Scanned PDF pages empty for ${doc.fileName}. Falling back to page OCR...`);
            pages = await extractPagesFromScannedPdf(arrayBuffer);
        }
        return pages;
    } else {
        const prefix = `data:${doc.mimeType};base64,`;
        const dataUrl = doc.base64Data.startsWith('data:') ? doc.base64Data : `${prefix}${cleanBase64}`;
        const text = await extractTextFromImage(dataUrl);
        return [text];
    }
}
