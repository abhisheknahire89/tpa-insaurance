import React, { useState } from 'react';
import { PreAuthWizard } from './PreAuthWizard';
import { PreAuthDashboard } from './PreAuthDashboard';
import { getRequiredDocuments } from '../data/icd10DocumentMap';
import { extractInsurancePreAuthData } from '../services/geminiService';
import { DIABETES_DEMO_RECORD, PNEUMONIA_DEMO_RECORD, APPENDICITIS_DEMO_RECORD } from '../data/demoCases';
import { reviewEnhancement, EnhancementReviewReport, EnhancementInput, EnhancementTrigger } from '../engine/enhancementReview';
import { logEvent } from '../utils/auditLog';
import { PriorAuthCopilot } from './TpaPlatform/PriorAuthCopilot';
import { DenialHub } from './TpaPlatform/DenialHub';
import { BillingCoderView } from './TpaPlatform/BillingCoderView';
import { WorkflowOrchestrator } from './TpaPlatform/WorkflowOrchestrator';
import { DenialQueue } from './PostSubmission/DenialQueue';

// --- TYPES ---

export interface DischargeDayEntry {
    day: number;
    date: string;
    clinicalEvents: string;
    treatmentGiven: string;
    vitalsTrend: 'improving' | 'stable' | 'deteriorating';
}

export interface ReimbursementInput {
    admissionDate: string;
    dischargeDate: string;
    hospitalName: string;
    hospitalROHINIId?: string;
    treatingDoctorName: string;
    treatingDoctorReg: string;
    wardType: 'general' | 'semi_private' | 'private' | 'icu';
    icuDays: number;
    patientName: string;
    patientAge: number;
    patientGender: string;
    policyNumber: string;
    insurerName: string;
    tpaName: string;
    abhaId?: string;
    relationshipToInsured: string;
    hasPriorTreatmentForCondition: boolean;
    priorTreatmentDetails?: string;
    finalPrimaryDiagnosis: string;
    finalPrimaryICD10: string;
    secondaryDiagnoses: string[];
    diagnosisChangedFromAdmission: boolean;
    diagnosisChangeReason?: string;
    clinicalCourse: DischargeDayEntry[];
    dischargeCondition: 'Improved' | 'Stable' | 'LAMA' | 'Referred' | 'Expired';
    dischargeCriteriaCheckbox: string[];
    followUpDate?: string;
    followUpSpecialty?: string;
    hospitalBillTotal: number;
    pharmacyBillTotal: number;
    investigationsBillTotal: number;
    implantsCost: number;
    implantDetails?: string;
    claimAmountTotal: number;
    neftAccountNumber?: string;
    neftIFSC?: string;
    documentsAvailable: string[];
}

// --- GENERATOR FUNCTIONS ---

const generateEnhancementDocument = (
    trigger: EnhancementTrigger,
    input: EnhancementInput,
    preAuthData: any,
    report?: EnhancementReviewReport
) => {
    let triggerDetails = '';
    switch (trigger) {
        case 'new_procedure':
            triggerDetails = `New Procedure: ${input.newProcedureName || 'N/A'} (${input.newProcedureCode || 'N/A'})\nDate: ${input.newProcedureDate || 'N/A'}\nWas foreseeable: ${input.newProcedureForeseeable ? 'Yes' : 'No'}\nClinical Finding: ${input.clinicalFindingTriggeringProcedure || 'N/A'}`;
            break;
        case 'extended_stay':
            triggerDetails = `Original Discharge: ${input.originalDischargeDate || 'N/A'}\nNew Expected Discharge: ${input.newDischargeDate || 'N/A'}\nReasons for delay: ${input.dischargeDelayReasons?.join(', ') || 'None'}`;
            break;
        case 'icu_upgrade':
            triggerDetails = `Deterioration DateTime: ${input.deteriorationDateTime || 'N/A'}\nVitals: ${input.deteriorationVitals || 'N/A'}\nICU Intervention: ${input.icuIntervention || 'N/A'}`;
            break;
    }

    const preauthPatient = preAuthData?.patient?.patientName || preAuthData?.record?.patient?.patientName || 'N/A';
    const preauthDiagnosis = preAuthData?.clinical?.diagnoses?.[0]?.diagnosis || preAuthData?.record?.clinical?.diagnoses?.[0]?.diagnosis || 'N/A';

    const statusText = report ? report.status.toUpperCase().replace('_', ' ') : 'PENDING REVIEW';
    const gapsText = report && report.gaps.length > 0
        ? `GAPS DETECTED:\n${report.gaps.map((g, i) => `  ${i + 1}. ${g}`).join('\n')}`
        : 'GAPS DETECTED: None';
    const queriesText = report && report.anticipatedQueries.length > 0
        ? `ANTICIPATED TPA QUERIES:\n${report.anticipatedQueries.map((q, i) => `  ${i + 1}. [${q.severity.toUpperCase()}] ${q.query}\n     Reason: ${q.reason}`).join('\n')}`
        : 'ANTICIPATED TPA QUERIES: None';

    return `
ENHANCEMENT REQUEST DOCUMENT (Status: ${statusText})
----------------------------------------
Original Approval Reference: ${input.originalApprovalRef}
Original Approved Amount: ₹${input.originalApprovedAmount}
Amount Utilized To Date: ₹${input.amountUtilizedToDate}

TRIGGER FOR ENHANCEMENT: ${trigger.toUpperCase().replace('_', ' ')}
${triggerDetails}

SEVERITY SCORES
Pheno Intensity: ${input.currentSeverityScores?.phenoIntensity ?? 'N/A'}
Deterioration Velocity: ${input.currentSeverityScores?.deteriorationVelocity ?? 'N/A'}

ADDITIONAL COST REQUESTED: ₹${input.additionalAmountRequested}
TOTAL CLAIM AMOUNT (Est): ₹${Number(input.originalApprovedAmount) + Number(input.additionalAmountRequested)}

PRE-AUTH CONTEXT:
Patient: ${preauthPatient}
Diagnosis: ${preauthDiagnosis}

----------------------------------------
AIVANA CLINICAL DOCUMENTATION AUDIT:
${gapsText}

${queriesText}
`.trim();
};

