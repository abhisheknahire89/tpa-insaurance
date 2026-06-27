import React, { useState, useCallback } from 'react';
import {
    PreAuthRecord, PatientRecord, InsurancePolicyDetails,
    ClinicalDetails, AdmissionDetails, CostEstimate, WizardState
} from './types';
import { WizardProgress } from './WizardProgress';
import { PatientInsuranceStep } from './PatientInsuranceStep';
import { ClinicalDetailsStep } from './ClinicalDetailsStep';
import { AdmissionCostStep } from './AdmissionCostStep';
import { DocumentsGenerateStep } from './DocumentsGenerateStep';
import { VoiceDictationMode } from './VoiceDictationMode';
import { VoiceExtractedData } from '../../services/voiceDictationService';
import { savePreAuth, savePatient, generatePreAuthId, generatePatientId } from '../../services/storageService';
import { calculateTotals } from '../../utils/costCalculator';
import { calculateCost, findConditionByICD } from '../../services/costEstimationService';
import { todayISO, nowTimeString } from '../../utils/formatters';

interface PreAuthWizardProps {
    onClose: () => void;
    existingRecord?: PreAuthRecord;
    prefilledData?: Partial<PreAuthRecord>;
}

const buildEmptyRecord = (): Partial<PreAuthRecord> => ({
    id: generatePreAuthId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    version: 1,
    createdBy: 'Insurance Desk',
    patient: {},
    insurance: { dataSource: 'manual' },
    clinical: {
        dataSource: 'manual_entry',
        diagnoses: [],
        selectedDiagnosisIndex: 0,
        proposedLineOfTreatment: { medical: false, surgical: false, intensiveCare: false, investigation: false, nonAllopathic: false },
        vitals: { bp: '', pulse: '', temp: '', spo2: '', rr: '' },
        voiceCapturedFindings: [],
        chiefComplaints: '',
        durationOfPresentAilment: '',
        natureOfIllness: 'Acute',
        historyOfPresentIllness: '',
        relevantClinicalFindings: '',
        treatmentTakenSoFar: '',
        reasonForHospitalisation: '',
        additionalClinicalNotes: '',
    },
    admission: {
        admissionType: 'Emergency',
        dateOfAdmission: todayISO(),
        timeOfAdmission: nowTimeString(),
        roomCategory: 'General Ward',
        expectedDaysInICU: 0,
        expectedDaysInRoom: 0,
        expectedLengthOfStay: 0,
        pastMedicalHistory: {
            diabetes: { present: false }, hypertension: { present: false }, heartDisease: { present: false },
            asthma: { present: false }, epilepsy: { present: false }, cancer: { present: false },
            kidney: { present: false }, liver: { present: false }, hiv: { present: false },
            alcoholism: { present: false }, smoking: { present: false }, anyOther: { present: false },
        },
        previousHospitalization: { wasHospitalizedBefore: false },
    },
    costEstimate: calculateTotals({}, 0),
    uploadedDocuments: [],
    documentRequirements: [],
    declarations: { patient: {}, doctor: {}, hospital: {} },
    outputs: {},
});

