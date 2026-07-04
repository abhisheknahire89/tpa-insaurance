import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, FileText, CheckCircle, ArrowRight, RefreshCw, Send, HelpCircle, FileCheck } from 'lucide-react';
import { DenialItem, MOCK_DENIALS, runAllDenialReviews, runDenialReview } from '../../engine/denialReview';
import { AppealPackage, generateAppealPackage } from '../../engine/appealGenerator';

export const DenialHub: React.FC = () => {
    const [denials, setDenials] = useState<DenialItem[]>(MOCK_DENIALS);
    const [selectedDenial, setSelectedDenial] = useState<DenialItem | null>(null);
    const [loadingQueue, setLoadingQueue] = useState(false);
    const [generatingAppeal, setGeneratingAppeal] = useState(false);
    const [clinicalJustification, setClinicalJustification] = useState('');
    const [appealPackage, setAppealPackage] = useState<AppealPackage | null>(null);
    const [doctorName, setDoctorName] = useState('Dr. Sunil Bhardwaj');
    const [doctorReg, setDoctorReg] = useState('MCI-88271');
    const [submittingAppeal, setSubmittingAppeal] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);

    // Initial audit of all denials to run priority sorting
    useEffect(() => {
        const analyzeAll = async () => {
            setLoadingQueue(true);
            try {
                const reviewed = await runAllDenialReviews(MOCK_DENIALS);
                setDenials(reviewed);
                if (reviewed.length > 0) {
                    setSelectedDenial(reviewed[0]);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingQueue(false);
            }
        };
        analyzeAll();
    }, []);

    // Set clinical justification placeholder based on denial category
    useEffect(() => {
        if (!selectedDenial) return;
        setAppealPackage(null);

        if (selectedDenial.analysis?.category === 'Clinical Necessity') {
            setClinicalJustification(`Patient presented with severe clinical deterioration, vital signs temp 103.4 F, pulse 110/min, platelet count 22,000/mcL. As per medical standards, platelet counts below 50,000/mcL with systemic symptoms carry high risk of spontaneous hemorrhage, necessitating immediate inpatient IV support. Outpatient management is contraindicated.`);
        } else if (selectedDenial.analysis?.category === 'Pre-Existing Disease') {
            setClinicalJustification(`The patient was diagnosed with Type 2 Diabetes Mellitus only 12 months ago, well after the insurance policy inception date. We attach the previous clinician primary consultation records confirming no prior history. The denial under Clause 3.2 is clinically factually incorrect.`);
        } else if (selectedDenial.analysis?.category === 'Coding / Billing') {
            setClinicalJustification(`Room rent occupied was medically necessary due to strict isolation requirements for active gastroenteritis infection control. Furthermore, standard IRDAI guidelines prohibit proportionate deductions on consulting and nursing charges under emergency admission.`);
        } else {
            setClinicalJustification(`The hospitalization was medically indicated for acute conservative treatment. All standard documentation is attached.`);
        }
    }, [selectedDenial]);

    const handleSelectDenial = (denial: DenialItem) => {
        setSelectedDenial(denial);
    };

    const handleCreateAppeal = async () => {
        if (!selectedDenial) return;
        setGeneratingAppeal(true);
        try {
            const pkg = await generateAppealPackage(
                selectedDenial,
                clinicalJustification,
                doctorName,
                doctorReg
            );
            setAppealPackage(pkg);
            // Update local state to show appeal generated
            setDenials(prev => prev.map(d => d.id === selectedDenial.id ? { ...d, status: 'Appeal Generated' } : d));
        } catch (e) {
            console.error(e);
            alert("Failed to generate appeal package");
        } finally {
            setGeneratingAppeal(false);
        }
    };

    const handleSimulateSubmission = () => {
        if (!selectedDenial || !appealPackage) return;
        setSubmittingAppeal(true);

        setTimeout(() => {
            setSubmittingAppeal(false);
            setDenials(prev => prev.map(d => {
                if (d.id === selectedDenial.id) {
                    // Update status to Appeal Submitted
                    return { ...d, status: 'Appeal Submitted' };
                }
                return d;
            }));
            
            // Re-select with updated status
            setSelectedDenial(prev => prev ? { ...prev, status: 'Appeal Submitted' } : null);

            // Mock an overturn response after 4 seconds
            setTimeout(() => {
                setDenials(prev => prev.map(d => {
                    if (d.id === selectedDenial.id) {
                        return { ...d, status: 'Claim Overturned' };
                    }
                    return d;
                }));
                setSelectedDenial(prev => prev ? { ...prev, status: 'Claim Overturned' } : null);
                alert(`🎉 Great news! TPA Appeal for patient ${selectedDenial.patientName} has been OVERTURNED. Cashless authorization of ₹${selectedDenial.claimAmount} approved in full!`);
            }, 4000);

        }, 2000);
    };

    return (
        <div className="space-y-6 animate-fadeInUp">
            {/* Header banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-900/40 p-6 rounded-3xl border border-white/5 backdrop-blur-md">
                <div>
                    <div className="inline-flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full mb-2">
                        <ShieldAlert className="w-3.5 h-3.5" /> Aegis Style Appeal Engine
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">Automated Denial Ingestion & Grievance Appeal Builder</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Scoring claim denials by financial loss, clinical urgency, and overturn probability, with compliant IRDAI appeal packet generation.</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                    <div className="bg-gray-950 px-4 py-2.5 rounded-2xl border border-white/5">
                        <span className="text-gray-400">Claims Ingested: </span>
                        <span className="text-white font-bold">{denials.length}</span>
                    </div>
                    <div className="bg-gray-950 px-4 py-2.5 rounded-2xl border border-white/5">
                        <span className="text-gray-400">Priority Backlog: </span>
                        <span className="text-rose-400 font-bold">₹{denials.reduce((acc, curr) => curr.status === 'Pending Review' ? acc + curr.claimAmount : acc, 0).toLocaleString('en-IN')}</span>
                    </div>
                </div>
            </div>

            {/* Split layout: Queue (7 cols) and Appeal Editor (5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Prioritized Denial Queue Table */}
                <div className="lg:col-span-7 bg-gray-900 border border-white/5 rounded-3xl p-6 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-white/5">
                        <h3 className="text-sm font-bold text-gray-200 tracking-wide uppercase">Prioritized Denial Backlog</h3>
                        {loadingQueue && <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />}
                    </div>

                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="text-gray-400 font-semibold border-b border-white/10 uppercase tracking-wider text-[10px]">
                                    <th className="py-3 px-2">Priority Rank</th>
                                    <th className="py-3 px-2">Patient</th>
                                    <th className="py-3 px-2">TPA / Insurer</th>
                                    <th className="py-3 px-2">Claim Amount</th>
                                    <th className="py-3 px-2 text-center">Overturn %</th>
                                    <th className="py-3 px-2 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {denials.map((denial, index) => (
                                    <tr
                                        key={denial.id}
                                        onClick={() => handleSelectDenial(denial)}
                                        className={`border-b border-white/5 hover:bg-white/5 transition cursor-pointer ${selectedDenial?.id === denial.id ? 'bg-blue-600/10 border-blue-500/30' : ''}`}
                                    >
                                        <td className="py-4 px-2 font-mono font-bold text-gray-300">
                                            {index + 1}. <span className="text-[10px] text-gray-500 font-semibold">(Score: {denial.priorityScore ?? '—'})</span>
                                        </td>
                                        <td className="py-4 px-2">
                                            <div className="font-bold text-gray-200">{denial.patientName}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">Policy: {denial.policyNumber}</div>
                                        </td>
                                        <td className="py-4 px-2">
                                            <div className="text-gray-200 font-semibold">{denial.tpaName}</div>
                                            <div className="text-[10px] text-gray-500 mt-0.5">{denial.insurerName}</div>
                                        </td>
                                        <td className="py-4 px-2 font-bold font-mono text-gray-100">
                                            ₹{denial.claimAmount.toLocaleString('en-IN')}
                                        </td>
                                        <td className="py-4 px-2 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                                (denial.analysis?.overturnProbability || 0) >= 0.7 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                (denial.analysis?.overturnProbability || 0) >= 0.5 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                'bg-red-500/10 text-red-400 border-red-500/20'
                                            }`}>
                                                {denial.analysis ? `${Math.round(denial.analysis.overturnProbability * 100)}%` : 'Auditing...'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-2 text-center">
                                            <span className={`px-2.5 py-1 rounded-xl text-[9px] font-bold uppercase tracking-wider ${
                                                denial.status === 'Claim Overturned' ? 'bg-emerald-500/15 text-emerald-400' :
                                                denial.status === 'Appeal Submitted' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' :
                                                denial.status === 'Appeal Generated' ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20' :
                                                'bg-gray-800 text-gray-400'
                                            }`}>
                                                {denial.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Side: Appeal Package Builder & Editor */}
                <div className="lg:col-span-5 space-y-6">
                    {selectedDenial ? (
                        <div className="bg-gray-900 border border-white/5 rounded-3xl p-6 space-y-5">
                            <div className="flex justify-between items-start border-b border-white/5 pb-3">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-200">Ingested Case Audit: {selectedDenial.patientName}</h3>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Denial Ref: {selectedDenial.id}</p>
                                </div>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${
                                    selectedDenial.analysis?.category === 'Clinical Necessity' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                    selectedDenial.analysis?.category === 'Pre-Existing Disease' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                    'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}>
                                    {selectedDenial.analysis?.category || 'Auditing'}
                                </span>
                            </div>

                            {/* Denial Details & Impact */}
                            <div className="bg-gray-950 border border-white/5 rounded-2xl p-4 space-y-3 text-xs">
                                <div>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">TPA Denial Clause / EOB Reason</span>
                                    <p className="text-gray-200 mt-1 leading-relaxed font-mono text-[11px] bg-black/40 p-2.5 rounded border border-white/5 max-h-32 overflow-y-auto custom-scrollbar">
                                        {selectedDenial.eobText}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-3">
                                    <div>
                                        <span className="text-[10px] text-gray-500 font-bold block">DISALLOWED AMOUNT</span>
                                        <span className="text-red-400 font-mono font-bold text-sm">₹{selectedDenial.claimAmount.toLocaleString('en-IN')}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-gray-500 font-bold block">OVERTURN LIKELIHOOD</span>
                                        <span className={`font-bold text-sm ${
                                            (selectedDenial.analysis?.overturnProbability || 0) >= 0.7 ? 'text-emerald-400' :
                                            (selectedDenial.analysis?.overturnProbability || 0) >= 0.5 ? 'text-amber-400' :
                                            'text-red-400'
                                        }`}>
                                            {selectedDenial.analysis ? `${Math.round(selectedDenial.analysis.overturnProbability * 100)}%` : 'Auditing...'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Appeal Formulation Form */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Draft Appeal Parameters</h4>
                                <div className="space-y-3 text-xs">
                                    <div>
                                        <label className="text-[10px] text-gray-400 font-bold mb-1 block">Clinical / Administrative Justification (Edit if needed)</label>
                                        <textarea
                                            value={clinicalJustification}
                                            onChange={(e) => setClinicalJustification(e.target.value)}
                                            rows={4}
                                            className="w-full bg-gray-950 border border-white/10 rounded-2xl p-3 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition leading-relaxed custom-scrollbar"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] text-gray-400 font-semibold mb-1 block">Doctor Name</label>
                                            <input type="text" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} className="w-full p-2 bg-gray-950 border border-white/10 rounded-xl text-xs text-gray-200" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-gray-400 font-semibold mb-1 block">MCI / SMC Registration</label>
                                            <input type="text" value={doctorReg} onChange={(e) => setDoctorReg(e.target.value)} className="w-full p-2 bg-gray-950 border border-white/10 rounded-xl text-xs text-gray-200" />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleCreateAppeal}
                                    disabled={generatingAppeal || !clinicalJustification}
                                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 active:scale-98"
                                >
                                    {generatingAppeal ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            <span>Building Appeal Package...</span>
                                        </>
                                    ) : (
                                        <>
                                            <FileCheck className="w-4 h-4" />
                                            <span>Generate Formal Appeal Letter Package 📄</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Appeal Package Preview Section */}
                            {appealPackage && (
                                <div className="space-y-4 border-t border-white/5 pt-4 animate-fadeInUp">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Appeal Letter Draft Ready</h4>
                                        <button
                                            onClick={() => setShowPreviewModal(true)}
                                            className="text-[10px] text-blue-400 hover:text-blue-300 font-bold transition uppercase underline"
                                        >
                                            Fullscreen Preview
                                        </button>
                                    </div>

                                    <div className="bg-gray-950 p-4 border border-white/5 rounded-2xl max-h-52 overflow-y-auto custom-scrollbar font-mono text-[10px] text-gray-300 whitespace-pre-wrap leading-relaxed">
                                        {appealPackage.letterContent}
                                    </div>

                                    {/* Checklist attachments */}
                                    <div className="space-y-2 text-xs">
                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Mandatory Attachment Pack</span>
                                        <div className="space-y-1 bg-gray-950 p-3 rounded-2xl border border-white/5">
                                            {appealPackage.suggestedAttachments.map((att, index) => (
                                                <label key={index} className="flex items-center space-x-2 text-[11px] text-gray-300 font-medium py-0.5">
                                                    <input type="checkbox" defaultChecked className="rounded border-white/10 bg-black" />
                                                    <span>📎 {att}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Submit to portal */}
                                    <button
                                        onClick={handleSimulateSubmission}
                                        disabled={submittingAppeal}
                                        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 active:scale-98 shadow-lg shadow-emerald-600/10"
                                    >
                                        {submittingAppeal ? (
                                            <>
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                <span>Submitting Appeal packet to TPA Portal...</span>
                                            </>
                                        ) : selectedDenial.status === 'Appeal Submitted' ? (
                                            <>
                                                <Send className="w-3.5 h-3.5" />
                                                <span>Appeal Submitted - Pending TPA Review</span>
                                            </>
                                        ) : selectedDenial.status === 'Claim Overturned' ? (
                                            <>
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                <span>Claim Overturned & Approved!</span>
                                            </>
                                        ) : (
                                            <>
                                                <Send className="w-3.5 h-3.5" />
                                                <span>Simulate Submission to TPA Portal 🚀</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                        </div>
                    ) : (
                        <div className="bg-gray-900/30 border border-dashed border-white/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[500px]">
                            <HelpCircle className="w-12 h-12 text-gray-600 mb-3" />
                            <h3 className="text-sm font-bold text-gray-300">Select Ingested Denial</h3>
                            <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Select any claim denial item from the prioritized backlog queue on the left to analyze and appeal.</p>
                        </div>
                    )}
                </div>

            </div>

            {/* Fullscreen letter preview modal */}
            {showPreviewModal && appealPackage && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-white/10 w-full max-w-3xl rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-fadeInUp">
                        <div className="p-5 border-b border-white/5 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-gray-200">Formal Appeal Grievance Letter Draft</h3>
                            <button
                                onClick={() => setShowPreviewModal(false)}
                                className="text-xs text-gray-400 hover:text-white transition font-bold"
                            >
                                CLOSE ✕
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[70vh] custom-scrollbar bg-gray-950 font-mono text-xs text-gray-300 whitespace-pre-wrap leading-relaxed border-b border-white/5">
                            {appealPackage.letterContent}
                        </div>
                        <div className="p-4 bg-gray-900/60 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(appealPackage.letterContent);
                                    alert("Appeal letter copied to clipboard!");
                                }}
                                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 font-bold text-xs text-gray-300 rounded-xl transition border border-white/5"
                            >
                                Copy to Clipboard
                            </button>
                            <button
                                onClick={() => setShowPreviewModal(false)}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 font-bold text-xs text-white rounded-xl transition"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
