import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI((import.meta as any).env?.VITE_GEMINI_API_KEY || '');

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
}

const EXTRACTION_PROMPT = `
Extract patient and insurance information from this document.
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
  "notes": "Any issues or unclear text"
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

export const extractFromDocument = async (file: File): Promise<ExtractedPatientData> => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Convert file to base64
        const fileToBase64 = (f: File): Promise<string> => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(f);
                reader.onload = () => {
                    const base64String = reader.result as string;
                    // Remove data url prefix
                    resolve(base64String.split(',')[1]);
                };
                reader.onerror = error => reject(error);
            });
        };

        const base64Data = await fileToBase64(file);

        const imageParts = [
            {
                inlineData: {
                    data: base64Data,
                    mimeType: file.type
                }
            }
        ];

        const result = await model.generateContent([EXTRACTION_PROMPT, ...imageParts]);
        const responseText = result.response.text().trim();

        // Ensure stripping markdown json blocks which GEMINI sometimes outputs anyway
        let jsonStr = responseText;
        if (jsonStr.startsWith('\`\`\`json')) {
            jsonStr = jsonStr.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
        } else if (jsonStr.startsWith('\`\`\`')) {
            jsonStr = jsonStr.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim();
        }

        const data = JSON.parse(jsonStr);
        const { extracted, missing } = computeExtractedMissingFields(data);

        return {
            ...data,
            extracted_fields: extracted,
            missing_fields: missing
        };
    } catch (error) {
        console.error("Extraction error:", error);
        // Fallback or bubble up error
        throw new Error("Failed to process document. Please ensure it's a clear image or PDF.");
    }
};
