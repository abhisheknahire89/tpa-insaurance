/**
 * CaseWorkspace.tsx
 *
 * Composed view — NOT a new screen from scratch.
 * Left column: uploaded document list + evidence highlights (supporting vs contradicting)
 * Right rail:  (a) readiness score ring, (b) missing items checklist,
 *              (c) suggested ICD billing codes with cost, (d) eligibility indicator
 * Header bar:  case ID, patient name, diagnosis, overall status pill
 *
 * Visual rules: follows scoreColorClass() convention from utils/readinessScore.ts.
 * No new color system is introduced.
 */

import React, { useEffect, useState } from 'react';
import { PreAuthRecord } from '../PreAuthWizard/types';
import { computeReadiness, scoreColorClass, readinessStatusLine } from '../../utils/readinessScore';
import { priorAuthOrchestrator, ExtendedEvidenceReviewReport } from '../../engine/priorAuthWorkflow';
import { runBillingCodingWorkflow, BillingInput } from '../../engine/billingCoder';
import type { BillingCodingOutput } from '../../services/geminiService';

// ── tiny re-usable ring (lifted from ClaimReadinessRail) ──────────────────────

const RING_R = 36;
const RING_CX = 44;
const RING_CY = 44;
const RING_SIZE = 88;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

function ScoreRing({ score }: { score: number }) {
    const colors = scoreColorClass(score);
    const offset = CIRCUMFERENCE - (CIRCUMFERENCE * score) / 100;
    return (
        <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: 'rotate(-90deg)' }}
                viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                <circle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none"
                    stroke="rgba(255,255,255,0.03)" strokeWidth={5} />
                <circle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none"
                    stroke={colors.stroke} strokeWidth={5} strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-bold tabular-nums leading-none"
                    style={{ fontSize: 20, color: colors.stroke }}>{score}</span>
                <span className="text-[7px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">/100</span>
            </div>
        </div>
    );
}

// ── evidence highlight card ───────────────────────────────────────────────────

interface HighlightCardProps {
    excerpt: string;
    relatedRule: string;
    sourceDocument: string;
    supportsOrContradicts: 'supports' | 'contradicts';
}

const HighlightCard: React.FC<HighlightCardProps> = ({ excerpt, relatedRule, sourceDocument, supportsOrContradicts }) => {
    const isSupport = supportsOrContradicts === 'supports';
    // Use the existing app convention: emerald for supporting, red for gaps
    return (
        <div className={`border rounded-xl p-3.5 space-y-2 border-l-4 ${
            isSupport
                ? 'border-l-emerald-500 bg-emerald-500/[0.015] border-y border-r border-white/5'
                : 'border-l-red-500 bg-red-500/[0.015] border-y border-r border-white/5'
        }`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                    isSupport
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                    {isSupport ? 'Supports Admission' : 'Contradicts / Gap'}
                </span>
                <span className="text-[9px] font-mono text-slate-500 truncate max-w-[160px]">{sourceDocument}</span>
            </div>
            {/* Actual substring extracted from the document — never placeholder */}
            <blockquote className="text-xs italic text-white/85 bg-black/20 border border-white/[0.04] rounded-lg px-3 py-2 leading-relaxed">
                "{excerpt}"
            </blockquote>
            <div className="text-[9px] text-slate-500 font-semibold flex items-center gap-1">
                <span className="text-slate-600">Rule:</span>
                <span className="text-slate-300 font-bold">{relatedRule}</span>
            </div>
        </div>
    );
};

// ── ICD billing tag ───────────────────────────────────────────────────────────

interface IcdTagProps {
    code: string;
    description: string;
    estimatedCost?: number;
    confidence: 'high' | 'medium' | 'low';
}

const IcdTag: React.FC<IcdTagProps> = ({ code, description, estimatedCost, confidence }) => {
    const confColor = confidence === 'high'
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        : confidence === 'medium'
        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        : 'bg-slate-500/10 border-slate-500/20 text-slate-400';

    return (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-slate-900/15 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[10px] font-bold text-blue-400 shrink-0">{code}</span>
                <span className="text-[10px] text-slate-300 truncate">{description}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
                {estimatedCost != null && (
                    <span className="text-[9px] font-bold text-white/80 font-mono">
                        ₹{estimatedCost.toLocaleString('en-IN')}
                    </span>
                )}
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${confColor}`}>
                    {confidence}
                </span>
            </div>
        </div>
    );
};

// ── eligibility pill ─────────────────────────────────────────────────────────

type EligibilityType = 'cashless' | 'reimbursement' | 'needs_verification';

const ELIG_CONFIG: Record<EligibilityType, { label: string; text: string; bg: string; border: string; icon: string }> = {
    cashless: {
        label: 'Cashless Eligible',
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        icon: '✓',
    },
    reimbursement: {
        label: 'Reimbursement Only',
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        icon: '⚠',
    },
    needs_verification: {
        label: 'Needs Verification',
        text: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        icon: '!',
    },
};

// ── overall status pill (header bar) ─────────────────────────────────────────

function StatusPill({ score }: { score: number }) {
    const colors = scoreColorClass(score);
    return (
        <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border ${colors.bg} ${colors.text} ${colors.border}`}>
            {score >= 80 ? '● Under Final Review' : score >= 50 ? '● Under AI Review' : '● Action Required'}
        </span>
    );
}

