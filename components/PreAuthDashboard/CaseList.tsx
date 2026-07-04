/**
 * CaseList.tsx
 *
 * Prioritised queue of all pre-auth cases.
 *
 * Sorting: query_raised / appeal_drafted cases bubble to the top,
 *          then denied, then everything else, each group sorted newest-first.
 *
 * Filtering:
 *   - Status filter pills (all + per-status)
 *   - "Needs Appeal" quick-filter: shows denied + appeal_drafted only
 *   - Full-text search (name / ID / ICD / policy)
 *
 * Navigation: clicking a row calls onOpenCase(record) so the parent
 * can push to CaseWorkspace (Task 3 wiring in index.tsx).
 *
 * Colour rules: follows scoreColorClass() + STATUS_CONFIG exclusively.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { PreAuthRecord, PreAuthStatus } from '../PreAuthWizard/types';
import { getAllPreAuths, deletePreAuth } from '../../services/storageService';
import { StatusBadge } from './StatusBadge';
import { computeReadiness, scoreColorClass } from '../../utils/readinessScore';
import { formatDateTime } from '../../utils/formatters';

// Urgency rank (lower = higher up in the list)
const URGENCY_RANK: Partial<Record<PreAuthStatus, number>> = {
    query_raised: 0,
    appeal_drafted: 1,
    denied: 2,
    query_received: 3,
    pending_documents: 4,
    submitted: 5,
    ready_to_submit: 6,
    draft: 7,
    enhancement_requested: 8,
    approved: 9,
    closed: 10,
};

function urgencyRank(status: PreAuthStatus): number {
    return URGENCY_RANK[status] ?? 5;
}

function sortRecords(records: PreAuthRecord[]): PreAuthRecord[] {
    return [...records].sort((a, b) => {
        const rankDiff = urgencyRank(a.status) - urgencyRank(b.status);
        if (rankDiff !== 0) return rankDiff;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

// Status filter pills shown in the bar
const STATUS_FILTER_OPTIONS: Array<{ value: PreAuthStatus | 'all' | 'needs_appeal'; label: string; icon: string }> = [
    { value: 'all', label: 'All', icon: '⬡' },
    { value: 'query_raised', label: 'Query', icon: '❓' },
    { value: 'needs_appeal', label: 'Needs Appeal', icon: '⚖️' },
    { value: 'submitted', label: 'Submitted', icon: '⏳' },
    { value: 'approved', label: 'Approved', icon: '✅' },
    { value: 'denied', label: 'Denied', icon: '❌' },
    { value: 'draft', label: 'Draft', icon: '📝' },
];

interface CaseListProps {
    onNewPreAuth: () => void;
    onOpenCase: (record: PreAuthRecord) => void;
    onSettings: () => void;
}

export const CaseList: React.FC<CaseListProps> = ({ onNewPreAuth, onOpenCase, onSettings }) => {
    const [records, setRecords] = useState<PreAuthRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<PreAuthStatus | 'all' | 'needs_appeal'>('all');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadRecords = useCallback(async () => {
        setLoading(true);
        try {
            const all = await getAllPreAuths();
            setRecords(sortRecords(all));
        } catch (e) {
            console.error('[CaseList] load error:', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadRecords(); }, [loadRecords]);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!window.confirm('Delete this case? This cannot be undone.')) return;
        setDeletingId(id);
        try {
            await deletePreAuth(id);
            setRecords(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            console.error('[CaseList] delete error:', err);
        }
        setDeletingId(null);
    };

    const filtered = records.filter(r => {
        const q = search.toLowerCase();
        const matchSearch = !q
            || (r.patient?.patientName ?? '').toLowerCase().includes(q)
            || (r.insurance?.policyNumber ?? '').toLowerCase().includes(q)
            || (r.id ?? '').toLowerCase().includes(q)
            || (r.clinical?.diagnoses?.[0]?.icd10Code ?? '').toLowerCase().includes(q);

        if (!matchSearch) return false;

        if (statusFilter === 'all') return true;
        if (statusFilter === 'needs_appeal') return r.status === 'denied' || r.status === 'appeal_drafted';
        return r.status === statusFilter;
    });

    const countFor = (f: typeof statusFilter) => {
        if (f === 'all') return records.length;
        if (f === 'needs_appeal') return records.filter(r => r.status === 'denied' || r.status === 'appeal_drafted').length;
        return records.filter(r => r.status === f).length;
    };

    // Summary stats bar
    const urgentCount = records.filter(r => r.status === 'query_raised' || r.status === 'appeal_drafted').length;
    const deniedCount = records.filter(r => r.status === 'denied').length;
    const approvedCount = records.filter(r => r.status === 'approved').length;

    return (
        <div className="relative min-h-screen overflow-hidden">
            {/* ── Spline background (matches existing dashboard) ── */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <iframe
                    src="https://my.spline.design/animatedpaperboat-jeJTnCRZkUeZW3jf48yUoDEa/"
                    frameBorder="0"
                    width="100%"
                    height="100%"
                    style={{ display: 'block', width: '100%', height: '100%' }}
                    title="Background"
                />
            </div>
            <div className="fixed inset-0 z-10 bg-black/30 pointer-events-none" />

            <div className="relative z-20 min-h-screen flex flex-col">
                {/* ── Header ─────────────────────────────────────────────── */}
                <header
                    className="px-6 py-4 flex items-center justify-between gap-4 shrink-0"
                    style={{
                        background: 'rgba(0,0,0,0.45)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderBottom: '1px solid rgba(255,255,255,0.12)',
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                            style={{ background: 'linear-gradient(135deg,#3b82f6,#06b6d4)', boxShadow: '0 0 20px rgba(59,130,246,0.4)' }}>
                            🏥
                        </div>
                        <div>
                            <h1 className="font-bold text-lg text-white leading-tight">Case Queue</h1>
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                Aivana — {records.length} case{records.length !== 1 ? 's' : ''} · {urgentCount} urgent
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={onSettings} type="button"
                            className="p-2 rounded-lg transition-all text-white/60 hover:text-white"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                            title="Settings">⚙️
                        </button>
                        <button type="button" onClick={onNewPreAuth}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
                            style={{
                                background: 'linear-gradient(135deg,#2563eb,#0891b2)',
                                boxShadow: '0 4px 24px rgba(37,99,235,0.45)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}>
                            <span>＋</span> New Pre-Auth
                        </button>
                    </div>
                </header>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 space-y-5">

                    {/* Summary chips */}
                    <div className="flex flex-wrap gap-3">
                        {[
                            { label: 'Urgent (Query/Appeal)', value: urgentCount, text: urgentCount > 0 ? 'text-orange-400' : 'text-slate-400', bg: urgentCount > 0 ? 'bg-orange-500/10 border-orange-500/20' : 'bg-white/5 border-white/10' },
                            { label: 'Denied', value: deniedCount, text: deniedCount > 0 ? 'text-red-400' : 'text-slate-400', bg: deniedCount > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-white/5 border-white/10' },
                            { label: 'Approved', value: approvedCount, text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                            { label: 'Total Cases', value: records.length, text: 'text-slate-300', bg: 'bg-white/5 border-white/10' },
                        ].map(chip => (
                            <div key={chip.label}
                                className={`rounded-xl px-4 py-2.5 border flex flex-col gap-0.5 backdrop-blur-sm ${chip.bg}`}
                                style={{ backdropFilter: 'blur(12px)' }}>
                                <span className={`text-xl font-bold tabular-nums ${chip.text}`}>{chip.value}</span>
                                <span className="text-[10px] text-white/50 font-semibold uppercase tracking-wider">{chip.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Search + filter bar */}
                    <div className="flex flex-col gap-3">
                        {/* Search */}
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">🔍</span>
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by patient name, policy no., ref ID, ICD-10 code…"
                                className="w-full pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none rounded-xl"
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    backdropFilter: 'blur(16px)',
                                    WebkitBackdropFilter: 'blur(16px)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                }}
                            />
                        </div>

                        {/* Status filter pills */}
                        <div className="flex gap-2 flex-wrap">
                            {STATUS_FILTER_OPTIONS.map(opt => {
                                const isActive = statusFilter === opt.value;
                                const count = countFor(opt.value as any);
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setStatusFilter(opt.value as any)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                                        style={{
                                            background: isActive ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.07)',
                                            backdropFilter: 'blur(12px)',
                                            WebkitBackdropFilter: 'blur(12px)',
                                            border: isActive ? '1px solid rgba(99,170,255,0.5)' : '1px solid rgba(255,255,255,0.10)',
                                            color: isActive ? '#fff' : 'rgba(255,255,255,0.60)',
                                        }}
                                    >
                                        <span>{opt.icon}</span>
                                        <span>{opt.label}</span>
                                        {count > 0 && (
                                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                                isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'
                                            }`}>{count}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Case table ──────────────────────────────────────────── */}
                    <div className="rounded-2xl overflow-hidden"
                        style={{
                            background: 'rgba(0,0,0,0.38)',
                            backdropFilter: 'blur(24px)',
                            WebkitBackdropFilter: 'blur(24px)',
                            border: '1px solid rgba(255,255,255,0.12)',
                        }}
                    >
                        {loading ? (
                            <div className="flex items-center justify-center py-20 text-white/40 text-sm gap-2">
                                <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-blue-400 animate-spin" />
                                Loading cases…
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="p-16 text-center space-y-4">
                                <div className="text-5xl">📋</div>
                                <h3 className="text-lg font-semibold text-white">
                                    {records.length === 0 ? 'No cases yet' : 'No matching cases'}
                                </h3>
                                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                    {records.length === 0
                                        ? 'Create your first pre-authorization to get started.'
                                        : 'Try adjusting your search or filter.'}
                                </p>
                                {records.length === 0 && (
                                    <button type="button" onClick={onNewPreAuth}
                                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-white mt-2"
                                        style={{ background: 'linear-gradient(135deg,#2563eb,#0891b2)', boxShadow: '0 4px 24px rgba(37,99,235,0.35)' }}>
                                        + New Pre-Authorization
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                            {['', 'Ref ID', 'Patient', 'Diagnosis / ICD', 'Insurer / TPA', 'Amount', 'Readiness', 'Updated', 'Status', ''].map((h, i) => (
                                                <th key={i} className="px-4 py-3 text-left text-xs font-semibold"
                                                    style={{ color: 'rgba(255,255,255,0.40)' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(rec => {
                                            const dx = rec.clinical?.diagnoses?.[rec.clinical.selectedDiagnosisIndex ?? 0];
                                            const cost = rec.costEstimate?.totalEstimatedCost;
                                            const { score } = computeReadiness(rec, rec.tpaEvidenceReview || null);
                                            const colors = scoreColorClass(score);
                                            const isUrgent = rec.status === 'query_raised' || rec.status === 'appeal_drafted';
                                            const isDeleting = deletingId === rec.id;

                                            return (
                                                <tr
                                                    key={rec.id}
                                                    className="cursor-pointer transition-all"
                                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.055)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                    onClick={() => onOpenCase(rec)}
                                                >
                                                    {/* Urgency indicator column */}
                                                    <td className="pl-3 pr-0 py-3 w-2">
                                                        {isUrgent && (
                                                            <div
                                                                title="Urgent — needs action"
                                                                className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"
                                                            />
                                                        )}
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs" style={{ color: '#60a5fa' }}>{rec.id}</span>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-sm text-white">{rec.patient?.patientName ?? '—'}</div>
                                                        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                                            {rec.patient?.age ? `${rec.patient.age}Y` : ''} {rec.patient?.gender ?? ''}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="text-sm text-white">{dx?.diagnosis ?? '—'}</div>
                                                        <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                                            {dx?.icd10Code ?? ''}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="text-sm text-white">{rec.insurance?.insurerName ?? '—'}</div>
                                                        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.40)' }}>
                                                            {rec.insurance?.tpaName ?? ''}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
                                                        {cost ? `₹${cost.toLocaleString('en-IN')}` : '—'}
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block ${colors.bg} ${colors.border} ${colors.text}`}>
                                                            {score}%
                                                        </span>
                                                    </td>

                                                    <td className="px-4 py-3 text-xs whitespace-nowrap"
                                                        style={{ color: 'rgba(255,255,255,0.45)' }}>
                                                        {formatDateTime(rec.updatedAt)}
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <StatusBadge status={rec.status} />
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            {/* Open */}
                                                            <button
                                                                type="button"
                                                                className="text-sm p-1.5 rounded transition-all"
                                                                style={{ color: 'rgba(255,255,255,0.40)' }}
                                                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.40)'; }}
                                                                onClick={e => { e.stopPropagation(); onOpenCase(rec); }}
                                                                title="Open workspace"
                                                            >→</button>
                                                            {/* Delete */}
                                                            <button
                                                                type="button"
                                                                disabled={isDeleting}
                                                                className="text-sm p-1.5 rounded transition-all opacity-0 hover:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                                                                style={{ color: 'rgba(239,68,68,0.6)' }}
                                                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(239,68,68,0.6)'; }}
                                                                onClick={e => handleDelete(e, rec.id)}
                                                                title="Delete case"
                                                            >
                                                                {isDeleting ? '…' : '🗑'}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
