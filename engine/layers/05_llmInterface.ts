
import { GoogleGenAI } from "@google/genai";
// FIX: Replaced incorrect type 'ClinicalWorkflowContext' with the correct exported type 'NexusContext'.
import { NexusContext } from '../types';
import { constructLlmContent } from './06_reasoningOrchestrator';

const ai = new GoogleGenAI({ apiKey: ((import.meta as any).env?.VITE_GEMINI_API_KEY || '') });

// Layer 05: Foundational LLM Interface (Reasoning Runtime)
export const queryLlm = async (context: NexusContext): Promise<NexusContext> => {
  
  const contents = constructLlmContent(context);
  
  try {
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview', // FIX: Using Gemini 3 for complex clinical reasoning
      contents: contents,
      config: {
        systemInstruction: context.systemInstruction,
      },
    });

    context.llmResponseStream = responseStream;
    context.auditTrail.push('[LLM Interface] Started streaming response from Gemini.');
  } catch (error: any) {
    console.error('Error streaming chat response:', error);
    context.auditTrail.push(`[LLM Interface] ERROR: ${error.message}`);
    throw error;
  }
  
  return context;
};
