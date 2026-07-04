/**
 * engine/denialAppealGenerator.ts
 *
 * Citation-backed denial appeal generator.
 *
 * KEY DESIGN CONSTRAINT: This generator NEVER fabricates evidence.
 * It only cites anchors/discriminators that were already confirmed
 * as PRESENT (present: true) in the EvidenceReviewReport produced
 * when the case was first submitted. If no matching evidence exists
 * for a denial reason, it explicitly records that in `stillMissing`
 * rather than inventing a citation.
 */

import { PreAuthRecord } from '../components/PreAuthWizard/types';
import { EvidenceReviewReport } from './evidenceReview';
import { queryMedGemma } from '../services/llmClient';

// ─── Output Types ───────────────────────────────────────────────────────────

export interface CitedEvidenceItem {
  denialReason: string;
  evidenceItem: string;        // Exact .item text from EvidenceReviewReport
  source: 'anchor' | 'discriminator';
  forChallenge?: string;       // The TPA challenge this evidence addresses
}

export interface StillMissingItem {
  denialReason: string;
  explanation: string;         // Always: "No matching evidence found in existing report"
}

export interface DenialAppealResult {
  recordId: string;            // Links to the PreAuthRecord
  denialReasonsParsed: string[];
  citedEvidence: CitedEvidenceItem[];
  stillMissing: StillMissingItem[];
  addressedCount: number;      // Number of reasons with ≥1 cited evidence item
  totalReasons: number;
  priorityScore: number;       // claimValue × (addressedCount / totalReasons)
  appealText: string;          // Assembled from real cited evidence ONLY
  hindiTranslation?: string;
  machineTranslatedWarning?: true;  // Always true when hindiTranslation is present
  generatedAt: string;
  appealStatus: 'draft' | 'submitted' | 'resolved';
}

// ─── Keyword Extraction ──────────────────────────────────────────────────────

/**
 * Extract meaningful keywords from a denial reason sentence for matching
 * against evidence item text. Strips stop words, returns 3+ char tokens.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'and', 'for', 'that', 'with', 'this', 'are', 'was', 'has',
    'not', 'any', 'all', 'been', 'from', 'have', 'its', 'but', 'our',
    'their', 'they', 'will', 'would', 'could', 'should', 'does', 'did',
    'due', 'per', 'ref', 'claim', 'policy', 'patient', 'hospital', 'under'
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));
}

/**
 * Compute how many keywords from the denial reason appear in an evidence
 * item string. Returns a score 0–1.
 */
function keywordOverlapScore(denialReason: string, evidenceItem: string): number {
  const reasonKeywords = extractKeywords(denialReason);
  const evidenceLower = evidenceItem.toLowerCase();
  if (reasonKeywords.length === 0) return 0;
  const matched = reasonKeywords.filter(kw => evidenceLower.includes(kw));
  return matched.length / reasonKeywords.length;
}

// ─── Denial Reason Parser ────────────────────────────────────────────────────

/**
 * Splits a denial reason block (e.g. an EOB excerpt or TPA query text)
 * into individual parseable reason sentences.
 */
