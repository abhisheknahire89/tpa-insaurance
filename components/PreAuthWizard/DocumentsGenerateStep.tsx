import React, { useState, useRef, useEffect } from 'react';
import { PreAuthRecord, WizardDocument, WizardDocCategory, MedicalNecessityStatement, DoctorDeclarationData, PatientDeclarationData, HospitalDeclarationData, EvidenceSuggestion } from '../PreAuthWizard/types';
import { generateMedicalNecessity, generateIRDAITextFromRecord } from '../../services/medicalNecessityService';
import { extractSuggestionsFromEvidence } from '../../services/evidenceExtractionService';
import { scoreNecessityStrength } from '../../utils/strengthScorer';
import { getRequiredDocuments } from '../../utils/documentRequirements';
import { DEFAULT_DOCTORS } from '../../config/hospitalConfig';
import { formatFileSize } from '../../utils/formatters';
import { reviewEvidence, EvidenceReviewReport } from '../../engine/evidenceReview';
import { generatePartC, generatePartCText, PartCOutput } from '../../engine/partCGenerator';
import { logEvent } from '../../utils/auditLog';
import { validateCode } from '../../services/icdService';
import { computeReadiness } from '../../utils/readinessScore';

interface DocGenerateStepProps {
    record: Partial<PreAuthRecord>;
    onRecordChange: (r: Partial<PreAuthRecord>) => void;
    onBack: () => void;
    onGenerate: (irdaiText: string) => void;
    defaultTab?: 'docs' | 'necessity' | 'summary' | 'declarations' | 'tpa-review';
    isDemo?: boolean;
    onResetDemo?: () => void;
    onJumpToStep?: (step: 1 | 2 | 3 | 4) => void;
    /** If provided by the parent wizard shell, use this instead of fetching separately */
    externalTpaReport?: EvidenceReviewReport | null;
}

const STRENGTH_CONFIG = {
    strong: { label: 'STRONG', color: 'text-green-400 bg-green-500/10 border-green-500/30', icon: '🟢' },
    moderate: { label: 'MODERATE', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: '🟡' },
    weak: { label: 'WEAK', color: 'text-red-400 bg-red-500/10 border-red-500/30', icon: '🔴' },
};

