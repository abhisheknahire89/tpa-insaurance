/**
 * components/PostSubmission/DenialQueue.tsx
 *
 * Live Denial Queue — shows IndexedDB denied pre-auth records sorted by
 * priority score (claim value × evidence coverage fraction).
 *
 * Evidence coverage is shown as "3 of 4 reasons addressed with existing
 * evidence" — never a bare percentage or fabricated ML confidence score.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    ShieldAlert, AlertTriangle, FileText, CheckCircle, XCircle,
    RefreshCw, Send, Languages, ChevronRight, BadgeAlert, BadgeCheck,
    Inbox
} from 'lucide-react';
import { PreAuthRecord } from '../PreAuthWizard/types';
import { EvidenceReviewReport } from '../../engine/evidenceReview';
import { DenialAppealResult, generateDenialAppeal } from '../../engine/denialAppealGenerator';
import { getAllPreAuths, getAppeal, saveAppeal, updateAppealStatus } from '../../services/storageService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

// ─── Queue entry enriched with appeal data ───────────────────────────────────

interface QueueEntry {
    record: PreAuthRecord;
    appeal: DenialAppealResult | null;
    priorityScore: number;
}

// ─── Status badge ────────────────────────────────────────────────────────────

const AppealStatusBadge: React.FC<{ status: DenialAppealResult['appealStatus'] | 'none' }> = ({ status }) => {
    const cfg = {
        none:      { label: 'Not Started',  cls: 'bg-gray-800 text-gray-400 border-white/5' },
        draft:     { label: 'Draft',         cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
        submitted: { label: 'Submitted',     cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
        resolved:  { label: 'Resolved',      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    }[status];
    return (
        <span className={`px-2.5 py-0.5 rounded-xl text-[9px] font-black uppercase tracking-wider border ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const DenialQueue: React.FC = () => {
    const [queue, setQueue]             = useState<QueueEntry[]>([]);
    const [loading, setLoading]         = useState(true);
    const [selected, setSelected]       = useState<QueueEntry | null>(null);
    const [generating, setGenerating]   = useState(false);
    const [includeHindi, setIncludeHindi] = useState(false);
    const [activeTab, setActiveTab]     = useState<'english' | 'hindi'>('english');
    const [saving, setSaving]           = useState(false);

    // ── Load denied records + any existing appeals ───────────────────────────
    const loadQueue = useCallback(async () => {
        setLoading(true);
        try {
            const all = await getAllPreAuths();
            const denied = all.filter(r => r.status === 'denied');
            const entries: QueueEntry[] = await Promise.all(
                denied.map(async (record) => {
                    const appeal = await getAppeal(record.id) ?? null;
                    // Compute priority: if appeal exists use its score; else use raw claim value
                    const pScore = appeal?.priorityScore ?? (record.costEstimate?.amountClaimedFromInsurer ?? 0);
                    return { record, appeal, priorityScore: pScore };
                })
            );
            // Sort: highest priority first
            entries.sort((a, b) => b.priorityScore - a.priorityScore);
            setQueue(entries);
            // Keep selected in sync
            if (selected) {
                const refreshed = entries.find(e => e.record.id === selected.record.id);
                if (refreshed) setSelected(refreshed);
            }
        } finally {
            setLoading(false);
        }
    }, [selected]);

    useEffect(() => { loadQueue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Generate appeal ──────────────────────────────────────────────────────
    const handleGenerate = async () => {
        if (!selected) return;
        const denialReasonText = selected.record.tpaResponse?.denialReason ?? '';
        if (!denialReasonText.trim()) {
            alert('No denial reason recorded for this case. Record the TPA denial reason in the Status Tracker first.');
            return;
        }

        const existingReport: EvidenceReviewReport | undefined = selected.record.tpaEvidenceReview;
        if (!existingReport) {
            alert('No Evidence Review Report found for this pre-auth. The case must have been processed through the evidence review engine before an appeal can be generated.');
            return;
        }

        setGenerating(true);
        try {
            const result = await generateDenialAppeal(
                denialReasonText,
                selected.record,
                existingReport,
                { includeHindi }
            );
            await saveAppeal(result);
            await loadQueue();
            setActiveTab('english');
        } catch (err) {
            console.error('[DenialQueue] Appeal generation failed:', err);
            alert('Appeal generation failed. Check console for details.');
        } finally {
            setGenerating(false);
        }
    };

    // ── Status transitions ────────────────────────────────────────────────────
    const handleStatusChange = async (newStatus: DenialAppealResult['appealStatus']) => {
        if (!selected?.appeal) return;
        setSaving(true);
        try {
            await updateAppealStatus(selected.record.id, newStatus);
            await loadQueue();
        } finally {
            setSaving(false);
        }
    };

    // ── Coverage display helper ───────────────────────────────────────────────
    const coverageLabel = (entry: QueueEntry): string => {
        if (!entry.appeal) return 'Not yet analyzed';
        const { addressedCount, totalReasons } = entry.appeal;
        return `${addressedCount} of ${totalReasons} reasons addressed with existing evidence`;
    };

    const coverageColor = (entry: QueueEntry): string => {
        if (!entry.appeal) return 'text-gray-500';
        const ratio = entry.appeal.totalReasons > 0
            ? entry.appeal.addressedCount / entry.appeal.totalReasons : 0;
        if (ratio >= 0.75) return 'text-emerald-400';
        if (ratio >= 0.5)  return 'text-amber-400';
        return 'text-red-400';
    };

    // ── Empty state ───────────────────────────────────────────────────────────
    if (!loading && queue.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 bg-gray-900/30 border border-dashed border-white/10 rounded-3xl p-12">
                <Inbox className="w-12 h-12 text-gray-600" />
                <h3 className="text-sm font-bold text-gray-300">No Denied Claims in Queue</h3>
                <p className="text-xs text-gray-500 max-w-xs text-center">
                    Denied pre-auth records will appear here once a TPA denial response is recorded via the Status Tracker in the Pre-Auth Dashboard.
                </p>
            </div>
        );
    }

    // ── Main Render ───────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-fadeInUp">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-900/40 p-6 rounded-3xl border border-white/5 backdrop-blur-md">
                <div>
                    <div className="inline-flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full mb-2">
                        <ShieldAlert className="w-3.5 h-3.5" /> Live Denial Queue
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">Citation-Backed Appeal Generator</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                        Appeals cite only evidence already confirmed present in the original pre-auth review — no fabricated citations. Missing evidence is flagged explicitly.
                    </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                    <div className="bg-gray-950 px-4 py-2.5 rounded-2xl border border-white/5">
                        <span className="text-gray-400">Open Denials: </span>
                        <span className="text-white font-bold">{queue.length}</span>
                    </div>
                    <div className="bg-gray-950 px-4 py-2.5 rounded-2xl border border-white/5">
                        <span className="text-gray-400">At Risk: </span>
                        <span className="text-rose-400 font-bold">
                            ₹{queue
                                .filter(e => e.appeal?.appealStatus !== 'resolved')
                                .reduce((s, e) => s + (e.record.costEstimate?.amountClaimedFromInsurer ?? 0), 0)
                                .toLocaleString('en-IN')}
                        </span>
                    </div>
                    <button
                        onClick={loadQueue}
                        disabled={loading}
                        className="p-2.5 rounded-xl bg-gray-800 border border-white/5 hover:bg-gray-700 transition"
                        title="Refresh queue"
                    >
                        <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* ── Left: Priority Queue Table ─────────────────────────────── */}
                <div className="lg:col-span-7 bg-gray-900 border border-white/5 rounded-3xl p-6 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-white/5">
                        <h3 className="text-sm font-bold text-gray-200 tracking-wide uppercase">Prioritized Denial Backlog</h3>
                        {loading && <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />}
                    </div>

                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="text-gray-400 font-semibold border-b border-white/10 uppercase tracking-wider text-[10px]">
                                    <th className="py-3 px-2">#</th>
                                    <th className="py-3 px-2">Patient</th>
                                    <th className="py-3 px-2">TPA / Insurer</th>
                                    <th className="py-3 px-2">Claim Value</th>
                                    <th className="py-3 px-2">Evidence Coverage</th>
                                    <th className="py-3 px-2 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {queue.map((entry, index) => (
                                    <tr
                                        key={entry.record.id}
                                        onClick={() => setSelected(entry)}
                                        className={`border-b border-white/5 hover:bg-white/5 transition cursor-pointer ${selected?.record.id === entry.record.id ? 'bg-blue-600/10 border-blue-500/30' : ''}`}
                                    >
                                        <td className="py-4 px-2 font-mono font-bold text-gray-300">
                                            {index + 1}.
                                            <span className="text-[9px] text-gray-500 font-semibold block">
                                                Score: {entry.priorityScore.toLocaleString('en-IN')}
                                            </span>
                                        </td>
                                        <td className="py-4 px-2">
                                            <div className="font-bold text-gray-200">{entry.record.patient?.patientName ?? '—'}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                {entry.record.clinical?.diagnoses?.[entry.record.clinical.selectedDiagnosisIndex ?? 0]?.diagnosis ?? '—'}
                                            </div>
                                            <div className="text-[10px] text-gray-500 font-mono">{entry.record.id}</div>
                                        </td>
                                        <td className="py-4 px-2">
                                            <div className="text-gray-200 font-semibold">{entry.record.insurance?.tpaName ?? '—'}</div>
                                            <div className="text-[10px] text-gray-500 mt-0.5">{entry.record.insurance?.insurerName ?? '—'}</div>
                                        </td>
                                        <td className="py-4 px-2 font-bold font-mono text-gray-100">
                                            ₹{(entry.record.costEstimate?.amountClaimedFromInsurer ?? 0).toLocaleString('en-IN')}
                                        </td>
                                        <td className="py-4 px-2">
                                            <span className={`text-[10px] font-semibold ${coverageColor(entry)}`}>
                                                {coverageLabel(entry)}
                                            </span>
                                        </td>
                                        <td className="py-4 px-2 text-center">
                                            <AppealStatusBadge status={entry.appeal?.appealStatus ?? 'none'} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── Right: Appeal Editor Panel ─────────────────────────────── */}
                <div className="lg:col-span-5 space-y-4">
                    {selected ? (
                        <div className="bg-gray-900 border border-white/5 rounded-3xl p-6 space-y-5">

                            {/* Case header */}
                            <div className="flex justify-between items-start border-b border-white/5 pb-3">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-200">
                                        {selected.record.patient?.patientName ?? '—'}
                                    </h3>
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                        {selected.record.id} · {selected.record.insurance?.tpaName ?? '—'}
                                    </p>
                                </div>
                                <AppealStatusBadge status={selected.appeal?.appealStatus ?? 'none'} />
                            </div>

                            {/* Denial reason block */}
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">TPA Denial Reason</span>
                                <div className="bg-gray-950 border border-white/5 rounded-2xl p-3 text-[11px] font-mono text-gray-300 leading-relaxed max-h-28 overflow-y-auto custom-scrollbar">
                                    {selected.record.tpaResponse?.denialReason || (
                                        <span className="text-gray-500 italic">No denial reason recorded. Update the Status Tracker to record the TPA denial text.</span>
                                    )}
                                </div>
                            </div>

                            {/* Evidence coverage breakdown (from existing appeal) */}
                            {selected.appeal && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Evidence Coverage</span>
                                        <span className={`text-[10px] font-black ${coverageColor(selected)}`}>
                                            {selected.appeal.addressedCount} of {selected.appeal.totalReasons} denial reasons addressed with existing evidence
                                        </span>
                                    </div>

                                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                        {selected.appeal.denialReasonsParsed.map((reason, idx) => {
                                            const cited = selected.appeal!.citedEvidence.filter(c => c.denialReason === reason);
                                            const isMissing = selected.appeal!.stillMissing.some(m => m.denialReason === reason);
                                            return (
                                                <div
                                                    key={idx}
                                                    className={`p-3 rounded-2xl border text-[11px] leading-relaxed ${cited.length > 0 ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-rose-500/5 border-rose-500/15'}`}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        {cited.length > 0
                                                            ? <BadgeCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                                            : <BadgeAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                                                        }
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`font-medium ${cited.length > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                                                {reason}
                                                            </p>
                                                            {cited.map((ce, ci) => (
                                                                <div key={ci} className="mt-1.5 pl-2 border-l-2 border-emerald-500/30">
                                                                    <span className="text-[9px] font-bold uppercase text-emerald-500/70 tracking-wider">
                                                                        {ce.source} evidence cited:
                                                                    </span>
                                                                    <p className="text-emerald-200/80 text-[10px] mt-0.5">"{ce.evidenceItem}"</p>
                                                                </div>
                                                            ))}
                                                            {isMissing && (
                                                                <p className="text-[10px] text-rose-400/80 mt-1">
                                                                    ⚠ Still missing — no confirmed evidence in existing report
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Hindi toggle */}
                            {!selected.appeal && (
                                <label className="flex items-center gap-2.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={includeHindi}
                                        onChange={e => setIncludeHindi(e.target.checked)}
                                        className="accent-blue-500 w-3.5 h-3.5"
                                    />
                                    <span className="text-xs text-gray-400 font-medium">Include Hindi translation</span>
                                    <span className="text-[9px] text-amber-400/70 font-semibold">(machine-translated, not official)</span>
                                </label>
                            )}

                            {/* Generate / Regenerate button */}
                            {!selected.appeal && (
                                <button
                                    onClick={handleGenerate}
                                    disabled={generating || !selected.record.tpaResponse?.denialReason}
                                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 active:scale-[.98]"
                                >
                                    {generating ? (
                                        <><RefreshCw className="w-4 h-4 animate-spin" /><span>Generating Citation-Backed Appeal...</span></>
                                    ) : (
                                        <><FileText className="w-4 h-4" /><span>Generate Citation-Backed Appeal</span></>
                                    )}
                                </button>
                            )}

                            {/* Appeal letter preview with tab for Hindi */}
                            {selected.appeal && (
                                <div className="space-y-3 border-t border-white/5 pt-4">
                                    {/* Tab bar */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setActiveTab('english')}
                                            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition ${activeTab === 'english' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                        >
                                            English
                                        </button>
                                        {selected.appeal.hindiTranslation && (
                                            <button
                                                onClick={() => setActiveTab('hindi')}
                                                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition ${activeTab === 'hindi' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                            >
                                                हिंदी
                                            </button>
                                        )}
                                    </div>

                                    {/* Machine-translated warning */}
                                    {activeTab === 'hindi' && selected.appeal.machineTranslatedWarning && (
                                        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                                            <Languages className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-amber-300 font-medium">
                                                <strong>Machine-translated only</strong> — This Hindi version is AI-generated and has NOT been reviewed by a qualified translator. Do not present it as a certified or official translation.
                                            </p>
                                        </div>
                                    )}

                                    <div className="bg-gray-950 border border-white/5 rounded-2xl p-4 max-h-52 overflow-y-auto custom-scrollbar font-mono text-[10px] text-gray-300 whitespace-pre-wrap leading-relaxed">
                                        {activeTab === 'english'
                                            ? selected.appeal.appealText
                                            : selected.appeal.hindiTranslation}
                                    </div>

                                    {/* Copy button */}
                                    <button
                                        onClick={() => {
                                            const txt = activeTab === 'english' ? selected.appeal!.appealText : (selected.appeal!.hindiTranslation ?? '');
                                            navigator.clipboard.writeText(txt);
                                        }}
                                        className="text-[10px] text-blue-400 hover:text-blue-300 font-bold transition underline"
                                    >
                                        Copy to clipboard
                                    </button>

                                    {/* Status actions */}
                                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                                        <button
                                            onClick={() => handleStatusChange('submitted')}
                                            disabled={saving || selected.appeal.appealStatus === 'submitted' || selected.appeal.appealStatus === 'resolved'}
                                            className="py-2.5 rounded-xl text-xs font-bold bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20 transition disabled:opacity-40 flex items-center justify-center gap-1"
                                        >
                                            <Send className="w-3.5 h-3.5" /> Mark Submitted
                                        </button>
                                        <button
                                            onClick={() => handleStatusChange('resolved')}
                                            disabled={saving || selected.appeal.appealStatus === 'resolved'}
                                            className="py-2.5 rounded-xl text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 transition disabled:opacity-40 flex items-center justify-center gap-1"
                                        >
                                            <CheckCircle className="w-3.5 h-3.5" /> Mark Resolved
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => {
                                            setSelected(prev => prev ? { ...prev, appeal: null } : prev);
                                        }}
                                        className="w-full py-2 rounded-xl text-[10px] font-bold text-gray-500 hover:text-gray-300 border border-white/5 hover:border-white/15 transition"
                                    >
                                        ↺ Regenerate Appeal
                                    </button>
                                </div>
                            )}

                        </div>
                    ) : (
                        <div className="bg-gray-900/30 border border-dashed border-white/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[500px]">
                            <ChevronRight className="w-12 h-12 text-gray-600 mb-3" />
                            <h3 className="text-sm font-bold text-gray-300">Select a Denied Claim</h3>
                            <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                                Click any row in the denial queue to open the citation-backed appeal generator.
                            </p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
