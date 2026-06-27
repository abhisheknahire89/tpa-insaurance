import React, { useState } from 'react';
import { PreAuthWizard } from './PreAuthWizard';
import { getRequiredDocuments } from '../data/icd10DocumentMap';
import { extractInsurancePreAuthData } from '../services/geminiService';

// --- TYPES ---

export type EnhancementTrigger = 'new_procedure' | 'extended_stay' | 'icu_upgrade';

export interface EnhancementInput {
    originalApprovalRef: string;
    originalApprovedAmount: number;
    amountUtilizedToDate: number;
    trigger: EnhancementTrigger;
    newProcedureName?: string;
    newProcedureCode?: string;
    newProcedureDate?: string;
    newProcedureForeseeable?: boolean;
    clinicalFindingTriggeringProcedure?: string;
    originalDischargeDate?: string;
    newDischargeDate?: string;
    dischargeDelayReasons?: string[];
    deteriorationDateTime?: string;
    deteriorationVitals?: string;
    icuIntervention?: string;
    additionalAmountRequested: number;
    currentSeverityScores?: {
        phenoIntensity: number;
        deteriorationVelocity: number;
    };
}

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

const generateEnhancementDocument = (trigger: EnhancementTrigger, input: EnhancementInput, preAuthData: any) => {
    let triggerDetails = '';
    switch (trigger) {
        case 'new_procedure':
            triggerDetails = `New Procedure: ${input.newProcedureName} (${input.newProcedureCode})\nDate: ${input.newProcedureDate}\nWas foreseeable: ${input.newProcedureForeseeable ? 'Yes' : 'No'}\nClinical Finding: ${input.clinicalFindingTriggeringProcedure}`;
            break;
        case 'extended_stay':
            triggerDetails = `Original Discharge: ${input.originalDischargeDate}\nNew Expected Discharge: ${input.newDischargeDate}\nReasons for delay: ${input.dischargeDelayReasons?.join(', ')}`;
            break;
        case 'icu_upgrade':
            triggerDetails = `Deterioration DateTime: ${input.deteriorationDateTime}\nVitals: ${input.deteriorationVitals}\nICU Intervention: ${input.icuIntervention}`;
            break;
    }

    const preauthPatient = preAuthData?.patient?.patientName || preAuthData?.record?.patient?.patientName || 'N/A';
    const preauthDiagnosis = preAuthData?.clinical?.diagnoses?.[0]?.diagnosis || preAuthData?.record?.clinical?.diagnoses?.[0]?.diagnosis || 'N/A';

    return `
ENHANCEMENT REQUEST DOCUMENT
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
    });
    const [doc, setDoc] = useState('');

    const handleGenerate = () => {
        setDoc(generateEnhancementDocument(input.trigger, input, preAuthData));
    };

    return (
        <div className="p-4 bg-gray-900 text-white rounded-lg shadow-md space-y-4">
            <h2 className="text-xl font-bold">Enhancement Request</h2>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm">Original Approval Reference</label>
                    <input className="w-full p-2 bg-gray-800 rounded border border-gray-700" value={input.originalApprovalRef} onChange={e => setInput({ ...input, originalApprovalRef: e.target.value })} />
                </div>
                <div>
                    <label className="block text-sm">Original Approved Amount (₹)</label>
                    <input type="number" className="w-full p-2 bg-gray-800 rounded border border-gray-700" value={input.originalApprovedAmount} onChange={e => setInput({ ...input, originalApprovedAmount: Number(e.target.value) })} />
                </div>
                <div>
                    <label className="block text-sm">Amount Utilized to Date (₹)</label>
                    <input type="number" className="w-full p-2 bg-gray-800 rounded border border-gray-700" value={input.amountUtilizedToDate} onChange={e => setInput({ ...input, amountUtilizedToDate: Number(e.target.value) })} />
                </div>
                <div>
                    <label className="block text-sm">Trigger Type</label>
                    <select className="w-full p-2 bg-gray-800 rounded border border-gray-700" value={input.trigger} onChange={e => setInput({ ...input, trigger: e.target.value as EnhancementTrigger })}>
                        <option value="new_procedure">New Procedure</option>
                        <option value="extended_stay">Extended Stay</option>
                        <option value="icu_upgrade">ICU Upgrade</option>
                    </select>
                </div>
            </div>

            {input.trigger === 'extended_stay' && (
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm">Original Discharge Date</label><input type="date" className="w-full p-2 bg-gray-800 rounded border border-gray-700" onChange={e => setInput({ ...input, originalDischargeDate: e.target.value })} /></div>
                    <div><label className="block text-sm">New Expected Discharge Date</label><input type="date" className="w-full p-2 bg-gray-800 rounded border border-gray-700" onChange={e => setInput({ ...input, newDischargeDate: e.target.value })} /></div>
                </div>
            )}

            {input.trigger === 'new_procedure' && (
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm">Procedure Name</label><input className="w-full p-2 bg-gray-800 rounded border border-gray-700" onChange={e => setInput({ ...input, newProcedureName: e.target.value })} /></div>
                    <div><label className="block text-sm">Procedure Code</label><input className="w-full p-2 bg-gray-800 rounded border border-gray-700" onChange={e => setInput({ ...input, newProcedureCode: e.target.value })} /></div>
                </div>
            )}

            {input.trigger === 'icu_upgrade' && (
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm">Deterioration Vitals</label><input className="w-full p-2 bg-gray-800 rounded border border-gray-700" onChange={e => setInput({ ...input, deteriorationVitals: e.target.value })} /></div>
                    <div><label className="block text-sm">ICU Intervention Required</label><input className="w-full p-2 bg-gray-800 rounded border border-gray-700" onChange={e => setInput({ ...input, icuIntervention: e.target.value })} /></div>
                </div>
            )}

            <div className="pt-2">
                <label className="block text-sm text-red-400 font-bold">Additional Amount Requested (₹)</label>
                <input type="number" className="w-1/2 p-2 bg-gray-800 rounded border border-gray-700" value={input.additionalAmountRequested} onChange={e => setInput({ ...input, additionalAmountRequested: Number(e.target.value) })} />
            </div>

            <button onClick={handleGenerate} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition shadow">Generate Document</button>

            {doc && (
                <div className="mt-4 p-4 bg-gray-950 rounded border border-gray-700">
                    <pre className="whitespace-pre-wrap text-sm">{doc}</pre>
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
    const [activeModule, setActiveModule] = useState<'preauth' | 'enhancement' | 'reimbursement'>('preauth');
    const [preAuthOutput, setPreAuthOutput] = useState<any>(null); // State passing

    // Testing state for isolated environment
    const [mockClinicalNote, setMockClinicalNote] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);
    const [prefilledData, setPrefilledData] = useState<any>(null);
    const [showWizard, setShowWizard] = useState(false);

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

    return (
        <div className="min-h-screen bg-black text-white p-6">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Horizontal Stepper */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <h1 className="text-2xl font-black text-blue-400">Insurance Center</h1>
                    <div className="flex space-x-2">
                        <button
                            className={`px-4 py-2 rounded-full text-sm font-bold transition ${activeModule === 'preauth' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                            onClick={() => setActiveModule('preauth')}
                        >
                            Step 1: Pre-Auth
                        </button>
                        <div className="self-center hidden sm:block w-4 h-0.5 bg-gray-700"></div>
                        <button
                            className={`px-4 py-2 rounded-full text-sm font-bold transition ${activeModule === 'enhancement' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                            onClick={() => setActiveModule('enhancement')}
                        >
                            Step 2: Enhancement
                        </button>
                        <div className="self-center hidden sm:block w-4 h-0.5 bg-gray-700"></div>
                        <button
                            className={`px-4 py-2 rounded-full text-sm font-bold transition ${activeModule === 'reimbursement' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                            onClick={() => setActiveModule('reimbursement')}
                        >
                            Step 3: Final Claim
                        </button>
                    </div>
                </div>

                {/* Content area */}
                <div className="mt-4">
                    {activeModule === 'preauth' && (
                        <div className="relative border border-white/10 rounded-xl overflow-hidden min-h-[500px] flex items-center justify-center bg-gray-950">
                            {showWizard ? (
                                <PreAuthWizard onClose={() => setShowWizard(false)} prefilledData={prefilledData} existingRecord={preAuthOutput?.record} />
                            ) : (
                                <div className="p-8 w-full max-w-3xl space-y-6">
                                    <h3 className="text-xl font-bold text-gray-200">Test Pre-Auth Flow</h3>
                                    <p className="text-sm text-gray-400">Paste an entire clinical note below to magically extract all Pre-Authorization fields utilizing the AI model. This represents the API integration layer.</p>

                                    <textarea
                                        className="w-full h-64 bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                                        placeholder="E.g., Anil Kankriya, 58 year old male. Known diabetic on metformin. Presenting with high grade fever..."
                                        value={mockClinicalNote}
                                        onChange={(e) => setMockClinicalNote(e.target.value)}
                                    />

                                    <div className="flex justify-end gap-3 mt-4">
                                        <button
                                            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 font-semibold rounded-lg text-white"
                                            onClick={() => setShowWizard(true)}
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
                            )}
                        </div>
                    )}

                    {activeModule === 'enhancement' && (
                        <EnhancementModule preAuthData={preAuthOutput} />
                    )}

                    {activeModule === 'reimbursement' && (
                        <ReimbursementModule />
                    )}
                </div>

            </div>
        </div>
    );
};