const generateInsuranceDischarge = (input: ReimbursementInput) => {
    return `
DISCHARGE SUMMARY (INSURANCE FORMAT)
----------------------------------------
Patient Details:
Name: ${input.patientName} (${input.patientAge}/${input.patientGender})
Policy: ${input.policyNumber} | Insurer: ${input.insurerName} | TPA: ${input.tpaName}
ABHA ID: ${input.abhaId ?? 'N/A'} | Relationship: ${input.relationshipToInsured}

Hospital Details:
Name: ${input.hospitalName} (ROHINI: ${input.hospitalROHINIId ?? 'N/A'})
Admission: ${input.admissionDate}
Discharge: ${input.dischargeDate}
Ward: ${input.wardType?.toUpperCase()} | ICU Days: ${input.icuDays}
Treating Doctor: ${input.treatingDoctorName} (Reg: ${input.treatingDoctorReg})

Diagnosis:
Primary: ${input.finalPrimaryDiagnosis} (ICD-10: ${input.finalPrimaryICD10})
Secondary: ${input.secondaryDiagnoses.join(', ')}
Diagnosis Changed?: ${input.diagnosisChangedFromAdmission ? 'Yes - ' + input.diagnosisChangeReason : 'No'}

Clinical Course:
${input.clinicalCourse.map(e => `Day ${e.day} (${e.date}): ${e.clinicalEvents} | Treatment: ${e.treatmentGiven} | Vitals: ${e.vitalsTrend}`).join('\n')}

Discharge Data:
Condition: ${input.dischargeCondition}
Discharge Criteria Met: ${input.dischargeCriteriaCheckbox.join(', ')}
Follow-up: ${input.followUpDate ?? 'N/A'} with ${input.followUpSpecialty ?? 'N/A'}
`.trim();
};

const generateCoverLetter = (input: ReimbursementInput) => {
    return `
COVER LETTER FOR REIMBURSEMENT
----------------------------------------
To,
The Claims Department,
${input.tpaName || input.insurerName}

Sub: Claim Submission for ${input.patientName} (Policy: ${input.policyNumber})

Dear Sir/Madam,
Please find enclosed the claim documents for the inpatient treatment of ${input.patientName} at ${input.hospitalName} from ${input.admissionDate} to ${input.dischargeDate}.

Final Primary Diagnosis: ${input.finalPrimaryDiagnosis} (ICD-10: ${input.finalPrimaryICD10})

Cost Breakdown Summary:
1. Hospital Bill: ₹${input.hospitalBillTotal}
2. Pharmacy Bill: ₹${input.pharmacyBillTotal}
3. Investigations: ₹${input.investigationsBillTotal}
4. Implants/Others: ₹${input.implantsCost} (${input.implantDetails ?? 'N/A'})
---
TOTAL CLAIM AMOUNT: ₹${input.claimAmountTotal}

Payment Details:
NEFT A/C: ${input.neftAccountNumber ?? 'N/A'}
IFSC: ${input.neftIFSC ?? 'N/A'}

Regards,
${input.treatingDoctorName}
${input.hospitalName}
`.trim();
};

const generateDocumentChecklist = (icd10Code: string, input: ReimbursementInput) => {
    const reqs = getRequiredDocuments(icd10Code);
    return `
DOCUMENT CHECKLIST (ICD-10: ${icd10Code})
----------------------------------------
Standard Requirements for this diagnosis:
${reqs.map((r, i) => `${i + 1}. [${input.documentsAvailable.includes(r) ? 'X' : ' '}] ${r}`).join('\n')}

Additional Requirements Based on Patient History:
[${input.hasPriorTreatmentForCondition && input.priorTreatmentDetails ? 'X' : ' '}] Prior Treatment Records
[${input.implantsCost > 0 ? 'X' : ' '}] Implant Invoice and Stickers

Other Provided Documents:
${input.documentsAvailable.filter(d => !reqs.includes(d)).map(d => `- [X] ${d}`).join('\n')}
`.trim();
};

