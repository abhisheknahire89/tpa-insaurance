/**
 * ClaimReadinessRail.tsx
 *
 * Redesigned persistent right rail (desktop/mobile collapse)
 * Shows:
 *   1. Claim Readiness Score ring (refined SVG, live-updating, status pill)
 *   2. TPA Queries list — phrased as "reviewer question + fix"
 *   3. Missing summary chips (docs X/Y, ICD status)
 *
 * PRESENTATION ONLY — reads from existing engine outputs.
 * No logic, score computation, or engine changes here.
 */

import React, { useState } from 'react';
import { PreAuthRecord } from './types';
import { EvidenceReviewReport } from '../../engine/evidenceReview';
import { computeReadiness, readinessStatusLine, scoreColorClass } from '../../utils/readinessScore';

interface ClaimReadinessRailProps {
    record: Partial<PreAuthRecord>;
    tpaReport: EvidenceReviewReport | null;
    tpaLoading: boolean;
    onJumpToStep?: (step: 1 | 2 | 3 | 4) => void;
    mode: 'desktop' | 'mobile';
}

// ── Score Ring ──────────────────────────────────────────────────────────────

const RING_R = 40;
const RING_CX = 48;
const RING_CY = 48;
const RING_SIZE = 96;
const CIRCUMFERENCE = 2 * Math.PI * RING_R; // ≈ 251.3

