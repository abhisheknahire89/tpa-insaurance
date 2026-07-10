// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getGoogleGenerativeAIClient } from './apiKeys';
import { MODEL_DOCUMENT } from '../config/modelConfig';

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
 * Converts a File, Blob, or base64 URL to raw base64 data and mimeType
 */
async function toBase64(source: File | Blob | string): Promise<{ mimeType: string; data: string }> {
    if (typeof source === 'string') {
        if (source.startsWith('data:')) {
            const parts = source.split(',');
            const mimeType = parts[0].split(':')[1].split(';')[0];
            const data = parts[1];
            return { mimeType, data };
        } else {
            return { mimeType: 'image/png', data: source };
        }
    }
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(source);
        reader.onload = () => {
            const base64Url = reader.result as string;
            const parts = base64Url.split(',');
            const mimeType = parts[0].split(':')[1].split(';')[0];
            const data = parts[1];
            resolve({ mimeType, data });
        };
        reader.onerror = error => reject(error);
    });
}

/**
 * Converts an ArrayBuffer to a base64 string in chunks to prevent call-stack limit errors
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as any);
    }
    return window.btoa(binary);
}

/**
 * Extracts text from an image file/blob or base64 URL using Gemini Multimodal OCR
 */
export async function extractTextFromImage(source: File | Blob | string): Promise<string> {
    try {
        console.log('[ocrService] Running Gemini-based Multimodal OCR on image...');
        const client = getGoogleGenerativeAIClient();
        const model = client.getGenerativeModel({ model: MODEL_DOCUMENT });
        
        const media = await toBase64(source);
        
        const contents = [
            {
                inlineData: {
                    mimeType: media.mimeType,
                    data: media.data
                }
            },
            "Extract all text from this image. Keep layout, headings, tables, and list items intact. Do not summarize or add commentary."
        ];
        
        const result = await model.generateContent(contents);
        const text = result.response.text();
        return text || '';
    } catch (error) {
        console.error('[ocrService] Gemini Multimodal OCR on image failed:', error);
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
 * OCR fallback for scanned PDFs: parses page-by-page using Gemini Multimodal OCR
 */
export async function extractTextFromScannedPdf(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
        const pages = await extractPagesFromScannedPdf(arrayBuffer);
        return pages.map((page, idx) => `--- START OF PAGE ${idx + 1} (Scanned OCR) ---\n${page}\n--- END OF PAGE ${idx + 1} ---\n\n`).join('').trim();
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
 * Extracts pages as string array from a scanned PDF ArrayBuffer using Gemini Multimodal OCR
 */
export async function extractPagesFromScannedPdf(arrayBuffer: ArrayBuffer): Promise<string[]> {
    try {
        console.log('[ocrService] Running Gemini-based Multimodal OCR on PDF...');
        const client = getGoogleGenerativeAIClient();
        const model = client.getGenerativeModel({ model: MODEL_DOCUMENT });
        
        const base64 = arrayBufferToBase64(arrayBuffer);
        
        const contents = [
            {
                inlineData: {
                    mimeType: 'application/pdf',
                    data: base64
                }
            },
            "Please extract all text from this PDF document. Present it page-by-page, wrapping each page's content strictly between '--- START OF PAGE X ---' and '--- END OF PAGE X ---', where X is the 1-based page number. Do not summarize or add commentary."
        ];
        
        const result = await model.generateContent(contents);
        const text = result.response.text();
        
        const pages: string[] = [];
        const pageMatches = [...text.matchAll(/--- START OF PAGE (\d+) ---([\s\S]*?)--- END OF PAGE \1 ---/gi)];
        if (pageMatches.length > 0) {
            for (const match of pageMatches) {
                pages.push(match[2].trim());
            }
        } else {
            pages.push(text);
        }
        return pages;
    } catch (error) {
        console.error('[ocrService] Gemini Multimodal OCR on PDF failed:', error);
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
