/**
 * readinessScore.ts
 *
 * Pure utility — no React, no side effects.
 * Computes the live Claim Readiness Score (0-100) and the associated
 * list of missing/gap items from a PreAuthRecord.
 *
 * This is the SINGLE source of truth for the score.  Both the persistent
 * ClaimReadinessRail and the DocumentsGenerateStep import from here.
 * Do NOT alter the deduction rules here — presentation only.
 */

import { PreAuthRecord, WizardDocument } from '../components/PreAuthWizard/types';
import { EvidenceReviewReport } from '../engine/evidenceReview';
import { getRequiredDocuments, isIcdMapped } from './documentRequirements';
import { validateCode } from '../services/icdService';
import { DocumentRequirement } from '../types';

export interface ReadinessMissingItem {
    text: string;
    deduction: number;
    step: 1 | 2 | 3 | 4;
}

export interface ReadinessResult {
    score: number;
    missingItems: ReadinessMissingItem[];
    hasInvalidICD: boolean;
    isSurgicalZeroCost: boolean;
    blockingGaps: string[];
    /** docs uploaded vs docs required */
    docsUploaded: number;
    docsRequired: number;
    needsManualReview?: boolean;
}

/**
 * computeReadiness — identical logic to what was in DocumentsGenerateStep.
 * Accepts the parts of the record needed so it can be called from anywhere.
 */
export function computeReadiness(
    record: Partial<PreAuthRecord>,
    tpaReport: EvidenceReviewReport | null
): ReadinessResult {
    const docs = record.uploadedDocuments ?? [];
    const selectedDx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
    const icdCode = selectedDx?.icd10Code ?? '';
    const requiredDocs: DocumentRequirement[] = getRequiredDocuments(selectedDx?.icd10Code ?? selectedDx?.diagnosis ?? '');

    const hasInvalidICD = !icdCode || icdCode === 'Pending ICD-10' || icdCode === 'Selection required' || !validateCode(icdCode);
    const isSurgical = record.clinical?.proposedLineOfTreatment?.surgical || false;
    const isSurgicalZeroCost = isSurgical &&
        (record.costEstimate?.otCharges ?? 0) === 0 &&
        (record.costEstimate?.surgeonFee ?? 0) === 0 &&
        (record.costEstimate?.totalImplantsCost ?? 0) === 0;

    const blockingGaps = [
        !record.patient?.patientName ? 'Patient Name is required.' : null,
        !selectedDx?.diagnosis ? 'Diagnosis is required.' : null,
        hasInvalidICD ? 'A confirmed, valid ICD-10 code is required.' : null,
        !record.declarations?.doctor?.doctorRegistrationNumber ? 'Doctor Registration Number is required.' : null,
        !record.admission?.dateOfAdmission ? 'Date of Admission is required.' : null,
        isSurgicalZeroCost ? 'Surgical procedure requires Surgeon Fee, OT Charges, or Implants Cost to be non-zero.' : null,
    ].filter(Boolean) as string[];

    let val = 100;
    const missingItems: ReadinessMissingItem[] = [];

    // 1. Data gaps (15 pts each)
    if (!record.patient?.patientName) {
        val -= 15;
        missingItems.push({ text: 'Patient Name is required', deduction: 15, step: 1 });
    }
    if (!selectedDx?.diagnosis) {
        val -= 15;
        missingItems.push({ text: 'Diagnosis is required', deduction: 15, step: 2 });
    }
    if (hasInvalidICD) {
        val -= 15;
        missingItems.push({ text: 'A confirmed WHO ICD-10 code is required', deduction: 15, step: 2 });
    }
    if (!record.declarations?.doctor?.doctorRegistrationNumber) {
        val -= 15;
        missingItems.push({ text: 'Treating Doctor Registration Number is required', deduction: 15, step: 2 });
    }
    if (!record.admission?.dateOfAdmission) {
        val -= 15;
        missingItems.push({ text: 'Date of Admission is required', deduction: 15, step: 3 });
    }
    if (isSurgicalZeroCost) {
        val -= 15;
        missingItems.push({ text: 'Surgical case requires OT / Surgeon Fee', deduction: 15, step: 3 });
    }

    // 2. Required diagnostic files (10 pts each)
    requiredDocs.forEach(req => {
        const uploaded = docs.find(d => d.documentCategory === req.category);
        if (req.isRequired && !uploaded) {
            val -= 10;
            missingItems.push({ text: `Missing file: ${req.displayName}`, deduction: 10, step: 4 });
        }
    });

    // 3. Ungrounded clinical gaps from pre-audit engine (10 pts each)
    if (tpaReport?.insufficientEvidence) {
        tpaReport.insufficientEvidence.forEach(gap => {
            val -= 10;
            missingItems.push({ text: `Clinical query gap: ${gap}`, deduction: 10, step: 2 });
        });
    }

    // 4. Minor warnings/expiry/blurry files (5 pts each)
    docs.forEach(d => {
        if (d.duplicateWarning) {
            val -= 5;
            missingItems.push({ text: `Duplicate document: ${d.fileName}`, deduction: 5, step: 4 });
        }
        if (d.expiryWarning) {
            val -= 5;
            missingItems.push({ text: `Expired policy document: ${d.fileName}`, deduction: 5, step: 4 });
        }
        if (d.readabilityWarning) {
            val -= 5;
            missingItems.push({ text: `Blurry document: ${d.fileName}`, deduction: 5, step: 4 });
        }
    });

    const isMapped = isIcdMapped(selectedDx?.icd10Code ?? selectedDx?.diagnosis ?? '');
    const needsManualReview = !isMapped;

    if (needsManualReview) {
        val -= 60;
        missingItems.push({ text: 'Needs Manual Review: No document requirement mapping exists for this condition', deduction: 60, step: 4 });
    }

    const docsRequired = requiredDocs.filter(r => r.isRequired).length;
    const docsUploaded = requiredDocs.filter(r => r.isRequired && docs.some(d => d.documentCategory === r.category)).length;

    return {
        score: Math.max(0, Math.min(100, val)),
        missingItems,
        hasInvalidICD,
        isSurgicalZeroCost,
        blockingGaps,
        docsUploaded,
        docsRequired,
        needsManualReview,
    };
}

/** Returns a one-line human summary of the score state for the rail. */
export function readinessStatusLine(score: number, missingCount: number): string {
    if (score >= 95) return 'Ready to submit';
    if (score >= 80) return `Almost ready — resolve ${missingCount} item${missingCount !== 1 ? 's' : ''}`;
    if (score >= 50) return `Requires action — ${missingCount} gap${missingCount !== 1 ? 's' : ''} to fix`;
    return `Critical gaps — ${missingCount} blocking issue${missingCount !== 1 ? 's' : ''}`;
}

/** Score → status color token */
export function scoreColorClass(score: number): {
    stroke: string;
    text: string;
    bg: string;
    border: string;
    label: string;
} {
    if (score >= 80) return {
        stroke: '#22c55e',
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        label: 'Highly Submittable',
    };
    if (score >= 50) return {
        stroke: '#f59e0b',
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        label: 'Requires Action',
    };
    return {
        stroke: '#ef4444',
        text: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        label: 'Critical Gaps',
    };
}
