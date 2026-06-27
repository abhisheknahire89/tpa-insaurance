import { PreAuthRecord } from '../components/PreAuthWizard/types';
import { getReasoningFromMedGemma, LlmReasoningOutput } from '../services/llmClient';
import { checkMandatoryGaps } from '../config/mandatoryItems';

export interface EvidenceReviewReport {
  status: 'sufficient' | 'insufficient';
  challengesConsidered: string[];          // what a TPA reviewer would question
  requiredEvidence: Array<{
    item: string;
    present: boolean;
    source: 'anchor' | 'discriminator';
    forChallenge?: string;
  }>;
  insufficientEvidence: string[];           // required-but-absent
  anticipatedQueries: Array<{
    query: string;
    reason: string;
    relatedChallenge: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  mandatoryGaps: string[];                  // from the deterministic layer
  reasoningTrace: string[];                 // NEXUS evidence chain, for auditability
  reviewedAt: string;
}

/**
 * Checks if a required finding is present in the case narrative or structured fields.
 */
export const checkClinicalPresence = (item: string, record: Partial<PreAuthRecord>): boolean => {
  const itemLower = item.toLowerCase();
  
  // 1. Gather all narrative text
  const chiefComplaints = record.clinical?.chiefComplaints || '';
  const hpi = record.clinical?.historyOfPresentIllness || '';
  const findings = record.clinical?.relevantClinicalFindings || '';
  const notes = record.clinical?.additionalClinicalNotes || '';
  const treatment = record.clinical?.treatmentTakenSoFar || '';
  const reasonHosp = record.clinical?.reasonForHospitalisation || '';
  
  const fullNarrative = `${chiefComplaints} ${hpi} ${findings} ${notes} ${treatment} ${reasonHosp}`.toLowerCase();

  // 2. Structured field: SpO2 / Hypoxia
  if (itemLower.includes('spo2') || itemLower.includes('hypoxia') || itemLower.includes('oxygen')) {
    const spo2 = record.clinical?.vitals?.spo2;
    if (spo2 && spo2.trim() !== '') {
      const val = parseInt(spo2, 10);
      if (!isNaN(val) && val > 0) return true;
    }
    if (fullNarrative.includes('spo2') || fullNarrative.includes('hypoxia') || fullNarrative.includes('saturation')) {
      return true;
    }
  }

  // 3. Structured field: Temperature / Fever
  if (itemLower.includes('temp') || itemLower.includes('fever') || itemLower.includes('pyrexia')) {
    const temp = record.clinical?.vitals?.temp;
    if (temp && temp.trim() !== '') {
      const val = parseFloat(temp);
      if (!isNaN(val) && val > 0) return true;
    }
    if (fullNarrative.includes('fever') || fullNarrative.includes('temp') || fullNarrative.includes('temperature') || fullNarrative.includes('pyrexia')) {
      return true;
    }
  }

  // 4. Structured field: Duration / Onset / History
  if (itemLower.includes('duration') || itemLower.includes('onset') || itemLower.includes('history') || itemLower.includes('past')) {
    const duration = record.clinical?.durationOfPresentAilment;
    if (duration && duration.trim() !== '') return true;

    // Check past medical history structures
    const pmh = record.admission?.pastMedicalHistory;
    if (pmh) {
      if (pmh.diabetes?.present || pmh.hypertension?.present || pmh.heartDisease?.present || pmh.asthma?.present || pmh.cancer?.present || pmh.kidney?.present) {
        return true;
      }
    }
    if (record.admission?.previousHospitalization?.wasHospitalizedBefore) return true;

    if (fullNarrative.includes('duration') || fullNarrative.includes('onset') || fullNarrative.includes('history of') || fullNarrative.includes('days') || fullNarrative.includes('weeks')) {
      return true;
    }
  }

  // 5. General keyword match: check if the narrative contains all or most significant words of the item
  const words = itemLower.split(/\s+/).filter(w => w.length > 3);
  if (words.length > 0) {
    const matchedCount = words.filter(w => fullNarrative.includes(w)).length;
    if (matchedCount >= Math.min(2, words.length)) {
      return true;
    }
  }

  return fullNarrative.includes(itemLower);
};

/**
 * Fallback static reviewer when MedGemma is not active or returns malformed output.
 */
export const getFallbackReasoning = (diagnosisName: string): LlmReasoningOutput => {
  const dxLower = diagnosisName.toLowerCase();

  if (dxLower.includes('pneumonia')) {
    return {
      challengesConsidered: [
        'could this be managed as OPD?',
        'could this be a pre-existing condition?',
        'is the stated diagnosis actually supported by the documented findings?'
      ],
      anchors: [
        'Fever or elevated body temperature',
        'Productive cough',
        'Leukocytosis (elevated WBC count)',
        'Chest X-Ray showing lung infiltrate or consolidation'
      ],
      discriminators: [
        {
          challenge: 'could this be managed as OPD?',
          evidence: 'Oxygen saturation (SpO2) < 90% or clinical signs of respiratory distress',
          reason: 'To establish severity of pneumonia and justify continuous inpatient oxygen therapy.'
        },
        {
          challenge: 'could this be a pre-existing condition?',
          evidence: 'Documented onset and short duration of acute respiratory symptoms (< 7 days)',
          reason: 'To rule out chronic respiratory illness exclusions.'
        },
        {
          challenge: 'is the stated diagnosis actually supported by the documented findings?',
          evidence: 'Chest X-ray report confirming infiltrate',
          reason: 'To verify diagnosis meets clinical diagnostic criteria.'
        }
      ]
    };
  }

  if (dxLower.includes('diabet') || dxLower.includes('dka')) {
    return {
      challengesConsidered: [
        'could this be managed as OPD?',
        'could this be a pre-existing condition?',
        'is the stated diagnosis actually supported by the documented findings?'
      ],
      anchors: [
        'Hyperglycemia (elevated blood glucose > 200 mg/dL)',
        'Polyuria, polydipsia, or rapid weight loss',
        'Documented history of diabetes and medication log',
        'HbA1c test results'
      ],
      discriminators: [
        {
          challenge: 'could this be managed as OPD?',
          evidence: 'Diabetic ketoacidosis (DKA) indicators (blood pH < 7.3, bicarbonate < 15, or positive ketonuria)',
          reason: 'DKA is an acute medical emergency requiring continuous intravenous insulin infusion and electrolyte monitoring.'
        },
        {
          challenge: 'could this be a pre-existing condition?',
          evidence: 'Documented history of onset, duration, and past treatment papers',
          reason: 'To rule out pre-existing disease waiting period exclusions.'
        },
        {
          challenge: 'is the stated diagnosis actually supported by the documented findings?',
          evidence: 'Random blood glucose > 200 mg/dL or fasting blood glucose > 126 mg/dL',
          reason: 'Objective laboratory proof of hyperglycemia is required.'
        }
      ]
    };
  }

  // Generic fallback
  return {
    challengesConsidered: [
      'could this be managed as OPD?',
      'could this be a pre-existing condition?',
      'is the stated diagnosis actually supported by the documented findings?'
    ],
    anchors: [
      'Chief complaints with severity indicators',
      'Clinical history and duration of ailment',
      'Treating doctor provisional diagnosis'
    ],
    discriminators: [
      {
        challenge: 'could this be managed as OPD?',
        evidence: 'Vitals instability or acute complications requiring continuous nursing care',
        reason: 'To demonstrate why outpatient treatment is unsafe or inappropriate.'
      },
      {
        challenge: 'could this be a pre-existing condition?',
        evidence: 'Detailed medical history including onset and duration',
        reason: 'To rule out pre-existing disease exclusions.'
      },
      {
        challenge: 'is the stated diagnosis actually supported by the documented findings?',
        evidence: 'Objective diagnostic investigations or lab reports',
        reason: 'To substantiate provisional clinical diagnosis with objective evidence.'
      }
    ]
  };
};

/**
 * Reviews a pre-auth case to evaluate if the documented evidence is sufficient.
 */
export const reviewEvidence = async (record: Partial<PreAuthRecord>): Promise<EvidenceReviewReport> => {
  const trace: string[] = ['[NEXUS TPA Engine] Initiating TPA pre-admission documentation sufficiency audit.'];
  
  // 1. Stated Diagnosis
  const selectedIndex = record.clinical?.selectedDiagnosisIndex ?? 0;
  const selectedDx = record.clinical?.diagnoses?.[selectedIndex];
  const diagnosis = selectedDx?.diagnosis || 'Unspecified Condition';
  
  // 2. Admission Decision
  const admissionType = record.admission?.admissionType || 'Planned';
  
  // 3. Clinical Narrative
  const chiefComplaints = record.clinical?.chiefComplaints || '';
  const hpi = record.clinical?.historyOfPresentIllness || '';
  const findings = record.clinical?.relevantClinicalFindings || '';
  const notes = record.clinical?.additionalClinicalNotes || '';
  const fullNarrative = `${chiefComplaints} ${hpi} ${findings} ${notes}`.trim();
  
  trace.push(`[NEXUS TPA Engine] Stated Diagnosis: "${diagnosis}". Admission Decision: "${admissionType}".`);
  
  let llmOutput: LlmReasoningOutput;
  try {
    trace.push('[NEXUS TPA Engine] Querying local MedGemma 4B LLM for reasoning steps (a)-(c).');
    llmOutput = await getReasoningFromMedGemma(diagnosis, admissionType, fullNarrative);
    trace.push('[NEXUS TPA Engine] MedGemma response received and parsed successfully.');
  } catch (error: any) {
    trace.push(`[NEXUS TPA Engine] MedGemma query failed/malformed: "${error.message}". Degrading to local rules-based review.`);
    llmOutput = getFallbackReasoning(diagnosis);
  }

  // 4. Deterministic Presence-Check (Gap Check)
  const requiredEvidence: EvidenceReviewReport['requiredEvidence'] = [];
  const insufficientEvidence: string[] = [];
  const anticipatedQueries: EvidenceReviewReport['anticipatedQueries'] = [];
  
  // Process anchors
  for (const anchor of llmOutput.anchors) {
    const present = checkClinicalPresence(anchor, record);
    requiredEvidence.push({
      item: anchor,
      present,
      source: 'anchor'
    });
    
    if (!present) {
      insufficientEvidence.push(anchor);
      trace.push(`[NEXUS TPA Engine] Missing Anchor: "${anchor}".`);
      
      // Map to anticipated query
      const query = `Provide clinical evidence/findings establishing "${anchor}" to validate the provisional diagnosis of "${diagnosis}".`;
      anticipatedQueries.push({
        query,
        reason: `Required diagnostic anchor "${anchor}" is not documented in the clinical narrative.`,
        relatedChallenge: 'is the stated diagnosis actually supported by the documented findings?',
        severity: 'medium'
      });
    }
  }

  // Process discriminators
  for (const disc of llmOutput.discriminators) {
    const present = checkClinicalPresence(disc.evidence, record);
    requiredEvidence.push({
      item: disc.evidence,
      present,
      source: 'discriminator',
      forChallenge: disc.challenge
    });
    
    if (!present) {
      insufficientEvidence.push(disc.evidence);
      trace.push(`[NEXUS TPA Engine] Missing Discriminator for challenge "${disc.challenge}": "${disc.evidence}".`);
      
      // Determine query phrasing & severity
      let query = '';
      let severity: 'low' | 'medium' | 'high' = 'medium';
      
      if (disc.challenge.includes('OPD')) {
        query = `Provide documentation of "${disc.evidence}" on admission to establish severity and rule out OPD-manageable alternative.`;
        severity = 'high';
      } else if (disc.challenge.includes('pre-existing')) {
        query = `Provide treating doctor's clinical note specifying onset and duration of "${disc.evidence}" to rule out pre-existing condition exclusions.`;
        severity = 'medium';
      } else {
        query = `Provide "${disc.evidence}" to rule out alternative TPA reviewer queries regarding "${disc.challenge}".`;
        severity = 'low';
      }
      
      anticipatedQueries.push({
        query,
        reason: disc.reason,
        relatedChallenge: disc.challenge,
        severity
      });
    }
  }

  // 5. Deterministic Admin/Legal Layer (config/mandatoryItems.ts)
  trace.push('[NEXUS TPA Engine] Running deterministic rules for administrative compliance.');
  const mandatoryGaps = checkMandatoryGaps(record);
  for (const gap of mandatoryGaps) {
    trace.push(`[NEXUS TPA Engine] Administrative Gap: "${gap}".`);
  }

  // 6. Overall Status Determination
  const status = (insufficientEvidence.length > 0 || mandatoryGaps.length > 0) ? 'insufficient' : 'sufficient';
  trace.push(`[NEXUS TPA Engine] Sufficiency Audit Complete. Status: "${status.toUpperCase()}".`);

  return {
    status,
    challengesConsidered: llmOutput.challengesConsidered,
    requiredEvidence,
    insufficientEvidence,
    anticipatedQueries,
    mandatoryGaps,
    reasoningTrace: trace,
    reviewedAt: new Date().toISOString()
  };
};