// ── main component ────────────────────────────────────────────────────────────

interface CaseWorkspaceProps {
    record: PreAuthRecord;
    onBack: () => void;
}

export const CaseWorkspace: React.FC<CaseWorkspaceProps> = ({ record, onBack }) => {
    const [tpaReport, setTpaReport] = useState<ExtendedEvidenceReviewReport | null>(
        record.tpaEvidenceReview ?? null
    );
    const [tpaLoading, setTpaLoading] = useState(!record.tpaEvidenceReview);
    const [billingOutput, setBillingOutput] = useState<BillingCodingOutput | null>(null);
    const [billingLoading, setBillingLoading] = useState(false);

    const selectedDx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
    const diagnosisText = selectedDx?.diagnosis ?? '—';
    const icdCode = selectedDx?.icd10Code ?? '';

    // Load TPA review if not already cached
    useEffect(() => {
        if (record.tpaEvidenceReview) return;
        let alive = true;
        setTpaLoading(true);
        priorAuthOrchestrator(record.uploadedDocuments || [], record)
            .then(r => { if (alive) setTpaReport(r); })
            .catch(e => console.error('[CaseWorkspace] TPA review error:', e))
            .finally(() => { if (alive) setTpaLoading(false); });
        return () => { alive = false; };
    }, [record]);

    // Run billing coder once we have a diagnosis
    useEffect(() => {
        if (!diagnosisText || diagnosisText === '—' || billingOutput || billingLoading) return;
        let alive = true;
        setBillingLoading(true);
        const clinicalNote = [
            diagnosisText,
            record.clinical?.chiefComplaints ?? '',
            record.clinical?.historyOfPresentIllness ?? '',
            record.clinical?.relevantClinicalFindings ?? '',
        ].join('. ');

        const input: BillingInput = {
            clinicalNote,
            insurerName: record.insurance?.insurerName ?? 'Unknown',
            sumInsured: record.insurance?.sumInsured ?? 500000,
            wardType: (['ICU', 'ICCU', 'NICU'].includes(record.admission?.roomCategory ?? '')
                ? 'ICU'
                : record.admission?.roomCategory === 'General Ward' ? 'General'
                : record.admission?.roomCategory === 'Semi-Private' ? 'Semi-Private'
                : 'Private') as BillingInput['wardType'],
            requestedAmount: record.costEstimate?.totalEstimatedCost ?? 0,
        };

        runBillingCodingWorkflow(input)
            .then(o => { if (alive) setBillingOutput(o); })
            .catch(e => console.error('[CaseWorkspace] Billing error:', e))
            .finally(() => { if (alive) setBillingLoading(false); });
        return () => { alive = false; };
    }, [diagnosisText]);

    // Determine eligibility from billing output + policy data
    const eligibility: EligibilityType = (() => {
        if (!record.insurance?.policyNumber) return 'needs_verification';
        const cashlessApproved = billingOutput?.cashlessApproved ?? 0;
        const total = record.costEstimate?.totalEstimatedCost ?? 0;
        if (total === 0 || !billingOutput) return 'needs_verification';
        if (billingOutput.scrubbingStatus === 'Warnings' && (billingOutput.validationWarnings?.length ?? 0) > 2)
            return 'reimbursement';
        if (cashlessApproved > 0) return 'cashless';
        return 'needs_verification';
    })();

    const eligCfg = ELIG_CONFIG[eligibility];

    const { score, missingItems, hasInvalidICD, docsUploaded, docsRequired } = computeReadiness(record, tpaReport);
    const colors = scoreColorClass(score);
    const statusLine = readinessStatusLine(score, missingItems.length);

    // Evidence highlights from tpaReport
    const evidenceHighlights: any[] = (tpaReport as any)?.evidenceHighlights ?? [];
    const supportHighlights = evidenceHighlights.filter(h => h.supportsOrContradicts === 'supports');
    const contradictHighlights = evidenceHighlights.filter(h => h.supportsOrContradicts !== 'supports');

    // Suggested ICD codes + CPT codes from billing output
    const suggestedCodes: Array<{ code: string; description: string; cost?: number; confidence: 'high' | 'medium' | 'low' }> = [];
    if (billingOutput) {
        if (billingOutput.primaryICD10) {
            suggestedCodes.push({
                code: billingOutput.primaryICD10,
                description: billingOutput.primaryDescription,
                confidence: 'high',
            });
        }
        (billingOutput.secondaryICD10 ?? []).forEach(s => {
            suggestedCodes.push({ code: s.code, description: s.description, confidence: 'medium' });
        });
        (billingOutput.suggestedCPT ?? []).forEach(c => {
            suggestedCodes.push({ code: c.code, description: c.description, cost: c.estimatedRate, confidence: 'medium' });
        });
    } else if (icdCode && !hasInvalidICD) {
        suggestedCodes.push({
            code: icdCode,
            description: selectedDx?.icd10Description || diagnosisText,
            cost: record.costEstimate?.totalEstimatedCost,
            confidence: 'high',
        });
    }

    return (
        <div className="flex flex-col h-full min-h-screen bg-gray-950">
            {/* ── Header bar ────────────────────────────────────────────────── */}
            <div className="shrink-0 border-b border-white/5 bg-slate-950/40 backdrop-blur-sm px-4 py-3 flex items-center gap-3 flex-wrap">
                {/* Back affordance */}
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg border border-white/5 hover:border-white/15 hover:bg-white/5 shrink-0"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Case List
                </button>

                <div className="w-px h-4 bg-white/10 shrink-0" />

                {/* Case meta */}
                <div className="flex items-center gap-3 flex-1 flex-wrap min-w-0">
                    <span className="font-mono text-[10px] text-blue-400 font-bold shrink-0">{record.id}</span>
                    <span className="text-sm font-semibold text-white truncate">{record.patient?.patientName || '—'}</span>
                    <div className="w-px h-3 bg-white/10 shrink-0" />
                    <span className="text-xs text-slate-400 truncate max-w-[200px]">{diagnosisText}</span>
                    {icdCode && !hasInvalidICD && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 shrink-0">
                            {icdCode}
                        </span>
                    )}
                </div>

                {/* Overall status pill */}
                <StatusPill score={score} />
            </div>

            {/* ── Body: two-column layout ───────────────────────────────────── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* ── LEFT: Documents + Evidence Highlights ─────────────────── */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">

                    {/* Uploaded documents */}
                    <section>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/5 pb-2 mb-3">
                            Uploaded Documents ({record.uploadedDocuments?.length ?? 0})
                        </div>
                        {(record.uploadedDocuments?.length ?? 0) === 0 ? (
                            <div className="text-xs text-slate-500 font-medium py-4 text-center border border-dashed border-white/5 rounded-xl">
                                No documents uploaded
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {record.uploadedDocuments.map(doc => (
                                    <div key={doc.id}
                                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-900/15 px-3 py-2.5">
                                        <span className="text-base shrink-0">{doc.fileType === 'pdf' ? '📄' : '🖼️'}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold text-white/90 truncate">{doc.fileName}</div>
                                            <div className="text-[9px] text-slate-500 font-medium">{doc.documentCategory.replace(/_/g, ' ')} · {doc.fileSizeDisplay}</div>
                                            {doc.duplicateWarning && (
                                                <div className="text-[9px] text-red-400 font-bold mt-0.5">{doc.duplicateWarning}</div>
                                            )}
                                            {doc.expiryWarning && (
                                                <div className="text-[9px] text-red-400 font-bold mt-0.5">{doc.expiryWarning}</div>
                                            )}
                                            {doc.readabilityWarning && (
                                                <div className="text-[9px] text-amber-400 font-bold mt-0.5">{doc.readabilityWarning}</div>
                                            )}
                                        </div>
                                        {doc.readabilityConfidence != null && (
                                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${
                                                doc.readabilityConfidence >= 80
                                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                    : doc.readabilityConfidence >= 50
                                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                                            }`}>
                                                OCR {doc.readabilityConfidence}%
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Evidence highlights */}
                    <section>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/5 pb-2 mb-3">
                            Evidence Highlights
                            {tpaLoading && (
                                <span className="ml-2 text-slate-600 normal-case font-normal">— running review…</span>
                            )}
                        </div>

                        {tpaLoading ? (
                            <div className="flex items-center gap-2 py-6 px-3">
                                <div className="flex gap-1">
                                    {[0, 1, 2].map(i => (
                                        <span key={i} className="pulse-dot inline-block w-1 h-1 rounded-full bg-slate-400" />
                                    ))}
                                </div>
                                <span className="text-xs text-slate-400 font-medium">Running Aivana review…</span>
                            </div>
                        ) : evidenceHighlights.length === 0 ? (
                            <div className="text-xs text-slate-500 font-medium py-4 text-center border border-dashed border-white/5 rounded-xl">
                                {record.uploadedDocuments?.length
                                    ? 'No evidence highlights extracted. Upload richer documents to see verbatim excerpts.'
                                    : 'Upload documents for AI evidence extraction.'}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Supporting first */}
                                {supportHighlights.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                                            Supporting Evidence ({supportHighlights.length})
                                        </div>
                                        {supportHighlights.map((h, i) => (
                                            <HighlightCard key={`sup-${i}`} {...h} supportsOrContradicts="supports" />
                                        ))}
                                    </div>
                                )}
                                {/* Contradicting / gaps */}
                                {contradictHighlights.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-red-400">
                                            Gaps & Contradictions ({contradictHighlights.length})
                                        </div>
                                        {contradictHighlights.map((h, i) => (
                                            <HighlightCard key={`con-${i}`} {...h} supportsOrContradicts="contradicts" />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>

                {/* ── RIGHT RAIL ────────────────────────────────────────────── */}
                <aside className="hidden lg:flex flex-col w-[292px] shrink-0 overflow-y-auto border-l border-white/5 bg-slate-950/20 px-4 py-5 gap-5 custom-scrollbar shadow-[inset_1px_0_0_rgba(255,255,255,0.03)]">

                    {/* (a) Readiness score */}
                    <section>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-2.5 border-b border-white/5 mb-3">
                            Claim Readiness
                        </div>
                        <div className="rounded-xl p-4 bg-slate-900/15 border border-white/5 flex flex-col items-center gap-2.5 shadow-sm shadow-black/10">
                            <ScoreRing score={score} />
                            <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider border ${colors.bg} ${colors.text} ${colors.border}`}>
                                {colors.label}
                            </span>
                            <p className="text-[10px] text-center font-medium text-slate-400 leading-normal max-w-[200px]">
                                {statusLine}
                            </p>
                            {/* Quick chips */}
                            <div className="flex flex-wrap gap-1.5 mt-1 justify-center">
                                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                                    docsUploaded >= docsRequired
                                        ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
                                        : 'bg-red-500/5 border-red-500/10 text-red-400'
                                }`}>
                                    {docsUploaded >= docsRequired ? '✓' : '✗'} Docs {docsUploaded}/{docsRequired}
                                </span>
                                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                                    !hasInvalidICD
                                        ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
                                        : 'bg-red-500/5 border-red-500/10 text-red-400'
                                }`}>
                                    {!hasInvalidICD ? '✓' : '✗'} ICD-10
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* (b) Missing items checklist */}
                    {missingItems.length > 0 && (
                        <section>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-2.5 border-b border-white/5 mb-3">
                                What to Fix ({missingItems.length})
                            </div>
                            <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-0.5">
                                {missingItems.slice(0, 8).map((item, idx) => (
                                    <div key={idx}
                                        className="flex items-start gap-2 rounded-lg p-2.5 border border-white/5 bg-slate-900/10">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-1.5" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold text-slate-200 leading-normal">{item.text}</div>
                                        </div>
                                        <span className="text-[9px] font-extrabold text-red-400/90 bg-red-500/10 border border-red-500/15 px-1 py-0.5 rounded shrink-0">
                                            -{item.deduction}
                                        </span>
                                    </div>
                                ))}
                                {missingItems.length > 8 && (
                                    <p className="text-[10px] text-center text-slate-500 font-medium">
                                        +{missingItems.length - 8} more to address
                                    </p>
                                )}
                            </div>
                        </section>
                    )}

                    {/* (c) Suggested ICD codes with cost */}
                    <section>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-2.5 border-b border-white/5 mb-3">
                            Billing Codes & Cost
                        </div>
                        {billingLoading ? (
                            <div className="flex items-center gap-2 py-3">
                                <div className="flex gap-1">
                                    {[0, 1, 2].map(i => (
                                        <span key={i} className="pulse-dot inline-block w-1 h-1 rounded-full bg-slate-400" />
                                    ))}
                                </div>
                                <span className="text-xs text-slate-400 font-medium">Running billing coder…</span>
                            </div>
                        ) : suggestedCodes.length === 0 ? (
                            <div className="text-xs text-slate-500 font-medium py-3 text-center border border-dashed border-white/5 rounded-xl">
                                No codes available — add a diagnosis to generate billing suggestions.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                {suggestedCodes.slice(0, 6).map((c, i) => (
                                    <IcdTag key={i} code={c.code} description={c.description}
                                        estimatedCost={c.cost} confidence={c.confidence} />
                                ))}
                                {billingOutput?.cashlessApproved != null && (
                                    <div className="mt-2 rounded-lg border border-white/5 bg-slate-900/15 px-3 py-2.5 flex justify-between items-center">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Cashless Approved Est.</span>
                                        <span className="font-mono text-xs font-bold text-emerald-400">
                                            ₹{billingOutput.cashlessApproved.toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                )}
                                {billingOutput?.patientShare != null && (
                                    <div className="rounded-lg border border-white/5 bg-slate-900/15 px-3 py-2.5 flex justify-between items-center">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Patient Share Est.</span>
                                        <span className="font-mono text-xs font-bold text-amber-400">
                                            ₹{billingOutput.patientShare.toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Validation warnings from billing scrubber */}
                        {(billingOutput?.validationWarnings?.length ?? 0) > 0 && (
                            <div className="mt-2 space-y-1.5">
                                {billingOutput!.validationWarnings.slice(0, 3).map((w, i) => (
                                    <div key={i} className="text-[9px] text-amber-400 font-semibold bg-amber-500/5 border border-amber-500/10 rounded-lg px-2.5 py-1.5 leading-snug">
                                        ⚠ {w}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* (d) Eligibility indicator */}
                    <section>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-2.5 border-b border-white/5 mb-3">
                            Eligibility Status
                        </div>
                        <div className={`rounded-xl border px-4 py-3.5 flex items-center gap-3 ${eligCfg.bg} ${eligCfg.border}`}>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${eligCfg.text} ${eligCfg.border}`}>
                                {eligCfg.icon}
                            </span>
                            <div>
                                <div className={`text-xs font-bold ${eligCfg.text}`}>{eligCfg.label}</div>
                                <div className="text-[9px] text-slate-500 font-medium mt-0.5">
                                    {eligibility === 'cashless'
                                        ? 'Claim can be processed as cashless'
                                        : eligibility === 'reimbursement'
                                        ? 'Patient to pay upfront; submit for reimbursement'
                                        : 'Policy / billing data insufficient for determination'}
                                </div>
                            </div>
                        </div>
                    </section>

                </aside>
            </div>
        </div>
    );
};
