import React, { useState } from 'react';
import { PreAuthRecord } from '../PreAuthWizard/types';
import { savePreAuth } from '../../services/storageService';
import { StatusBadge } from '../PreAuthDashboard/StatusBadge';
import { formatDateTime, formatCurrency } from '../../utils/formatters';

interface StatusTrackerProps {
    record: PreAuthRecord;
    onClose: () => void;
    onRecordUpdate: (r: PreAuthRecord) => void;
}

export const StatusTracker: React.FC<StatusTrackerProps> = ({ record, onClose, onRecordUpdate }) => {
    const [tpaStatus, setTpaStatus] = useState<'approved' | 'denied' | 'query' | 'partial_approved'>(record.tpaResponse?.status ?? 'approved');
    const [approvedAmount, setApprovedAmount] = useState(record.tpaResponse?.approvedAmount ?? 0);
    const [denialReason, setDenialReason] = useState(record.tpaResponse?.denialReason ?? '');
    const [queryDetails, setQueryDetails] = useState(record.tpaResponse?.queryDetails ?? '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        const updatedStatus = tpaStatus === 'approved' || tpaStatus === 'partial_approved' ? 'approved' :
            tpaStatus === 'denied' ? 'denied' : 'query_raised';
        const updated: PreAuthRecord = {
            ...record,
            status: updatedStatus,
            updatedAt: new Date().toISOString(),
            tpaResponse: { respondedAt: new Date().toISOString(), status: tpaStatus, approvedAmount, denialReason, queryDetails },
        };
        await savePreAuth(updated);
        setSaving(false);
        onRecordUpdate(updated);
    };

    const selectedDx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-gray-950 border border-white/10 rounded-2xl w-full max-w-2xl my-8 mx-4 shadow-2xl">
                <div className="flex justify-between items-center px-6 py-4 border-b border-white/10">
                    <h2 className="font-bold text-white">Pre-Auth Details</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                </div>
                <div className="px-6 py-5 space-y-5">
                    {/* Summary */}
                    <div className="bg-gray-900 rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                            <span className="font-mono text-blue-400 text-xs">{record.id}</span>
                            <StatusBadge status={record.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-400 pt-1">
                            <div>Patient: <span className="text-white">{record.patient?.patientName}</span></div>
                            <div>Age/Sex: <span className="text-white">{record.patient?.age}Y {record.patient?.gender}</span></div>
                            <div>Diagnosis: <span className="text-white">{selectedDx?.diagnosis ?? '—'}</span></div>
                            <div>ICD-10: <span className="text-white font-mono">{selectedDx?.icd10Code ?? '—'}</span></div>
                            <div>Insurer: <span className="text-white">{record.insurance?.insurerName}</span></div>
                            <div>TPA: <span className="text-white">{record.insurance?.tpaName}</span></div>
                            <div>Amount: <span className="text-white">₹{(record.costEstimate?.amountClaimedFromInsurer ?? 0).toLocaleString('en-IN')}</span></div>
                            <div>Updated: <span className="text-white">{formatDateTime(record.updatedAt)}</span></div>
                        </div>
                    </div>

                    {/* Generated Document */}
                    {record.outputs?.irdaiText && (() => {
                        const buildHTML = (text: string) => {
                            const dx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
                            return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Pre-Auth — ${record.id}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Times New Roman',serif;font-size:11pt;color:#000;padding:20mm 18mm}
.header{text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:14px}.header h1{font-size:14pt;font-weight:bold}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;margin-bottom:14px;font-size:10pt}
.meta-row{display:flex;gap:6px}.meta-row .label{font-weight:bold;min-width:120px}
.section-title{font-weight:bold;font-size:10pt;border-bottom:1px solid #999;margin:12px 0 6px;padding-bottom:2px;text-transform:uppercase}
pre{white-space:pre-wrap;font-family:'Courier New',monospace;font-size:9.5pt;line-height:1.5}
.footer{margin-top:20px;border-top:1px solid #999;padding-top:10px;font-size:9pt;color:#444;text-align:center}
@media print{body{padding:10mm 12mm}}</style></head><body>
<div class="header"><h1>INSURANCE PRE-AUTHORIZATION REQUEST</h1><p>IRDAI Part-C — Medical Necessity Statement</p></div>
<div class="meta">
<div class="meta-row"><span class="label">Ref No:</span> ${record.id}</div>
<div class="meta-row"><span class="label">Date:</span> ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
<div class="meta-row"><span class="label">Patient:</span> ${record.patient?.patientName ?? '—'}, ${record.patient?.age ?? '?'}Y ${record.patient?.gender ?? ''}</div>
<div class="meta-row"><span class="label">Policy No:</span> ${record.insurance?.policyNumber ?? '—'}</div>
<div class="meta-row"><span class="label">Insurer:</span> ${record.insurance?.insurerName ?? '—'}</div>
<div class="meta-row"><span class="label">TPA:</span> ${record.insurance?.tpaName ?? '—'}</div>
<div class="meta-row"><span class="label">Diagnosis:</span> ${dx?.diagnosis ?? '—'}</div>
<div class="meta-row"><span class="label">ICD-10:</span> ${dx?.icd10Code ?? '—'}</div>
</div>
<div class="section-title">Pre-Authorization Document</div>
<pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
<div class="footer">Generated by Aivana Insurance Pre-Auth System &nbsp;|&nbsp; Not valid without hospital seal and authorized signature</div>
</body></html>`;
                        };
                        const openPrint = () => {
                            const w = window.open('', '_blank', 'width=900,height=700');
                            if (!w) return;
                            w.document.write(buildHTML(record.outputs.irdaiText!));
                            w.document.close();
                            w.focus();
                            setTimeout(() => w.print(), 400);
                        };
                        return (
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">IRDAI Pre-Auth Document</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    <button onClick={() => navigator.clipboard.writeText(record.outputs.irdaiText!)}
                                        className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium bg-gray-800 hover:bg-gray-700 border border-white/10 text-gray-300 hover:text-white transition-colors">
                                        📋 Copy
                                    </button>
                                    <button onClick={openPrint}
                                        className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium bg-blue-900/30 hover:bg-blue-900/50 border border-blue-500/30 text-blue-300 hover:text-white transition-colors">
                                        🖨️ Print
                                    </button>
                                    <button onClick={openPrint}
                                        className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white transition-all">
                                        📄 PDF
                                    </button>
                                </div>
                                <textarea readOnly value={record.outputs.irdaiText} rows={8}
                                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-gray-300 focus:outline-none resize-none" />
                            </div>
                        );
                    })()}


                    {/* TPA Response Entry */}
                    {(record.status === 'submitted' || record.status === 'query_raised' || record.status === 'approved' || record.status === 'denied') && (
                        <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
                            <h3 className="font-semibold text-blue-300 text-sm">📨 Record TPA Response</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {(['approved', 'partial_approved', 'query', 'denied'] as const).map(s => (
                                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="tpaStatus" value={s} checked={tpaStatus === s} onChange={() => setTpaStatus(s)} className="accent-blue-500" />
                                        <span className="text-sm text-gray-300 capitalize">{s.replace('_', ' ')}</span>
                                    </label>
                                ))}
                            </div>
                            {(tpaStatus === 'approved' || tpaStatus === 'partial_approved') && (
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Approved Amount (₹)</label>
                                    <input type="number" value={approvedAmount} onChange={e => setApprovedAmount(+e.target.value)}
                                        className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                                </div>
                            )}
                            {tpaStatus === 'denied' && (
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Denial Reason</label>
                                    <textarea value={denialReason} onChange={e => setDenialReason(e.target.value)} rows={3}
                                        className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" />
                                </div>
                            )}
                            {tpaStatus === 'query' && (
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">TPA Query Details</label>
                                    <textarea value={queryDetails} onChange={e => setQueryDetails(e.target.value)} rows={3}
                                        className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" />
                                </div>
                            )}
                            <button onClick={handleSave} disabled={saving}
                                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white disabled:opacity-50">
                                {saving ? 'Saving...' : '💾 Save TPA Response'}
                            </button>
                        </div>
                    )}

                    {/* Mark as Submitted */}
                    {(record.status === 'ready_to_submit' || record.status === 'draft') && (
                        <button onClick={async () => {
                            const updated = { ...record, status: 'submitted' as const, updatedAt: new Date().toISOString() };
                            await savePreAuth(updated as PreAuthRecord);
                            onRecordUpdate(updated as PreAuthRecord);
                        }} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
                            📤 Mark as Submitted to TPA
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
