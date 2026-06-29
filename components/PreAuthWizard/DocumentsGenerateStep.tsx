import React, { useState, useRef, useEffect } from 'react';
import { PreAuthRecord, WizardDocument, WizardDocCategory, MedicalNecessityStatement, DoctorDeclarationData, PatientDeclarationData, HospitalDeclarationData } from '../PreAuthWizard/types';
import { generateMedicalNecessity, generateIRDAITextFromRecord } from '../../services/medicalNecessityService';
import { scoreNecessityStrength } from '../../utils/strengthScorer';
import { getRequiredDocuments } from '../../utils/documentRequirements';
import { DEFAULT_DOCTORS } from '../../config/hospitalConfig';
import { formatFileSize } from '../../utils/formatters';
import { reviewEvidence, EvidenceReviewReport } from '../../engine/evidenceReview';
import { generatePartC, generatePartCText, PartCOutput } from '../../engine/partCGenerator';
import { logEvent } from '../../utils/auditLog';
import { validateCode } from '../../services/icdService';

interface DocGenerateStepProps {
    record: Partial<PreAuthRecord>;
    onRecordChange: (r: Partial<PreAuthRecord>) => void;
    onBack: () => void;
    onGenerate: (irdaiText: string) => void;
    defaultTab?: 'docs' | 'necessity' | 'summary' | 'declarations' | 'tpa-review';
    isDemo?: boolean;
    onResetDemo?: () => void;
}

const STRENGTH_CONFIG = {
    strong: { label: 'STRONG', color: 'text-green-400 bg-green-500/10 border-green-500/30', icon: '🟢' },
    moderate: { label: 'MODERATE', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: '🟡' },
    weak: { label: 'WEAK', color: 'text-red-400 bg-red-500/10 border-red-500/30', icon: '🔴' },
};

