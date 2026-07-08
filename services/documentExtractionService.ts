import { getGoogleGenerativeAIClient, rotateApiKey, getActiveApiKey } from './apiKeys';
import { extractTextFromDocument } from './ocrService';

export interface ExtractedPatientData {
    document_type: string;
    patient: {
        name?: string | null;
        age?: number | null;
        dob?: string | null;
        gender?: 'Male' | 'Female' | 'Other' | null;
        address?: string | null;
        phone?: string | null;
    };
    insurance: {
        policy_number?: string | null;
        insurance_company?: string | null;
        tpa_name?: string | null;
        sum_insured?: number | null;
        valid_till?: string | null;
        member_id?: string | null;
    };
    confidence: number;
    notes?: string;
    // Computed fields
    extracted_fields: string[];
    missing_fields: string[];
    clinical_excerpts?: string[];
}

const EXTRACTION_PROMPT = `
Extract patient and insurance information from this document text.
You are a medical data extraction bot. 

Return ONLY valid JSON (no markdown formatting, no \`\`\`json block) in this exact structure:
{
  "document_type": "hospital_registration" | "insurance_card" | "policy_document" | "id_card" | "unknown",
  "patient": {
    "name": "Full name as written",
    "age": "number or null",
    "dob": "YYYY-MM-DD or null",
    "gender": "Male" | "Female" | "Other" | null,
    "address": "Full address or null",
    "phone": "Phone number or null"
  },
  "insurance": {
    "policy_number": "Policy/Certificate number or null",
    "insurance_company": "Company name or null",
    "tpa_name": "TPA name if visible or null",
    "sum_insured": "number or null",
    "valid_till": "YYYY-MM-DD or null",
    "member_id": "Member/Employee ID or null"
  },
  "confidence": "0-100 number",
  "notes": "Any issues or unclear text",
  "clinical_excerpts": [
    "verbatim clinical quote or clinical finding 1",
    "verbatim clinical quote or clinical finding 2"
  ]
}

If a field is not visible, missing, or unclear, return strictly null for that field. Do not make up information.
`;

function computeExtractedMissingFields(data: any): { extracted: string[], missing: string[] } {
    const extracted: string[] = [];
    const missing: string[] = [];

    const checkField = (obj: any, key: string, label: string) => {
        if (obj && obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
            extracted.push(label);
        } else {
            missing.push(label);
        }
    };

    checkField(data.patient, 'name', 'Patient Name');
    checkField(data.patient, 'age', 'Age / DOB');
    checkField(data.patient, 'gender', 'Gender');
    checkField(data.patient, 'phone', 'Contact Number');
    checkField(data.insurance, 'insurance_company', 'Insurance Company');
    checkField(data.insurance, 'tpa_name', 'TPA Name');
    checkField(data.insurance, 'policy_number', 'Policy Number');
    checkField(data.insurance, 'sum_insured', 'Sum Insured');

    return { extracted, missing };
}

function getPreCachedExcerpts(fileName: string): string[] {
    const nameLower = fileName.toLowerCase();
    if (nameLower.includes('gluc') || nameLower.includes('diabet')) {
        return [
            'Blood sugar values: fasting blood glucose is 280 mg/dL and post-prandial blood glucose is 380 mg/dL.',
            'Urine ketones: negative. ECG: Normal.',
            'High blood sugar noted during home tests. Advising emergency glycemic control and stabilization of blood glucose levels.',
            'Patient complains of polyuria and polydipsia for 3 days.'
        ];
    }
    if (nameLower.includes('gluc') || nameLower.includes('diabet')) {
        return [
            'Blood sugar values: fasting blood glucose is 280 mg/dL and post-prandial blood glucose is 380 mg/dL.',
            'Urine ketones: negative. ECG: Normal.',
            'High blood sugar noted during home tests. Advising emergency glycemic control and stabilization of blood glucose levels.',
            'Patient complains of polyuria and polydipsia for 3 days.'
        ];
    }
    if (nameLower.includes('ultrasound') || nameLower.includes('pneumonia')) {
        return [
            'Cough and high fever noticed recently. Chest crackles present.',
            'Clinical presentation of fever and productive cough. Advised admission for antibiotic course.',
            'Cough and high fever for 3 days.'
        ];
    }
    if (nameLower.includes('cbc') || nameLower.includes('appendicitis')) {
        return [
            'Appendicitis suspected. RLQ tender.',
            'Presented with RLQ tenderness. Suspected acute appendicitis.',
            'RLQ pain for 1 day.'
        ];
    }
    return [];
}

import { MODEL_DOCUMENT } from '../config/modelConfig';

export const extractFromDocument = async (file: File): Promise<ExtractedPatientData> => {
    // Check if we have a demo document or fallback mode is set
    const hasDemoDoc = file.name.toLowerCase().includes('demo') ||
        file.name.toLowerCase().includes('report') ||
        file.name.toLowerCase().includes('gluc') ||
        file.name.toLowerCase().includes('ultrasound') ||
        file.name.toLowerCase().includes('cbc');

    const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

    if (isDemoMode && hasDemoDoc) {
        console.log("[documentExtractionService] Returning pre-cached demo excerpts and data.");
        const excerpts = getPreCachedExcerpts(file.name);
        const isGluc = file.name.includes('gluc');
        const { extracted, missing } = computeExtractedMissingFields({
            patient: { name: 'Abhishek Nahire', age: 28, gender: 'Male' },
            insurance: { policy_number: 'POL-123456', insurance_company: 'Star Health', sum_insured: 500000 }
        });
        return {
            document_type: isGluc ? 'policy_document' : 'unknown',
            patient: { name: 'Abhishek Nahire', age: 28, gender: 'Male' },
            insurance: { policy_number: 'POL-123456', insurance_company: 'Star Health', sum_insured: 500000 },
            confidence: 99,
            extracted_fields: extracted,
            missing_fields: missing,
            clinical_excerpts: excerpts
        };
    }

    let attempts = 3;
    let lastError: any = null;

    // Run local OCR or PDF text extraction
    console.log(`[documentExtractionService] Running local text extraction for file: ${file.name}`);
    const extractedText = await extractTextFromDocument(file);
    console.log(`[documentExtractionService] Extracted ${extractedText.length} characters of text locally.`);

    const userPrompt = `
DOCUMENT FILENAME: ${file.name}

EXTRACTED TEXT FROM DOCUMENT:
"""
${extractedText}
"""

Instructions: Use the extracted text above to identify which page contains what test/report/info, fill out the patient and insurance details, and return strictly valid JSON matching the schema.
`;

    while (attempts > 0) {
        try {
            const client = getGoogleGenerativeAIClient();
            const model = client.getGenerativeModel({ model: MODEL_DOCUMENT });

            const result = await model.generateContent([EXTRACTION_PROMPT, userPrompt]);
            const responseText = result.response.text().trim();

            // Ensure stripping markdown json blocks which GEMINI sometimes outputs anyway
            let jsonStr = responseText;
            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
            } else if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
            }

            const data = JSON.parse(jsonStr);
            const { extracted, missing } = computeExtractedMissingFields(data);

            return {
                ...data,
                extracted_fields: extracted,
                missing_fields: missing
            };
        } catch (error) {
            lastError = error;
            attempts--;
            if (attempts > 0 && rotateApiKey()) {
                console.warn("[documentExtractionService] Retrying document extraction with fallback API key...");
                continue;
            }
            break;
        }
    }

    console.error("Extraction error:", lastError);
    throw new Error("Failed to process document. Please ensure it's a clear image or PDF.");
};