// --- COMPONENTS ---

export const EnhancementModule: React.FC<{ preAuthData: any }> = ({ preAuthData }) => {
    const [input, setInput] = useState<EnhancementInput>({
        originalApprovalRef: '',
        originalApprovedAmount: 0,
        amountUtilizedToDate: 0,
        trigger: 'extended_stay',
        additionalAmountRequested: 0,
        dischargeDelayReasons: [],
        originalDischargeDate: '',
        newDischargeDate: '',
        newProcedureName: '',
        newProcedureCode: '',
        newProcedureDate: '',
        newProcedureForeseeable: false,
        clinicalFindingTriggeringProcedure: '',
        deteriorationDateTime: '',
        deteriorationVitals: '',
        icuIntervention: '',
        currentSeverityScores: {
            phenoIntensity: 1,
            deteriorationVelocity: 1,
        }
    });

    const [doc, setDoc] = useState('');
    const [reviewLoading, setReviewLoading] = useState(false);
    const [report, setReport] = useState<EnhancementReviewReport | null>(null);

    const handleGenerate = async () => {
        setReviewLoading(true);
        try {
            const diagnosis = preAuthData?.clinical?.diagnoses?.[0]?.diagnosis || preAuthData?.record?.clinical?.diagnoses?.[0]?.diagnosis || 'Type 2 diabetes mellitus';
            const rep = await reviewEnhancement(input, diagnosis);
            setReport(rep);
            setDoc(generateEnhancementDocument(input.trigger, input, preAuthData, rep));

            // Log event: enhancement_reviewed
            const caseId = preAuthData?.id || preAuthData?.record?.id || 'UNKNOWN';
            logEvent(caseId, 'enhancement_reviewed', {
                status: rep.status,
                gapCount: rep.gaps.length,
                insufficientItems: rep.insufficientEvidence,
                originalApprovalRef: input.originalApprovalRef,
                additionalAmountRequested: input.additionalAmountRequested
            });
        } catch (err) {
            console.error("Failed to run enhancement review:", err);
        } finally {
            setReviewLoading(false);
        }
    };

    const handleDelayReasonChange = (reason: string, checked: boolean) => {
        const current = input.dischargeDelayReasons || [];
        const next = checked
            ? [...current, reason]
            : current.filter(r => r !== reason);
        setInput({ ...input, dischargeDelayReasons: next });
    };

    const DELAY_REASONS = [
        'Surgical recovery / postoperative monitoring required',
        'Acute post-op pain / hemodynamics management',
        'Slow clinical recovery / ongoing wound care',
        'Awaiting critical laboratory or culture reports',
        'Active infection treatment / intravenous antibiotics',
        'Post-procedure complications (e.g. hematoma, urinary retention)'
    ];

    return (
        <div className="p-6 bg-gray-900 border border-white/5 text-white rounded-2xl shadow-xl space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold tracking-tight">Enhancement / Stay Extension Request</h2>
                {report && (
                    <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-bold border ${
                        report.status === 'sufficient'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/10'
                            : 'bg-red-500/15 text-red-400 border-red-500/10'
                    }`}>
                        {report.status === 'sufficient' ? 'Complete (Sufficient)' : 'Pending Documents'}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                    <label className="block text-xs text-gray-400 font-semibold mb-1">Original Approval Reference</label>
                    <input className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.originalApprovalRef} onChange={e => setInput({ ...input, originalApprovalRef: e.target.value })} />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 font-semibold mb-1">Original Approved Amount (₹)</label>
                    <input type="number" className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.originalApprovedAmount || ''} onChange={e => setInput({ ...input, originalApprovedAmount: Number(e.target.value) })} />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 font-semibold mb-1">Amount Utilized to Date (₹)</label>
                    <input type="number" className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.amountUtilizedToDate || ''} onChange={e => setInput({ ...input, amountUtilizedToDate: Number(e.target.value) })} />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 font-semibold mb-1">Trigger Type</label>
                    <select className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.trigger} onChange={e => setInput({ ...input, trigger: e.target.value as EnhancementTrigger })}>
                        <option value="extended_stay">Extended Stay</option>
                        <option value="new_procedure">New Procedure</option>
                        <option value="icu_upgrade">ICU Upgrade</option>
                    </select>
                </div>
            </div>

            {/* Extended Stay Trigger Fields */}
            {input.trigger === 'extended_stay' && (
                <div className="space-y-4 border-t border-white/5 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 font-semibold mb-1">Original Discharge Date</label>
                            <input type="date" className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.originalDischargeDate} onChange={e => setInput({ ...input, originalDischargeDate: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 font-semibold mb-1">New Expected Discharge Date</label>
                            <input type="date" className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.newDischargeDate} onChange={e => setInput({ ...input, newDischargeDate: e.target.value })} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                            <label className="block text-xs text-gray-400 font-semibold mb-1">Pheno Intensity Score (1-10)</label>
                            <select className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.currentSeverityScores?.phenoIntensity ?? 1} onChange={e => setInput({ ...input, currentSeverityScores: { phenoIntensity: Number(e.target.value), deteriorationVelocity: input.currentSeverityScores?.deteriorationVelocity ?? 1 } })}>
                                {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 font-semibold mb-1">Deterioration Velocity Score (1-10)</label>
                            <select className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.currentSeverityScores?.deteriorationVelocity ?? 1} onChange={e => setInput({ ...input, currentSeverityScores: { phenoIntensity: input.currentSeverityScores?.phenoIntensity ?? 1, deteriorationVelocity: Number(e.target.value) } })}>
                                {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-2">Discharge Delay Reasons (Select all that apply)</label>
                        <div className="grid grid-cols-2 gap-2 text-sm bg-gray-950/30 p-3 rounded-xl border border-white/5">
                            {DELAY_REASONS.map(reason => (
                                <label key={reason} className="flex items-start space-x-2.5 cursor-pointer hover:text-white text-gray-300 py-1">
                                    <input type="checkbox" className="mt-0.5 rounded border-white/10 bg-gray-900" checked={input.dischargeDelayReasons?.includes(reason) ?? false} onChange={e => handleDelayReasonChange(reason, e.target.checked)} />
                                    <span>{reason}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* New Procedure Trigger Fields */}
            {input.trigger === 'new_procedure' && (
                <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4 text-xs">
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1">New Procedure Name</label>
                        <input className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.newProcedureName} onChange={e => setInput({ ...input, newProcedureName: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1">New Procedure Code</label>
                        <input className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.newProcedureCode} onChange={e => setInput({ ...input, newProcedureCode: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1">New Procedure Date</label>
                        <input type="date" className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.newProcedureDate} onChange={e => setInput({ ...input, newProcedureDate: e.target.value })} />
                    </div>
                    <div className="flex items-center mt-6">
                        <label className="flex items-center space-x-2.5 cursor-pointer text-sm">
                            <input type="checkbox" className="rounded border-white/10 bg-gray-900" checked={input.newProcedureForeseeable ?? false} onChange={e => setInput({ ...input, newProcedureForeseeable: e.target.checked })} />
                            <span>Was new procedure foreseeable?</span>
                        </label>
                    </div>
                    <div className="col-span-2">
                        <label className="block text-xs text-gray-400 font-semibold mb-1">Clinical Findings Triggering Procedure</label>
                        <textarea rows={2} className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.clinicalFindingTriggeringProcedure} onChange={e => setInput({ ...input, clinicalFindingTriggeringProcedure: e.target.value })} />
                    </div>
                </div>
            )}

            {/* ICU Upgrade Trigger Fields */}
            {input.trigger === 'icu_upgrade' && (
                <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4 text-xs">
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1">Deterioration Date & Time</label>
                        <input type="datetime-local" className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.deteriorationDateTime} onChange={e => setInput({ ...input, deteriorationDateTime: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1">Deterioration Vitals (e.g., BP, SpO2, HR)</label>
                        <input className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.deteriorationVitals} onChange={e => setInput({ ...input, deteriorationVitals: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-xs text-gray-400 font-semibold mb-1">ICU Intervention Required (e.g., Ventilation, Pressor support)</label>
                        <textarea rows={2} className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm" value={input.icuIntervention} onChange={e => setInput({ ...input, icuIntervention: e.target.value })} />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
                <div>
                    <label className="block text-xs text-red-400 font-semibold mb-1">Additional Amount Requested (₹)</label>
                    <input type="number" className="w-full p-2.5 bg-gray-800 rounded border border-white/10 text-sm font-semibold text-red-200" value={input.additionalAmountRequested || ''} onChange={e => setInput({ ...input, additionalAmountRequested: Number(e.target.value) })} />
                </div>
            </div>

            <div className="flex items-center space-x-3">
                <button onClick={handleGenerate} disabled={reviewLoading} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-xl text-sm font-bold transition shadow-lg active:scale-95 flex items-center space-x-2">
                    {reviewLoading ? (
                        <>
                            <span className="animate-spin inline-block w-4 h-4 border-2 border-t-transparent border-white rounded-full"></span>
                            <span>Reviewing Enhancement...</span>
                        </>
                    ) : (
                        <span>Generate & Audit Request</span>
                    )}
                </button>
            </div>

            {/* Reviewed Outputs Gaps & Queries Panel */}
            {report && (
                <div className="grid grid-cols-2 gap-4 mt-4 text-xs">
                    <div className="p-4 bg-red-950/20 border border-red-500/10 rounded-2xl space-y-2">
                        <h4 className="font-bold text-red-400 uppercase tracking-wider text-[10px]">Verification Gaps ({report.gaps.length})</h4>
                        {report.gaps.length > 0 ? (
                            <ul className="list-disc pl-4 space-y-1.5 text-gray-300">
                                {report.gaps.map((g, idx) => <li key={idx}>{g}</li>)}
                            </ul>
                        ) : (
                            <p className="text-emerald-400 font-medium">✓ No blocking gaps detected.</p>
                        )}
                    </div>

                    <div className="p-4 bg-blue-950/20 border border-blue-500/10 rounded-2xl space-y-2">
                        <h4 className="font-bold text-blue-400 uppercase tracking-wider text-[10px]">Anticipated TPA Queries ({report.anticipatedQueries.length})</h4>
                        {report.anticipatedQueries.length > 0 ? (
                            <div className="space-y-2.5 max-h-48 overflow-y-auto">
                                {report.anticipatedQueries.map((q, idx) => (
                                    <div key={idx} className="border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
                                        <p className="font-semibold text-gray-200">Q: {q.query}</p>
                                        <p className="text-gray-400 mt-0.5">Reason: {q.reason}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-emerald-400 font-medium">✓ No queries expected from TPA medical reviewers.</p>
                        )}
                    </div>
                </div>
            )}

            {doc && (
                <div className="mt-4 p-4 bg-gray-950/60 rounded-2xl border border-white/10">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Preview Generated Enhancement Document</h3>
                    </div>
                    <pre className="whitespace-pre-wrap text-xs text-gray-300 font-mono leading-relaxed">{doc}</pre>
                </div>
            )}
        </div>
    );
};

export const ReimbursementModule: React.FC = () => {
    const [input, setInput] = useState<ReimbursementInput>({
        admissionDate: '', dischargeDate: '', hospitalName: '', treatingDoctorName: '', treatingDoctorReg: '',
        wardType: 'general', icuDays: 0, patientName: '', patientAge: 0, patientGender: '', policyNumber: '',
        insurerName: '', tpaName: '', relationshipToInsured: 'Self', hasPriorTreatmentForCondition: false,
        finalPrimaryDiagnosis: '', finalPrimaryICD10: '', secondaryDiagnoses: [], diagnosisChangedFromAdmission: false,
        clinicalCourse: [], dischargeCondition: 'Improved', dischargeCriteriaCheckbox: [], hospitalBillTotal: 0,
        pharmacyBillTotal: 0, investigationsBillTotal: 0, implantsCost: 0, claimAmountTotal: 0, documentsAvailable: [],
    });

    const [docs, setDocs] = useState<{ discharge?: string; coverLetter?: string; checklist?: string }>({});
    const [activeTab, setActiveTab] = useState<'discharge' | 'cover' | 'checklist'>('discharge');

    const handleGenerate = () => {
        // Step 3 Validation: Block if patientName, ICD-10, admission date, or clinical course is empty
        if (!input.patientName || !input.finalPrimaryICD10 || !input.admissionDate) {
            alert("⚠️ Missing Critical Fields: Patient Name, ICD-10 Code, and Admission Date are required for hospital credibility.");
            return;
        }

        if (input.clinicalCourse.length === 0) {
            alert("⚠️ Clinical Course Empty: Please add at least one daily entry to substantiate the claim.");
            return;
        }

        setDocs({
            discharge: generateInsuranceDischarge(input),
            coverLetter: generateCoverLetter(input),
            checklist: generateDocumentChecklist(input.finalPrimaryICD10 || 'default', input)
        });
    };

    const handleCopyAll = () => {
        const text = [docs.discharge, docs.coverLetter, docs.checklist].filter(Boolean).join('\n\n==========================================\n\n');
        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    };

    return (
        <div className="p-4 bg-gray-900 text-white rounded-lg shadow-md space-y-4">
            <h2 className="text-xl font-bold">Final Claim / Reimbursement</h2>

            <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm">Patient Name</label><input className="w-full p-2 bg-gray-800 rounded border border-gray-700" onChange={e => setInput({ ...input, patientName: e.target.value })} /></div>
                <div><label className="block text-sm">ICD-10 Code</label><input className="w-full p-2 bg-gray-800 rounded border border-gray-700" onChange={e => setInput({ ...input, finalPrimaryICD10: e.target.value })} /></div>
                <div><label className="block text-sm">Primary Diagnosis</label><input className="w-full p-2 bg-gray-800 rounded border border-gray-700" onChange={e => setInput({ ...input, finalPrimaryDiagnosis: e.target.value })} /></div>
                <div><label className="block text-sm">Total Claim Amount (₹)</label><input type="number" className="w-full p-2 bg-gray-800 rounded border border-gray-700" onChange={e => setInput({ ...input, claimAmountTotal: Number(e.target.value) })} /></div>
            </div>

            <button onClick={handleGenerate} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition shadow">Generate Claim Documents</button>

            {docs.discharge && (
                <div className="mt-4 border border-gray-700 rounded-lg overflow-hidden">
                    <div className="flex bg-gray-800 border-b border-gray-700">
                        <button className={`flex-1 py-2 ${activeTab === 'discharge' ? 'bg-gray-700 font-bold' : ''}`} onClick={() => setActiveTab('discharge')}>Discharge Summary</button>
                        <button className={`flex-1 py-2 ${activeTab === 'cover' ? 'bg-gray-700 font-bold' : ''}`} onClick={() => setActiveTab('cover')}>Cover Letter</button>
                        <button className={`flex-1 py-2 ${activeTab === 'checklist' ? 'bg-gray-700 font-bold' : ''}`} onClick={() => setActiveTab('checklist')}>Document Checklist</button>
                    </div>
                    <div className="p-4 bg-gray-950">
                        {activeTab === 'discharge' && <pre className="whitespace-pre-wrap text-sm">{docs.discharge}</pre>}
                        {activeTab === 'cover' && <pre className="whitespace-pre-wrap text-sm">{docs.coverLetter}</pre>}
                        {activeTab === 'checklist' && <pre className="whitespace-pre-wrap text-sm">{docs.checklist}</pre>}
                    </div>
                </div>
            )}

            {docs.discharge && (
                <button onClick={handleCopyAll} className="mt-2 w-full px-4 py-2 border border-gray-500 hover:bg-gray-800 text-white rounded transition">Copy All for Submission</button>
            )}
        </div>
    );
};

export const InsuranceModule: React.FC = () => {
    const [activeModule, setActiveModule] = useState<'preauth' | 'enhancement' | 'reimbursement' | 'tpa_platform'>('preauth');
    const [tpaSubTab, setTpaSubTab] = useState<'prior_auth' | 'denial' | 'coding' | 'orchestrator'>('prior_auth');
    const [preAuthOutput, setPreAuthOutput] = useState<any>(null); // State passing

    // Testing state for isolated environment
    const [mockClinicalNote, setMockClinicalNote] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);
    const [prefilledData, setPrefilledData] = useState<any>(null);
    const [selectedRecord, setSelectedRecord] = useState<any>(null);
    const [showWizard, setShowWizard] = useState(false);
    const [showExtractor, setShowExtractor] = useState(false);

    // Demo Mode States
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [demoStartStep, setDemoStartStep] = useState<1 | 2 | 3 | 4>(1);
    const [demoDefaultTab, setDemoDefaultTab] = useState<any>(undefined);

    const handleExtract = async () => {
        if (!mockClinicalNote) return;
        setIsExtracting(true);
        try {
            const data = await extractInsurancePreAuthData(mockClinicalNote, 'Unknown');
            setPrefilledData(data);
            setShowWizard(true);
        } catch (e) {
            console.error(e);
            alert("Error extracting data");
        } finally {
            setIsExtracting(false);
        }
    };

    const runDemoCase = (record: any) => {
        setPrefilledData(record);
        setDemoStartStep(4);
        setDemoDefaultTab('tpa-review');
        setIsDemoMode(true);
        setShowWizard(true);
    };

    const resetDemo = () => {
        setShowWizard(false);
        setIsDemoMode(false);
        setPrefilledData(null);
        setSelectedRecord(null);
        setShowExtractor(false);
    };

    return (
        <div className="min-h-screen bg-black text-white p-6">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Horizontal Stepper */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-black text-blue-400">Insurance Center</h1>
                        {/* Demo Mode Toggle Switch */}
                        <div className="flex items-center bg-gray-900 border border-white/10 rounded-full px-3 py-1 gap-2 select-none animate-pulse">
                            <span className="text-xs font-bold text-gray-400 tracking-wider">DEMO MODE</span>
                            <button
                                onClick={() => setIsDemoMode(!isDemoMode)}
                                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${isDemoMode ? 'bg-blue-500' : 'bg-gray-700'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${isDemoMode ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                    <div className="flex space-x-2 overflow-x-auto pb-2">
                        <button
                            className={`px-4 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${activeModule === 'preauth' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                            onClick={() => setActiveModule('preauth')}
                        >
                            Step 1: Pre-Auth
                        </button>
                        <div className="self-center hidden sm:block w-4 h-0.5 bg-gray-700"></div>
                        <button
                            className={`px-4 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${activeModule === 'enhancement' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                            onClick={() => setActiveModule('enhancement')}
                        >
                            Step 2: Stay Enhancement
                        </button>
                        <div className="self-center hidden sm:block w-4 h-0.5 bg-gray-700"></div>
                        <button
                            className={`px-4 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${activeModule === 'reimbursement' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                            onClick={() => setActiveModule('reimbursement')}
                        >
                            Step 3: Final Claim
                        </button>
                        <div className="self-center hidden sm:block w-4 h-0.5 bg-gray-700"></div>
                        <button
                            className={`px-4 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${activeModule === 'tpa_platform' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                            onClick={() => setActiveModule('tpa_platform')}
                        >
                            ⚡ TPA AI Copilot
                        </button>
                    </div>
                </div>

                {/* Content area */}
                <div className="mt-4">
                    {activeModule === 'preauth' && (
                        <div className="relative border border-white/10 rounded-xl overflow-hidden min-h-[500px] flex flex-col bg-gray-950">
                            {showWizard ? (
                                <PreAuthWizard
                                    onClose={resetDemo}
                                    prefilledData={prefilledData}
                                    existingRecord={selectedRecord || (isDemoMode ? (prefilledData as any) : preAuthOutput?.record)}
                                    startAtStep={isDemoMode ? demoStartStep : 1}
                                    defaultTab={isDemoMode ? demoDefaultTab : undefined}
                                    isDemo={isDemoMode}
                                    onResetDemo={isDemoMode ? resetDemo : undefined}
                                />
                            ) : isDemoMode ? (
                                <div className="w-full max-w-4xl space-y-6 p-6 mx-auto">
                                    <div className="text-center space-y-2">
                                        <div className="inline-block bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                            ⚡ Presentation Sandbox
                                        </div>
                                        <h3 className="text-2xl font-extrabold text-white">Pre-Loaded Demo Scenarios</h3>
                                        <p className="text-sm text-gray-400 max-w-xl mx-auto">
                                            Run pre-seeded cases instantly to showcase Aivana's clinical evidence reasoning engine. Go straight to the results in one click.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                                        {/* Scenario A: The Hero (Diabetes) */}
                                        <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-blue-500/30 transition-all hover:scale-[1.01] shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                                                        HERO SCENARIO
                                                    </span>
                                                    <span className="text-xs text-gray-500">ICD-10: {DIABETES_DEMO_RECORD.clinical?.diagnoses?.[0]?.icd10Code ?? '—'}</span>
                                                </div>
                                                <h4 className="text-lg font-bold text-white leading-snug">Type 2 Diabetes Mellitus with Hyperglycemia</h4>
                                                <p className="text-xs text-gray-400 leading-relaxed">
                                                    Looks complete to checkers: all Part C fields filled, cost estimate present, and documents attached.
                                                </p>
                                                <div className="border-t border-white/5 pt-3 space-y-2">
                                                    <div className="flex justify-between text-[11px]">
                                                        <span className="text-gray-400">Form Validator Check:</span>
                                                        <span className="text-green-400 font-bold">✓ COMPLETE</span>
                                                    </div>
                                                    <div className="flex justify-between text-[11px]">
                                                        <span className="text-gray-400">Aivana Clinical Review:</span>
                                                        <span className="text-red-400 font-bold">✕ BOUNCED (No PED History)</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => runDemoCase(DIABETES_DEMO_RECORD)}
                                                className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-1"
                                            >
                                                Load Case & Run Review 🚀
                                            </button>
                                        </div>

                                        {/* Scenario B: Thin Pneumonia */}
                                        <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-blue-500/30 transition-all hover:scale-[1.01] shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                        THIN RECORD
                                                    </span>
                                                    <span className="text-xs text-gray-500">ICD-10: {PNEUMONIA_DEMO_RECORD.clinical?.diagnoses?.[0]?.icd10Code ?? '—'}</span>
                                                </div>
                                                <h4 className="text-lg font-bold text-white leading-snug">Community-Acquired Pneumonia</h4>
                                                <p className="text-xs text-gray-400 leading-relaxed">
                                                    An easy win. A thin clinical narrative lacking vital metrics (missing SpO2 saturation) and required attachments.
                                                </p>
                                                <div className="border-t border-white/5 pt-3 space-y-2">
                                                    <div className="flex justify-between text-[11px]">
                                                        <span className="text-gray-400">Form Validator Check:</span>
                                                        <span className="text-red-400 font-bold">✕ INCOMPLETE</span>
                                                    </div>
                                                    <div className="flex justify-between text-[11px]">
                                                        <span className="text-gray-400">Aivana Clinical Review:</span>
                                                        <span className="text-red-400 font-bold">✕ INSUFFICIENT</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => runDemoCase(PNEUMONIA_DEMO_RECORD)}
                                                className="w-full py-2.5 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-white transition-colors border border-white/10 flex items-center justify-center gap-1"
                                            >
                                                Load Case & Run Review 🚀
                                            </button>
                                        </div>

                                        {/* Scenario C: Sufficient Appendicitis */}
                                        <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-blue-500/30 transition-all hover:scale-[1.01] shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-green-500/20 text-green-400 border border-green-500/30">
                                                        SUFFICIENT
                                                    </span>
                                                    <span className="text-xs text-gray-500">ICD-10: {APPENDICITIS_DEMO_RECORD.clinical?.diagnoses?.[0]?.icd10Code ?? '—'}</span>
                                                </div>
                                                <h4 className="text-lg font-bold text-white leading-snug">Acute Appendicitis (Clean Pass)</h4>
                                                <p className="text-xs text-gray-400 leading-relaxed">
                                                    Demonstrates credibility. A case with rich clinical history, clear diagnostic reports, and appropriate surgery planning.
                                                </p>
                                                <div className="border-t border-white/5 pt-3 space-y-2">
                                                    <div className="flex justify-between text-[11px]">
                                                        <span className="text-gray-400">Form Validator Check:</span>
                                                        <span className="text-green-400 font-bold">✓ COMPLETE</span>
                                                    </div>
                                                    <div className="flex justify-between text-[11px]">
                                                        <span className="text-gray-400">Aivana Clinical Review:</span>
                                                        <span className="text-green-400 font-bold">✓ SUFFICIENT</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => runDemoCase(APPENDICITIS_DEMO_RECORD)}
                                                className="w-full py-2.5 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-white transition-colors border border-white/10 flex items-center justify-center gap-1"
                                            >
                                                Load Case & Run Review 🚀
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex justify-center pt-4">
                                        <button
                                            onClick={() => setIsDemoMode(false)}
                                            className="text-xs text-gray-500 hover:text-white underline transition-colors"
                                        >
                                            Return to normal sandbox mode
                                        </button>
                                    </div>
                                </div>
                            ) : showExtractor ? (
                                <div className="p-8 w-full max-w-3xl space-y-6 mx-auto">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-xl font-bold text-gray-200">New Pre-Authorization Case</h3>
                                        <button
                                            onClick={() => setShowExtractor(false)}
                                            className="text-xs text-gray-400 hover:text-white underline transition"
                                        >
                                            ← Back to Dashboard
                                        </button>
                                    </div>
                                    <p className="text-sm text-gray-400">Paste a clinical note below to automatically extract and pre-fill Pre-Authorization fields using AI, or skip to start with manual entry.</p>

                                    <textarea
                                        className="w-full h-64 bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                                        placeholder="E.g., Anil Kankriya, 58 year old male. Known diabetic on metformin. Presenting with high grade fever..."
                                        value={mockClinicalNote}
                                        onChange={(e) => setMockClinicalNote(e.target.value)}
                                    />

                                    <div className="flex justify-end gap-3 mt-4">
                                        <button
                                            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 font-semibold rounded-lg text-white"
                                            onClick={() => {
                                                setPrefilledData(null);
                                                setSelectedRecord(null);
                                                setShowWizard(true);
                                            }}
                                        >
                                            Skip / Manual Entry
                                        </button>
                                        <button
                                            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 font-bold rounded-lg text-white disabled:opacity-50"
                                            onClick={handleExtract}
                                            disabled={isExtracting || !mockClinicalNote}
                                        >
                                            {isExtracting ? 'Extracting via AI...' : 'Generate Pre-Auth Wizard 🚀'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <PreAuthDashboard
                                    onNewPreAuth={() => setShowExtractor(true)}
                                    onOpenPreAuth={(rec) => {
                                        setSelectedRecord(rec);
                                        setShowWizard(true);
                                    }}
                                    onSettings={() => alert("Settings configuration coming soon.")}
                                />
                            )}
                        </div>
                    )}

                    {activeModule === 'enhancement' && (
                        <EnhancementModule preAuthData={preAuthOutput} />
                    )}

                    {activeModule === 'reimbursement' && (
                        <ReimbursementModule />
                    )}

                    {activeModule === 'tpa_platform' && (
                        <div className="space-y-6">
                            {/* Inner navigation bar for TPA Center */}
                            <div className="flex bg-gray-900 border border-white/5 rounded-2xl p-1.5 gap-1.5 text-xs font-bold w-full md:w-auto md:inline-flex">
                                <button
                                    onClick={() => setTpaSubTab('prior_auth')}
                                    className={`px-4 py-2 rounded-xl transition ${tpaSubTab === 'prior_auth' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    Prior Auth Copilot (Fairway)
                                </button>
                                <button
                                    onClick={() => setTpaSubTab('denial')}
                                    className={`px-4 py-2 rounded-xl transition ${tpaSubTab === 'denial' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    Denial Hub &amp; Appeals (Aegis)
                                </button>
                                <button
                                    onClick={() => setTpaSubTab('denial_queue')}
                                    className={`px-4 py-2 rounded-xl transition ${tpaSubTab === 'denial_queue' ? 'bg-rose-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    📋 Denial Queue (Live Cases)
                                </button>
                                <button
                                    onClick={() => setTpaSubTab('coding')}
                                    className={`px-4 py-2 rounded-xl transition ${tpaSubTab === 'coding' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    Coding &amp; Scrubbing (Taiga)
                                </button>
                                <button
                                    onClick={() => setTpaSubTab('orchestrator')}
                                    className={`px-4 py-2 rounded-xl transition ${tpaSubTab === 'orchestrator' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    Claims Timeline Simulator
                                </button>
                            </div>

                            {/* Inner tab content */}
                            <div className="mt-4">
                                {tpaSubTab === 'prior_auth' && <PriorAuthCopilot />}
                                {tpaSubTab === 'denial' && <DenialHub />}
                                {tpaSubTab === 'denial_queue' && <DenialQueue />}
                                {tpaSubTab === 'coding' && <BillingCoderView />}
                                {tpaSubTab === 'orchestrator' && <WorkflowOrchestrator />}
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
