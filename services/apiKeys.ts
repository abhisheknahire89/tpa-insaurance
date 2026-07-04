import { GoogleGenAI } from "@google/genai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const KEYS_SET = new Set<string>();

// Add primary key from environment if present
const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
if (envKey) KEYS_SET.add(envKey);

// Add the fallback keys explicitly
KEYS_SET.add("AQ.Ab8RN6I58AX9Y92cThrTM75S5464Rq_kpf-bFdohTEEldgdA1Q");
KEYS_SET.add("AIzaSyDvTMvfKsrqCj9fQ_1oiC8-BmNhyadeTTE");

const KEYS = Array.from(KEYS_SET);
let activeKeyIndex = 0;

export function getActiveApiKey(): string {
    return KEYS[activeKeyIndex] || "";
}

export function getGoogleGenAIClient(): GoogleGenAI {
    return new GoogleGenAI({ apiKey: getActiveApiKey() });
}

export function getGoogleGenerativeAIClient(): GoogleGenerativeAI {
    return new GoogleGenerativeAI(getActiveApiKey());
}

export function rotateApiKey(): boolean {
    if (activeKeyIndex < KEYS.length - 1) {
        activeKeyIndex++;
        console.warn(`[apiKeys] Rotated to fallback API key at index ${activeKeyIndex}`);
        return true;
    }
    return false;
}
