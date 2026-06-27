import React, { useState, useEffect, useCallback } from 'react';
import { PreAuthRecord, PreAuthStatus } from '../PreAuthWizard/types';
import { getAllPreAuths, deletePreAuth } from '../../services/storageService';
import { StatusBadge } from './StatusBadge';
import { formatDateTime } from '../../utils/formatters';

interface PreAuthDashboardProps {
    onNewPreAuth: () => void;
    onOpenPreAuth: (record: PreAuthRecord) => void;
    onSettings: () => void;
}

const STATUS_FILTERS: (PreAuthStatus | 'all')[] = ['all', 'draft', 'pending_documents', 'submitted', 'query_raised', 'approved', 'denied'];

export const PreAuthDashboard: React.FC<PreAuthDashboardProps> = ({ onNewPreAuth, onOpenPreAuth, onSettings }) => {
    const [records, setRecords] = useState<PreAuthRecord[]>([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<PreAuthStatus | 'all'>('all');
    const [loading, setLoading] = useState(true);

    const loadRecords = useCallback(async () => {
        setLoading(true);
        try {
            const all = await getAllPreAuths();
            setRecords(all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { loadRecords(); }, [loadRecords]);

    const filtered = records.filter(r => {
        const matchStatus = statusFilter === 'all' || r.status === statusFilter;
        const q = search.toLowerCase();
        const matchSearch = !q ||
            (r.patient?.patientName ?? '').toLowerCase().includes(q) ||
            (r.insurance?.policyNumber ?? '').toLowerCase().includes(q) ||
            (r.id ?? '').toLowerCase().includes(q) ||
            (r.clinical?.diagnoses?.[0]?.icd10Code ?? '').toLowerCase().includes(q);
        return matchStatus && matchSearch;
    });

    const countByStatus = (s: PreAuthStatus) => records.filter(r => r.status === s).length;

    const statusCards: { status: PreAuthStatus; label: string; icon: string; glow: string }[] = [
        { status: 'draft',            label: 'Draft',     icon: '📝', glow: 'rgba(156,163,175,0.15)' },
        { status: 'pending_documents',label: 'Pending',   icon: '📎', glow: 'rgba(251,191,36,0.15)'  },
        { status: 'submitted',        label: 'Submitted', icon: '⏳', glow: 'rgba(34,211,238,0.15)'  },
        { status: 'approved',         label: 'Approved',  icon: '✅', glow: 'rgba(74,222,128,0.15)'  },
        { status: 'query_raised',     label: 'Query',     icon: '❓', glow: 'rgba(251,146,60,0.15)'  },
    ];

    return (
        <div className="relative min-h-screen overflow-hidden">

            {/* ── Spline background ───────────────────────────────────────── */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <iframe
                    src="https://my.spline.design/animatedpaperboat-jeJTnCRZkUeZW3jf48yUoDEa/"
                    frameBorder="0"
                    width="100%"
                    height="100%"
                    style={{ display: 'block', width: '100%', height: '100%' }}
                    title="Animated Paper Boat"
                />
            </div>

            {/* ── Subtle dark overlay so text stays readable ───────────────── */}
            <div className="fixed inset-0 z-10 bg-black/30 pointer-events-none" />

            {/* ── All content on top ───────────────────────────────────────── */}
            <div className="relative z-20 min-h-screen flex flex-col">

                {/* Header */}
                <header
                    className="px-6 py-4 flex items-center justify-between"
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
                            <h1 className="font-bold text-lg text-white leading-tight">Insurance Pre-Authorization</h1>
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>Aivana — TPA-ready documents, faster claims</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={onSettings}
                            className="p-2 rounded-lg transition-all text-white/60 hover:text-white"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                            title="Settings">⚙️
                        </button>
                        <button
                            onClick={onNewPreAuth}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
                            style={{
                                background: 'linear-gradient(135deg,#2563eb,#0891b2)',
                                boxShadow: '0 4px 24px rgba(37,99,235,0.45)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                        >
                            <span>＋</span> New Pre-Authorization
                        </button>
                    </div>
                </header>

                {/* Body */}
                <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 space-y-5">

                    {/* Status Cards */}
                    <div className="grid grid-cols-5 gap-4">
                        {statusCards.map(sc => (
                            <button
                                key={sc.status}
                                onClick={() => setStatusFilter(statusFilter === sc.status ? 'all' : sc.status)}
                                className="text-left rounded-2xl p-4 transition-all hover:scale-[1.03]"
                                style={{
                                    background: statusFilter === sc.status
                                        ? 'rgba(59,130,246,0.25)'
                                        : 'rgba(255,255,255,0.08)',
                                    backdropFilter: 'blur(16px)',
                                    WebkitBackdropFilter: 'blur(16px)',
                                    border: statusFilter === sc.status
                                        ? '1px solid rgba(99,170,255,0.5)'
                                        : '1px solid rgba(255,255,255,0.12)',
                                    boxShadow: `0 4px 24px ${sc.glow}`,
                                }}
                            >
                                <div className="text-2xl font-bold text-white">{countByStatus(sc.status)}</div>
                                <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>{sc.icon} {sc.label}</div>
                            </button>
                        ))}
                    </div>

                    {/* Search + Filter bar */}
                    <div className="flex gap-3 items-center">
                        <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">🔍</span>
                            <input
                                type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search by patient name, policy number, reference ID, ICD-10..."
                                className="w-full pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none rounded-xl"
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    backdropFilter: 'blur(16px)',
                                    WebkitBackdropFilter: 'blur(16px)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                }}
                            />
                        </div>
                        <div className="flex gap-2">
                            {STATUS_FILTERS.slice(0, 4).map(s => (
                                <button key={s}
                                    onClick={() => setStatusFilter(s as any)}
                                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
                                    style={{
                                        background: statusFilter === s ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)',
                                        backdropFilter: 'blur(12px)',
                                        WebkitBackdropFilter: 'blur(12px)',
                                        border: statusFilter === s ? '1px solid rgba(99,170,255,0.5)' : '1px solid rgba(255,255,255,0.12)',
                                        color: statusFilter === s ? '#fff' : 'rgba(255,255,255,0.65)',
                                    }}
                                >
                                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Queue / Table */}
                    <div className="rounded-2xl overflow-hidden"
                        style={{
                            background: 'rgba(0,0,0,0.38)',
                            backdropFilter: 'blur(24px)',
                            WebkitBackdropFilter: 'blur(24px)',
                            border: '1px solid rgba(255,255,255,0.12)',
                        }}
                    >
                        {loading ? (
                            <div className="flex items-center justify-center py-20 text-white/40 text-sm">Loading...</div>
                        ) : filtered.length === 0 ? (
                            <div className="p-16 text-center space-y-4">
                                <div className="text-6xl">📋</div>
                                <h3 className="text-lg font-semibold text-white">No pre-authorizations found</h3>
                                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                    {records.length === 0
                                        ? 'Click "New Pre-Authorization" to create your first one.'
                                        : 'Try adjusting your search or filter.'}
                                </p>
                                {records.length === 0 && (
                                    <button onClick={onNewPreAuth}
                                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
                                        style={{
                                            background: 'linear-gradient(135deg,#2563eb,#0891b2)',
                                            boxShadow: '0 4px 24px rgba(37,99,235,0.45)',
                                        }}>
                                        + New Pre-Authorization
                                    </button>
                                )}
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                        {['Ref ID', 'Patient', 'Diagnosis', 'Insurer / TPA', 'Amount', 'Updated', 'Status', ''].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold"
                                                style={{ color: 'rgba(255,255,255,0.45)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(rec => {
                                        const dx = rec.clinical?.diagnoses?.[rec.clinical.selectedDiagnosisIndex ?? 0];
                                        const cost = rec.costEstimate?.totalEstimatedCost;
                                        return (
                                            <tr key={rec.id}
                                                className="cursor-pointer transition-all"
                                                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                onClick={() => onOpenPreAuth(rec)}
                                            >
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
                                                    <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{dx?.icd10Code ?? ''}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-sm text-white">{rec.insurance?.insurerName ?? '—'}</div>
                                                    <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{rec.insurance?.tpaName ?? ''}</div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-white">
                                                    {cost ? `₹${cost.toLocaleString('en-IN')}` : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                                    {formatDateTime(rec.updatedAt)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <StatusBadge status={rec.status} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        className="text-sm p-1 rounded transition-all"
                                                        style={{ color: 'rgba(255,255,255,0.4)' }}
                                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; }}
                                                        onClick={e => { e.stopPropagation(); onOpenPreAuth(rec); }}>
                                                        →
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
