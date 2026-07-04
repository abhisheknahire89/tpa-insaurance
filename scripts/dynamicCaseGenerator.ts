import { GoogleGenAI } from '@google/genai';
import { GroundedTestCase } from './groundedBattery';

export async function generateBatchWithGemini(count: number = 20, modelName: string = 'gemini-2.5-pro'): Promise<GroundedTestCase[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[DynamicCaseGenerator] GEMINI_API_KEY not found. Cannot generate dynamic cases.');
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
You are a highly experienced Indian clinical documentation specialist and TPA claims expert.
Your task is to generate an array of ${count} highly realistic, completely fictional patient cases based on common Indian inpatient conditions.

CONDITIONS TO USE: Dengue Fever, Typhoid Fever, Ischemic Heart Disease / Planned CABG, Senile Cataract, Maintenance Hemodialysis, Acute Appendicitis, Osteoarthritis / Planned TKR, Acute Gastroenteritis, Maternity (LSCS), Uterine Fibroids / Hysterectomy.

For each case, construct a JSON object matching this TypeScript interface exactly:
interface GroundedTestCase {
  id: number;
  category: 'A' | 'B' | 'C' | 'D' | 'E';
  diagnosis: string;
  code: string; // Valid WHO ICD-10 code (e.g. A97.0, A01.0, etc.)
  chiefComplaints: string;
  hpi: string;
  relevantClinicalFindings: string;
  additionalClinicalNotes?: string;
  duration?: string;
  treatmentTakenSoFar?: string;
  reasonForHospitalisation?: string;
  uploadedDocuments?: string[]; // array of strings like 'doctor_notes', 'blood_test_reports', 'ecg'
  patientName?: string;
  vitals?: { bp?: string; pulse?: string; temp?: string; spo2?: string; rr?: string };
  expected: { mustFlag: string[]; mustNotFlag: string[]; shouldGenerate: boolean; };
  notes: string;
  realGap: string; // The explicit, real-world TPA gap this case is designed to trigger (e.g., "Missing NS1 Antigen", "Lack of medical necessity (OPD manageable)")
  sourceReasoning: string; // The IRDAI/TPA rule justifying the gap.
}

INSTRUCTIONS:
1. Generate unique patient presentations, ages, and vitals for every case.
2. Ensure realistic gaps: e.g., missing CAG for CABG, missing LMP/EDD for maternity, missing exact symptom duration for TKR, missing Widal for typhoid.
3. Also include some "Control" cases where there are NO gaps (perfect documentation) and realGap is "None", to test over-flagging.
4. Output ONLY a valid JSON array of ${count} objects. Do not include markdown code blocks.
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
        throw new Error("Empty response text from Gemini dynamic generation");
    }
    
    let generatedCases = JSON.parse(text) as GroundedTestCase[];
    
    // Assign random unique IDs to avoid collisions
    const baseId = Math.floor(Math.random() * 10000) + 5000;
    generatedCases = generatedCases.map((tc, idx) => ({
      ...tc,
      id: baseId + idx
    }));

    return generatedCases;
  } catch (error) {
    console.error(`[DynamicCaseGenerator] Error synthesizing cases:`, error);
    return null;
  }
}
