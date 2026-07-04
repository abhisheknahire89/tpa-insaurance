import { PreAuthRecord, EvidenceReviewReport, WizardDocument } from '../components/PreAuthWizard/types';
import { INSURANCE_POLICY_RULES, InsurancePolicyRule } from '../config/insurancePolicies';
import { reviewEvidence } from './evidenceReview';
import { extractFromDocument, ExtractedPatientData } from '../services/documentExtractionService';

export interface ExtendedEvidenceReviewReport extends EvidenceReviewReport {
  decision: 'APPROVE' | 'DENY' | 'PENDING';
  justification: string;
  evidenceHighlights: Array<{
    sourceDocument: string;
    excerpt: string;
    supportsOrContradicts: 'supports' | 'contradicts';
    relatedRule: string;
  }>;
  missingInfo: string[];
  policyMatches?: Array<{
    policyId: string;
    policyTitle: string;
    matched: boolean;
    details: string;
  }>;
}

export interface PriorAuthInput {
  clinicalNote: string;
  uploadedDocuments: Array<{
    name: string;
    type: string;
    textContent: string;
    base64Data?: string;
  }>;
  patientDetails: {
    name: string;
    age: number;
    gender: string;
    stateCode: string;
  };
  insuranceDetails: {
    tpaName: string;
    insurerName: string;
    policyNumber: string;
    sumInsured: number;
    wardType: 'General' | 'Semi-Private' | 'Private' | 'ICU';
    roomRentPerDay: number;
    isEmergency: boolean;
  };
  doctorDetails: {
    doctorName: string;
    doctorRegistrationNumber: string;
    hospitalSealApplied: boolean;
    signatureConfirmed: boolean;
  };
}

export interface PriorAuthAnalysis {
  decision: 'Approved' | 'Denied' | 'Pending';
  justification: string;
  englishSummary: string;
  hindiSummary: string;
  evidenceHighlights: Array<{
    severity: 'supportive' | 'contradictory';
    snippet: string;
    relevance: string;
  }>;
  missingInformation: string[];
  policyCitations: Array<{
    clause: string;
    description: string;
    status: 'Compliant' | 'Non-Compliant' | 'Pending';
  }>;
}

/**
 * Helper to convert base64 payload to a browser File object.
 */
function base64ToFile(base64Data: string, fileName: string, mimeType: string): File {
  let cleanBase64 = base64Data;
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1];
  }
  const byteCharacters = atob(cleanBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return new File([blob], fileName, { type: mimeType });
}

/**
 * Orchestrator that accepts uploaded documents and pre-auth record data,
 * runs OCR/extraction, evaluates them against insurance policies & clinical guidelines,
 * and outputs a prior-authorization decision with evidence highlights.
 */
