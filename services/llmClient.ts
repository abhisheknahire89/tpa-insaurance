import axios from 'axios';
import { DEMO_FALLBACKS } from '../data/demoFallbacks';

const OLLAMA_URL = 'http://localhost:11434/v1/chat/completions';

export interface LlmReasoningOutput {
  challengesConsidered: string[];
  anchors: string[];
  discriminators: Array<{
    challenge: string;
    evidence: string;
    reason: string;
  }>;
}

let mockQueryOverride: ((prompt: string, systemInstruction?: string) => Promise<string>) | null = null;

export function setMockQuery(fn: typeof mockQueryOverride) {
  mockQueryOverride = fn;
}

export async function queryMedGemma(prompt: string, systemInstruction?: string): Promise<string> {
  if (mockQueryOverride) {
    return mockQueryOverride(prompt, systemInstruction);
  }
  let attempts = 2;
  let lastError: any = null;

  while (attempts > 0) {
    try {
      const response = await axios.post(OLLAMA_URL, {
        model: 'medgemma:4b',
        messages: [
          ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        stream: false
      }, {
        timeout: 15000 // 15 seconds timeout
      });

      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content.trim();
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

  const lowerDx = diagnosis.toLowerCase();
  let demoKey: 'diabetes' | 'pneumonia' | 'appendicitis' | null = null;
  if (lowerDx.includes('diabetes')) {
    demoKey = 'diabetes';
  } else if (lowerDx.includes('pneumonia')) {
    demoKey = 'pneumonia';
  } else if (lowerDx.includes('appendicitis')) {
    demoKey = 'appendicitis';
  }

  const systemInstruction = `You are an experienced TPA (Third Party Administrator) senior medical reviewer conducting a pre-authorization documentation sufficiency audit. Your role is to assess whether the clinical note adequately justifies the hospitalization and stated diagnosis from a reviewer's perspective — NOT to suggest a diagnosis or treatment.

THE TREATING DOCTOR'S DIAGNOSIS IS THE GIVEN INPUT. You only assess whether the documentation supports it.

## YOUR REASONING PROTOCOL (internal use only — do NOT output these stages verbatim)

Work through these five stages before producing your output:

**STAGE 1 — SIGNAL HORIZON**
Inventory what clinical facts ARE present in the note: symptoms, examination findings, vitals, history, disease duration, comorbidities, investigations, treatment already taken. Then explicitly note what is ABSENT from each of those categories.

**STAGE 2 — PATTERN CONSTELLATION**
Does the documented picture coherently fit the stated diagnosis? Identify any red flags (e.g., findings inconsistent with the diagnosis) or notable absences that weaken the picture. Do NOT suggest an alternative diagnosis — only note whether the documentation is coherent and complete.

**STAGE 3 — HYPOTHESIS FORGE**
Identify what questions an experienced TPA reviewer would raise:
- Could this be managed as OPD rather than inpatient? What EVIDENCE ANCHORS would justify inpatient admission, and which are missing?
- Could this be a pre-existing condition? What historical documentation would establish or rule out PED status, and is it present?
- Is the stated diagnosis sufficiently supported by objective findings and investigations? Which DISCRIMINATORS (lab values, imaging, vitals readings) are documented vs absent?

**STAGE 4 — DECISION NEXUS (documentation-justification only)**
IMPORTANT: Do NOT recommend any treatment, drug name, or dose. Instead, identify what JUSTIFICATION a reviewer expects to see already documented for the management chosen by the treating doctor:
- Why inpatient rather than OPD?
- Why this procedure / intervention?
- Why now (acuity / urgency)?
Flag missing justification — never a treatment decision.

**STAGE 5 — METACOGNITIVE LOOP (self-check)**
Before finalising: re-read each query you plan to raise. If the note ALREADY answers it, drop that query. Only keep queries that are genuinely unanswered by the documented text. Do not invent requirements. Do not raise a query you cannot directly tie to something absent.

## OUTPUT RULES

1. Output ONLY the raw JSON below — no markdown backticks, no prose, no wrapper text.
2. NO treatment recommendations, drug names, or doses anywhere in the output.
3. NO "TPA auto-rejects X" — phrase as "a reviewer would likely query…" or "provide X to establish Y."
4. NO ICD codes in the output.
5. NO computed probability numbers — qualitative queries only.
6. Every discriminator must be tied to one of the challenges in challengesConsidered.
7. If the note is well-documented and your Metacognitive Loop drops all queries, it is acceptable to return minimal anchors and empty discriminators — do NOT over-flag a sufficient case.

## JSON SCHEMA (output exactly this structure)

{
  "challengesConsidered": ["challenge 1", "challenge 2", "challenge 3"],
  "anchors": ["required finding or document 1", "required finding or document 2"],
  "discriminators": [
    {
      "challenge": "exact challenge string from challengesConsidered",
      "evidence": "the specific document, measurement, or finding the reviewer would request",
      "reason": "why this evidence is needed to address the challenge"
    }
  ]
}

Always include at minimum these three challenges:
1. "could this be managed as OPD?"
2. "could this be a pre-existing condition?"
3. "is the stated diagnosis supported by documented findings?"

Tailor anchors and discriminators specifically to the diagnosis: "${diagnosis}". Keep output compact — target ≤ 5 anchors and ≤ 5 discriminators total.`;

  const prompt = `Provisional Diagnosis: ${diagnosis}
Admission Decision: ${admissionType}
Clinical Narrative:
${clinicalNarrative}

Apply the five-stage NEXUS protocol internally, then output ONLY the raw JSON. Raise queries only for evidence that is genuinely absent from the note above.`;

  let responseText = '';
  try {
    if (demoKey) {
      // Race local model call with a 2-second timeout to ensure the demo is highly responsive
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Local model query timeout')), 2000)
      );
      responseText = await Promise.race([
        queryMedGemma(prompt, systemInstruction),
        timeoutPromise
      ]);
    } else {
      responseText = await queryMedGemma(prompt, systemInstruction);
    }
  } catch (error: any) {
    if (demoKey) {
      console.warn(`[llmClient] Local model call failed/timed out: ${error.message}. Using pre-captured demo fallback for ${demoKey}.`);
      return DEMO_FALLBACKS[demoKey];
    }
    throw error;
  }

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
    if (demoKey) {
      console.warn(`[llmClient] Failed to parse model output as JSON. Using pre-captured demo fallback for ${demoKey}.`);
      return DEMO_FALLBACKS[demoKey];
    }
    console.error("[llmClient] Failed to parse model output as JSON. Raw output:", responseText);
    throw new Error("Malformed JSON from LLM: " + error);
  }
}
