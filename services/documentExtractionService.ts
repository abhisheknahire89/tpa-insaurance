import { getGoogleGenerativeAIClient, rotateApiKey, getActiveApiKey } from './apiKeys';
import { extractPagesFromDocument } from './ocrService';
import { buildLlamaDocument, runLlamaGeminiPipeline } from './llamaIndexOrchestrator';

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
    clinical?: {
        diagnosis_impression?: string | null;
        doctor_name?: string | null;
        consultation_date?: string | null;
        lab_name?: string | null;
        hospital_name?: string | null;
        vitals?: {
            bp?: string | null;
            pulse?: string | null;
            temp?: string | null;
            spo2?: string | null;
            rr?: string | null;
        } | null;
        drugs_prescribed?: string[] | null;
    } | null;
    pages?: Array<{
        pageNumber: number;
        classification: string;
        tables: Array<{
            tableName: string;
            rows: Array<{
                testName: string;
                result: string;
                units: string;
                normalRange: string;
            }>;
        }>;
    }>;
    confidence: number;
    notes?: string;
    // Computed fields
    extracted_fields: string[];
    missing_fields: string[];
    clinical_excerpts?: string[];
}

const EXTRACTION_PROMPT = `
You are an advanced medical OCR pipeline post-processor. 
Analyze the extracted document text page-by-page. For each page, classify the document type (e.g. "Lab report – Urine examination", "Lab report – Dengue rapid test", "Lab report – CBC", "OPD prescription / consultation note", etc.). Extract any tables present (extract test names, results, units, and reference normal ranges). Also extract insurance-relevant demographics, medical providers, and clinical details.

Return ONLY a valid JSON object matching the following structure:
{
  "document_type": "hospital_registration" | "insurance_card" | "policy_document" | "id_card" | "unknown",
  "patient": {
    "name": "Full name or null",
    "age": number or null,
    "dob": "YYYY-MM-DD or null",
    "gender": "Male" | "Female" | "Other" | null,
    "address": "Full address or null",
    "phone": "Phone number or null"
  },
  "insurance": {
    "policy_number": "Policy number or null",
    "insurance_company": "Company name or null",
    "tpa_name": "TPA name or null",
    "sum_insured": number or null,
    "valid_till": "YYYY-MM-DD or null",
    "member_id": "Member/Employee ID or null"
  },
  "clinical": {
    "diagnosis_impression": "Stated diagnosis or impressions (e.g. Dengue, Acute Appendicitis)",
    "doctor_name": "Name of the treating physician",
    "consultation_date": "YYYY-MM-DD or null",
    "lab_name": "Name of the lab where tests were done",
    "hospital_name": "Name of the hospital",
    "vitals": {
      "bp": "blood pressure",
      "pulse": "pulse rate",
      "temp": "temperature",
      "spo2": "oxygen saturation",
      "rr": "respiratory rate"
    },
    "drugs_prescribed": ["List of drug names, or empty array"]
  },
  "pages": [
    {
      "pageNumber": 1,
      "classification": "Document classification per page (e.g., 'Lab report - CBC')",
      "tables": [
        {
          "tableName": "Table name if any (e.g. 'Complete Blood Count')",
          "rows": [
            {
              "testName": "Hemoglobin",
              "result": "12.5",
              "units": "g/dL",
              "normalRange": "13.0 - 17.0"
            }
          ]
        }
      ]
    }
  ],
  "confidence": 95,
  "notes": "Any extraction issues or notes"
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
        
        const mockPages = [
            {
                pageNumber: 1,
                classification: isGluc ? "Policy Document – Plan Details" : "Lab report – CBC",
                tables: [
                    {
                        tableName: isGluc ? "Plan Coverage" : "Complete Blood Count",
                        rows: isGluc ? [
                            { testName: "Room Rent Limit", result: "Single Private A/C", units: "Daily", normalRange: "Up to 5000" }
                        ] : [
                            { testName: "Hemoglobin", result: "12.5", units: "g/dL", normalRange: "13.0 - 17.0" },
                            { testName: "White Blood Cells (WBC)", result: "14500", units: "/cumm", normalRange: "4000 - 11000" },
                            { testName: "Platelet Count", result: "180000", units: "/cumm", normalRange: "150000 - 450000" }
                        ]
                    }
                ]
            },
            {
                pageNumber: 2,
                classification: isGluc ? "ID Card – Member Details" : "Lab report – Dengue rapid test",
                tables: [
                    {
                        tableName: isGluc ? "Member Details" : "Dengue Duo Panel",
                        rows: isGluc ? [
                            { testName: "Co-pay", result: "10%", units: "Percentage", normalRange: "0%" }
                        ] : [
                            { testName: "Dengue NS1 Antigen", result: "POSITIVE", units: "Qualitative", normalRange: "NEGATIVE" }
                        ]
                    }
                ]
            }
        ];

        const mockClinical = {
            diagnosis_impression: isGluc ? "Routine Check" : "Dengue Fever with Leukocytosis",
            doctor_name: "Dr. Ramesh Kumar",
            consultation_date: new Date().toISOString().split('T')[0],
            lab_name: "Aivana Diagnostics",
            hospital_name: "Star Specialty Hospital",
            vitals: {
                bp: "110/70",
                pulse: "98",
                temp: "101",
                spo2: "97",
                rr: "18"
            },
            drugs_prescribed: ["Paracetamol 650mg TDS", "IV Fluids Normal Saline"]
        };

        const resultPayload = {
            document_type: isGluc ? 'policy_document' : 'unknown',
            patient: { name: 'Abhishek Nahire', age: 28, gender: 'Male' },
            insurance: { policy_number: 'POL-123456', insurance_company: 'Star Health', sum_insured: 500000 },
            clinical: mockClinical,
            pages: mockPages,
            confidence: 99,
            extracted_fields: extracted,
            missing_fields: missing,
            clinical_excerpts: excerpts
        };
        return {
            ...resultPayload,
            rawJson: JSON.stringify(resultPayload, null, 2)
        };
    }

    // Run page-by-page local text extraction (Stage 2)
    console.log(`[documentExtractionService] Extracting page-by-page text for file: ${file.name}`);
    const pageTexts = await extractPagesFromDocument(file);
    console.log(`[documentExtractionService] Extracted ${pageTexts.length} pages locally.`);

    // Wrap pages in LlamaIndex Document & Nodes (Stage 3)
    const llamaDoc = buildLlamaDocument(file.name, file.type, new Date().toISOString(), pageTexts);
    console.log(`[documentExtractionService] Created LlamaIndex Document: ${llamaDoc.id} with ${llamaDoc.nodes.length} nodes.`);

    // Execute the orchestrated classification, table parsing and field mapping pipeline (Stage 4 & 5)
    return await runLlamaGeminiPipeline(llamaDoc);
};