export async function priorAuthOrchestrator(
  documents: WizardDocument[],
  record: Partial<PreAuthRecord>
): Promise<ExtendedEvidenceReviewReport> {
  // 1. Run the existing clinical evidence review first to get base clinical/admin results
  const baseReport = await reviewEvidence(record);

  // 2. Extract structured data & clinical excerpts from all uploaded documents
  const extractions: Array<{ doc: WizardDocument; data: ExtractedPatientData }> = [];
  for (const doc of documents) {
    try {
      if (doc.base64Data) {
        const file = base64ToFile(doc.base64Data, doc.fileName, doc.mimeType);
        const data = await extractFromDocument(file);
        extractions.push({ doc, data });
      }
    } catch (err) {
      console.error(`[priorAuthOrchestrator] Failed to extract from document ${doc.fileName}:`, err);
    }
  }

  // 3. Match diagnosis to policies
  const selectedIndex = record.clinical?.selectedDiagnosisIndex ?? 0;
  const selectedDx = record.clinical?.diagnoses?.[selectedIndex];
  const diagnosisName = selectedDx?.diagnosis || '';
  const provisionalCode = selectedDx?.icd10Code || '';

  const matchedPolicies = INSURANCE_POLICY_RULES.filter(policy => {
    const term = diagnosisName.toLowerCase();
    const scopeLower = policy.scope.toLowerCase();
    const titleLower = policy.title.toLowerCase();
    const idLower = policy.id.toLowerCase();
    return term.includes(scopeLower) || scopeLower.includes(term) || titleLower.includes(term) || idLower.includes(term);
  });

  const evidenceHighlights: ExtendedEvidenceReviewReport['evidenceHighlights'] = [];
  const missingInfo: string[] = [];
  const policyMatches: NonNullable<ExtendedEvidenceReviewReport['policyMatches']> = [];

  // Evaluate matching policies
  for (const policy of matchedPolicies) {
    let policyFullyMet = true;
    const matchDetails: string[] = [];

    // Check documentation requirements
    for (const reqDoc of policy.documentation_requirements) {
      const docFound = documents.some(d => {
        const catMatch = d.documentCategory?.toLowerCase().includes(reqDoc.toLowerCase()) ||
                         reqDoc.toLowerCase().includes(d.documentCategory?.toLowerCase() || '');
        const nameMatch = d.fileName.toLowerCase().includes(reqDoc.toLowerCase());
        return catMatch || nameMatch;
      });

      if (docFound) {
        matchDetails.push(`Required document "${reqDoc}" is uploaded.`);
      } else {
        policyFullyMet = false;
        missingInfo.push(`Missing required document: ${reqDoc} (per ${policy.title})`);
        matchDetails.push(`Missing required document "${reqDoc}".`);
      }
    }

    // Check clinical criteria
    for (const criterion of policy.clinical_criteria) {
      let criterionFound = false;
      for (const ext of extractions) {
        const excerpts = ext.data.clinical_excerpts || [];
        for (const excerpt of excerpts) {
          const terms = criterion.toLowerCase().split(/\s+/).filter(t => t.length > 3);
          const matchesCount = terms.filter(t => excerpt.toLowerCase().includes(t)).length;
          if (matchesCount >= Math.min(2, terms.length)) {
            criterionFound = true;
            evidenceHighlights.push({
              sourceDocument: ext.doc.fileName,
              excerpt: excerpt,
              supportsOrContradicts: 'supports',
              relatedRule: `${policy.title}: ${criterion}`
            });
            break;
          }
        }
        if (criterionFound) break;
      }

      if (criterionFound) {
        matchDetails.push(`Clinical criterion "${criterion}" is met.`);
      } else {
        policyFullyMet = false;
        missingInfo.push(`Missing clinical confirmation: ${criterion} (per ${policy.title})`);
        matchDetails.push(`Missing clinical confirmation for "${criterion}".`);
      }
    }

    policyMatches.push({
      policyId: policy.id,
      policyTitle: policy.title,
      matched: policyFullyMet,
      details: matchDetails.join(' ')
    });
  }

  // 4. Decision logic (APPROVE / DENY / PENDING)
  let decision: 'APPROVE' | 'DENY' | 'PENDING' = 'APPROVE';
  let justification = '';

  const hasHighQueries = baseReport.anticipatedQueries.some(q => q.severity === 'high');
  const hasGaps = baseReport.insufficientEvidence.length > 0 || baseReport.mandatoryGaps.length > 0 || missingInfo.length > 0;

  if (hasHighQueries) {
    decision = 'DENY';
    justification = `The request is recommended for Denial. Clinical pre-audit identifies severe gaps in inpatient necessity or conservative management requirements. Detailed reason: ${baseReport.anticipatedQueries.find(q => q.severity === 'high')?.query}`;
  } else if (hasGaps) {
    decision = 'PENDING';
    justification = 'The request is recommended as Pending. There are missing clinical documents or specific policy criteria that are not yet confirmed in the uploaded files.';
  } else {
    decision = 'APPROVE';
    justification = 'The request is recommended for Approval. All clinical protocol indicators are met, and required documents and policy criteria are fully verified with supporting excerpts from the source files.';
  }

  // Add contradictions if any
  // E.g., if there are cost estimates with surgical procedures stating 0 fee, we flag a contradiction
  const isSurgical = record.clinical?.proposedLineOfTreatment?.surgical || false;
  const isSurgicalZeroCost = isSurgical &&
      ((record.costEstimate?.otCharges ?? 0) === 0 &&
       (record.costEstimate?.surgeonFee ?? 0) === 0);
  if (isSurgicalZeroCost) {
    evidenceHighlights.push({
      sourceDocument: 'Cost Estimate Form',
      excerpt: `Surgeon Fee: ₹${record.costEstimate?.surgeonFee ?? 0}, OT Charges: ₹${record.costEstimate?.otCharges ?? 0}`,
      supportsOrContradicts: 'contradicts',
      relatedRule: 'Surgical Cost Breakdowns: Non-zero values required for OT & Surgeon Fee'
    });
  }

  return {
    ...baseReport,
    decision,
    justification,
    evidenceHighlights,
    missingInfo,
    policyMatches,
    status: (decision === 'APPROVE') ? 'sufficient' : 'insufficient'
  };
}

