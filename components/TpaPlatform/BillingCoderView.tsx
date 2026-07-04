import React, { useState } from 'react';
import { Layers, FileText, CheckCircle, AlertTriangle, XCircle, CreditCard, Sparkles, RefreshCw } from 'lucide-react';
import { runBillingCodingWorkflow, BillingInput } from '../../engine/billingCoder';
import { BillingCodingOutput } from '../../services/geminiService';

export const BillingCoderView: React.FC = () => {
    const [clinicalNote, setClinicalNote] = useState(`DISCHARGE BRIEF & TREATMENT RECORD
Patient: Sushma Swaraj, 54-year-old female, admitted for right knee severe osteoarthritis (Grade 4). She has undergone a planned unilateral Total Knee Replacement (TKR) on 03/07/2026.
Procedure: Unilateral Total Knee Replacement. Access made via midline longitudinal incision, patella everted. Bone cuts done, sizing of components completed. Femoral and tibial components cemented. Patella resurfaced. Lavage done. Joint capsule closed. Drainage tube inserted.
Comorbidities: Essential Hypertension on Telmisartan 40mg. Type 2 Diabetes Mellitus on Metformin 500mg.
Daily progress: Day 1 post-op, pain managed with femoral nerve block. Started on passive range of motion exercises. Wound dry, drainage minimal. Day 2 post-op, ambulated with walker. Stable vitals. LFTs normal. Platelets normal.
Billing request: Total surgery package, private ward stay (INR 8,000/day for 4 days), orthopedic implants (cemented unilateral knee prosthesis), post-op knee brace, physical therapy sessions (INR 1,200/session x 3), surgical sutures, dressing kits.`);

    const [insurerName, setInsurerName] = useState('HDFC Ergo');
    const [sumInsured, setSumInsured] = useState(400000);
    const [wardType, setWardType] = useState<'General' | 'Semi-Private' | 'Private' | 'ICU'>('Private');
    const [requestedAmount, setRequestedAmount] = useState(185000);

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<BillingCodingOutput | null>(null);

    const handleRunCoder = async () => {
        setLoading(true);
        try {
            const output = await runBillingCodingWorkflow({
                clinicalNote,
                insurerName,
                sumInsured,
                wardType,
                requestedAmount
            });
            setResult(output);
        } catch (e) {
            console.error(e);
            alert("Coding engine execution failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeInUp">
            {/* Header Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-900/40 p-6 rounded-3xl border border-white/5 backdrop-blur-md">
                <div>
                    <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full mb-2">
                        <Sparkles className="w-3.5 h-3.5" /> Taiga Style Billing Coder
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">AI-Powered ICD-10/CPT Medical Coding & Scrubbing</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Scrubbing claim documentation against CCI unbundling edits and room rent caps, dynamically formulating approved cashless ledgers.</p>
                </div>
            </div>

            {/* Layout Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Inputs Pane (7 columns) */}
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-gray-900 border border-white/5 rounded-3xl p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-gray-200 tracking-wide uppercase">Discharge Notes & Consumables Checklist</h3>
                            <button
                                onClick={() => setClinicalNote('')}
                                className="text-[10px] text-gray-500 hover:text-white transition uppercase font-semibold"
                            >
                                Clear Notes
                            </button>
                        </div>

                        <textarea
                            value={clinicalNote}
                            onChange={(e) => setClinicalNote(e.target.value)}
                            rows={10}
                            className="w-full bg-gray-950 border border-white/10 rounded-2xl p-4 text-xs font-mono text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500 transition leading-relaxed custom-scrollbar"
                        />

                        {/* Financial and Policy Parameters */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs border-t border-white/5 pt-4">
                            <div>
                                <label className="text-[10px] text-gray-400 font-bold mb-1 block">Insurer Name</label>
                                <input type="text" value={insurerName} onChange={(e) => setInsurerName(e.target.value)} className="w-full p-2.5 bg-gray-950 border border-white/10 rounded-xl text-xs text-gray-200" />
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-400 font-bold mb-1 block">Sum Insured (₹)</label>
                                <input type="number" value={sumInsured} onChange={(e) => setSumInsured(Number(e.target.value))} className="w-full p-2.5 bg-gray-950 border border-white/10 rounded-xl text-xs text-gray-200" />
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-400 font-bold mb-1 block">Ward Capping Class</label>
                                <select value={wardType} onChange={(e) => setWardType(e.target.value as any)} className="w-full p-2.5 bg-gray-950 border border-white/10 rounded-xl text-xs text-gray-200">
                                    <option value="General">General (1% limit)</option>
                                    <option value="Semi-Private">Semi-Private</option>
                                    <option value="Private">Private</option>
                                    <option value="ICU">ICU (2% limit)</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-400 font-bold mb-1 block">Invoice Bill Total (₹)</label>
                                <input type="number" value={requestedAmount} onChange={(e) => setRequestedAmount(Number(e.target.value))} className="w-full p-2.5 bg-gray-950 border border-white/10 rounded-xl text-xs text-gray-200 font-bold text-purple-300" />
                            </div>
                        </div>

                        {/* Execute Button */}
                        <button
                            onClick={handleRunCoder}
                            disabled={loading || !clinicalNote}
                            className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold tracking-wider text-sm transition shadow-lg disabled:opacity-40 active:scale-[0.99] flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>Coding, Validating & Scrubbing Claim...</span>
                                </>
                            ) : (
                                <span>Code & Scrub Hospital Claim ⚡</span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Audit & Coding Output Pane (5 columns) */}
                <div className="lg:col-span-5 space-y-6">
                    {result ? (
                        <div className="bg-gray-900 border border-white/10 rounded-3xl p-6 space-y-6 relative shadow-2xl">
                            
                            {/* Header Status */}
                            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                <h3 className="text-sm font-bold text-gray-200 tracking-wide uppercase">Claim Scrubbing Report</h3>
                                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl tracking-wider border ${
                                    result.scrubbingStatus === 'Clean' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                    'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}>
                                    {result.scrubbingStatus}
                                </span>
                            </div>

                            {/* Coded Diagnoses (ICD-10) */}
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-purple-400" /> Coded ICD-10 Diagnoses
                                </h4>
                                <div className="space-y-2 bg-gray-950 p-4 rounded-2xl border border-white/5 text-xs">
                                    <div className="flex justify-between items-start gap-3">
                                        <span className="font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">{result.primaryICD10}</span>
                                        <div className="text-right">
                                            <span className="font-bold text-gray-200 block">Primary: {result.primaryDescription}</span>
                                        </div>
                                    </div>

                                    {result.secondaryICD10.length > 0 && (
                                        <div className="border-t border-white/5 pt-2.5 mt-2.5 space-y-2">
                                            <span className="text-[9px] text-gray-500 font-bold block uppercase tracking-wider">Secondary / Comorbidities</span>
                                            {result.secondaryICD10.map((sec, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-[11px]">
                                                    <span className="font-mono text-gray-400 bg-gray-900 px-1.5 py-0.5 rounded border border-white/5">{sec.code}</span>
                                                    <span className="text-gray-300">{sec.description}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Suggested Procedures (CPT) */}
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-indigo-400" /> Coded CPT Procedures & Rates
                                </h4>
                                <div className="space-y-2 bg-gray-950 p-4 rounded-2xl border border-white/5 text-xs">
                                    {result.suggestedCPT.map((cpt, idx) => (
                                        <div key={idx} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-b-0 last:pb-0 first:pt-0">
                                            <div>
                                                <span className="font-mono text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 text-[10px] font-bold mr-2">{cpt.code}</span>
                                                <span className="text-gray-300 text-[11px]">{cpt.description}</span>
                                            </div>
                                            <span className="font-mono text-gray-200 font-bold">₹{cpt.estimatedRate.toLocaleString('en-IN')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Claim Scrubbing Warnings */}
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> CCI Edits & Validation Warnings
                                </h4>
                                <div className="bg-amber-950/15 border border-amber-500/10 rounded-2xl p-4 space-y-2">
                                    {result.validationWarnings.length > 0 ? (
                                        <ul className="list-disc pl-4 space-y-1.5 text-xs text-amber-300 font-medium">
                                            {result.validationWarnings.map((warning, idx) => (
                                                <li key={idx} className="leading-relaxed">{warning}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                                            <CheckCircle className="w-4 h-4" /> Claim is clean. No CCI unbundling or double billing detected.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Cashless Approval Ledger */}
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <CreditCard className="w-3.5 h-3.5 text-emerald-400" /> Final Cashless Billing Ledger
                                </h4>
                                <div className="bg-gray-950 border border-white/5 rounded-2xl p-4 space-y-2.5 text-xs">
                                    <div className="flex justify-between items-center text-gray-400">
                                        <span>Total Invoiced Bill:</span>
                                        <span className="font-mono">₹{requestedAmount.toLocaleString('en-IN')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-red-400/80">
                                        <span>Non-Medical Deductions (Consumables ~8%):</span>
                                        <span className="font-mono">- ₹{Math.round(requestedAmount * 0.08).toLocaleString('en-IN')}</span>
                                    </div>
                                    {result.copayDeductions > 0 && (
                                        <div className="flex justify-between items-center text-red-400/80">
                                            <span>Policy Co-payment:</span>
                                            <span className="font-mono">- ₹{result.copayDeductions.toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    {result.patientShare > (requestedAmount * 0.08 + result.copayDeductions) && (
                                        <div className="flex justify-between items-center text-red-400/80">
                                            <span>Room Rent Excess & Proportional Deductions:</span>
                                            <span className="font-mono">- ₹{Math.round(result.patientShare - (requestedAmount * 0.08) - result.copayDeductions).toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    <div className="border-t border-white/5 pt-2.5 flex justify-between items-center font-bold text-gray-200">
                                        <span>Approved Cashless Coverage:</span>
                                        <span className="font-mono text-emerald-400 text-sm">₹{result.cashlessApproved.toLocaleString('en-IN')}</span>
                                    </div>
                                    <div className="flex justify-between items-center font-bold text-gray-400">
                                        <span>Patient Co-pay/Share:</span>
                                        <span className="font-mono text-amber-500 text-xs">₹{result.patientShare.toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    ) : (
                        <div className="bg-gray-900/30 border border-dashed border-white/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[500px]">
                            <Layers className="w-12 h-12 text-gray-600 mb-3" />
                            <h3 className="text-sm font-bold text-gray-300">Awaiting Coding Report</h3>
                            <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Click the button on the left to extract ICD-10 codes, suggest CPT listings, and audit the billing ledger.</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