export const PreAuthWizard: React.FC<PreAuthWizardProps> = ({ onClose, existingRecord, prefilledData }) => {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [showVoiceMode, setShowVoiceMode] = useState(false);
    const [record, setRecord] = useState<Partial<PreAuthRecord>>(() => {
        if (existingRecord) return existingRecord;
        const empty = buildEmptyRecord();
        if (prefilledData) {
            return {
                ...empty,
                ...prefilledData,
                patient: { ...empty.patient, ...prefilledData.patient },
                clinical: { ...empty.clinical, ...prefilledData.clinical },
                admission: { ...empty.admission, ...prefilledData.admission },
                costEstimate: prefilledData.costEstimate ?? empty.costEstimate,
            };
        }
        return empty;
    });
    const [saving, setSaving] = useState(false);

    const updateRecord = useCallback(async (partial: Partial<PreAuthRecord>) => {
        const updated = { ...record, ...partial, updatedAt: new Date().toISOString() };
        setRecord(updated);
        try { await savePreAuth(updated as PreAuthRecord); } catch (e) { /* silent */ }
    }, [record]);

    const handleNext = async () => {
        setSaving(true);
        await updateRecord({});
        setSaving(false);
        if (step < 4) setStep((step + 1) as any);
    };

    const handleBack = () => {
        if (step > 1) setStep((step - 1) as any);
    };

    const handleGenerate = async (irdaiText: string) => {
        const finalStatus = (record.uploadedDocuments ?? []).length === 0 ? 'pending_documents' : 'ready_to_submit';
        await updateRecord({ status: finalStatus, outputs: { irdaiText } });
        if (record.patient?.patientName) {
            const pat = { id: generatePatientId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...record.patient } as PatientRecord;
            await savePatient(pat);
        }
    };

    // ── Voice dictation: bulk-fill all sections, auto-calculate costs, jump to step 4 ──
    const handleVoiceComplete = async (data: VoiceExtractedData) => {
        const los = data.admission.expectedLengthOfStay ?? 0;
        const roomDays = data.admission.expectedDaysInRoom ?? los;
        const icuDays = data.admission.expectedDaysInICU ?? 0;

        // Build a smart cost estimate from the Gemini-extracted admission info
        let baseCost = calculateTotals({
            expectedRoomDays: roomDays,
            expectedIcuDays: icuDays,
        }, data.insurance.sumInsured ?? 0);

        // ✅ FIX: If voice extracted ICD code, auto-calculate costs from ICD database
        const voiceDx = data.clinical?.diagnoses?.[0];
        const voiceICD = voiceDx?.icd10Code;
        if (voiceICD) {
            const roomCat = data.admission.roomCategory ?? 'General Ward';
            const isPMJAY = data.insurance.policyType?.toLowerCase().includes('pmjay') ||
                data.insurance.policyType?.toLowerCase().includes('ayushman') || false;

            console.log(`[VoiceCostFix] Calculating costs from ICD DB: ${voiceICD}, room=${roomCat}, PMJAY=${isPMJAY}`);
            const est = calculateCost(voiceICD, roomCat, isPMJAY, los || undefined, icuDays || undefined);

            // Also fix LOS from ICD database if voice didn't capture it
            const icdCond = findConditionByICD(voiceICD);
            const finalLOS = los || (icdCond?.los.avg ?? 5);
            const finalICU = icuDays || (icdCond?.los.icu ?? 0);
            const finalWard = finalLOS - finalICU;

            baseCost = calculateTotals({
                roomRentPerDay: est.breakdown.room_rent / Math.max(1, est.los.ward_days),
                expectedRoomDays: finalWard,
                nursingChargesPerDay: est.breakdown.nursing_charges / Math.max(1, est.los.ward_days),
                icuChargesPerDay: finalICU > 0 ? est.breakdown.icu_charges / finalICU : 0,
                expectedIcuDays: finalICU,
                otCharges: est.breakdown.ot_charges,
                surgeonFee: est.breakdown.surgeon_fee,
                anesthetistFee: est.breakdown.anesthetist_fee,
                consultantFee: est.breakdown.consultant_fee,
                investigationsEstimate: est.breakdown.investigations,
                medicinesEstimate: est.breakdown.medicines,
                consumablesEstimate: est.breakdown.consumables,
                miscCharges: est.breakdown.miscellaneous,
                ...(est.source === 'PMJAY' && est.pmjay_details ? {
                    isPackageRate: true,
                    packageName: est.pmjay_details.package_name,
                    packageAmount: est.pmjay_details.package_rate,
                } : {}),
            }, data.insurance.sumInsured ?? 0);

            console.log(`[VoiceCostFix] Result: LOS=${finalLOS}, Total=₹${baseCost.totalEstimatedCost}`);
        }

        const merged: Partial<PreAuthRecord> = {
            ...record,
            patient: { ...record.patient, ...data.patient },
            insurance: { ...record.insurance, ...data.insurance, dataSource: 'manual' as const },
            clinical: {
                ...record.clinical,
                ...data.clinical,
            } as Partial<ClinicalDetails>,
            admission: {
                ...record.admission,
                ...data.admission,
                dateOfAdmission: record.admission?.dateOfAdmission ?? todayISO(),
                timeOfAdmission: record.admission?.timeOfAdmission ?? nowTimeString(),
            } as Partial<AdmissionDetails>,
            costEstimate: baseCost,
            updatedAt: new Date().toISOString(),
        };

        setSaving(true);
        const updated = { ...merged, updatedAt: new Date().toISOString() };
        setRecord(updated);
        try { await savePreAuth(updated as PreAuthRecord); } catch (e) { /**/ }
        setSaving(false);
        setShowVoiceMode(false);
        // Jump straight to Documents & Generate — all data is pre-filled
        setStep(4);
    };

    // ── Voice dictation overlay ─────────────────────────────────────────────────
    if (showVoiceMode) {
        return (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto">
                <div className="bg-gray-950 border border-white/10 rounded-2xl w-full max-w-3xl my-8 mx-4 shadow-2xl">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <span className="text-red-400 font-bold text-sm">🎙️ Voice Dictation</span>
                            <span className="font-mono text-xs text-gray-500">{record.id}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            {saving && <span className="text-xs text-gray-500">💾 Saving...</span>}
                            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none transition-colors">✕</button>
                        </div>
                    </div>
                    <div className="px-6 py-6">
                        <VoiceDictationMode
                            onComplete={handleVoiceComplete}
                            onCancel={() => setShowVoiceMode(false)}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-gray-950 border border-white/10 rounded-2xl w-full max-w-3xl my-8 mx-4 shadow-2xl">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <span className="text-blue-400 font-bold text-sm">📋 New Pre-Authorization</span>
                        <span className="font-mono text-xs text-gray-500">{record.id}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {saving && <span className="text-xs text-gray-500">💾 Saving...</span>}
                        <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none transition-colors">✕</button>
                    </div>
                </div>

                {/* Voice Dictation Banner — shown on step 1 */}
                {step === 1 && (
                    <div className="mx-6 mt-4 bg-gradient-to-r from-red-900/20 to-rose-900/10 border border-red-500/20 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">🎙️</span>
                            <div>
                                <div className="text-sm font-semibold text-white">Voice Dictation — Fastest</div>
                                <div className="text-xs text-gray-400">Speak clinical notes → AI fills ALL fields instantly</div>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowVoiceMode(true)}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white transition-all hover:scale-105 whitespace-nowrap">
                            Start Dictating →
                        </button>
                    </div>
                )}

                {/* Progress Bar */}
                <div className="px-6 pt-4 pb-3">
                    <WizardProgress currentStep={step} onStepClick={s => s < step && setStep(s)} />
                </div>

                {/* Step Content */}
                <div className="px-6 pb-6 min-h-[500px] overflow-y-auto" style={{ maxHeight: '75vh' }}>
                    {step === 1 && (
                        <PatientInsuranceStep
                            patient={record.patient ?? {}}
                            insurance={record.insurance ?? {}}
                            onPatientChange={p => updateRecord({ patient: p })}
                            onInsuranceChange={ins => updateRecord({ insurance: ins })}
                            onNext={handleNext}
                        />
                    )}
                    {step === 2 && (
                        <ClinicalDetailsStep
                            clinical={record.clinical ?? {}}
                            onClinicalChange={c => updateRecord({ clinical: c })}
                            onNext={handleNext}
                            onBack={handleBack}
                        />
                    )}
                    {step === 3 && (
                        <AdmissionCostStep
                            admission={record.admission ?? {}}
                            cost={record.costEstimate ?? {}}
                            clinical={record.clinical ?? {}}
                            sumInsured={record.insurance?.sumInsured ?? 0}
                            onAdmissionChange={a => updateRecord({ admission: a })}
                            onCostChange={c => updateRecord({ costEstimate: c })}
                            onNext={handleNext}
                            onBack={handleBack}
                        />
                    )}
                    {step === 4 && (
                        <DocumentsGenerateStep
                            record={record}
                            onRecordChange={r => updateRecord(r)}
                            onBack={handleBack}
                            onGenerate={handleGenerate}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