export const DocumentsGenerateStep: React.FC<DocGenerateStepProps> = ({
    record, onRecordChange, onBack, onGenerate, defaultTab, isDemo = false, onResetDemo
}) => {
    const [activeTab, setActiveTab] = useState<'docs' | 'necessity' | 'summary' | 'declarations' | 'tpa-review'>(defaultTab ?? 'docs');
    const [tpaReport, setTpaReport] = useState<EvidenceReviewReport | null>(null);
    const [partCOutput, setPartCOutput] = useState<PartCOutput | null>(null);
    const [tpaLoading, setTpaLoading] = useState(false);
    const [necessity, setNecessity] = useState<MedicalNecessityStatement | null>(record.medicalNecessity ?? null);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const [generating, setGenerating] = useState(false);
    const [generated, setGenerated] = useState(false);
    const [irdaiText, setIrdaiText] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
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
    }, [record]);

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
        { id: 'docs', label: 'Documents' },
        { id: 'necessity', label: 'Medical Necessity' },
        { id: 'summary', label: 'Summary' },
        { id: 'declarations', label: 'Declarations' },
        { id: 'tpa-review', label: 'Evidence Review' },
    ] as const;

    if (generated) {
        return (
            <div className="space-y-5">
                {/* Success Banner */}
                <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-3">
                    <div className="text-3xl">✨</div>
                    <h2 className="text-lg font-bold text-white">Pre-Auth Document Ready</h2>
                    <div className="font-mono text-xs bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-md inline-block">{record.id}</div>
                    
                    {/* Part C Submittability Status */}
                    <div className="pt-1.5">
                        {partCOutput && (
                            <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold border ${
                                partCOutput.submittabilityStatus === 'complete'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            }`}>
                                <span>{partCOutput.submittabilityStatus === 'complete' ? '✓' : '⚠'}</span>
                                <span>{partCOutput.submittabilityStatus === 'complete'
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
                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-gray-900 border border-white/10 hover:bg-gray-800 text-gray-300 hover:text-white transition-all active:scale-[0.98]"
                            type="button">
                            Copy Text
                        </button>
                        <button
                            onClick={handlePrint}
                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-gray-900 border border-white/10 hover:bg-gray-800 text-blue-400 hover:text-blue-300 transition-all active:scale-[0.98]"
                            type="button">
                            Print
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white shadow-md shadow-blue-500/10 transition-all active:scale-[0.98]"
                            type="button">
                            Save PDF
                        </button>
                    </div>
                </div>

                {/* Generated Document Preview */}
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Generated IRDAI Pre-Auth Document</h3>
                    <pre className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-4 text-xs font-mono text-gray-300 overflow-x-auto overflow-y-auto resize-none whitespace-pre-wrap leading-relaxed max-h-[420px] custom-scrollbar select-all">{irdaiText}</pre>
                </div>

                <button onClick={() => setGenerated(false)} className="w-full py-2.5 rounded-xl text-xs font-semibold bg-gray-900 border border-white/10 hover:bg-gray-800 text-gray-300 hover:text-white transition-all active:scale-[0.98]" type="button">
                    ← Back to Edit
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <h2 className="text-base font-semibold text-white">Documents & Generate</h2>

            {/* Tabs */}
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
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                        <span className="text-lg">⛔</span> Submission Blocked — Required Data Missing
                    </div>
                    <p className="text-gray-300 text-xs font-medium">You must fix the following issues before this pre-authorization can be generated:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-xs text-red-300 font-semibold leading-relaxed">
                        {blockingGaps.map((bg, idx) => <li key={idx}>{bg}</li>)}
                    </ul>
                </div>
            )}

            {/* Consistency Warnings Alert */}
            {!hasBlockers && currentPartC?.warnings && currentPartC.warnings.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                        <span className="text-lg">⚠️</span> Internal Consistency Warnings
                    </div>
                    <p className="text-gray-300 text-xs font-medium">Please review these potential discrepancies in the record:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-xs text-amber-300 font-semibold leading-relaxed">
                        {currentPartC.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                    </ul>
                </div>
            )}

            {/* Documents Tab */}
            {activeTab === 'docs' && (
                <div className="space-y-4">
                    {/* Missing Evidence Alert */}
                    {missingDocs.length > 0 && (
                        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 space-y-2.5">
                            <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                                <span className="text-base">⚠️</span> Critical Missing Evidence
                            </div>
                            <p className="text-gray-300 text-xs font-medium">Required documents according to clinical guidelines for <strong>{diagnosisText}</strong>:</p>
                            <ul className="space-y-1.5">
                                {missingDocs.map(d => (
                                    <li key={d.category} className="flex items-center gap-2 text-xs text-rose-300 font-semibold">
                                        <span className="text-rose-500 font-bold">✗</span>
                                        <strong>{d.displayName}</strong> — {d.description}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Required Docs Checklist */}
                    {requiredDocs.length > 0 && (
                        <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-5 space-y-3 shadow-sm">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Required for: {diagnosisText}</h3>
                            <div className="space-y-2.5">
                                {requiredDocs.map(req => {
                                    const uploaded = docs.find(d => d.documentCategory === req.category);
                                    return (
                                        <div key={req.category} className="flex items-center gap-3 text-xs bg-gray-950/40 border border-white/5 rounded-xl px-4 py-3">
                                            <span className={uploaded ? 'text-emerald-400' : req.isRequired ? 'text-rose-400' : 'text-gray-500'}>
                                                {uploaded ? '✓' : req.isRequired ? '⚠' : '○'}
                                            </span>
                                            <span className={`flex-1 font-semibold ${uploaded ? 'text-gray-400' : req.isRequired ? 'text-white' : 'text-gray-500'}`}>{req.displayName}</span>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${req.isRequired ? 'bg-rose-500/10 border border-rose-500/10 text-rose-400' : 'bg-gray-800 text-gray-500'}`}>{req.isRequired ? 'Required' : 'Optional'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Upload Zone */}
                    <div
                        onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-white/10 hover:border-blue-500/40 rounded-2xl p-8 text-center bg-gray-900/10 hover:bg-blue-500/5 cursor-pointer transition-all duration-200 group"
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
                    >
                        <div className="text-3xl transition-transform duration-200 group-hover:scale-110">📁</div>
                        <div className="text-white font-semibold mt-2.5 text-sm">Drop files here or click to upload</div>
                        <div className="text-xs text-gray-500 mt-1">PDF, JPG, PNG — max 10MB each</div>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />

                    {/* Uploaded Docs List */}
                    {docs.length > 0 && (
                        <div className="space-y-2">
                            {docs.map(doc => (
                                <div key={doc.id} className="flex items-center gap-3 bg-gray-950/40 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-xs text-gray-300 transition-colors">
                                    <span className="text-lg">{doc.fileType === 'pdf' ? '📄' : '🖼️'}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-white truncate">{doc.fileName}</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">{doc.fileSizeDisplay}</div>
                                    </div>
                                    <select value={doc.documentCategory} onChange={e => updateDocCategory(doc.id, e.target.value as WizardDocCategory)}
                                        className="bg-gray-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors">
                                        {DOC_CAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                    <button onClick={() => removeDoc(doc.id)} className="text-gray-500 hover:text-rose-400 p-1.5 hover:bg-white/5 rounded-lg transition-all" type="button">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Medical Necessity Tab */}
            {activeTab === 'necessity' && (
                <div className="space-y-4">
                    <div className={`flex items-center justify-between p-4 rounded-xl border ${strCfg.color.includes('green') ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : strCfg.color.includes('blue') ? 'bg-blue-500/5 border-blue-500/20 text-blue-400' : 'bg-rose-500/5 border-rose-500/20 text-rose-400'}`}>
                        <span className="font-bold text-xs uppercase tracking-wider">Necessity Strength: {strCfg.icon} {strCfg.label}</span>
                        <button onClick={() => { setEditText(necessity?.generatedText ?? ''); setIsEditing(!isEditing); }} className="text-xs font-bold hover:underline transition-all" type="button">
                            {isEditing ? 'Preview' : '✏️ Edit Description'}
                        </button>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1.5 font-medium leading-relaxed bg-gray-900/10 border border-white/5 rounded-xl p-3.5">
                        {reasons.map((r, i) => <div key={i} className="flex items-start gap-1.5"><span>•</span><span>{r}</span></div>)}
                    </div>
                    {isEditing ? (
                        <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={15}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3.5 text-xs font-mono text-gray-300 leading-relaxed focus:outline-none focus:border-blue-500/50 resize-none" />
                    ) : (
                        <div className="bg-gray-900/60 border border-white/10 rounded-xl px-4 py-3.5 text-xs font-mono text-gray-300 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed custom-scrollbar">
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
                <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-5 space-y-3.5 text-xs shadow-sm">
                    <h3 className="font-bold text-gray-400 uppercase tracking-wider border-b border-white/5 pb-2">Pre-Authorization Summary</h3>
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
                    <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-5 space-y-4 shadow-sm">
                        <h3 className="font-semibold text-blue-400 text-xs flex items-center gap-2 uppercase tracking-wider">Patient / Insured Declaration</h3>
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
                                        className="accent-blue-500 w-4 h-4 rounded mt-0.5" />
                                    <span className="text-xs text-gray-300 font-semibold">{label}</span>
                                </label>
                            ))}
                            <div className="pt-2">
                                <label className="block text-xs text-gray-400 font-semibold mb-1.5">Captured by (insurance desk person name) *</label>
                                <input value={docDecl.capturedBy ?? ''} onChange={e => updateDecl({ patient: { ...docDecl, capturedBy: e.target.value } })}
                                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600" placeholder="Enter your full name" />
                            </div>
                        </div>
                    </div>

                    {/* Doctor */}
                    <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-5 space-y-4 shadow-sm">
                        <h3 className="font-semibold text-blue-400 text-xs flex items-center gap-2 uppercase tracking-wider">Treating Doctor's Declaration</h3>
                        <div>
                            <label className="block text-xs text-gray-400 font-semibold mb-1.5">Select Treating Doctor *</label>
                            <select value={drDecl.doctorId ?? ''} onChange={e => {
                                const dr = DEFAULT_DOCTORS.find(d => d.id === e.target.value);
                                if (dr) updateDecl({ doctor: { doctorId: dr.id, doctorName: dr.name, doctorQualification: dr.qualification, doctorRegistrationNumber: dr.registrationNumber, registrationCouncil: dr.registrationCouncil, confirmed: false, confirmationMethod: 'in_app' } });
                            }} className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors">
                                <option value="">Select Doctor</option>
                                {DEFAULT_DOCTORS.map(d => <option key={d.id} value={d.id}>{d.name} — {d.qualification}</option>)}
                            </select>
                        </div>
                        {drDecl.doctorName && (
                            <div className="bg-gray-950/40 border border-white/5 rounded-xl p-3 text-xs text-gray-400 leading-normal font-semibold">
                                <div>Registration No: <span className="text-white">{drDecl.doctorRegistrationNumber}</span></div>
                                <div className="text-[10px] text-gray-500 mt-0.5">{drDecl.registrationCouncil}</div>
                            </div>
                        )}
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                            <input type="checkbox" checked={drDecl.confirmed ?? false} disabled={!drDecl.doctorId}
                                onChange={e => updateDecl({ doctor: { ...drDecl, confirmed: e.target.checked, confirmationMethod: 'in_app' } })}
                                className="accent-blue-500 w-4 h-4 rounded mt-0.5 disabled:opacity-50" />
                            <span className="text-xs text-gray-300 font-semibold">Doctor confirms the above clinical information is accurate</span>
                        </label>
                    </div>

                    {/* Hospital */}
                    <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-5 space-y-4 shadow-sm">
                        <h3 className="font-semibold text-blue-400 text-xs flex items-center gap-2 uppercase tracking-wider">Hospital Declaration</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-400 font-semibold mb-1.5">Authorized Signatory</label>
                                <input value={hospDecl.authorizedSignatoryName ?? ''} onChange={e => updateDecl({ hospital: { ...hospDecl, authorizedSignatoryName: e.target.value } })}
                                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 font-semibold mb-1.5">Designation</label>
                                <input value={hospDecl.designation ?? ''} onChange={e => updateDecl({ hospital: { ...hospDecl, designation: e.target.value } })}
                                    className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600" />
                            </div>
                        </div>
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input type="checkbox" checked={hospDecl.hospitalSealApplied ?? false}
                                onChange={e => updateDecl({ hospital: { ...hospDecl, hospitalSealApplied: e.target.checked } })}
                                className="accent-blue-500 w-4 h-4 rounded" />
                            <span className="text-xs text-gray-300 font-semibold">Hospital seal will be applied on printed copy</span>
                        </label>
                    </div>
                </div>
            )}

            {/* TPA Reviewer Tab */}
            {activeTab === 'tpa-review' && (
                <div className="space-y-4">
                    {isDemo && (
                        <div className="bg-blue-950/20 border border-blue-500/20 rounded-2xl p-5 space-y-3.5 shadow-[inset_0_0_15px_rgba(59,130,246,0.05)]">
                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                                    <span className="animate-pulse">⚡</span> Aivana Demo Walkthrough
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

                    {tpaLoading ? (
                        <div className="flex flex-col items-center justify-center py-14 space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="pulse-dot w-2 h-2 rounded-full bg-blue-500"></div>
                                <div className="pulse-dot w-2 h-2 rounded-full bg-blue-500 animation-delay-150"></div>
                                <div className="pulse-dot w-2 h-2 rounded-full bg-blue-500 animation-delay-300"></div>
                            </div>
                            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Analysing clinical evidence sufficiency…</span>
                        </div>
                    ) : tpaReport ? (
                        <div className="space-y-5">
                            {/* Sufficiency Status Badge */}
                            <div className={`flex items-center gap-5 p-6 rounded-2xl border transition-all ${
                                tpaReport.status === 'sufficient'
                                    ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)] text-emerald-400'
                                    : 'bg-rose-500/5 border-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.05)] text-rose-400'
                            }`}>
                                <div className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold border-2 ${
                                    tpaReport.status === 'sufficient'
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                }`}>
                                    {tpaReport.status === 'sufficient' ? '✓' : '✕'}
                                </div>
                                <div className="space-y-1">
                                    <div className="text-base font-bold tracking-wider uppercase">
                                        {tpaReport.status === 'sufficient' ? 'EVIDENCE SUFFICIENT' : 'EVIDENCE INSUFFICIENT'}
                                    </div>
                                    <p className="text-xs text-gray-400 font-medium leading-relaxed">
                                        {tpaReport.status === 'sufficient'
                                            ? 'Documentation is complete and ready for TPA submission.'
                                            : `${tpaReport.insufficientEvidence?.length ?? 0} query-gap(s) detected. A real TPA reviewer would bounce this case.`}
                                    </p>
                                </div>
                            </div>

                            {/* Challenges Considered */}
                            <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-4 space-y-2">
                                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sufficiency Challenges Checked</h3>
                                <ul className="space-y-1.5">
                                    {tpaReport.challengesConsidered.map((challenge, idx) => (
                                        <li key={idx} className="text-xs text-gray-300 flex items-start gap-2 font-medium">
                                            <span className="text-blue-400 mt-0.5">🔎</span>
                                            <span>{challenge}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Administrative Compliance Gaps */}
                            {tpaReport.mandatoryGaps.length > 0 && (
                                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-2">
                                    <h3 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                        ⚠️ Checklist & Checklist Gaps
                                    </h3>
                                    <ul className="space-y-1.5">
                                        {tpaReport.mandatoryGaps.map((gap, idx) => (
                                            <li key={idx} className="text-xs text-amber-200 flex items-start gap-2 font-semibold">
                                                <span className="text-amber-500 font-bold">•</span>
                                                <span>{gap}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Evidence Checklist */}
                            <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Clinical Evidence Checklist</h3>
                                    <span className="text-[10px] text-gray-500 font-bold">
                                        {tpaReport.requiredEvidence.filter(e => e.present).length} of {tpaReport.requiredEvidence.length} documented
                                    </span>
                                </div>
                                <div className="space-y-2.5">
                                    {tpaReport.requiredEvidence.map((ev, idx) => (
                                        <div key={idx} className="flex items-start justify-between border-b border-white/[0.04] pb-2.5 last:border-0 last:pb-0 font-medium">
                                            <div className="space-y-0.5 pr-3">
                                                <div className="text-xs text-gray-200 font-semibold leading-snug">{ev.item}</div>
                                                <div className="flex gap-2 text-[10px] text-gray-500">
                                                    <span className="uppercase tracking-wider font-bold">{ev.source}</span>
                                                    {ev.forChallenge && <span className="italic">for: {ev.forChallenge}</span>}
                                                </div>
                                            </div>
                                            <span className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                ev.present
                                                    ? 'bg-emerald-500/10 border border-emerald-500/10 text-emerald-400'
                                                    : 'bg-rose-500/10 border border-rose-500/10 text-rose-400'
                                            }`}>
                                                {ev.present ? 'Documented' : 'Missing'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Required TPA Justifications (Rules-based) */}
                            {tpaReport.anticipatedQueries.filter(q => q.source === 'rule').length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">Required TPA Justifications ({tpaReport.anticipatedQueries.filter(q => q.source === 'rule').length})</h3>
                                    <div className="space-y-4">
                                        {tpaReport.anticipatedQueries.filter(q => q.source === 'rule').map((q, idx) => (
                                            <div key={idx} className="border border-white/5 rounded-2xl p-5 space-y-3 border-l-8 bg-rose-500/5 border-l-rose-500 shadow-sm">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-rose-500/10 text-rose-300 border border-rose-500/20">
                                                        {q.severity.toUpperCase()} PRIORITY RULE
                                                    </span>
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{q.relatedChallenge}</span>
                                                </div>
                                                <div className="text-xs text-rose-300 font-semibold bg-rose-950/20 border border-rose-500/10 px-3.5 py-2 rounded-xl leading-relaxed">
                                                    Required for <span className="underline">{diagnosisText}</span> per "{q.reason}"
                                                </div>
                                                <div className="text-sm font-bold text-white leading-normal">
                                                    "{q.query}"
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Clinical Evidence Suggestions (Model-suggested) */}
                            {tpaReport.anticipatedQueries.filter(q => q.source === 'suggestion').length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">Clinical Evidence Suggestions ({tpaReport.anticipatedQueries.filter(q => q.source === 'suggestion').length})</h3>
                                    <div className="space-y-4">
                                        {tpaReport.anticipatedQueries.filter(q => q.source === 'suggestion').map((q, idx) => (
                                            <div key={idx} className="border border-white/5 rounded-2xl p-5 space-y-3 border-l-8 bg-blue-950/10 border-l-blue-500">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-blue-500/15 text-blue-300 border border-blue-500/20">
                                                        CLINICAL ADVISORY
                                                    </span>
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{q.relatedChallenge}</span>
                                                </div>
                                                <div className="text-xs text-blue-300 font-semibold bg-blue-950/20 border border-blue-500/10 px-3.5 py-1.5 rounded-xl">
                                                    Possible gap — review
                                                </div>
                                                <div className="text-sm font-bold text-white leading-normal">
                                                    "{q.query}"
                                                </div>
                                                {q.reason && (
                                                    <div className="bg-black/25 rounded-xl p-3.5 border border-white/[0.04] space-y-1">
                                                        <div className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">Clinical Context / Reasoning</div>
                                                        <p className="text-xs text-gray-300 leading-relaxed font-medium">{q.reason}</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Policy Verification prompts */}
                            {tpaReport.policyChecks && tpaReport.policyChecks.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">Policy Verifications Needed</h3>
                                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 space-y-3">
                                        <p className="text-gray-300 text-xs font-medium leading-relaxed">Verify the following policy boundaries manually (cannot be determined from clinical data):</p>
                                        <div className="space-y-2.5">
                                            {tpaReport.policyChecks.map((pc, idx) => (
                                                <div key={idx} className="flex items-start gap-2.5 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/5 rounded-xl px-4 py-3 font-semibold leading-relaxed">
                                                    <span className="text-base mt-0.5">📋</span>
                                                    <span>
                                                        <strong>Policy check:</strong> {pc}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Reasoning Trace */}
                            <details className="group bg-gray-900/30 border border-white/5 rounded-2xl p-3">
                                <summary className="flex items-center justify-between text-xs text-gray-400 cursor-pointer list-none select-none px-1">
                                    <span className="font-bold uppercase tracking-wider text-[10px]">Evidence Reasoning Trace</span>
                                    <span className="transition-transform group-open:rotate-180 text-[10px]">▼</span>
                                </summary>
                                <div className="mt-3.5 space-y-1 font-mono text-[10px] text-gray-400 bg-black/35 p-3 rounded-xl overflow-x-auto leading-relaxed custom-scrollbar">
                                    {tpaReport.reasoningTrace.map((line, i) => (
                                        <div key={i}>{line}</div>
                                    ))}
                                </div>
                            </details>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                            <div className="text-3xl text-gray-600">◎</div>
                            <p className="text-gray-400 text-xs font-semibold">Evidence review runs automatically when you open this tab.</p>
                            <p className="text-gray-500 text-[11px]">Generate the pre-auth document first to see results.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
                <button onClick={onBack} className="py-2.5 rounded-xl font-semibold text-sm bg-gray-900 border border-white/10 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors duration-200 active:scale-[0.98]" type="button">
                    ← Back
                </button>
                <button onClick={handleGenerate} disabled={generating || hasBlockers} type="button"
                    className={`py-2.5 rounded-xl font-semibold text-sm text-white transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] ${
                        generating
                            ? 'bg-gray-800 border border-white/5 cursor-not-allowed text-gray-500'
                            : hasBlockers
                            ? 'bg-gray-900 border border-red-500/20 text-red-400/50 cursor-not-allowed'
                            : currentPartC?.submittabilityStatus === 'complete' || !currentPartC
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-500/10'
                            : 'bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 shadow-md shadow-blue-500/10'
                    }`}>
                    {generating ? (
                        <>
                            <svg className="spin-svg w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
