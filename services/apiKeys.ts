import { GoogleGenAI } from "@google/genai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const isBrowser = typeof window !== 'undefined';

export function getActiveApiKey(): string {
    const key = isBrowser
        ? (import.meta as any).env?.VITE_GEMINI_API_KEY
        : process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    return key || "";
}

// Startup verification check
if (isBrowser) {
    const key = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (!key) {
        console.error("CRITICAL STARTUP ERROR: VITE_GEMINI_API_KEY is missing from environment variables.");
        window.addEventListener('DOMContentLoaded', () => {
            const banner = document.createElement('div');
            banner.style.position = 'fixed';
            banner.style.top = '0';
            banner.style.left = '0';
            banner.style.width = '100%';
            banner.style.backgroundColor = '#ef4444';
            banner.style.color = '#ffffff';
            banner.style.padding = '16px';
            banner.style.textAlign = 'center';
            banner.style.fontWeight = 'bold';
            banner.style.zIndex = '999999';
            banner.innerHTML = "⚠️ CRITICAL STARTUP ERROR: VITE_GEMINI_API_KEY is missing from your environment variables. Please check your .env.local file.";
            document.body.appendChild(banner);
        });
        throw new Error("CRITICAL STARTUP ERROR: VITE_GEMINI_API_KEY is missing from environment variables (.env.local).");
    }
}

async function proxyGenerateContent(sdkType: 'genai' | 'generative-ai', args: any) {
    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sdkType, args })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Proxy error: ${response.status} - ${errText}`);
    }
    return await response.json();
}

export function getGoogleGenAIClient(): any {
    if (!isBrowser) {
        // Node environment (scripts): talk to SDK directly
        return new GoogleGenAI({ apiKey: getActiveApiKey() });
    }

    // Browser: proxy via /api/gemini serverless function
    return {
        models: {
            generateContent: async (args: any) => {
                const resJson = await proxyGenerateContent('genai', args);
                return {
                    text: resJson.text,
                    candidates: resJson.candidates
                };
            },
            generateContentStream: async function* (args: any) {
                const resJson = await proxyGenerateContent('genai', args);
                yield {
                    text: resJson.text
                };
            }
        }
    };
}

export function getGoogleGenerativeAIClient(): any {
    if (!isBrowser) {
        return new GoogleGenerativeAI(getActiveApiKey());
    }

    return {
        getGenerativeModel: (modelArgs: { model: string }) => {
            return {
                generateContent: async (contents: any) => {
                    const resJson = await proxyGenerateContent('generative-ai', {
                        model: modelArgs.model,
                        contents
                    });
                    return {
                        response: {
                            text: () => resJson.text
                        }
                    };
                }
            };
        }
    };
}

export function rotateApiKey(): boolean {
    // No-op client side as rotation is handled at proxy level/backend pool if any.
    return false;
}