/**
 * Legacy workflow orchestrator mapping to PriorAuthCopilot view requirements.
 */
export async function runPriorAuthWorkflow(input: PriorAuthInput): Promise<PriorAuthAnalysis> {
  const wizardDocs: WizardDocument[] = input.uploadedDocuments.map((doc, idx) => ({
    id: `doc-${idx}-${Date.now()}`,
    fileName: doc.name,
    fileSize: doc.textContent?.length || 1024,
    mimeType: doc.type || 'application/pdf',
    fileType: doc.type?.includes('pdf') ? 'pdf' : 'image',
    base64Data: doc.base64Data || btoa(doc.textContent || ''),
    documentCategory: doc.name.toLowerCase().includes('lab') ? 'Lab Report' : 
                     doc.name.toLowerCase().includes('ultrasound') ? 'USG/Radiology' :
                     doc.name.toLowerCase().includes('cbc') ? 'Lab Report' : 'Other'
  }));

  const noteLower = input.clinicalNote.toLowerCase();
  let mappedDx = 'Unspecified';
  let mappedICD = 'Pending';
  let isSurgical = false;

  if (noteLower.includes('dengue')) {
    mappedDx = 'Dengue Hemorrhagic Fever';
    mappedICD = 'A91';
  } else if (noteLower.includes('appendi')) {
    mappedDx = 'Acute Appendicitis';
    mappedICD = 'K35.8';
    isSurgical = true;
  } else if (noteLower.includes('cabg') || noteLower.includes('coronary')) {
    mappedDx = 'Coronary Artery Disease';
    mappedICD = 'I25.1';
    isSurgical = true;
  } else if (noteLower.includes('cataract')) {
    mappedDx = 'Senile Cataract';
    mappedICD = 'H25.9';
    isSurgical = true;
  }

  const record: Partial<PreAuthRecord> = {
    id: `pre-auth-${Date.now()}`,
    patient: {
      patientName: input.patientDetails.name,
      age: input.patientDetails.age,
      gender: input.patientDetails.gender as any,
      uhid: 'UHID-DEMO-999'
    },
    insurance: {
      insurerName: input.insuranceDetails.insurerName,
      tpaName: input.insuranceDetails.tpaName,
      policyNumber: input.insuranceDetails.policyNumber,
      sumInsured: input.insuranceDetails.sumInsured,
      policyType: 'Commercial'
    },
    clinical: {
      diagnoses: [{
        diagnosis: mappedDx,
        icd10Code: mappedICD,
        icd10Description: 'Confirmed',
        isSelected: true
      }],
      selectedDiagnosisIndex: 0,
      chiefComplaints: input.clinicalNote,
      relevantClinicalFindings: input.clinicalNote,
      proposedLineOfTreatment: {
        surgical: isSurgical
      },
      vitals: {
        spo2: '96',
        temp: '102',
        pulse: '110',
        bp: '120/80'
      }
    },
    admission: {
      admissionType: input.insuranceDetails.isEmergency ? 'Emergency' : 'Planned',
      dateOfAdmission: new Date().toISOString().split('T')[0]
    },
    uploadedDocuments: wizardDocs
  };

  const report = await priorAuthOrchestrator(wizardDocs, record);

  const decisionMap = {
    'APPROVE': 'Approved' as const,
    'DENY': 'Denied' as const,
    'PENDING': 'Pending' as const
  };

  const highlights = report.evidenceHighlights.map(hl => ({
    severity: hl.supportsOrContradicts === 'supports' ? ('supportive' as const) : ('contradictory' as const),
    snippet: hl.excerpt,
    relevance: hl.relatedRule
  }));

  const policyCitations = (report.policyMatches || []).map(pm => ({
    clause: pm.policyTitle,
    description: pm.details,
    status: pm.matched ? ('Compliant' as const) : ('Non-Compliant' as const)
  }));

  return {
    decision: decisionMap[report.decision] || 'Pending',
    justification: report.justification,
    englishSummary: report.justification,
    hindiSummary: 'पूर्व-प्राधिकरण अनुरोध की समीक्षा की गई है। ' + (report.decision === 'APPROVE' ? 'स्वीकृत करने की अनुशंसा की जाती है।' : 'विवरण या दस्तावेज लंबित हैं।'),
    evidenceHighlights: highlights,
    missingInformation: report.missingInfo,
    policyCitations: policyCitations
  };
}
