import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, ShieldAlert, TrendingUp, Clock, FileCheck2, User, Send, Building2, HelpCircle } from 'lucide-react';

export const WorkflowOrchestrator: React.FC = () => {
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
    const [patientJourney, setPatientJourney] = useState({
        patientName: 'Asha Devi',
        age: 48,
        gender: 'Female',
        abhaId: '99-8812-7721-09',
        diagnosis: 'Acute Appendicitis',
        icd10: 'K35.8',
        tpa: 'Medi Assist TPA',
        sumInsured: 300000,
        estimatedCost: 85000,
        eligibilityStatus: 'Verified (ABHA Active, AB-PMJAY empanelled)',
        preAuthStatus: 'Approved (Cashless Auth: ₹60,000)',
        codingStatus: 'Scrubbed Clean (CPT: 44970 Appendectomy, ICD-10: K35.8)',
        settlementStatus: 'Deductions Applied (₹12,000 consumables excluded)',
        appealStatus: 'Appeal Submitted (Seeking recovery of ₹12,000)'
    });

    const [simulationLog, setSimulationLog] = useState<string[]>([
        'Patient Asha Devi registered at admission desk.',
        'ABHA ID 99-8812-7721-09 validated against National Health Authority (NHA) database.'
    ]);

    const advanceSimulation = (step: 1 | 2 | 3 | 4 | 5) => {
        setCurrentStep(step);
        const logs = [...simulationLog];
        
        switch (step) {
            case 2:
                logs.push('Prior Auth Copilot initiated. Messy chart parsed via Gemini.');
                logs.push('Medical Necessity established: Severe right lower quadrant pain, WBC 14,000/mcL.');
                logs.push('Pre-Auth submitted to Medi Assist. Cashless authorized for ₹60,000 (Room rent capped at ₹3,000/day).');
                break;
            case 3:
                logs.push('Appendectomy surgery successfully completed by Dr. Bhardwaj.');
                logs.push('Coding Cockpit parsed surgeon discharge note.');
                logs.push('ICD-10 K35.8 and CPT 44970 extracted. CCI Scrubber ran: Clean.');
                break;
            case 4:
                logs.push('Discharge invoice of ₹85,000 submitted to TPA.');
                logs.push('TPA approved cashless settlement for ₹73,000. Deducted ₹12,000 stating "Non-medical consumables excess under Clause 4.1".');
                break;
            case 5:
                logs.push('Aegis Denial Hub ingested disallowance EOB.');
                logs.push('AI Appeal package generated citing IRDAI consumer protection clause on consumable bundling.');
                logs.push('Appeal letter signed by medical director and forwarded to TPA Grievance Cell.');
                break;
        }
        setSimulationLog(logs);
    };

    const resetSimulation = () => {
        setCurrentStep(1);
        setSimulationLog([
            'Patient Asha Devi registered at admission desk.',
            'ABHA ID 99-8812-7721-09 validated against National Health Authority (NHA) database.'
        ]);
    };

    return (
        <div className="space-y-6 animate-fadeInUp">
            
            {/* Analytics Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                
                {/* Metric 1 */}
                <div className="bg-gray-900 border border-white/5 rounded-3xl p-5 flex items-center justify-between shadow-lg">
                    <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Cashless Approval Rate</span>
                        <span className="text-2xl font-black text-emerald-400 mt-1 block">94.8%</span>
                        <span className="text-[10px] text-gray-500 mt-0.5 block">+18% with AI Scrubbing</span>
                    </div>
                    <TrendingUp className="w-8 h-8 text-emerald-500/20" />
                </div>

                {/* Metric 2 */}
                <div className="bg-gray-900 border border-white/5 rounded-3xl p-5 flex items-center justify-between shadow-lg">
                    <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Average Settlement TAT</span>
                        <span className="text-2xl font-black text-blue-400 mt-1 block">38 min</span>
                        <span className="text-[10px] text-gray-500 mt-0.5 block">IRDAI limit: 60 min</span>
                    </div>
                    <Clock className="w-8 h-8 text-blue-500/20" />
                </div>

                {/* Metric 3 */}
                <div className="bg-gray-900 border border-white/5 rounded-3xl p-5 flex items-center justify-between shadow-lg">
                    <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Denial Revenue Recovered</span>
                        <span className="text-2xl font-black text-purple-400 mt-1 block">₹4.8 Lakhs</span>
                        <span className="text-[10px] text-gray-500 mt-0.5 block">82% appeal success rate</span>
                    </div>
                    <FileCheck2 className="w-8 h-8 text-purple-500/20" />
                </div>

                {/* Metric 4 */}
                <div className="bg-gray-900 border border-white/5 rounded-3xl p-5 flex items-center justify-between shadow-lg">
                    <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Anomaly/Fraud Blocked</span>
                        <span className="text-2xl font-black text-rose-400 mt-1 block">12 claims</span>
                        <span className="text-[10px] text-gray-500 mt-0.5 block">Prevented upcoding penalties</span>
                    </div>
                    <ShieldAlert className="w-8 h-8 text-rose-500/20" />
                </div>

            </div>

            {/* Simulated Claim Journey Timeline */}
            <div className="bg-gray-900 border border-white/5 rounded-3xl p-6 space-y-6">
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <h3 className="text-sm font-bold text-gray-200 tracking-wide uppercase">Patient Claims Journey Simulator</h3>
                    <button
                        onClick={resetSimulation}
                        className="text-[10px] text-gray-500 hover:text-white transition uppercase font-semibold border border-white/10 px-2.5 py-1 rounded-xl"
                    >
                        Reset Simulator
                    </button>
                </div>

                {/* Horizontal Stepper Timeline */}
                <div className="grid grid-cols-5 gap-3 relative">
                    
                    {/* Step 1 */}
                    <div
                        onClick={() => advanceSimulation(1)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all text-left flex flex-col justify-between h-28 ${
                            currentStep >= 1 ? 'bg-blue-600/10 border-blue-500/30' : 'bg-gray-950 border-white/5 opacity-40'
                        }`}
                    >
                        <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest">Step 1</span>
                        <span className="text-xs font-bold text-gray-200 block mt-1">Pre-Visit Eligibility</span>
                        <span className="text-[10px] text-gray-400 truncate mt-1">Status: Active</span>
                    </div>

                    {/* Step 2 */}
                    <div
                        onClick={() => advanceSimulation(2)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all text-left flex flex-col justify-between h-28 ${
                            currentStep >= 2 ? 'bg-blue-600/10 border-blue-500/30' : 'bg-gray-950 border-white/5 opacity-40'
                        }`}
                    >
                        <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest">Step 2</span>
                        <span className="text-xs font-bold text-gray-200 block mt-1">Pre-Auth (Fairway)</span>
                        <span className="text-[10px] text-gray-400 truncate mt-1">{currentStep >= 2 ? 'Authorized' : 'Pending'}</span>
                    </div>

                    {/* Step 3 */}
                    <div
                        onClick={() => advanceSimulation(3)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all text-left flex flex-col justify-between h-28 ${
                            currentStep >= 3 ? 'bg-blue-600/10 border-blue-500/30' : 'bg-gray-950 border-white/5 opacity-40'
                        }`}
                    >
                        <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest">Step 3</span>
                        <span className="text-xs font-bold text-gray-200 block mt-1">Coding (Taiga)</span>
                        <span className="text-[10px] text-gray-400 truncate mt-1">{currentStep >= 3 ? 'Scrubbed Clean' : 'Pending'}</span>
                    </div>

                    {/* Step 4 */}
                    <div
                        onClick={() => advanceSimulation(4)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all text-left flex flex-col justify-between h-28 ${
                            currentStep >= 4 ? 'bg-blue-600/10 border-blue-500/30' : 'bg-gray-950 border-white/5 opacity-40'
                        }`}
                    >
                        <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest">Step 4</span>
                        <span className="text-xs font-bold text-gray-200 block mt-1">TPA Settlement</span>
                        <span className="text-[10px] text-gray-400 truncate mt-1">{currentStep >= 4 ? 'Settled with Cuts' : 'Pending'}</span>
                    </div>

                    {/* Step 5 */}
                    <div
                        onClick={() => advanceSimulation(5)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all text-left flex flex-col justify-between h-28 ${
                            currentStep >= 5 ? 'bg-blue-600/10 border-blue-500/30' : 'bg-gray-950 border-white/5 opacity-40'
                        }`}
                    >
                        <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest">Step 5</span>
                        <span className="text-xs font-bold text-gray-200 block mt-1">Appeals (Aegis)</span>
                        <span className="text-[10px] text-gray-400 truncate mt-1">{currentStep >= 5 ? 'Appeal Sent' : 'Pending'}</span>
                    </div>

                </div>

                {/* Simulation Logs & Details split */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    
                    {/* Live simulator log console */}
                    <div className="bg-gray-950 border border-white/5 rounded-2xl p-4 space-y-2">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Live System Logs</h4>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar font-mono text-[10px] leading-relaxed text-gray-400">
                            {simulationLog.map((log, index) => (
                                <div key={index} className="flex gap-2">
                                    <span className="text-blue-500 font-bold">»</span>
                                    <span>{log}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Active Step Details */}
                    <div className="bg-gray-950 border border-white/5 rounded-2xl p-4 text-xs space-y-3">
                        <h4 className="text-[10px] font-bold text-gray-200 uppercase tracking-wider border-b border-white/5 pb-2">Journey Details</h4>
                        
                        {currentStep === 1 && (
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Patient Name:</span>
                                    <span className="text-white font-bold">{patientJourney.patientName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">ABHA National ID:</span>
                                    <span className="font-mono text-gray-300">{patientJourney.abhaId}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Eligibility Status:</span>
                                    <span className="text-emerald-400 font-semibold">{patientJourney.eligibilityStatus}</span>
                                </div>
                                <button
                                    onClick={() => advanceSimulation(2)}
                                    className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5"
                                >
                                    <span>Advance to Admission & Pre-Auth</span> <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Provisional Diagnosis:</span>
                                    <span className="text-white font-bold">{patientJourney.diagnosis} ({patientJourney.icd10})</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Estimated Cost:</span>
                                    <span className="font-mono text-gray-300">₹{patientJourney.estimatedCost.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">TPA Verdict:</span>
                                    <span className="text-emerald-400 font-semibold">{patientJourney.preAuthStatus}</span>
                                </div>
                                <button
                                    onClick={() => advanceSimulation(3)}
                                    className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5"
                                >
                                    <span>Advance to Discharge Coding</span> <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Primary CPT Code:</span>
                                    <span className="font-mono text-white font-bold">{patientJourney.codingStatus.split(' (')[1].replace(')', '')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Claim Scrubber Result:</span>
                                    <span className="text-emerald-400 font-semibold">Clean (0 CCI warnings)</span>
                                </div>
                                <button
                                    onClick={() => advanceSimulation(4)}
                                    className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5"
                                >
                                    <span>Advance to TPA Cashless Settlement</span> <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Final Bill Sum:</span>
                                    <span className="font-mono text-white font-bold">₹{patientJourney.estimatedCost.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Claim Settlement Verdict:</span>
                                    <span className="text-rose-400 font-semibold">{patientJourney.settlementStatus}</span>
                                </div>
                                <button
                                    onClick={() => advanceSimulation(5)}
                                    className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5"
                                >
                                    <span>Advance to Grievance Appeal</span> <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        {currentStep === 5 && (
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Appeal Dispute Sum:</span>
                                    <span className="font-mono text-red-400 font-bold">₹12,000</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Aegis Status:</span>
                                    <span className="text-blue-400 font-semibold">{patientJourney.appealStatus}</span>
                                </div>
                                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2.5 rounded-xl text-[11px] leading-relaxed">
                                    ✓ Simulated TPA Portal has accepted the appeal package and scheduled review under IRDAI section-45.
                                </div>
                            </div>
                        )}

                    </div>

                </div>

            </div>

            {/* Payer Portal & Fraud Flags Simulation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Simulated Payer Portal */}
                <div className="bg-gray-900 border border-white/5 rounded-3xl p-6 space-y-4">
                    <h3 className="text-xs font-bold text-gray-200 tracking-wide uppercase border-b border-white/5 pb-2 flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-blue-400" /> TPA Auditor / Payer Review Console
                    </h3>
                    <p className="text-[11px] text-gray-400">This panel simulates what the insurance company's medical officer observes. Aivana pre-emptively answers their queries to prevent claims bouncing.</p>
                    
                    <div className="space-y-3 text-xs bg-gray-950 p-4 rounded-2xl border border-white/5">
                        <div className="border-b border-white/5 pb-2">
                            <span className="font-bold text-gray-300">Expected TPA Audit Query:</span>
                            <p className="text-gray-400 mt-1 italic">"Please clarify history of diabetes and provide first consult prescription to rule out PED clause exclusions."</p>
                        </div>
                        <div>
                            <span className="font-bold text-emerald-400 flex items-center gap-1">✓ Aivana Pre-emptive Prefill Attached:</span>
                            <p className="text-gray-300 mt-1">"Attached primary consult note dated 10/10/2025 by Dr. Bhardwaj indicating first diagnosis. The policy is 18 months old, complying with IRDAI PED standards."</p>
                        </div>
                    </div>
                </div>

                {/* Fraud & Anomaly Detections */}
                <div className="bg-gray-900 border border-white/5 rounded-3xl p-6 space-y-4">
                    <h3 className="text-xs font-bold text-gray-200 tracking-wide uppercase border-b border-white/5 pb-2 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-rose-400" /> Fraud / Anomaly & Compliance Flags
                    </h3>
                    <p className="text-[11px] text-gray-400">Automatic validation layers screening for compliance, over-coding, upcoding, and billing anomalies before submitting to TPAs.</p>
                    
                    <div className="space-y-2">
                        <div className="flex gap-3 bg-rose-950/15 border border-rose-500/10 p-3.5 rounded-2xl text-xs text-rose-300">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold block">Abnormal Length of Stay (ALOS) Alert</span>
                                <span className="text-[11px] text-gray-400 mt-0.5 block">Cholecystectomy empanelled package standard is 2 days. The chart requests 4 general ward days. stay extension must be justified in Step 2.</span>
                            </div>
                        </div>

                        <div className="flex gap-3 bg-amber-950/15 border border-amber-500/10 p-3.5 rounded-2xl text-xs text-amber-300">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold block">Upcoding Risk Indicator</span>
                                <span className="text-[11px] text-gray-400 mt-0.5 block">CPT procedure codes list major laparoscopic intervention, but ward monitoring charts show only mild conservative treatment records. Checked for synchronization.</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

        </div>
    );
};
