import { getGoogleGenAIClient } from '../services/apiKeys';
import { MODEL_TEXT } from '../config/modelConfig';
import { TestCase } from './testBattery';

export interface GeminiVerdict {
  caseId: string;
  iteration: number;
  timestamp: string;
  factualIssues: string[];
  codeIssues: string[];
  authorityIssues: string[];
  queryQuality: { query: string; rating: string; notes: string }[];
  missedGaps: string[];
  overallPass: boolean;
}

export async function checkCaseWithGemini(
  caseInput: TestCase,
  engineOutput: any,
  iteration: number,
  modelName: string = MODEL_TEXT
): Promise<GeminiVerdict | null> {
  const ai = getGoogleGenAIClient();

  const prompt = `
You are an independent clinical and technical auditor evaluating an AI insurance evidence engine.
Your job is to review a single test case's INPUT and the engine's OUTPUT against a strict rubric.

INPUT (Test Case):
${JSON.stringify(caseInput, null, 2)}

ENGINE OUTPUT:
${JSON.stringify(engineOutput, null, 2)}

RUBRIC:
1. FACTUAL/CLINICAL CORRECTNESS: Is there any wrong or fabricated clinical fact in the engine output?
2. CODE-STANDARD: Any ICD code that is US ICD-10-CM rather than WHO (e.g. M17.11 vs M17.0/M17.1)? Flag if yes.
3. HALLUCINATED AUTHORITY: Any "auto-reject" or TPA-rule claim that is not grounded in deterministic rules? Flag if yes.
4. QUERY QUALITY: For each generated query, rate it as specific or generic, and note if it is over-flagging (asking for information already present in the input).
5. MISSED GAPS (GROUNDED CHECK): The input case is designed to trigger a specific real-world query: "${(caseInput as any).realGap || 'None'}". Did the engine miss this REAL query? Also note any other obvious reviewer questions the engine failed to raise.

INSTRUCTIONS:
Output a strictly valid JSON object matching the following schema. Do NOT include markdown code blocks (e.g. \`\`\`json). Just the raw JSON object.
{
  "caseId": "${caseInput.id}",
  "iteration": ${iteration},
  "timestamp": "${new Date().toISOString()}",
  "factualIssues": ["list of factual issues, or empty array"],
  "codeIssues": ["list of code issues, e.g. CM code detected, or empty array"],
  "authorityIssues": ["list of hallucinated authority issues, e.g. fabricated auto-reject rules, or empty array"],
  "queryQuality": [
    {
      "query": "the text of the query",
      "rating": "specific or generic",
      "notes": "notes on over-flagging or appropriateness"
    }
  ],
  "missedGaps": ["list of missed gaps, or empty array"],
  "overallPass": true // boolean, false if there are any factual, code, or authority issues, or major missed gaps/over-flagging
}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) {
        throw new Error("Empty response text from Gemini");
    }
    const verdict = JSON.parse(text) as GeminiVerdict;
    return verdict;
  } catch (error) {
    console.error(`[GeminiChecker] Error calling Gemini for Case ${caseInput.id}:`, error);
    return null; // Return null on error to not crash the continuous loop, but we will log it.
  }
}
