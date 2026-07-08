import { WizardDocument } from '../components/PreAuthWizard/types';
import { extractPagesFromDocument, extractPagesFromWizardDocument } from './ocrService';
import { getGoogleGenerativeAIClient, rotateApiKey } from './apiKeys';
import { MODEL_DOCUMENT } from '../config/modelConfig';

export interface LlamaNode {
    id: string;
    text: string;
    metadata: {
        pageNumber: number;
        fileName: string;
        mimeType: string;
        documentTypeClassification?: string;
    };
}

export interface LlamaDocument {
    id: string;
    nodes: LlamaNode[];
    metadata: {
        fileName: string;
        mimeType: string;
        uploadedAt: string;
    };
}

/**
 * Stage 3: Wrap OCR output into LlamaIndex Document & Nodes structures
 * One Node per Page to maintain auditability and references.
 */
export function buildLlamaDocument(fileName: string, mimeType: string, uploadedAt: string, pageTexts: string[]): LlamaDocument {
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nodes = pageTexts.map((text, index) => ({
        id: `node_${docId}_page_${index + 1}`,
        text,
        metadata: {
            pageNumber: index + 1,
            fileName,
            mimeType
        }
    }));
    return {
        id: docId,
        nodes,
        metadata: {
            fileName,
            mimeType,
            uploadedAt
        }
    };
}

/**
 * Stage 4 & 5: Process LlamaDocument Nodes with Gemini for classification, parsing, and insurance field extraction
 */
export async function runLlamaGeminiPipeline(llamaDoc: LlamaDocument): Promise<any> {
    const client = getGoogleGenerativeAIClient();
    const model = client.getGenerativeModel({ model: MODEL_DOCUMENT });

    // Step 4: Page Classification and parsing for each node (page)
    const processedPages = [];
    for (const node of llamaDoc.nodes) {
        console.log(`[LlamaIndex Pipeline] Processing Page Node ${node.id}`);
        
        const classificationPrompt = `
You are processing a page Node from a medical record.
Original PDF Page Reference: Page ${node.metadata.pageNumber} of ${node.metadata.fileName}.

TEXT FOR NODE:
"""
${node.text}
"""

Instructions:
1. Classify this page's document type exactly (e.g. "Lab report – Urine examination", "Lab report – Dengue rapid test", "Lab report – Widal test + Malarial smear", "Lab report – CBC", "OPD prescription / consultation note", "Insurance card", "Hospital registration form", or "Unknown").
2. Reconstruct any tables present in this page containing lab tests or vitals, detailing testName, result, units, and normalRange.

Return strictly a valid JSON object matching this structure:
{
  "classification": "Specific document type classification",
  "tables": [
    {
      "tableName": "Table Name",
      "rows": [
        { "testName": "Name of test", "result": "result value", "units": "units", "normalRange": "normal range reference" }
      ]
    }
  ]
}
`;
        let attempts = 2;
        let nodeResult = { classification: "Unknown", tables: [] as any[] };
        while (attempts > 0) {
            try {
                const res = await model.generateContent(classificationPrompt);
                let text = res.response.text().trim();
                if (text.startsWith('```json')) {
                    text = text.replace(/^```json/, '').replace(/```$/, '').trim();
                } else if (text.startsWith('```')) {
                    text = text.replace(/^```/, '').replace(/```$/, '').trim();
                }
                nodeResult = JSON.parse(text);
                break;
            } catch (e) {
                console.error(`Error parsing node ${node.id}:`, e);
                attempts--;
            }
        }
        processedPages.push({
            pageNumber: node.metadata.pageNumber,
            classification: nodeResult.classification || "Unknown",
            tables: nodeResult.tables || []
        });
    }

    // Step 5: Aggregate node content and extract global insurance-relevant fields
    const allText = llamaDoc.nodes.map(n => `[PAGE ${n.metadata.pageNumber}]\n${n.text}`).join('\n\n');
    const extractionPrompt = `
Analyze the full patient medical record and extract insurance-relevant fields.

FULL RECORD TEXT:
"""
${allText}
"""

Return strictly a valid JSON object matching this structure:
{
  "patient": {
    "name": "Full name or null",
    "age": number or null,
    "dob": "YYYY-MM-DD or null",
    "gender": "Male" | "Female" | "Other" | null,
    "address": "Full address or null",
    "phone": "Phone number or null"
  },
  "insurance": {
    "policy_number": "Policy/Certificate number or null",
    "insurance_company": "Company name or null",
    "tpa_name": "TPA name or null",
    "sum_insured": number or null,
    "valid_till": "YYYY-MM-DD or null",
    "member_id": "Member/Employee ID or null"
  },
  "clinical": {
    "diagnosis_impression": "Stated diagnosis or clinical impressions (e.g. Dengue, Acute Appendicitis)",
    "doctor_name": "Name of the treating physician",
    "consultation_date": "YYYY-MM-DD or null",
    "lab_name": "Name of the laboratory / diagnostics centre",
    "hospital_name": "Name of the hospital / healthcare facility",
    "vitals": {
      "bp": "blood pressure",
      "pulse": "pulse rate",
      "temp": "temperature",
      "spo2": "oxygen saturation",
      "rr": "respiratory rate"
    },
    "drugs_prescribed": ["List of drug names, or empty array"]
  },
  "document_type": "hospital_registration" | "insurance_card" | "policy_document" | "id_card" | "unknown",
  "confidence": 95,
  "notes": "Any extraction issues or notes"
}
`;

    let globalResult = {
        patient: {} as any, 
        insurance: {} as any, 
        clinical: {} as any, 
        document_type: "unknown", 
        confidence: 50, 
        notes: ""
    };
    try {
        const res = await model.generateContent(extractionPrompt);
        let text = res.response.text().trim();
        if (text.startsWith('```json')) {
            text = text.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (text.startsWith('```')) {
            text = text.replace(/^```/, '').replace(/```$/, '').trim();
        }
        globalResult = JSON.parse(text);
    } catch (e) {
        console.error("Global insurance field extraction failed:", e);
    }

    const { extracted, missing } = computeExtractedMissingFields(globalResult);

    return {
        ...globalResult,
        pages: processedPages,
        extracted_fields: extracted,
        missing_fields: missing,
        rawJson: JSON.stringify({ llamaDocument: llamaDoc, processedPages, extractedFields: globalResult }, null, 2)
    };
}

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

    if (data.patient) {
        checkField(data.patient, 'name', 'Patient Name');
        checkField(data.patient, 'age', 'Age / DOB');
        checkField(data.patient, 'gender', 'Gender');
        checkField(data.patient, 'phone', 'Contact Number');
    }
    if (data.insurance) {
        checkField(data.insurance, 'insurance_company', 'Insurance Company');
        checkField(data.insurance, 'tpa_name', 'TPA Name');
        checkField(data.insurance, 'policy_number', 'Policy Number');
        checkField(data.insurance, 'sum_insured', 'Sum Insured');
    }

    return { extracted, missing };
}