export const DocumentsGenerateStep: React.FC<DocGenerateStepProps> = ({
    record, onRecordChange, onBack, onGenerate, defaultTab, isDemo = false, onResetDemo, onJumpToStep, externalTpaReport
}) => {
    const [activeTab, setActiveTab] = useState<'docs' | 'necessity' | 'summary' | 'declarations' | 'tpa-review' | 'partc-review'>(defaultTab ?? 'docs');
    // Use externalTpaReport if provided by the parent wizard shell (avoids double-fetching)
    const [tpaReport, setTpaReport] = useState<EvidenceReviewReport | null>(externalTpaReport ?? null);
    const [partCOutput, setPartCOutput] = useState<PartCOutput | null>(null);
    const [tpaLoading, setTpaLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<EvidenceSuggestion[] | null>(null);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const [necessity, setNecessity] = useState<MedicalNecessityStatement | null>(record.medicalNecessity ?? null);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const [generating, setGenerating] = useState(false);
    const [generated, setGenerated] = useState(false);
    const [irdaiText, setIrdaiText] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    // Only fetch TPA report internally if not provided externally
    useEffect(() => {
        if (externalTpaReport !== undefined) {
            setTpaReport(externalTpaReport);
            return;
        }
        let active = true;
        const fetchReview = async () => {
            setTpaLoading(true);
            try {
                const report = await reviewEvidence(record);
                if (active) {
                    setTpaReport(report);
                    // Generate Part C immediately after evidence review
                    const partC = generatePartC(record, report);
                    setPartCOutput(partC);
                    // Audit: evidence_reviewed
                    if (record.id) {
                        logEvent(record.id, 'evidence_reviewed', {
                            status: report.status,
                            gapCount: report.insufficientEvidence.length,
                            mandatoryGapCount: report.mandatoryGaps.length,
                            insufficientItems: report.insufficientEvidence,
                        });
                    }
                }
            } catch (err) {
                console.error("Failed to run TPA review:", err);
            } finally {
                if (active) {
                    setTpaLoading(false);
                }
            }
        };
        fetchReview();
        return () => { active = false; };
    }, [record, externalTpaReport]);

    useEffect(() => {
        let active = true;
        const fetchSuggestions = async () => {
            if ((activeTab !== 'partc-review' && activeTab !== 'docs') || suggestions || suggestionsLoading || !record.uploadedDocuments?.length) return;
            setSuggestionsLoading(true);
            try {
                // Pass documents and diagnosis to extractSuggestionsFromEvidence
                const diag = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0]?.diagnosis;
                const sugg = await extractSuggestionsFromEvidence(record.uploadedDocuments, diag);
                if (active) setSuggestions(sugg);
            } catch (err) {
                console.error("Failed to fetch suggestions", err);
            } finally {
                if (active) setSuggestionsLoading(false);
            }
        };
        fetchSuggestions();
        return () => { active = false; };
    }, [activeTab, record, suggestions, suggestionsLoading]);

    const handleAcceptAllSuggestions = () => {
        if (!suggestions) return;
        const up = { ...record };
        if (!up.clinical) up.clinical = {};
        if (!up.clinical.injuryDetails) up.clinical.injuryDetails = {};
        if (!up.insurance) up.insurance = {};
        if (!up.patient) up.patient = {};
        
        suggestions.forEach(sug => {
            if (sug.field === 'clinical.relevantClinicalFindings') up.clinical!.relevantClinicalFindings = sug.suggestedValue;
            if (sug.field === 'clinical.historyOfPresentIllness') up.clinical!.historyOfPresentIllness = sug.suggestedValue;
            if (sug.field === 'clinical.firstConsultationDate') up.clinical!.firstConsultationDate = sug.suggestedValue;
            if (sug.field === 'clinical.injuryDetails.isInjury') up.clinical!.injuryDetails!.isInjury = sug.suggestedValue === 'Yes';
            if (sug.field === 'clinical.injuryDetails.alcoholInvolvement') up.clinical!.injuryDetails!.alcoholInvolvement = sug.suggestedValue === 'Yes';
            if (sug.field === 'insurance.hasOtherHealthPolicy') up.insurance!.hasOtherHealthPolicy = sug.suggestedValue === 'Yes';
            if (sug.field === 'patient.familyPhysicianName') up.patient!.familyPhysicianName = sug.suggestedValue;
        });
        
        onRecordChange(up);
    };

    const handleAcceptSuggestion = (fieldKey: string, value: any) => {
        const up = { ...record };
        if (!up.clinical) up.clinical = {};
        if (!up.clinical.injuryDetails) up.clinical.injuryDetails = {};
        if (!up.insurance) up.insurance = {};
        if (!up.patient) up.patient = {};

        switch (fieldKey) {
            case 'clinical.relevantClinicalFindings': up.clinical.relevantClinicalFindings = value; break;
            case 'clinical.historyOfPresentIllness': up.clinical.historyOfPresentIllness = value; break;
            case 'clinical.firstConsultationDate': up.clinical.firstConsultationDate = value; break;
            case 'clinical.injuryDetails.isInjury': up.clinical.injuryDetails.isInjury = value === 'Yes'; break;
            case 'clinical.injuryDetails.alcoholInvolvement': up.clinical.injuryDetails.alcoholInvolvement = value === 'Yes'; break;
            case 'insurance.hasOtherHealthPolicy': up.insurance.hasOtherHealthPolicy = value === 'Yes'; break;
            case 'patient.familyPhysicianName': up.patient.familyPhysicianName = value; break;
        }
        onRecordChange(up);
    };


    const docs = record.uploadedDocuments ?? [];
    const selectedDx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
    const diagnosisText = selectedDx?.diagnosis ?? '';
    const requiredDocs = getRequiredDocuments(selectedDx?.icd10Code ?? diagnosisText);

    const docDecl = record.declarations?.patient ?? {} as Partial<PatientDeclarationData>;
    const drDecl = record.declarations?.doctor ?? {} as Partial<DoctorDeclarationData>;
    const hospDecl = record.declarations?.hospital ?? {} as Partial<HospitalDeclarationData>;

    const currentPartC = partCOutput || generatePartC(record, tpaReport);
    const icdCode = selectedDx?.icd10Code ?? '';
    // Block generation if code is absent, a placeholder, or not found in the WHO table
    const hasInvalidICD = !icdCode || icdCode === 'Pending ICD-10' || icdCode === 'Selection required' || !validateCode(icdCode);
    const isSurgical = record.clinical?.proposedLineOfTreatment?.surgical || false;
    const hasZeroSurgicalCosts = isSurgical && 
        (record.costEstimate?.otCharges ?? 0) === 0 && 
        (record.costEstimate?.surgeonFee ?? 0) === 0 && 
        (record.costEstimate?.totalImplantsCost ?? 0) === 0;

    const blockingGaps = [
        !record.patient?.patientName ? 'Patient Name is required.' : null,
        !selectedDx?.diagnosis ? 'Diagnosis is required.' : null,
        hasInvalidICD ? 'A confirmed, valid ICD-10 code is required.' : null,
        !record.declarations?.doctor?.doctorRegistrationNumber ? 'Doctor Registration Number is required.' : null,
        !record.admission?.dateOfAdmission ? 'Date of Admission is required.' : null,
        hasZeroSurgicalCosts ? 'Surgical procedure requires Surgeon Fee, OT Charges, or Implants Cost to be non-zero.' : null,
    ].filter(Boolean) as string[];

    const hasBlockers = blockingGaps.length > 0;

    // Readiness score — from the shared utility (same logic as the persistent rail)
    const { score: readinessScore, missingItems } = computeReadiness(record, tpaReport);



    const updateDecl = (partial: { patient?: Partial<PatientDeclarationData>; doctor?: Partial<DoctorDeclarationData>; hospital?: Partial<HospitalDeclarationData> }) => {
        onRecordChange({ ...record, declarations: { ...record.declarations as any, ...partial } });
    };

    const missingDocs = requiredDocs.filter(req => req.isRequired && !docs.some(d => d.documentCategory === req.category));

    const generateNecessity = () => {
        const result = generateMedicalNecessity(record);
        setNecessity(result);
        onRecordChange({ ...record, medicalNecessity: result });
    };

    useEffect(() => {
        if (!necessity) generateNecessity();
    }, []);

    const handleFileUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = (e.target?.result as string) ?? '';
            const guessedCategory = guessCategory(file.name);
            
            // Phase 2 Checks:
            // 1. Duplicate check
            const isDuplicate = docs.some(d => d.fileName === file.name || d.base64Data === base64);
            const duplicateWarning = isDuplicate ? '⚠️ Duplicate document name/content already uploaded' : undefined;

            // 2. Expiry check
            let expiryWarning = undefined;
            if (guessedCategory === 'policy_copy' && record.insurance?.policyEndDate) {
                const now = new Date();
                const end = new Date(record.insurance.policyEndDate);
                if (end < now) {
                    expiryWarning = '⚠️ Insurance Policy copy has expired.';
                }
            }

            // 3. Readability check (Simulated OCR verification)
            const isPoorQuality = file.name.toLowerCase().includes('blurry') || file.name.toLowerCase().includes('unreadable') || file.size < 2048;
            const readabilityConfidence = isPoorQuality ? 42 : 96;
            const readabilityWarning = isPoorQuality ? '⚠️ Low readability warning (OCR confidence < 50%)' : undefined;

            const doc: WizardDocument = {
                id: `DOC-${Date.now()}`,
                fileName: file.name,
                fileSizeDisplay: formatFileSize(file.size),
                fileType: file.type.includes('pdf') ? 'pdf' : 'image',
                mimeType: file.type,
                uploadedAt: new Date().toISOString(),
                base64Data: base64,
                documentCategory: guessedCategory,
                autoClassified: true,
                isRequired: requiredDocs.some(r => r.category === guessedCategory && r.isRequired),
                duplicateWarning,
                expiryWarning,
                readabilityWarning,
                readabilityConfidence
            };
            onRecordChange({ ...record, uploadedDocuments: [...docs, doc] });
        };
        reader.readAsDataURL(file);
    };

    const removeDoc = (id: string) => {
        onRecordChange({ ...record, uploadedDocuments: docs.filter(d => d.id !== id) });
    };

    const updateDocCategory = (id: string, category: WizardDocCategory) => {
        onRecordChange({ ...record, uploadedDocuments: docs.map(d => d.id === id ? { ...d, documentCategory: category } : d) });
    };

    const handleGenerate = async () => {
        setGenerating(true);
        const finalNecessity = necessity ? { ...necessity, editedText: isEditing ? editText : undefined, wasEdited: isEditing } : generateMedicalNecessity(record);
        const finalRecord = { ...record, medicalNecessity: finalNecessity };

        let text = generatePartCText(currentPartC);

        setIrdaiText(text);
        setGenerating(false);
        setGenerated(true);
        onGenerate(text);

        // Audit: log submission event
        if (record.id && partCOutput) {
            const eventType = partCOutput.submittabilityStatus === 'complete'
                ? 'submitted_sufficient'
                : 'submitted_insufficient';
            logEvent(record.id, eventType, {
                submittabilityStatus: partCOutput.submittabilityStatus,
                icdCode: partCOutput.icd.code,
                diagnosisName: partCOutput.diagnosisName,
                missingItems: eventType === 'submitted_insufficient'
                    ? partCOutput.gaps.map(g => `${g.field}: ${g.reason}`)
                    : undefined,
                totalEstimatedCost: partCOutput.totalEstimatedCost,
            });
        }
    };

    const buildPrintHTML = (text: string) => {
        const patient = record.patient;
        const ins = record.insurance;
        const dx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
        const isDraft = currentPartC?.isDraftPendingData ?? false;
        const draftBanner = isDraft ? `
  <div style="background-color: #fef2f2; border: 1px solid #fee2e2; color: #b91c1c; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 15px; border-radius: 6px; font-family: sans-serif; font-size: 11pt;">
    *** DRAFT — PENDING DATA (NOT FOR SUBMISSION) ***
  </div>` : '';

        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Pre-Auth — ${record.id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; background: #fff; padding: 20mm 18mm; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 14px; }
    .header h1 { font-size: 14pt; font-weight: bold; letter-spacing: 1px; }
    .header p  { font-size: 9pt; color: #444; margin-top: 2px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-bottom: 14px; font-size: 10pt; }
    .meta-row { display: flex; gap: 6px; }
    .meta-row .label { font-weight: bold; min-width: 120px; }
    .section-title { font-weight: bold; font-size: 10pt; border-bottom: 1px solid #999; margin: 12px 0 6px; padding-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    pre { white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 9.5pt; line-height: 1.5; }
    .footer { margin-top: 20px; border-top: 1px solid #999; padding-top: 10px; font-size: 9pt; color: #444; text-align: center; }
    @media print { body { padding: 10mm 12mm; } }
  </style>
</head>
<body>
  ${draftBanner}
  <div class="header">
    <h1>INSURANCE PRE-AUTHORIZATION REQUEST</h1>
    <p>IRDAI Part-C — Medical Necessity Statement</p>
  </div>
  <div class="meta">
    <div class="meta-row"><span class="label">Ref No:</span> ${record.id ?? '—'}</div>
    <div class="meta-row"><span class="label">Date:</span> ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    <div class="meta-row"><span class="label">Patient:</span> ${patient?.patientName ?? '—'}, ${patient?.age ?? '?'}Y ${patient?.gender ?? ''}</div>
    <div class="meta-row"><span class="label">Policy No:</span> ${ins?.policyNumber ?? '—'}</div>
    <div class="meta-row"><span class="label">Insurer:</span> ${ins?.insurerName ?? '—'}</div>
    <div class="meta-row"><span class="label">TPA:</span> ${ins?.tpaName ?? '—'}</div>
    <div class="meta-row"><span class="label">Diagnosis:</span> ${dx?.diagnosis ?? '—'}</div>
    <div class="meta-row"><span class="label">ICD-10:</span> ${dx?.icd10Code ?? '—'}</div>
  </div>
  <div class="section-title">Pre-Authorization Document</div>
  <pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  <div class="footer">Generated by Aivana Pre-Auth &nbsp;|&nbsp; Not valid without seal</div>
  ${isDraft ? `
  <div style="background-color: #fef2f2; border: 1px solid #fee2e2; color: #b91c1c; padding: 10px; text-align: center; font-weight: bold; margin-top: 15px; border-radius: 6px; font-family: sans-serif; font-size: 11pt;">
    *** DRAFT — PENDING DATA (NOT FOR SUBMISSION) ***
  </div>` : ''}
</body>
</html>`;
    };

    const handlePrint = () => {
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) return;
        w.document.write(buildPrintHTML(irdaiText));
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); }, 400);
    };

    const handleDownloadPDF = () => {
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) return;
        w.document.write(buildPrintHTML(irdaiText));
        w.document.close();
        w.focus();
        // Slight delay so styles render, then trigger print-to-PDF
        setTimeout(() => {
            w.print();
            // After print dialog, the user saves as PDF from the browser dialog
        }, 500);
    };

    const { strength, reasons } = scoreNecessityStrength(record);
    const strCfg = STRENGTH_CONFIG[strength];

    const allDeclsComplete = docDecl.agreedToTerms && docDecl.consentForMedicalDataSharing && drDecl.confirmed && docDecl.capturedBy;

    const TABS = [
        { id: 'docs', label: 'Documents & Auto-Fill' },
        { id: 'necessity', label: 'Medical Necessity' },
        { id: 'summary', label: 'Summary' },
        { id: 'declarations', label: 'Declarations' },
        { id: 'tpa-review', label: 'Evidence Review' },
        { id: 'partc-review', label: 'Part C Preview' },
    ] as const;

    const AUTOFILL_FIELDS = [
        { key: 'clinical.relevantClinicalFindings', label: 'Relevant Clinical Findings', type: 'textarea' },
        { key: 'clinical.historyOfPresentIllness', label: 'Past History (Illness/Injury)', type: 'textarea' },
        { key: 'clinical.firstConsultationDate', label: 'Date of First Consultation', type: 'date' },
        { key: 'clinical.injuryDetails.isInjury', label: 'Is this an injury?', type: 'select', options: ['Yes', 'No'] },
        { key: 'clinical.injuryDetails.alcoholInvolvement', label: 'Alcohol Involvement', type: 'select', options: ['Yes', 'No'] },
        { key: 'insurance.hasOtherHealthPolicy', label: 'Any Other Health Policy?', type: 'select', options: ['Yes', 'No'] },
        { key: 'patient.familyPhysicianName', label: 'Family Physician Name', type: 'text' }
    ] as const;

    const getFieldValue = (fieldKey: string): string => {
        if (fieldKey === 'clinical.relevantClinicalFindings') return record.clinical?.relevantClinicalFindings ?? '';
        if (fieldKey === 'clinical.historyOfPresentIllness') return record.clinical?.historyOfPresentIllness ?? '';
        if (fieldKey === 'clinical.firstConsultationDate') return record.clinical?.firstConsultationDate ?? '';
        if (fieldKey === 'clinical.injuryDetails.isInjury') {
            const val = record.clinical?.injuryDetails?.isInjury;
            return val === true ? 'Yes' : val === false ? 'No' : '';
        }
        if (fieldKey === 'clinical.injuryDetails.alcoholInvolvement') {
            const val = record.clinical?.injuryDetails?.alcoholInvolvement;
            return val === true ? 'Yes' : val === false ? 'No' : '';
        }
        if (fieldKey === 'insurance.hasOtherHealthPolicy') {
            const val = record.insurance?.hasOtherHealthPolicy;
            return val === true ? 'Yes' : val === false ? 'No' : '';
        }
        if (fieldKey === 'patient.familyPhysicianName') return record.patient?.familyPhysicianName ?? '';
        return '';
    };

    const updateFieldValue = (fieldKey: string, value: string) => {
        const up = { ...record };
        if (!up.clinical) up.clinical = {};
        if (!up.clinical.injuryDetails) up.clinical.injuryDetails = {};
        if (!up.insurance) up.insurance = {};
        if (!up.patient) up.patient = {};

        if (fieldKey === 'clinical.relevantClinicalFindings') up.clinical.relevantClinicalFindings = value;
        else if (fieldKey === 'clinical.historyOfPresentIllness') up.clinical.historyOfPresentIllness = value;
        else if (fieldKey === 'clinical.firstConsultationDate') up.clinical.firstConsultationDate = value;
        else if (fieldKey === 'clinical.injuryDetails.isInjury') up.clinical.injuryDetails.isInjury = value === '' ? undefined : value === 'Yes';
        else if (fieldKey === 'clinical.injuryDetails.alcoholInvolvement') up.clinical.injuryDetails.alcoholInvolvement = value === '' ? undefined : value === 'Yes';
        else if (fieldKey === 'insurance.hasOtherHealthPolicy') up.insurance.hasOtherHealthPolicy = value === '' ? undefined : value === 'Yes';
        else if (fieldKey === 'patient.familyPhysicianName') up.patient.familyPhysicianName = value;

        onRecordChange(up);
    };

    const suggestionsPanel = (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-[#0D121F] border border-white/5 rounded-xl p-4 shadow-sm">
                <div>
                    <h3 className="text-xs font-bold text-blue-400 flex items-center gap-1.5 uppercase tracking-wider">
                        <span>✨</span> AI Suggest-and-Confirm
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-0.5 font-semibold">Review evidence-derived values or fill silent fields.</p>
                </div>
                {suggestions && suggestions.length > 0 && (
                    <button
                        onClick={handleAcceptAllSuggestions}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg shadow-sm transition-all"
                        type="button"
                    >
                        Accept All
                    </button>
                )}
            </div>

            <div className="space-y-3.5">
                {AUTOFILL_FIELDS.map(({ key: fKey, label: fLabel, type: fType, options: fOpts }) => {
                    const currentVal = getFieldValue(fKey);
                    const sug = suggestions?.find(s => s.field === fKey);
                    const hasSuggestion = !!sug;
                    const isApplied = hasSuggestion && currentVal === sug.suggestedValue;

                    if (hasSuggestion) {
                        return (
                            <div key={fKey} className={`border rounded-xl p-4 flex gap-4 items-start transition-colors ${
                                isApplied ? 'bg-emerald-500/[0.01] border-emerald-500/20' : 'bg-blue-500/[0.01] border-blue-500/15'
                            }`}>
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{fLabel}</div>
                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                                            isApplied ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                        }`}>
                                            {isApplied ? '✓ Confirmed (AI)' : '🤖 AI Suggests'}
                                        </span>
                                    </div>
                                    
                                    {isApplied ? (
                                        <div className="space-y-2">
                                            {fType === 'textarea' ? (
                                                <textarea
                                                    value={currentVal}
                                                    onChange={e => updateFieldValue(fKey, e.target.value)}
                                                    rows={3}
                                                    className="w-full bg-[#080B11]/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-all resize-none"
                                                />
                                            ) : fType === 'select' ? (
                                                <select
                                                    value={currentVal}
                                                    onChange={e => updateFieldValue(fKey, e.target.value)}
                                                    className="w-full bg-[#080B11]/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                                                >
                                                    <option value="" className="bg-[#0B0F19]">-- Select --</option>
                                                    {fOpts?.map(opt => <option key={opt} value={opt} className="bg-[#0B0F19]">{opt}</option>)}
                                                </select>
                                            ) : fType === 'date' ? (
                                                <input
                                                    type="date"
                                                    value={currentVal}
                                                    onChange={e => updateFieldValue(fKey, e.target.value)}
                                                    className="w-full bg-[#080B11]/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                                                />
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={currentVal}
                                                    onChange={e => updateFieldValue(fKey, e.target.value)}
                                                    className="w-full bg-[#080B11]/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="text-xs text-white font-semibold bg-black/20 px-3 py-2 rounded-lg border border-white/[0.02]">{sug.suggestedValue}</div>
                                            <div className="bg-blue-950/10 border-l-2 border-blue-500/40 rounded-r-lg p-2.5 text-[10px] text-blue-200/70 font-mono italic">
                                                "{sug.sourceSnippet}"
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {!isApplied && (
                                    <button
                                        onClick={() => updateFieldValue(fKey, sug.suggestedValue)}
                                        className="shrink-0 px-3 py-1.5 mt-5 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white border border-white/10 shadow-sm transition-all"
                                        type="button"
                                    >
                                        Accept
                                    </button>
                                )}
                            </div>
                        );
                    }

                    const isSilentFieldFilled = currentVal !== '';
                    return (
                        <div key={fKey} className={`border rounded-xl p-4 flex flex-col gap-2 transition-colors ${
                            isSilentFieldFilled ? 'bg-[#0D121F]/60 border-white/10' : 'bg-rose-500/[0.01] border-rose-500/15'
                        }`}>
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{fLabel}</div>
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                                    isSilentFieldFilled ? 'bg-slate-500/10 text-slate-300 border-slate-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                }`}>
                                    {isSilentFieldFilled ? '✓ Confirmed (Manual)' : '⚠️ Needs input'}
                                </span>
                            </div>
                            
                            <div className="space-y-2">
                                {fType === 'textarea' ? (
                                    <textarea
                                        value={currentVal}
                                        onChange={e => updateFieldValue(fKey, e.target.value)}
                                        rows={3}
                                        placeholder={`Not found in evidence. Please type ${fLabel.toLowerCase()} manually...`}
                                        className="w-full bg-[#080B11]/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 placeholder-slate-600 transition-all resize-none"
                                    />
                                ) : fType === 'select' ? (
                                    <select
                                        value={currentVal}
                                        onChange={e => updateFieldValue(fKey, e.target.value)}
                                        className="w-full bg-[#080B11]/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                                    >
                                        <option value="" className="bg-[#0B0F19]">-- Select --</option>
                                        {fOpts?.map(opt => <option key={opt} value={opt} className="bg-[#0B0F19]">{opt}</option>)}
                                    </select>
                                ) : fType === 'date' ? (
                                    <input
                                        type="date"
                                        value={currentVal}
                                        onChange={e => updateFieldValue(fKey, e.target.value)}
                                        className="w-full bg-[#080B11]/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-all"
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        value={currentVal}
                                        onChange={e => updateFieldValue(fKey, e.target.value)}
                                        placeholder={`Enter ${fLabel.toLowerCase()}...`}
                                        className="w-full bg-[#080B11]/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 placeholder-slate-600 transition-all"
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    if (generated) {
        const isComplete = partCOutput?.submittabilityStatus === 'complete';
        return (
            <div className="space-y-5">
                {/* Dynamic Success Banner */}
                <div className={`border rounded-2xl p-6 text-center space-y-3 shadow-sm ${
                    isComplete
                        ? 'bg-emerald-500/[0.02] border-emerald-500/15 text-emerald-400'
                        : 'bg-amber-500/[0.02] border-amber-500/15 text-amber-400'
                }`}>
                    <div className="text-3xl">✨</div>
                    <h2 className="text-lg font-bold text-white">Pre-Auth Document Ready</h2>
                    <div className={`font-mono text-xs px-2.5 py-1 rounded-md inline-block ${
                        isComplete
                            ? 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-400'
                            : 'bg-amber-950/40 border border-amber-500/20 text-amber-400'
                    }`}>{record.id}</div>
                    
                    {/* Part C Submittability Status */}
                    <div className="pt-1.5">
                        {partCOutput && (
                            <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold border ${
                                isComplete
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            }`}>
                                <span>{isComplete ? '✓' : '⚠'}</span>
                                <span>{isComplete
                                    ? 'COMPLETE — Ready to Submit'
                                    : `PENDING DOCUMENTS — ${partCOutput.gaps.filter(g => g.severity === 'blocking').length} blocking issues`
                                }</span>
                            </div>
                        )}
                    </div>
                    {missingDocs.length > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 text-amber-300 text-xs font-semibold max-w-md mx-auto">
                            ⚠️ {missingDocs.length} required document(s) missing — flagged PENDING DOCUMENTS
                        </div>
                    )}
                </div>

                {/* Action Buttons — sticky above document */}
                <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm pb-3.5 pt-1">
                    <div className="grid grid-cols-3 gap-3">
                        <button
                            onClick={() => navigator.clipboard.writeText(irdaiText)}
                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white transition-all active:scale-[0.98]"
                            type="button">
                            Copy Text
                        </button>
                        <button
                            onClick={handlePrint}
                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 text-blue-400 hover:text-blue-300 transition-all active:scale-[0.98]"
                            type="button">
                            Print
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-[0.98] ${
                                isComplete
                                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-500/10 text-white'
                                    : 'bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/10 text-white'
                            }`}
                            type="button">
                            Save PDF
                        </button>
                    </div>
                </div>

                {/* Centered Premium Document Preview */}
                <div className="flex flex-col items-center justify-center p-5 bg-black/20 border border-white/5 rounded-2xl">
                    <div className="w-full border-b border-white/5 pb-2 mb-3.5 flex items-center justify-between">
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Generated IRDAI Pre-Auth Document Preview</h3>
                        <span className="text-[9px] text-gray-500 font-mono uppercase tracking-wider font-bold">Format: IRDAI PART C</span>
                    </div>
                    <pre className="w-full max-w-3xl bg-[#080B11] border border-white/10 rounded-xl p-6 text-xs font-mono text-gray-300 overflow-x-auto overflow-y-auto whitespace-pre-wrap leading-relaxed max-h-[500px] shadow-2xl custom-scrollbar select-all">
                        {irdaiText}
                    </pre>
                </div>

                <button onClick={() => setGenerated(false)} className="w-full py-2.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white transition-all active:scale-[0.98]" type="button">
                    ← Back to Edit
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ── Compact case context strip ────────────────────────────── */}
            <div
                className="rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Patient</span>
                    <span className="text-xs font-semibold text-white truncate">{record.patient?.patientName || '—'}</span>
                </div>
                <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.1)' }} />
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Dx</span>
                    <span className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{diagnosisText || 'Pending'}</span>
                    {icdCode && !hasInvalidICD && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.15)' }}>
                            {icdCode}
                        </span>
                    )}
                </div>
                <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.1)' }} />
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Cost</span>
                    <span className="text-xs font-bold font-mono" style={{ color: 'rgba(255,255,255,0.8)' }}>₹{(record.costEstimate?.totalEstimatedCost ?? 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="w-px h-3" style={{ background: 'rgba(255,255,255,0.1)' }} />
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>TPA</span>
                    <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>{record.insurance?.tpaName || record.insurance?.insurerName || '—'}</span>
                </div>
            </div>

            {/* ── Tabs ─────────────────────────────────────────────────────── */}
            <div className="flex gap-1 bg-gray-950/60 border border-white/5 rounded-xl p-1 select-none">
                        {TABS.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                                className={`flex-1 py-2 rounded-lg text-xs transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/10' : 'text-gray-400 hover:text-gray-200 font-semibold hover:bg-white/5'}`}
                                type="button">
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Validation Blocker Alert */}
                    {hasBlockers && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-wider">
                                <span>⛔</span> Submission Blocked — Required Data Missing
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-xs text-red-300 font-medium leading-relaxed">
                                {blockingGaps.map((bg, idx) => <li key={idx}>{bg}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* Consistency Warnings Alert */}
                    {!hasBlockers && currentPartC?.warnings && currentPartC.warnings.length > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                                <span>⚠️</span> Internal Consistency Warnings
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-xs text-amber-300 font-medium leading-relaxed">
                                {currentPartC.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* Active tab contents */}
                    <div className="space-y-4">
                        {/* Documents Tab */}
                        {activeTab === 'docs' && (
                            <div className="space-y-4">
                                {/* Missing Evidence Alert */}
                                {missingDocs.length > 0 && (
                                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 space-y-2">
                                        <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                                            <span>📂 Missing Diagnostic Evidence ({missingDocs.length})</span>
                                        </div>
                                        <p className="text-gray-300 text-xs font-medium">Required documents according to clinical guidelines for <strong>{diagnosisText}</strong>:</p>
                                        <ul className="space-y-1">
                                            {missingDocs.map(d => (
                                                <li key={d.category} className="flex items-center gap-2 text-xs text-rose-300 font-semibold">
                                                    <span className="text-rose-500 font-bold">✗</span>
                                                    <strong>{d.displayName}</strong> — {d.description}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {docs.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Left Column: Required Docs & Upload Zone */}
                                        <div className="space-y-4">
                                            {requiredDocs.length > 0 && (
                                                <div className="bg-[#0D121F] border border-white/5 rounded-xl p-5 space-y-3 shadow-sm shadow-black/10">
                                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Required for: {diagnosisText}</h3>
                                                    <div className="space-y-2">
                                                        {requiredDocs.map(req => {
                                                            const uploaded = docs.find(d => d.documentCategory === req.category);
                                                            return (
                                                                <div key={req.category} className="flex items-center gap-3 text-xs bg-white/[0.02] border border-white/5 rounded-lg px-4 py-2.5 font-medium">
                                                                    <span className={uploaded ? 'text-emerald-400' : req.isRequired ? 'text-rose-400' : 'text-gray-500'}>
                                                                        {uploaded ? '✓' : req.isRequired ? '⚠' : '○'}
                                                                    </span>
                                                                    <span className={`flex-1 ${uploaded ? 'text-gray-400' : req.isRequired ? 'text-white font-semibold' : 'text-gray-500'}`}>{req.displayName}</span>
                                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${req.isRequired ? 'bg-rose-500/10 border border-rose-500/10 text-rose-400' : 'bg-gray-850 text-gray-500'}`}>{req.isRequired ? 'Required' : 'Optional'}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            <div
                                                onClick={() => fileRef.current?.click()}
                                                className="border border-dashed border-white/10 hover:border-blue-500/40 rounded-xl p-6 text-center bg-white/[0.01] hover:bg-blue-500/5 cursor-pointer transition-all duration-200 group"
                                            >
                                                <div className="text-xl transition-transform duration-200 group-hover:scale-110">📁</div>
                                                <div className="text-white font-semibold mt-2 text-xs uppercase tracking-wider">Drop files here or click to upload</div>
                                                <div className="text-[10px] text-gray-500 mt-1">PDF, JPG, PNG — max 10MB each</div>
                                            </div>
                                            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />

                                            <div className="space-y-2">
                                                {docs.map(doc => (
                                                    <div key={doc.id} className="flex items-center gap-3 bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-lg px-4 py-3 text-xs text-gray-300 transition-colors">
                                                        <span className="text-lg">{doc.fileType === 'pdf' ? '📄' : '🖼️'}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-xs font-semibold text-white truncate">{doc.fileName}</div>
                                                            <div className="text-[10px] text-gray-500 mt-0.5">{doc.fileSizeDisplay}</div>
                                                            {doc.duplicateWarning && <div className="text-[9px] text-rose-400 font-bold mt-0.5">{doc.duplicateWarning}</div>}
                                                            {doc.expiryWarning && <div className="text-[9px] text-rose-400 font-bold mt-0.5">{doc.expiryWarning}</div>}
                                                            {doc.readabilityWarning && <div className="text-[9px] text-amber-400 font-bold mt-0.5">{doc.readabilityWarning}</div>}
                                                        </div>
                                                        <select value={doc.documentCategory} onChange={e => updateDocCategory(doc.id, e.target.value as WizardDocCategory)}
                                                            className="bg-[#0D121F] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                                                            {DOC_CAT_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-[#0B0F19]">{o.label}</option>)}
                                                        </select>
                                                        <button onClick={() => removeDoc(doc.id)} className="text-gray-500 hover:text-rose-400 p-1.5 hover:bg-white/5 rounded-lg transition-all" type="button">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Right Column: AI Auto-fill Suggestions & Silent Fields */}
                                        <div className="space-y-4">
                                            {suggestionsLoading ? (
                                                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center bg-[#0D121F] border border-white/5 rounded-2xl h-full min-h-[300px]">
                                                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Analyzing documents for Part C fields...</p>
                                                </div>
                                            ) : (
                                                suggestionsPanel
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div
                                            onClick={() => fileRef.current?.click()}
                                            className="border-2 border-dashed border-white/10 hover:border-blue-500/40 rounded-xl p-12 text-center bg-white/[0.01] hover:bg-blue-500/5 cursor-pointer transition-all duration-200 group"
                                        >
                                            <div className="text-3xl transition-transform duration-200 group-hover:scale-110">📁</div>
                                            <div className="text-white font-semibold mt-3 text-xs uppercase tracking-wider">Drop files here or click to upload</div>
                                            <div className="text-[10px] text-gray-500 mt-1">PDF, JPG, PNG — max 10MB each</div>
                                        </div>
                                        <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />

                                        {requiredDocs.length > 0 && (
                                            <div className="bg-[#0D121F] border border-white/5 rounded-xl p-5 space-y-3 shadow-sm shadow-black/10">
                                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Required for: {diagnosisText}</h3>
                                                <div className="space-y-2">
                                                    {requiredDocs.map(req => (
                                                        <div key={req.category} className="flex items-center gap-3 text-xs bg-white/[0.02] border border-white/5 rounded-lg px-4 py-2.5 font-medium">
                                                            <span className="text-rose-400 font-bold">⚠</span>
                                                            <span className="flex-1 text-white font-semibold">{req.displayName}</span>
                                                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/10 text-rose-400">Required</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Medical Necessity Tab */}
                        {activeTab === 'necessity' && (
                            <div className="space-y-4">
                                <div className={`flex items-center justify-between p-3.5 rounded-lg border ${strCfg.color.includes('green') ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : strCfg.color.includes('blue') ? 'bg-blue-500/5 border-blue-500/20 text-blue-400' : 'bg-rose-500/5 border-rose-500/20 text-rose-400'}`}>
                                    <span className="font-bold text-xs uppercase tracking-wider">Necessity Strength: {strCfg.icon} {strCfg.label}</span>
                                    <button onClick={() => { setEditText(necessity?.generatedText ?? ''); setIsEditing(!isEditing); }} className="text-xs font-bold hover:underline transition-all text-blue-400 hover:text-blue-300" type="button">
                                        {isEditing ? 'Preview' : '✏️ Edit Description'}
                                    </button>
                                </div>
                                <div className="text-[10px] text-gray-400 space-y-1.5 font-medium leading-relaxed bg-white/[0.01] border border-white/5 rounded-lg p-3.5">
                                    {reasons.map((r, i) => <div key={i} className="flex items-start gap-1.5"><span>•</span><span>{r}</span></div>)}
                                </div>
                                {isEditing ? (
                                    <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={15}
                                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-xs font-mono text-gray-300 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
                                ) : (
                                    <div className="bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-xs font-mono text-gray-300 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed custom-scrollbar">
                                        {necessity?.generatedText ?? 'Generating necessity text...'}
                                    </div>
                                )}
                                <div className="flex justify-end pt-1">
                                    <button onClick={generateNecessity} className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors" type="button">↺ Regenerate from clinical details</button>
                                </div>
                            </div>
                        )}

                        {/* Summary Tab */}
                        {activeTab === 'summary' && (
                            <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-3.5 text-xs shadow-sm shadow-black/10">
                                <h3 className="font-bold text-gray-300 uppercase tracking-wider border-b border-white/5 pb-2">Pre-Authorization Summary</h3>
                                {[
                                    ['Patient Details', `${record.patient?.patientName ?? '—'}, ${record.patient?.age ?? '?'}Y ${record.patient?.gender ?? ''}`],
                                    ['Policy Info', `${record.insurance?.policyNumber ?? '—'} (${record.insurance?.insurerName ?? '—'} via ${record.insurance?.tpaName ?? '—'})`],
                                    ['Primary Diagnosis', `${selectedDx?.diagnosis ?? '—'} (${selectedDx?.icd10Code ?? '—'})`],
                                    ['Admission Setup', `${record.admission?.admissionType ?? '—'} — ${record.admission?.dateOfAdmission ?? '—'} — ${record.admission?.roomCategory ?? '—'}`],
                                    ['Expected Length of Stay', `${record.admission?.expectedLengthOfStay ?? 0} days (${record.admission?.expectedDaysInRoom ?? 0} ward + ${record.admission?.expectedDaysInICU ?? 0} ICU)`],
                                    ['Total Estimated Cost', `₹${(record.costEstimate?.totalEstimatedCost ?? 0).toLocaleString('en-IN')}`],
                                    ['Claimed Amount', `₹${(record.costEstimate?.amountClaimedFromInsurer ?? 0).toLocaleString('en-IN')}`],
                                    ['Documents Checklist', `${docs.length} attached, ${missingDocs.length} required pending`],
                                    ['Necessity Analysis', `${strCfg.icon} ${strCfg.label}`],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex justify-between border-b border-white/5 pb-2.5 last:border-0 last:pb-0 font-medium">
                                        <span className="text-gray-400">{label}</span>
                                        <span className="text-white text-right max-w-xs font-semibold">{value}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Declarations Tab */}
                        {activeTab === 'declarations' && (
                            <div className="space-y-5">
                                {/* Patient */}
                                <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm shadow-black/10">
                                    <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">Patient / Insured Declaration</h3>
                                    <p className="text-xs text-gray-400 leading-relaxed font-medium">I hereby declare that the information furnished is true and correct. I authorize the hospital and TPA to share my medical records for claim processing.</p>
                                    <div className="space-y-3 pt-1">
                                        {[
                                            ['agreedToTerms', 'Patient/attendant has been informed and consents to terms'],
                                            ['consentForMedicalDataSharing', 'Patient consents to sharing of medical data with insurer/TPA'],
                                            ['agreesToPayNonPayables', 'Patient agrees to pay any non-payable items per policy terms'],
                                        ].map(([key, label]) => (
                                            <label key={key} className="flex items-start gap-2.5 cursor-pointer select-none">
                                                <input type="checkbox" checked={(docDecl as any)[key] ?? false}
                                                    onChange={e => updateDecl({ patient: { ...docDecl, [key]: e.target.checked } })}
                                                    className="accent-blue-500 w-3.5 h-3.5 rounded mt-0.5" />
                                                <span className="text-xs text-gray-300 font-semibold">{label}</span>
                                            </label>
                                        ))}
                                        <div className="pt-2">
                                            <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Captured by (insurance desk person name) *</label>
                                            <input value={docDecl.capturedBy ?? ''} onChange={e => updateDecl({ patient: { ...docDecl, capturedBy: e.target.value } })}
                                                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" placeholder="Enter your full name" />
                                        </div>
                                    </div>
                                </div>

                                {/* Doctor */}
                                <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm shadow-black/10">
                                    <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">Treating Doctor's Declaration</h3>
                                    <div>
                                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Select Treating Doctor *</label>
                                        <select value={drDecl.doctorId ?? ''} onChange={e => {
                                            const dr = DEFAULT_DOCTORS.find(d => d.id === e.target.value);
                                            if (dr) updateDecl({ doctor: { doctorId: dr.id, doctorName: dr.name, doctorQualification: dr.qualification, doctorRegistrationNumber: dr.registrationNumber, registrationCouncil: dr.registrationCouncil, confirmed: false, confirmationMethod: 'in_app' } });
                                        }} className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                                            <option value="" className="bg-[#0B0F19]">Select Doctor</option>
                                            {DEFAULT_DOCTORS.map(d => <option key={d.id} value={d.id} className="bg-[#0B0F19]">{d.name} — {d.qualification}</option>)}
                                        </select>
                                    </div>
                                    {drDecl.doctorName && (
                                        <div className="bg-black/30 border border-white/5 rounded-lg p-3 text-xs text-gray-400 leading-normal font-semibold">
                                            <div>Registration No: <span className="text-white">{drDecl.doctorRegistrationNumber}</span></div>
                                            <div className="text-[10px] text-gray-500 mt-0.5">{drDecl.registrationCouncil}</div>
                                        </div>
                                    )}
                                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                        <input type="checkbox" checked={drDecl.confirmed ?? false} disabled={!drDecl.doctorId}
                                            onChange={e => updateDecl({ doctor: { ...drDecl, confirmed: e.target.checked, confirmationMethod: 'in_app' } })}
                                            className="accent-blue-500 w-3.5 h-3.5 rounded mt-0.5 disabled:opacity-50" />
                                        <span className="text-xs text-gray-300 font-semibold">Doctor confirms the above clinical information is accurate</span>
                                    </label>
                                </div>

                                {/* Hospital */}
                                <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm shadow-black/10">
                                    <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">Hospital Declaration</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Authorized Signatory</label>
                                            <input value={hospDecl.authorizedSignatoryName ?? ''} onChange={e => updateDecl({ hospital: { ...hospDecl, authorizedSignatoryName: e.target.value } })}
                                                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Designation</label>
                                            <input value={hospDecl.designation ?? ''} onChange={e => updateDecl({ hospital: { ...hospDecl, designation: e.target.value } })}
                                                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" />
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                        <input type="checkbox" checked={hospDecl.hospitalSealApplied ?? false}
                                            onChange={e => updateDecl({ hospital: { ...hospDecl, hospitalSealApplied: e.target.checked } })}
                                            className="accent-blue-500 w-3.5 h-3.5 rounded" />
                                        <span className="text-xs text-gray-300 font-semibold">Hospital seal will be applied on printed copy</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* TPA Reviewer Tab (Screen 3 Case Review Dashboard) */}
                        {activeTab === 'tpa-review' && (
                            <div className="space-y-4">
                                {isDemo && (
                                    <div className="bg-blue-950/20 border border-blue-500/10 rounded-2xl p-5 space-y-3.5 shadow-[inset_0_0_15px_rgba(59,130,246,0.02)]">
                                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                                                <span>⚡</span> Aivana Demo Walkthrough
                                            </h3>
                                            {onResetDemo && (
                                                <button onClick={onResetDemo} className="text-xs px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 rounded-xl transition-all font-bold" type="button">
                                                    Reset Demo
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                                            <div className="p-3.5 rounded-xl bg-blue-950/10 border border-blue-500/10 space-y-1">
                                                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">1. Checklist: COMPLETE ✓</div>
                                                <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
                                                    Every required document is attached and Part C fields are filled. Standard form-checkers mark this <strong>"ready to submit"</strong>.
                                                </p>
                                            </div>
                                            <div className="p-3.5 rounded-xl bg-blue-950/10 border border-blue-500/10 space-y-1">
                                                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">2. Aivana Engine Review</div>
                                                <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
                                                    Aivana reads the clinical narrative for actual medical history/necessity logic, not just document presence check.
                                                </p>
                                            </div>
                                            <div className="p-3.5 rounded-xl bg-blue-950/10 border border-blue-500/10 space-y-1">
                                                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">3. The Jolt ⚡</div>
                                                <p className="text-[11px] text-gray-400 leading-relaxed font-medium">
                                                    Aivana flags it <strong>INSUFFICIENT</strong>, anticipating the exact pre-existing condition query a real TPA reviewer would raise.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Case Header Info Panel */}
                                <div className="bg-slate-900/15 border border-white/5 rounded-2xl p-5 shadow-sm space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-3">
                                        <div>
                                            <h2 className="text-base font-semibold text-white/95 leading-tight flex items-center gap-2">
                                                <span>{record.patient?.patientName || '—'}</span>
                                                {record.complexity && (
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                                        record.complexity === 'Low' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                                        record.complexity === 'Medium' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                                        'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                                    }`} title={record.complexityReason}>
                                                        {record.complexity} Complexity
                                                    </span>
                                                )}
                                            </h2>
                                            <p className="text-xs text-slate-500 mt-1">Ref ID: <span className="font-mono text-slate-400 select-all">{record.id}</span></p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                        <div className="space-y-1">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Demographics</div>
                                            <div className="text-slate-300 font-semibold">{record.patient?.age ? `${record.patient.age}Y` : ''} {record.patient?.gender ?? ''}</div>
                                            <div className="text-[10px] text-slate-500">UHID: {record.patient?.uhid || '—'}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Diagnosis</div>
                                            <div className="text-slate-300 font-semibold truncate" title={diagnosisText}>{diagnosisText || '—'}</div>
                                            {icdCode && (
                                                <div className="font-mono text-[9px] text-emerald-400 font-bold">ICD: {icdCode}</div>
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Insurer / TPA</div>
                                            <div className="text-slate-300 font-semibold truncate">{record.insurance?.insurerName || '—'}</div>
                                            <div className="text-[10px] text-slate-500">TPA: {record.insurance?.tpaName || '—'}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sum Insured</div>
                                            <div className="text-slate-300 font-semibold">₹{(record.insurance?.sumInsured ?? 0).toLocaleString('en-IN')}</div>
                                            <div className="text-[10px] text-slate-500">Policy: {record.insurance?.policyNumber || '—'}</div>
                                        </div>
                                    </div>
                                </div>

                                {tpaLoading ? (
                                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center bg-slate-900/10 border border-white/5 rounded-2xl">
                                        <div className="flex gap-1">
                                            {[0, 1, 2].map(i => (
                                                <span key={i} className="pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-slate-400" />
                                            ))}
                                        </div>
                                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Running Aivana audit review...</p>
                                    </div>
                                ) : tpaReport ? (
                                    <div className="space-y-6">
                                        {/* Aivana Audit Verdict Card */}
                                        <div className="bg-slate-900/15 border border-white/5 rounded-2xl p-5 space-y-4 shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border ${
                                                    tpaReport.status === 'sufficient'
                                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                                }`}>
                                                    {tpaReport.status === 'sufficient' ? '✓' : '⚠️'}
                                                </div>
                                                <div>
                                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Pre-Submission Audit Verdict</h3>
                                                    <p className={`text-sm font-bold mt-0.5 ${tpaReport.status === 'sufficient' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {tpaReport.status === 'sufficient' ? 'SUFFICIENT EVIDENCE' : 'INSUFFICIENT CLINICAL EVIDENCE'}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-400 leading-normal font-medium">
                                                {tpaReport.status === 'sufficient'
                                                    ? 'The clinical narrative details provide strong backing. Anticipated queries are highly unlikely.'
                                                    : 'Aivana identified critical evidence gaps that are likely to trigger TPA rejections or query letters.'}
                                            </p>
                                        </div>

                                        {/* Gaps & Queries (The Visible Hero Section) */}
                                        <div className="bg-slate-900/15 border border-white/5 rounded-2xl p-5 space-y-5 shadow-sm">
                                            <div className="border-b border-white/5 pb-2.5">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Anticipated Audit Queries</h3>
                                                <p className="text-[10px] text-slate-500 mt-0.5">Prioritized list of predicted reviewer questions and corresponding clinical fixes.</p>
                                            </div>

                                            {/* Gaps Checklist */}
                                            {tpaReport.insufficientEvidence && tpaReport.insufficientEvidence.length > 0 && (
                                                <div className="space-y-2.5">
                                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Missing Narrative Gaps</h4>
                                                    <div className="grid grid-cols-1 gap-2 bg-rose-500/[0.01] border border-rose-500/10 rounded-xl p-3.5">
                                                        {tpaReport.insufficientEvidence.map((gap, idx) => (
                                                            <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed font-semibold">
                                                                <span className="text-rose-500 text-sm leading-none">✗</span>
                                                                <div className="flex-1">
                                                                    <span>Requires details: "{gap}"</span>
                                                                    {onJumpToStep && (
                                                                        <button onClick={() => onJumpToStep(2)} className="text-[10px] font-bold text-blue-400 hover:text-blue-300 ml-2 hover:underline inline-block">
                                                                            Fix in Step 2 (Clinical) →
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Rule Challenges */}
                                            {tpaReport.anticipatedQueries.filter(q => q.source === 'rule').length > 0 && (
                                                <div className="space-y-3">
                                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Anticipated TPA Challenges</h4>
                                                    <div className="space-y-3">
                                                        {tpaReport.anticipatedQueries.filter(q => q.source === 'rule').map((q, idx) => {
                                                            const isHigh = q.severity === 'high';
                                                            return (
                                                                <div key={idx} className={`border border-white/5 rounded-xl p-4 space-y-3 border-l-4 ${
                                                                    isHigh ? 'border-l-rose-500 bg-rose-500/[0.01]' : 'border-l-amber-500 bg-amber-500/[0.01]'
                                                                }`}>
                                                                    <div className="flex items-center justify-between">
                                                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                                                                            isHigh ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                                        }`}>
                                                                            {isHigh ? 'High Severity Query' : 'Medium Severity Query'}
                                                                        </span>
                                                                        <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">{q.relatedChallenge}</span>
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-white/[0.02] border border-white/5 px-2.5 py-0.5 rounded inline-block">
                                                                        Reviewer Question:
                                                                    </div>
                                                                    <div className="text-xs font-bold text-white leading-normal">
                                                                        "{q.query}"
                                                                    </div>
                                                                    {q.reason && (
                                                                        <div className="bg-black/20 rounded-lg p-3 border border-white/[0.03] space-y-1 text-xs">
                                                                            <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Required Fix / Reasoning</div>
                                                                            <p className="text-slate-300 font-semibold leading-relaxed">{q.reason}</p>
                                                                        </div>
                                                                    )}
                                                                    {onJumpToStep && (
                                                                        <button onClick={() => onJumpToStep(2)} className="text-[10px] font-bold text-blue-400 hover:text-blue-300 hover:underline">
                                                                            Update Clinical Scribe (Step 2) →
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Clinical Suggestions */}
                                            {tpaReport.anticipatedQueries.filter(q => q.source === 'suggestion').length > 0 && (
                                                <div className="space-y-3">
                                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Clinical Evidence Suggestions</h4>
                                                    <div className="space-y-3">
                                                        {tpaReport.anticipatedQueries.filter(q => q.source === 'suggestion').map((q, idx) => (
                                                            <div key={idx} className="border border-white/5 rounded-xl p-4 space-y-3 border-l-4 border-l-blue-500 bg-blue-500/[0.01]">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                                        Clinical Advisory
                                                                    </span>
                                                                    <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">{q.relatedChallenge}</span>
                                                                </div>
                                                                <div className="text-xs font-bold text-white leading-normal">
                                                                    "{q.query}"
                                                                </div>
                                                                {q.reason && (
                                                                    <div className="bg-black/20 rounded-lg p-3 border border-white/[0.03] space-y-1 text-xs">
                                                                        <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Clinical Guidance</div>
                                                                        <p className="text-slate-300 font-semibold leading-relaxed">{q.reason}</p>
                                                                    </div>
                                                                )}
                                                                {onJumpToStep && (
                                                                    <button onClick={() => onJumpToStep(2)} className="text-[10px] font-bold text-blue-400 hover:text-blue-300 hover:underline">
                                                                        Update Narrative (Step 2) →
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Policy Verifications */}
                                            {tpaReport.policyChecks && tpaReport.policyChecks.length > 0 && (
                                                <div className="space-y-3">
                                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Manual Policy Verifications</h4>
                                                    <div className="bg-amber-500/[0.01] border border-amber-500/10 rounded-xl p-4 space-y-3">
                                                        <p className="text-slate-300 text-xs font-semibold leading-relaxed">The following policy boundary checks must be verified manually by the coordinator:</p>
                                                        <div className="space-y-2">
                                                            {tpaReport.policyChecks.map((pc, idx) => (
                                                                <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300 bg-white/[0.01] border border-white/5 rounded-lg px-3 py-2 font-semibold">
                                                                    <span className="text-slate-500 select-none">📋</span>
                                                                    <div className="flex-1">
                                                                        <span>{pc}</span>
                                                                        {onJumpToStep && (
                                                                            <button onClick={() => onJumpToStep(1)} className="text-[9px] font-bold text-blue-400 hover:text-blue-300 hover:underline ml-2">
                                                                                Check Policy Details (Step 1) →
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Clinical & Cost Profile Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            {/* Clinical Profile */}
                                            <div className="bg-slate-900/15 border border-white/5 rounded-2xl p-5 space-y-4 shadow-sm">
                                                <div className="border-b border-white/5 pb-2.5">
                                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Clinical Facts Profile</h3>
                                                </div>

                                                <div className="space-y-3.5 text-xs">
                                                    <div>
                                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Chief Complaints</div>
                                                        <p className="text-slate-300 font-semibold mt-0.5">{record.clinical?.chiefComplaints || '—'}</p>
                                                        {record.clinical?.durationOfPresentAilment && (
                                                            <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 bg-white/5 text-slate-400 rounded">
                                                                Duration: {record.clinical.durationOfPresentAilment}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {record.clinical?.natureOfIllness && (
                                                        <div>
                                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nature of Illness</div>
                                                            <p className="text-slate-300 font-semibold mt-0.5">{record.clinical.natureOfIllness}</p>
                                                        </div>
                                                    )}

                                                    {record.clinical?.historyOfPresentIllness && (
                                                        <div>
                                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">HPI (History of Present Illness)</div>
                                                            <p className="text-slate-300 font-semibold mt-0.5 leading-relaxed truncate-3-lines" title={record.clinical.historyOfPresentIllness}>
                                                                {record.clinical.historyOfPresentIllness}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {record.clinical?.relevantClinicalFindings && (
                                                        <div>
                                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Relevant Clinical Findings</div>
                                                            <p className="text-slate-300 font-semibold mt-0.5 leading-relaxed">{record.clinical.relevantClinicalFindings}</p>
                                                        </div>
                                                    )}

                                                    {/* Vitals */}
                                                    {record.clinical?.vitals && (
                                                        <div>
                                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Patient Vitals</div>
                                                            <div className="grid grid-cols-5 gap-2 text-center">
                                                                <div className="bg-white/5 border border-white/5 rounded p-1.5">
                                                                    <div className="text-[8px] font-bold text-slate-500 uppercase">BP</div>
                                                                    <div className="font-mono text-xs font-semibold text-white mt-0.5">{record.clinical.vitals.bp || '—'}</div>
                                                                </div>
                                                                <div className="bg-white/5 border border-white/5 rounded p-1.5">
                                                                    <div className="text-[8px] font-bold text-slate-500 uppercase">Pulse</div>
                                                                    <div className="font-mono text-xs font-semibold text-white mt-0.5">{record.clinical.vitals.pulse || '—'}</div>
                                                                </div>
                                                                <div className="bg-white/5 border border-white/5 rounded p-1.5">
                                                                    <div className="text-[8px] font-bold text-slate-500 uppercase">Temp</div>
                                                                    <div className="font-mono text-xs font-semibold text-white mt-0.5">{record.clinical.vitals.temp || '—'}</div>
                                                                </div>
                                                                <div className="bg-white/5 border border-white/5 rounded p-1.5">
                                                                    <div className="text-[8px] font-bold text-slate-500 uppercase">SpO2</div>
                                                                    <div className="font-mono text-xs font-semibold text-white mt-0.5">{record.clinical.vitals.spo2 || '—'}</div>
                                                                </div>
                                                                <div className="bg-white/5 border border-white/5 rounded p-1.5">
                                                                    <div className="text-[8px] font-bold text-slate-500 uppercase">RR</div>
                                                                    <div className="font-mono text-xs font-semibold text-white mt-0.5">{record.clinical.vitals.rr || '—'}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Proposed Line of Treatment */}
                                                    {record.clinical?.proposedLineOfTreatment && (
                                                        <div>
                                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Proposed Line of Treatment</div>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {Object.entries(record.clinical.proposedLineOfTreatment)
                                                                    .filter(([_, val]) => val === true)
                                                                    .map(([key]) => {
                                                                        const label = key === 'nonAllopathic' ? 'Non-Allopathic' : key === 'intensiveCare' ? 'Intensive Care' : key.charAt(0).toUpperCase() + key.slice(1);
                                                                        return (
                                                                            <span key={key} className="text-[9px] font-bold px-2 py-0.5 bg-slate-900 border border-white/5 text-slate-300 rounded">
                                                                                {label}
                                                                            </span>
                                                                        );
                                                                    })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Cost & Admission Profile */}
                                            <div className="bg-slate-900/15 border border-white/5 rounded-2xl p-5 space-y-4 shadow-sm">
                                                <div className="border-b border-white/5 pb-2.5">
                                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Admission & Cost Profile</h3>
                                                </div>

                                                <div className="space-y-3.5 text-xs">
                                                    <div className="grid grid-cols-2 gap-3.5">
                                                        <div>
                                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Admission Date & Type</div>
                                                            <p className="text-slate-300 font-semibold mt-0.5">{record.admission?.dateOfAdmission || '—'}</p>
                                                            <div className="text-[10px] text-slate-500">Type: {record.admission?.admissionType || '—'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Room Category</div>
                                                            <p className="text-slate-300 font-semibold mt-0.5">{record.admission?.roomCategory || '—'}</p>
                                                            <div className="text-[10px] text-slate-500">Stay: {record.admission?.expectedLengthOfStay || 0} Days (Ward: {record.admission?.expectedDaysInRoom || 0}, ICU: {record.admission?.expectedDaysInICU || 0})</div>
                                                        </div>
                                                    </div>

                                                    {/* Pre-Existing History */}
                                                    <div>
                                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pre-Existing Conditions</div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {(() => {
                                                                const pmh = record.admission?.pastMedicalHistory ?? {};
                                                                const active = Object.entries(pmh)
                                                                    .filter(([_, val]) => (val as any)?.present === true)
                                                                    .map(([key]) => {
                                                                        if (key === 'anyOther') return pmh.anyOther?.details || 'Other Condition';
                                                                        return key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
                                                                    });
                                                                if (active.length === 0) {
                                                                    return <span className="text-slate-500 font-medium text-xs">No pre-existing conditions reported.</span>;
                                                                }
                                                                return active.map(name => (
                                                                    <span key={name} className="text-[9px] font-bold px-2 py-0.5 bg-slate-900 border border-white/5 text-amber-400 rounded">
                                                                        {name}
                                                                    </span>
                                                                ));
                                                            })()}
                                                        </div>
                                                    </div>

                                                    {/* Cost Estimate details */}
                                                    <div>
                                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Cost Breakdown Details</div>
                                                        {(() => {
                                                            const cost = record.costEstimate ?? {};
                                                            return (
                                                                <div className="space-y-1.5 border border-white/5 rounded-xl p-3 bg-white/[0.01]">
                                                                    <div className="flex justify-between text-slate-400">
                                                                        <span>Room Charges ({cost.expectedRoomDays || 0} days)</span>
                                                                        <span className="font-mono text-slate-300">₹{(cost.totalRoomCharges ?? 0).toLocaleString('en-IN')}</span>
                                                                    </div>
                                                                    {cost.expectedIcuDays && cost.expectedIcuDays > 0 ? (
                                                                        <div className="flex justify-between text-slate-400">
                                                                            <span>ICU Charges ({cost.expectedIcuDays} days)</span>
                                                                            <span className="font-mono text-slate-300">₹{(cost.totalIcuCharges ?? 0).toLocaleString('en-IN')}</span>
                                                                        </div>
                                                                    ) : null}
                                                                    <div className="flex justify-between text-slate-400">
                                                                        <span>Nursing Charges</span>
                                                                        <span className="font-mono text-slate-300">₹{(cost.totalNursingCharges ?? 0).toLocaleString('en-IN')}</span>
                                                                    </div>
                                                                    {cost.otCharges ? (
                                                                        <div className="flex justify-between text-slate-400">
                                                                            <span>OT Charges</span>
                                                                            <span className="font-mono text-slate-300">₹{cost.otCharges.toLocaleString('en-IN')}</span>
                                                                        </div>
                                                                    ) : null}
                                                                    {cost.surgeonFee ? (
                                                                        <div className="flex justify-between text-slate-400">
                                                                            <span>Surgeon Fee</span>
                                                                            <span className="font-mono text-slate-300">₹{cost.surgeonFee.toLocaleString('en-IN')}</span>
                                                                        </div>
                                                                    ) : null}
                                                                    {cost.investigationsEstimate ? (
                                                                        <div className="flex justify-between text-slate-400">
                                                                            <span>Investigations</span>
                                                                            <span className="font-mono text-slate-300">₹{cost.investigationsEstimate.toLocaleString('en-IN')}</span>
                                                                        </div>
                                                                    ) : null}
                                                                    {cost.medicinesEstimate ? (
                                                                        <div className="flex justify-between text-slate-400">
                                                                            <span>Medicines</span>
                                                                            <span className="font-mono text-slate-300">₹{cost.medicinesEstimate.toLocaleString('en-IN')}</span>
                                                                        </div>
                                                                    ) : null}
                                                                    <div className="border-t border-white/5 pt-2 flex justify-between font-bold text-slate-200">
                                                                        <span>Total Estimate</span>
                                                                        <span className="font-mono text-white">₹{(cost.totalEstimatedCost ?? 0).toLocaleString('en-IN')}</span>
                                                                    </div>
                                                                    {cost.exceedsSumInsured && (
                                                                        <div className="text-[10px] text-rose-400 font-bold bg-rose-500/5 px-2 py-1 rounded mt-1.5 border border-rose-500/10">
                                                                            ⚠️ Exceeds Sum Insured! Excess patient responsibility: ₹{(cost.excessAmount ?? 0).toLocaleString('en-IN')}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Reasoning Trace */}
                                        <details className="group bg-white/[0.01] border border-white/5 rounded-xl p-3">
                                            <summary className="flex items-center justify-between text-xs text-slate-400 cursor-pointer list-none select-none px-1 font-semibold">
                                                <span className="font-bold uppercase tracking-wider text-[9px]">Evidence Reasoning Trace</span>
                                                <span className="transition-transform group-open:rotate-180 text-[10px]">▼</span>
                                            </summary>
                                            <div className="mt-3.5 space-y-1 font-mono text-[10px] text-slate-400 bg-black/40 border border-white/5 p-3 rounded-lg overflow-x-auto leading-relaxed custom-scrollbar">
                                                {tpaReport.reasoningTrace.map((line, i) => (
                                                    <div key={i}>{line}</div>
                                                ))}
                                            </div>
                                        </details>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center bg-slate-900/10 border border-white/5 rounded-2xl">
                                        <div className="text-3xl text-slate-600">◎</div>
                                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Evidence review runs automatically</p>
                                        <p className="text-slate-500 text-[10px]">Ensure patient & diagnosis details are populated to begin auditing.</p>
                                    </div>
                                )}
                            </div>
                        )}
                           {/* Part C Preview Tab */}
                        {activeTab === 'partc-review' && (
                            <div className="space-y-4">
                                {suggestionsLoading ? (
                                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center bg-[#0D121F] border border-white/5 rounded-2xl h-full min-h-[300px]">
                                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Analyzing documents for Part C fields...</p>
                                    </div>
                                ) : (
                                    suggestionsPanel
                                )}
                            </div>
                        )}
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button onClick={onBack} className="py-2 rounded-lg font-semibold text-xs bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white transition-all duration-150 active:scale-[0.98]" type="button">
                            ← Back
                        </button>
                        <button onClick={handleGenerate} disabled={generating || hasBlockers} type="button"
                            className={`py-2 rounded-lg font-semibold text-xs text-white transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.98] ${
                                generating
                                    ? 'bg-white/5 border border-white/5 cursor-not-allowed text-gray-500'
                                    : hasBlockers
                                    ? 'bg-white/5 border border-red-500/20 text-red-400/50 cursor-not-allowed'
                                    : currentPartC?.submittabilityStatus === 'complete' || !currentPartC
                                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-sm'
                                    : 'bg-blue-600 hover:bg-blue-500 shadow-sm'
                            }`}>
                            {generating ? (
                                <>
                                    <svg className="spin-svg w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                                    </svg>
                                    Generating…
                                </>
                            ) : hasBlockers ? (
                                'Generation Blocked'
                            ) : currentPartC?.submittabilityStatus === 'pending_documents' ? (
                                'Generate (Pending Documents)'
                            ) : (
                                'Generate Pre-Auth Document'
                            )}
                        </button>
                    </div>
                    {missingDocs.length > 0 && (
                        <p className="text-xs text-amber-500 font-semibold text-center mt-2 leading-relaxed">⚠️ {missingDocs.length} required documents missing — pre-auth will be marked PENDING DOCUMENTS</p>
                    )}
        </div>
    );
};

const guessCategory = (filename: string): WizardDocCategory => {
    const lower = filename.toLowerCase();
    if (lower.includes('knee') && (lower.includes('xray') || lower.includes('x-ray') || lower.includes('film'))) return 'xray_knee';
    if (lower.includes('xray') || lower.includes('x_ray') || lower.includes('chest')) return 'chest_xray';
    if (lower.includes('cbc') || lower.includes('blood_count') || lower.includes('haemogram')) return 'cbc';
    if (lower.includes('ecg') || lower.includes('ekg')) return 'ecg';
    if (lower.includes('ct') || lower.includes('scan')) return 'ct_scan';
    if (lower.includes('mri')) return 'mri';
    if (lower.includes('abg') || lower.includes('blood_gas')) return 'abg';
    if (lower.includes('ultrasound') || lower.includes('usg')) return 'ultrasound';
    if (lower.includes('ns1') || lower.includes('dengue')) return 'ns1_antigen';
    if (lower.includes('policy') || lower.includes('insurance')) return 'policy_copy';
    if (lower.includes('id') || lower.includes('aadhaar') || lower.includes('aadhar')) return 'id_proof';
    if (lower.includes('pan')) return 'pan_card';
    return 'other';
};

const DOC_CAT_OPTIONS: { value: WizardDocCategory; label: string }[] = [
    { value: 'chest_xray', label: 'Chest X-Ray' },
    { value: 'xray_knee', label: 'Knee X-Ray' },
    { value: 'cbc', label: 'CBC / Blood Count' },
    { value: 'ecg', label: 'ECG' },
    { value: 'ct_scan', label: 'CT Scan' },
    { value: 'mri', label: 'MRI' },
    { value: 'abg', label: 'ABG' },
    { value: 'ultrasound', label: 'Ultrasound / USG' },
    { value: 'ns1_antigen', label: 'NS1 Antigen (Dengue)' },
    { value: 'dengue_igm', label: 'Dengue IgM' },
    { value: 'blood_culture', label: 'Blood Culture' },
    { value: 'urine_routine', label: 'Urine Routine' },
    { value: 'lft', label: 'LFT' },
    { value: 'kft', label: 'KFT / RFT' },
    { value: 'policy_copy', label: 'Policy Copy' },
    { value: 'id_proof', label: 'ID Proof' },
    { value: 'pan_card', label: 'PAN Card' },
    { value: 'admission_letter', label: 'Admission Letter' },
    { value: 'prescription', label: 'Prescription' },
    { value: 'other', label: 'Other' },
];
