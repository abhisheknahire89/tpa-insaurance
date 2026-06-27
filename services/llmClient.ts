import axios from 'axios';

const OLLAMA_URL = 'http://localhost:11434/api/generate';

export interface LlmReasoningOutput {
  challengesConsidered: string[];
  anchors: string[];
  discriminators: Array<{
    challenge: string;
    evidence: string;
    reason: string;
  }>;
}

export async function queryMedGemma(prompt: string, systemInstruction?: string): Promise<string> {
  let attempts = 2;
  let lastError: any = null;

  while (attempts > 0) {
    try {
      const response = await axios.post(OLLAMA_URL, {
        model: 'medgemma',
        prompt: prompt,
        system: systemInstruction,
        stream: false,
        options: {
          temperature: 0.1,
        }
      }, {
        timeout: 15000 // 15 seconds timeout
      });

      if (response.data && typeof response.data.response === 'string') {
        return response.data.response.trim();
      }
      throw new Error('Malformed response structure from local LLM');
    } catch (error: any) {
      attempts--;
      lastError = error;
      console.warn(`[llmClient] Local LLM call failed (attempts remaining: ${attempts}): ${error.message}`);
      if (attempts === 0) {
        break;
      }
    }
  }
  throw new Error(`Failed to query local LLM after all attempts: ${lastError?.message || 'Unknown error'}`);
}

let mockOverride: ((diagnosis: string, admissionType: string, clinicalNarrative: string) => Promise<LlmReasoningOutput>) | null = null;

export function setMockReasoning(fn: typeof mockOverride) {
  mockOverride = fn;
}

export async function getReasoningFromMedGemma(
  diagnosis: string,
  admissionType: string,
  clinicalNarrative: string
): Promise<LlmReasoningOutput> {
  if (mockOverride) {
    return mockOverride(diagnosis, admissionType, clinicalNarrative);
  }

  const systemInstruction = `You are a skeptical TPA medical reviewer reviewing a pre-authorization case. 
Your task is to challenge the admission and provisional diagnosis, identify what evidence (anchors) is required to support the diagnosis and admission, and what specific evidence (discriminators) is needed to rule out TPA-preferred alternatives (like OPD management or pre-existing conditions).

You must output a raw JSON object with exactly the following structure, and nothing else (no wrapper, no markdown backticks, no comments):
{
  "challengesConsidered": ["challenge 1", "challenge 2", "challenge 3"],
  "anchors": ["required finding 1", "required finding 2"],
  "discriminators": [
    {
      "challenge": "challenge 1",
      "evidence": "evidence needed to rule out challenge 1",
      "reason": "clinical justification why this rules it out"
    }
  ]
}

At a minimum, include these challenges in "challengesConsidered":
1. "could this be managed as OPD?"
2. "could this be a pre-existing condition?"
3. "is the stated diagnosis actually supported by the documented findings?"

Provide clinically specific anchors and discriminators relevant to the diagnosis: "${diagnosis}".`;

  const prompt = `Provisional Diagnosis: ${diagnosis}
Admission Decision: ${admissionType}
Clinical Narrative: ${clinicalNarrative}

Analyze this case. Frame the challenges, list the expected evidence anchors, and specify the discriminators. Return only the raw JSON.`;

  const responseText = await queryMedGemma(prompt, systemInstruction);
  
  // Clean markdown block wrappers if the model returned them
  let cleanText = responseText.trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.substring(7);
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.substring(3);
  }
  if (cleanText.endsWith('```')) {
    cleanText = cleanText.substring(0, cleanText.length - 3);
  }
  cleanText = cleanText.trim();

  try {
    const parsed = JSON.parse(cleanText);
    if (
      Array.isArray(parsed.challengesConsidered) &&
      Array.isArray(parsed.anchors) &&
      Array.isArray(parsed.discriminators)
    ) {
      return parsed as LlmReasoningOutput;
    }
    throw new Error("Parsed JSON structure does not match expected schema");
  } catch (error) {
    console.error("[llmClient] Failed to parse model output as JSON. Raw output:", responseText);
    throw new Error("Malformed JSON from LLM: " + error);
  }
}