function parseDenialReasons(denialReasonText: string): string[] {
  // Split on sentence boundaries, numbered lists, or explicit delimiters
  const raw = denialReasonText
    .split(/(?:\n|\.(?=\s)|;\s*|\d+\.\s+)/)
    .map(s => s.trim())
    .filter(s => s.length > 15);   // Discard very short fragments

  // Deduplicate while preserving order
  const seen = new Set<string>();
  return raw.filter(r => {
    const key = r.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Core Generator ──────────────────────────────────────────────────────────

export async function generateDenialAppeal(
  denialReasonText: string,
  record: PreAuthRecord,
  existingReport: EvidenceReviewReport,
  options?: {
    includeHindi?: boolean;
  }
): Promise<DenialAppealResult> {

  const reasons = parseDenialReasons(denialReasonText);
  const claimValue = record.costEstimate?.amountClaimedFromInsurer ?? 0;

  const citedEvidence: CitedEvidenceItem[] = [];
  const stillMissing: StillMissingItem[] = [];
  const addressedReasonIds = new Set<number>();

  // Only work with evidence items the system already confirmed as PRESENT
  const presentEvidence = existingReport.requiredEvidence.filter(e => e.present);

  for (let i = 0; i < reasons.length; i++) {
    const reason = reasons[i];
    let bestScore = 0;
    let bestMatch: typeof presentEvidence[0] | null = null;

    for (const ev of presentEvidence) {
      const score = keywordOverlapScore(reason, ev.item);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = ev;
      }
    }

    const MATCH_THRESHOLD = 0.18; // At least ~1 in 5 keywords must overlap

    if (bestMatch && bestScore >= MATCH_THRESHOLD) {
      citedEvidence.push({
        denialReason: reason,
        evidenceItem: bestMatch.item,
        source: bestMatch.source,
        forChallenge: bestMatch.forChallenge
      });
      addressedReasonIds.add(i);
    } else {
      // No fabrication — record explicitly as still missing
      stillMissing.push({
        denialReason: reason,
        explanation:
          'No matching confirmed evidence found in the submitted pre-authorization report. ' +
          'This gap must be addressed with new documentation before the appeal can be fully supported.'
      });
    }
  }

  const addressedCount = addressedReasonIds.size;
  const totalReasons = reasons.length;
  const overturFraction = totalReasons > 0 ? addressedCount / totalReasons : 0;
  const priorityScore = Math.round(claimValue * overturFraction);

  // ── Assemble the appeal letter text ─────────────────────────────────────
  const selectedDx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
  const diagnosisName = selectedDx?.diagnosis ?? 'the stated condition';
  const icdCode = selectedDx?.icd10Code ?? 'pending';
  const patientName = record.patient?.patientName ?? 'the patient';
  const insurerName = record.insurance?.insurerName ?? 'the insurer';
  const tpaName = record.insurance?.tpaName ?? 'the TPA';
  const policyNumber = record.insurance?.policyNumber ?? '—';

  const citedParagraphs = citedEvidence.map((ce, idx) => {
    const sourceLabel = ce.source === 'anchor'
      ? 'clinical anchor'
      : 'discriminating clinical evidence';
    return `${idx + 1}. Regarding the denial reason: "${ce.denialReason}"\n   The pre-authorization record contains ${sourceLabel} confirming: "${ce.evidenceItem}".${ce.forChallenge ? `\n   This directly addresses the TPA's challenge: "${ce.forChallenge}".` : ''}`;
  }).join('\n\n');

  const missingParagraphs = stillMissing.length > 0
    ? `\nThe following denial reasons could not be addressed with documentation available at the time of initial submission and will require supplementary evidence:\n` +
      stillMissing.map((sm, idx) => `${idx + 1}. "${sm.denialReason}"\n   → ${sm.explanation}`).join('\n')
    : '';

  const appealText = `FORMAL GRIEVANCE APPEAL — Insurance Pre-Authorization Denial
Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}

To: ${tpaName} / ${insurerName}
Re: Policy No. ${policyNumber} | Patient: ${patientName}
Diagnosis: ${diagnosisName} (ICD-10: ${icdCode})
Pre-Auth Ref: ${record.id}

Dear Grievance Resolution Officer,

We write to formally appeal the denial of the above-referenced cashless authorization. The denial reasons cited in your Explanation of Benefits have been reviewed against the clinical and administrative evidence present in the original pre-authorization documentation.

EVIDENCE-CITED RESPONSE TO DENIAL REASONS
==========================================

${citedParagraphs || '(No denial reasons could be matched to existing clinical evidence — please attach supplementary clinical documentation.)'}
${missingParagraphs}

REGULATORY POSITION
===================
Per IRDAI Grievance Redressal Regulations, 2017, and the IRDAI Master Circular on Health Insurance (2024), the insurer is obligated to process appeals within 15 days of receipt. We request a full reversal of the denial decision on the above stated grounds.

We enclose all relevant supporting documentation. Should additional clinical information be required, the treating physician is available for a peer-to-peer consultation.

Evidence coverage: ${addressedCount} of ${totalReasons} denial reasons addressed with confirmed existing pre-authorization evidence.

Sincerely,
Hospital Insurance Desk
[Authorized Signatory & Hospital Seal]`;

  // ── Optional Hindi translation (second model call) ────────────────────────
  let hindiTranslation: string | undefined;
  let machineTranslatedWarning: true | undefined;

  if (options?.includeHindi) {
    try {
      const hindiSystemInstruction =
        `You are a medical document translator. Translate the following formal insurance appeal letter from English to Hindi. ` +
        `Preserve all proper nouns, ICD codes, policy numbers, and monetary amounts in their original form. ` +
        `Output ONLY the Hindi translation, no explanations.`;
      hindiTranslation = await queryMedGemma(appealText, hindiSystemInstruction);
      machineTranslatedWarning = true;
    } catch (err) {
      console.error('[denialAppealGenerator] Hindi translation failed:', err);
      // Silently skip — do not block the English appeal
    }
  }

  return {
    recordId: record.id,
    denialReasonsParsed: reasons,
    citedEvidence,
    stillMissing,
    addressedCount,
    totalReasons,
    priorityScore,
    appealText,
    ...(hindiTranslation !== undefined && {
      hindiTranslation,
      machineTranslatedWarning: true
    }),
    generatedAt: new Date().toISOString(),
    appealStatus: 'draft'
  };
}