function ScoreRing({ score }: { score: number }) {
    const colors = scoreColorClass(score);
    const offset = CIRCUMFERENCE - (CIRCUMFERENCE * score) / 100;

    return (
        <div className="flex flex-col items-center">
            <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
                <svg
                    width={RING_SIZE}
                    height={RING_SIZE}
                    style={{ transform: 'rotate(-90deg)' }}
                    viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                >
                    {/* Track */}
                    <circle
                        cx={RING_CX} cy={RING_CY} r={RING_R}
                        fill="none"
                        stroke="rgba(255,255,255,0.03)"
                        strokeWidth={6}
                    />
                    {/* Progress arc */}
                    <circle
                        cx={RING_CX} cy={RING_CY} r={RING_R}
                        fill="none"
                        stroke={colors.stroke}
                        strokeWidth={6}
                        strokeLinecap="round"
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.4s' }}
                    />
                </svg>
                {/* Center content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span
                        className="font-bold tabular-nums leading-none tracking-tight text-white/95"
                        style={{ fontSize: 24, color: colors.stroke, transition: 'color 0.4s' }}
                    >
                        {score}
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
                        / 100
                    </span>
                </div>
            </div>
        </div>
    );
}

// ── Query item ───────────────────────────────────────────────────────────────

interface QueryItemProps {
    query: string;
    reason: string;
    severity: 'high' | 'medium' | 'low';
    source: 'rule' | 'suggestion';
}

const QueryItem: React.FC<QueryItemProps> = ({ query, reason, severity, source }) => {
    const isRule = source === 'rule';
    let borderColor = 'border-l-slate-700 bg-slate-900/10';
    let labelText = 'Clinical Advisory';
    let labelStyle = 'bg-slate-500/10 text-slate-400 border-slate-500/20';

    if (isRule) {
        if (severity === 'high') {
            borderColor = 'border-l-rose-500 bg-rose-500/[0.02] border-rose-500/10';
            labelText = 'High Risk Query';
            labelStyle = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
        } else {
            borderColor = 'border-l-amber-500 bg-amber-500/[0.02] border-amber-500/10';
            labelText = 'Medium Risk Query';
            labelStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        }
    }

    return (
        <div className={`border-l-2 rounded-r-lg p-3 text-xs leading-normal ${borderColor} border-y border-r border-white/5 space-y-1.5 shadow-sm`}>
            <div className="flex items-center justify-between">
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${labelStyle}`}>
                    {labelText}
                </span>
            </div>
            <p className="text-xs font-semibold text-white/90 leading-snug">
                {query}
            </p>
            {reason && (
                <div className="text-[10px] text-slate-400 leading-snug pl-1 border-l border-white/5 font-medium">
                    Fix: {reason}
                </div>
            )}
        </div>
    );
};

// ── Missing chips ────────────────────────────────────────────────────────────

function MissingChip({ label, ok }: { label: string; ok: boolean }) {
    return (
        <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                ok
                    ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
                    : 'bg-rose-500/5 border-rose-500/10 text-rose-400'
            }`}
        >
            <span>{ok ? '✓' : '✗'}</span>
            {label}
        </span>
    );
}

// ── Main Rail ────────────────────────────────────────────────────────────────

export const ClaimReadinessRail: React.FC<ClaimReadinessRailProps> = ({
    record,
    tpaReport,
    tpaLoading,
    onJumpToStep,
    mode,
}) => {
    const [mobileOpen, setMobileOpen] = useState(false);

    const { score, missingItems, hasInvalidICD, docsUploaded, docsRequired, needsManualReview } = computeReadiness(record, tpaReport);

    // Merge missingInfo from TPA policy report (Task 3)
    const allMissingItems = [...missingItems];
    if (tpaReport && (tpaReport as any).missingInfo) {
        (tpaReport as any).missingInfo.forEach((info: string) => {
            if (!allMissingItems.some(item => item.text.includes(info))) {
                allMissingItems.push({
                    text: `Policy: ${info}`,
                    deduction: 10,
                    step: 4
                });
            }
        });
    }

    const policyDeductionCount = allMissingItems.length - missingItems.length;
    const finalScore = Math.max(0, score - (policyDeductionCount * 10));
    const colors = scoreColorClass(finalScore);
    const statusLine = readinessStatusLine(finalScore, allMissingItems.length);

    // Queries sorted high → medium → low, rules before suggestions
    const queries = [...(tpaReport?.anticipatedQueries ?? [])].sort((a, b) => {
        const sev = { high: 0, medium: 1, low: 2 };
        if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
        if (a.source !== b.source) return a.source === 'rule' ? -1 : 1;
        return 0;
    });

    const railContent = (
        <div className="flex flex-col gap-5">
            {/* ── Score Ring + Status ──────────────────────────────── */}
            <div
                className="rounded-xl p-4 bg-slate-900/15 border border-white/5 flex flex-col items-center gap-3 shadow-md shadow-black/10"
            >
                <ScoreRing score={finalScore} />
                {/* Status label */}
                <span
                    className={`text-[9px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}
                    style={{ transition: 'all 0.4s' }}
                >
                    {colors.label}
                </span>
                {/* One-line status */}
                <p className="text-[11px] text-center font-medium text-slate-400 leading-normal max-w-[200px]">
                    {statusLine}
                </p>

                {needsManualReview && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] rounded px-3 py-1.5 text-center font-bold tracking-wider uppercase max-w-full">
                        ⚠️ Needs Manual Review
                    </div>
                )}

                {/* Missing chips */}
                <div className="flex flex-wrap gap-1.5 mt-1 justify-center">
                    <MissingChip label={`Docs ${docsUploaded}/${docsRequired}`} ok={docsUploaded >= docsRequired} />
                    <MissingChip label="ICD-10" ok={!hasInvalidICD} />
                </div>
            </div>

            {/* ── Queries ─────────────────────────────────────────── */}
            <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Open Queries {queries.length > 0 && <span className="text-slate-500 font-mono text-[9px] ml-1">({queries.length})</span>}
                </div>

                {tpaLoading ? (
                    /* Calm loading — pulsing dots, no spinner */
                    <div className="flex items-center gap-2 py-3 px-1">
                        <div className="flex gap-1">
                            {[0, 1, 2].map(i => (
                                <span
                                    key={i}
                                    className="pulse-dot inline-block w-1 h-1 rounded-full bg-slate-400"
                                />
                            ))}
                        </div>
                        <span className="text-xs text-slate-400 font-medium">
                            Reviewing case…
                        </span>
                    </div>
                ) : queries.length === 0 ? (
                    <div
                        className="rounded-lg p-3.5 text-xs font-semibold text-emerald-400 bg-emerald-500/[0.03] border border-emerald-500/10 text-center"
                    >
                        ✓ Ready. No open queries anticipated.
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                        {queries.map((q, i) => (
                            <QueryItem
                                key={i}
                                query={q.query}
                                reason={q.reason}
                                severity={q.severity}
                                source={q.source}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Gap Checklist ────────────────────────────────────── */}
            {allMissingItems.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        What to Fix
                    </div>
                    <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                        {allMissingItems.slice(0, 8).map((item, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => onJumpToStep && onJumpToStep(item.step)}
                                className="w-full text-left flex items-start gap-2.5 rounded-lg p-2.5 border border-white/5 bg-slate-900/10 hover:border-slate-700/50 hover:bg-slate-900/20 transition-all duration-150 group"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-slate-200 group-hover:text-white leading-normal">
                                        {item.text}
                                    </div>
                                    {onJumpToStep && (
                                        <div className="text-[9px] font-bold text-blue-400 group-hover:text-blue-300 mt-1">
                                            Fix on Step {item.step} →
                                        </div>
                                    )}
                                </div>
                                <span className="text-[9px] font-extrabold text-rose-400/90 bg-rose-500/10 border border-rose-500/15 px-1 py-0.5 rounded shrink-0">
                                    -{item.deduction}
                                </span>
                            </button>
                        ))}
                        {allMissingItems.length > 8 && (
                            <p className="text-[10px] text-center text-slate-500 font-medium">
                                +{allMissingItems.length - 8} more items to address
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    if (mode === 'desktop') {
        return (
            <aside
                className="hidden lg:flex flex-col overflow-y-auto w-[280px] shrink-0 bg-slate-950/20 border-l border-white/5 py-5 px-4 shadow-[inset_1px_0_0_rgba(255,255,255,0.03)] gap-4 h-full"
            >
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/5 pb-2.5">
                    Claim Readiness
                </div>
                {railContent}
            </aside>
        );
    }

    return (
        <div
            className="lg:hidden bg-slate-950/20 border-t border-white/5"
        >
            <button
                type="button"
                onClick={() => setMobileOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3"
            >
                <div className="flex items-center gap-2">
                    <span
                        className="text-xs font-bold font-mono"
                        style={{ color: scoreColorClass(finalScore).stroke }}
                    >
                        {finalScore}
                    </span>
                    <span className="text-xs font-bold text-slate-300">
                        Claim Readiness
                    </span>
                    {allMissingItems.length > 0 && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/15">
                            {allMissingItems.length} gap{allMissingItems.length !== 1 ? 's' : ''}
                        </span>
                    )}
                    {needsManualReview && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/10 uppercase tracking-wider">
                            ⚠️ Needs Review
                        </span>
                    )}
                </div>
                <span
                    className="text-[10px] text-slate-500 transition-transform duration-200"
                    style={{ transform: mobileOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                >
                    ▼
                </span>
            </button>
            {mobileOpen && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3">
                    {railContent}
                </div>
            )}
        </div>
    );
};
