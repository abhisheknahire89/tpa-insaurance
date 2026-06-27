import React, { useState, useRef, useEffect } from 'react';
import { PreAuthRecord, WizardDocument, WizardDocCategory, MedicalNecessityStatement, DoctorDeclarationData, PatientDeclarationData, HospitalDeclarationData } from '../PreAuthWizard/types';
import { generateMedicalNecessity, generateIRDAITextFromRecord } from '../../services/medicalNecessityService';
import { scoreNecessityStrength } from '../../utils/strengthScorer';
import { getRequiredDocuments } from '../../utils/documentRequirements';
import { DEFAULT_DOCTORS } from '../../config/hospitalConfig';
import { formatFileSize } from '../../utils/formatters';
import { reviewEvidence, EvidenceReviewReport } from '../../engine/evidenceReview';

interface DocGenerateStepProps {
    record: Partial<PreAuthRecord>;
    onRecordChange: (r: Partial<PreAuthRecord>) => void;
    onBack: () => void;
    onGenerate: (irdaiText: string) => void;
}

const STRENGTH_CONFIG = {
    strong: { label: 'STRONG', color: 'text-green-400 bg-green-500/10 border-green-500/30', icon: '🟢' },
    moderate: { label: 'MODERATE', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: '🟡' },
    weak: { label: 'WEAK', color: 'text-red-400 bg-red-500/10 border-red-500/30', icon: '🔴' },
};

export const DocumentsGenerateStep: React.FC<DocGenerateStepProps> = ({
    record, onRecordChange, onBack, onGenerate
}) => {
    const [activeTab, setActiveTab] = useState<'docs' | 'necessity' | 'summary' | 'declarations' | 'tpa-review'>('docs');
    const [tpaReport, setTpaReport] = useState<EvidenceReviewReport | null>(null);
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
        const text = generateIRDAITextFromRecord(finalRecord);
        setIrdaiText(text);
        setGenerating(false);
        setGenerated(true);
        onGenerate(text);
    };

    const buildPrintHTML = (text: string) => {
        const patient = record.patient;
        const ins = record.insurance;
        const dx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
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
  <div class="footer">Generated by Aivana Insurance Pre-Auth System &nbsp;|&nbsp; Not valid without hospital seal and authorized signature</div>
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
        { id: 'docs', label: '📁 Documents' },
        { id: 'necessity', label: '🏥 Medical Necessity' },
        { id: 'summary', label: '📋 Summary' },
        { id: 'declarations', label: '✍️ Declarations' },
        { id: 'tpa-review', label: '🛡️ TPA Reviewer' },
    ] as const;

    if (generated) {
        return (
            <div className="space-y-5">
                {/* Success Banner */}
                <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-5 text-center space-y-2">
                    <div className="text-4xl">✅</div>
                    <h2 className="text-xl font-bold text-white">Pre-Auth Document Ready</h2>
                    <div className="font-mono text-blue-300 text-sm">{record.id}</div>
                    {missingDocs.length > 0 && (
                        <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-2 text-amber-300 text-xs">
                            ⚠️ {missingDocs.length} required document(s) missing — flagged PENDING DOCUMENTS
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-2">
                    <button
                        onClick={() => navigator.clipboard.writeText(irdaiText)}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium bg-gray-800 hover:bg-gray-700 border border-white/10 text-gray-300 hover:text-white transition-colors">
                        📋 Copy Text
                    </button>
                    <button
                        onClick={handlePrint}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium bg-blue-900/30 hover:bg-blue-900/50 border border-blue-500/30 text-blue-300 hover:text-white transition-colors">
                        🖨️ Print
                    </button>
                    <button
                        onClick={handleDownloadPDF}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white transition-all">
                        📄 Save PDF
                    </button>
                </div>

                {/* Generated Document Preview */}
                <div>
                    <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Generated IRDAI Pre-Auth Document</h3>
                    <textarea readOnly value={irdaiText} rows={18}
                        className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-gray-300 focus:outline-none resize-none" />
                </div>

                <button onClick={() => setGenerated(false)} className="w-full py-2.5 rounded-xl text-sm text-gray-500 border border-white/10 hover:bg-white/5 transition-colors">
                    ← Back to Edit
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <h2 className="text-xl font-bold text-white">Step 4: Documents & Generate</h2>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-800/50 rounded-xl p-1">
                {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Documents Tab */}
            {activeTab === 'docs' && (
                <div className="space-y-4">
                    {/* Missing Evidence Alert */}
                    {missingDocs.length > 0 && (
                        <div className="bg-red-900/20 border border-red-500/40 rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-red-300 font-semibold text-sm">
                                <span className="text-xl">⚠️</span> Critical Missing Evidence Alert
                            </div>
                            <p className="text-red-200 text-xs">TPA algorithms auto-reject <strong>{diagnosisText}</strong> claims without the following:</p>
                            <ul className="space-y-1">
                                {missingDocs.map(d => (
                                    <li key={d.category} className="flex items-center gap-2 text-xs text-red-200">
                                        <span className="text-red-500">✗</span>
                                        <strong>{d.displayName}</strong> — {d.description}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Required Docs Checklist */}
                    {requiredDocs.length > 0 && (
                        <div className="bg-gray-800/50 rounded-xl p-4 space-y-2">
                            <h3 className="text-sm font-semibold text-gray-300">Required for: {diagnosisText}</h3>
                            {requiredDocs.map(req => {
                                const uploaded = docs.find(d => d.documentCategory === req.category);
                                return (
                                    <div key={req.category} className="flex items-center gap-3 text-sm">
                                        <span className={uploaded ? 'text-green-400' : req.isRequired ? 'text-red-400' : 'text-gray-500'}>
                                            {uploaded ? '✅' : req.isRequired ? '⚠️' : '○'}
                                        </span>
                                        <span className={`flex-1 ${uploaded ? 'text-gray-400' : req.isRequired ? 'text-white' : 'text-gray-500'}`}>{req.displayName}</span>
                                        <span className={`text-xs ${req.isRequired ? 'text-red-400' : 'text-gray-600'}`}>{req.isRequired ? 'Required' : 'Optional'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Upload Zone */}
                    <div
                        onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-white/20 hover:border-blue-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors"
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
                    >
                        <div className="text-3xl">📁</div>
                        <div className="text-white font-medium mt-2">Drop files here or click to upload</div>
                        <div className="text-xs text-gray-500 mt-1">PDF, JPG, PNG — max 10MB each</div>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />

                    {/* Uploaded Docs List */}
                    {docs.length > 0 && (
                        <div className="space-y-2">
                            {docs.map(doc => (
                                <div key={doc.id} className="flex items-center gap-3 bg-gray-900 border border-white/10 rounded-xl px-3 py-2.5">
                                    <span className="text-lg">{doc.fileType === 'pdf' ? '📄' : '🖼️'}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-white truncate">{doc.fileName}</div>
                                        <div className="text-xs text-gray-500">{doc.fileSizeDisplay}</div>
                                    </div>
                                    <select value={doc.documentCategory} onChange={e => updateDocCategory(doc.id, e.target.value as WizardDocCategory)}
                                        className="bg-gray-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none">
                                        {DOC_CAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                    <button onClick={() => removeDoc(doc.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Medical Necessity Tab */}
            {activeTab === 'necessity' && (
                <div className="space-y-4">
                    <div className={`flex items-center justify-between p-3 rounded-xl border ${strCfg.color}`}>
                        <span className="font-semibold text-sm">Necessity Strength: {strCfg.icon} {strCfg.label}</span>
                        <button onClick={() => { setEditText(necessity?.generatedText ?? ''); setIsEditing(!isEditing); }} className="text-xs underline opacity-70 hover:opacity-100">
                            {isEditing ? 'Preview' : '✏️ Edit'}
                        </button>
                    </div>
                    <div className="text-xs text-gray-400 space-y-1">
                        {reasons.map((r, i) => <div key={i}>{r}</div>)}
                    </div>
                    {isEditing ? (
                        <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={18}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500/30 resize-none" />
                    ) : (
                        <div className="bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-gray-300 whitespace-pre-wrap max-h-80 overflow-y-auto">
                            {necessity?.generatedText ?? 'Generating...'}
                        </div>
                    )}
                    <button onClick={generateNecessity} className="text-xs text-blue-400 hover:text-blue-300 underline">↺ Regenerate from data</button>
                </div>
            )}

            {/* Summary Tab */}
            {activeTab === 'summary' && (
                <div className="bg-gray-800/50 rounded-xl p-4 space-y-3 text-sm">
                    <h3 className="font-semibold text-white">Pre-Authorization Summary</h3>
                    {[
                        ['Patient', `${record.patient?.patientName ?? '—'}, ${record.patient?.age ?? '?'}Y ${record.patient?.gender ?? ''}`],
                        ['Policy', `${record.insurance?.policyNumber ?? '—'} (${record.insurance?.insurerName ?? '—'} via ${record.insurance?.tpaName ?? '—'})`],
                        ['Diagnosis', `${selectedDx?.diagnosis ?? '—'} (${selectedDx?.icd10Code ?? '—'})`],
                        ['Admission', `${record.admission?.admissionType ?? '—'} — ${record.admission?.dateOfAdmission ?? '—'} — ${record.admission?.roomCategory ?? '—'}`],
                        ['Expected Stay', `${record.admission?.expectedLengthOfStay ?? 0} days (${record.admission?.expectedDaysInRoom ?? 0} ward + ${record.admission?.expectedDaysInICU ?? 0} ICU)`],
                        ['Total Estimate', `₹${(record.costEstimate?.totalEstimatedCost ?? 0).toLocaleString('en-IN')}`],
                        ['Claimed', `₹${(record.costEstimate?.amountClaimedFromInsurer ?? 0).toLocaleString('en-IN')}`],
                        ['Documents', `${docs.length} attached, ${missingDocs.length} required pending`],
                        ['Necessity Strength', `${strCfg.icon} ${strCfg.label}`],
                    ].map(([label, value]) => (
                        <div key={label} className="flex justify-between border-b border-white/5 pb-2">
                            <span className="text-gray-400">{label}</span>
                            <span className="text-white text-right max-w-xs">{value}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Declarations Tab */}
            {activeTab === 'declarations' && (
                <div className="space-y-5">
                    {/* Patient */}
                    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
                        <h3 className="font-semibold text-blue-300 text-sm">Patient / Insured Declaration</h3>
                        <p className="text-xs text-gray-400">I hereby declare that the information furnished is true and correct. I authorize the hospital and TPA to share my medical records for claim processing.</p>
                        <div className="space-y-2">
                            {[
                                ['agreedToTerms', 'Patient/attendant has been informed and consents to terms'],
                                ['consentForMedicalDataSharing', 'Patient consents to sharing of medical data with insurer/TPA'],
                                ['agreesToPayNonPayables', 'Patient agrees to pay any non-payable items per policy terms'],
                            ].map(([key, label]) => (
                                <label key={key} className="flex items-start gap-2 cursor-pointer">
                                    <input type="checkbox" checked={(docDecl as any)[key] ?? false}
                                        onChange={e => updateDecl({ patient: { ...docDecl, [key]: e.target.checked } })}
                                        className="accent-blue-500 mt-0.5" />
                                    <span className="text-sm text-gray-300">{label}</span>
                                </label>
                            ))}
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Captured by (insurance desk person name) *</label>
                                <input value={docDecl.capturedBy ?? ''} onChange={e => updateDecl({ patient: { ...docDecl, capturedBy: e.target.value } })}
                                    className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="Your name" />
                            </div>
                        </div>
                    </div>

                    {/* Doctor */}
                    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
                        <h3 className="font-semibold text-blue-300 text-sm">Treating Doctor's Declaration</h3>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Select Treating Doctor *</label>
                            <select value={drDecl.doctorId ?? ''} onChange={e => {
                                const dr = DEFAULT_DOCTORS.find(d => d.id === e.target.value);
                                if (dr) updateDecl({ doctor: { doctorId: dr.id, doctorName: dr.name, doctorQualification: dr.qualification, doctorRegistrationNumber: dr.registrationNumber, registrationCouncil: dr.registrationCouncil, confirmed: false, confirmationMethod: 'in_app' } });
                            }} className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50">
                                <option value="">Select Doctor</option>
                                {DEFAULT_DOCTORS.map(d => <option key={d.id} value={d.id}>{d.name} — {d.qualification}</option>)}
                            </select>
                        </div>
                        {drDecl.doctorName && (
                            <div className="bg-gray-900 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                                <div>Reg: {drDecl.doctorRegistrationNumber} | {drDecl.registrationCouncil}</div>
                            </div>
                        )}
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={drDecl.confirmed ?? false} disabled={!drDecl.doctorId}
                                onChange={e => updateDecl({ doctor: { ...drDecl, confirmed: e.target.checked, confirmationMethod: 'in_app' } })}
                                className="accent-blue-500" />
                            <span className="text-sm text-gray-300">Doctor confirms the above clinical information is accurate</span>
                        </label>
                    </div>

                    {/* Hospital */}
                    <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
                        <h3 className="font-semibold text-blue-300 text-sm">Hospital Declaration</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Authorized Signatory</label>
                                <input value={hospDecl.authorizedSignatoryName ?? ''} onChange={e => updateDecl({ hospital: { ...hospDecl, authorizedSignatoryName: e.target.value } })}
                                    className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Designation</label>
                                <input value={hospDecl.designation ?? ''} onChange={e => updateDecl({ hospital: { ...hospDecl, designation: e.target.value } })}
                                    className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                            </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={hospDecl.hospitalSealApplied ?? false}
                                onChange={e => updateDecl({ hospital: { ...hospDecl, hospitalSealApplied: e.target.checked } })}
                                className="accent-blue-500" />
                            <span className="text-sm text-gray-300">Hospital seal will be applied on printed copy</span>
                        </label>
                    </div>
                </div>
            )}

            {/* TPA Reviewer Tab */}
            {activeTab === 'tpa-review' && (
                <div className="space-y-4">
                    {tpaLoading ? (
                        <div className="flex flex-col items-center justify-center py-10 space-y-3">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-gray-400 text-sm">NEXUS is auditing documentation sufficiency...</span>
                        </div>
                    ) : tpaReport ? (
                        <div className="space-y-5">
                            {/* Sufficiency Status Badge */}
                            <div className={`p-5 rounded-2xl border text-center space-y-2 backdrop-blur-md ${
                                tpaReport.status === 'sufficient'
                                    ? 'bg-green-950/30 border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.1)]'
                                    : 'bg-red-950/30 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.1)]'
                            }`}>
                                <div className="text-sm font-semibold tracking-wider uppercase text-gray-400">Claims Readiness Status</div>
                                <div className={`text-3xl font-extrabold tracking-wide ${
                                    tpaReport.status === 'sufficient' ? 'text-green-400' : 'text-red-400'
                                }`}>
                                    {tpaReport.status.toUpperCase()}
                                </div>
                                <p className="text-xs text-gray-300 max-w-md mx-auto">
                                    {tpaReport.status === 'sufficient'
                                        ? 'Documentation is complete and sufficient to defend this claim against standard TPA challenges.'
                                        : 'Documentation is insufficient. TPA algorithms are highly likely to raise queries or reject this claim.'}
                                </p>
                            </div>

                            {/* Challenges Considered */}
                            <div className="bg-gray-800/50 border border-white/5 rounded-2xl p-4 space-y-2">
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Challenges Considered</h3>
                                <ul className="space-y-1.5">
                                    {tpaReport.challengesConsidered.map((challenge, idx) => (
                                        <li key={idx} className="text-xs text-gray-300 flex items-start gap-2">
                                            <span className="text-blue-400">🔎</span>
                                            <span>{challenge}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Administrative Compliance Gaps */}
                            {tpaReport.mandatoryGaps.length > 0 && (
                                <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 space-y-2">
                                    <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                                        ⚠️ Compliance & Checklist Gaps
                                    </h3>
                                    <ul className="space-y-1.5">
                                        {tpaReport.mandatoryGaps.map((gap, idx) => (
                                            <li key={idx} className="text-xs text-amber-200 flex items-start gap-2">
                                                <span className="text-amber-500">•</span>
                                                <span>{gap}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Evidence Checklist */}
                            <div className="bg-gray-800/50 border border-white/5 rounded-2xl p-4 space-y-3">
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Clinical Evidence Checklist</h3>
                                <div className="space-y-2.5">
                                    {tpaReport.requiredEvidence.map((ev, idx) => (
                                        <div key={idx} className="flex items-start justify-between border-b border-white/5 pb-2 text-xs">
                                            <div className="space-y-0.5 pr-2">
                                                <div className="text-gray-200 font-medium">{ev.item}</div>
                                                <div className="flex gap-2 text-[10px] text-gray-500">
                                                    <span className="uppercase">{ev.source}</span>
                                                    {ev.forChallenge && <span className="italic">for: {ev.forChallenge}</span>}
                                                </div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                ev.present
                                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                            }`}>
                                                {ev.present ? 'Documented' : 'Missing'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Anticipated Queries */}
                            {tpaReport.anticipatedQueries.length > 0 && (
                                <div className="space-y-2.5">
                                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Anticipated TPA Queries</h3>
                                    <div className="space-y-3">
                                        {tpaReport.anticipatedQueries.map((q, idx) => (
                                            <div key={idx} className="bg-gray-900 border border-white/10 rounded-2xl p-4 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                        q.severity === 'high' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                                        q.severity === 'medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                                        'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                    }`}>
                                                        {q.severity.toUpperCase()} SEVERITY
                                                    </span>
                                                    <span className="text-[10px] text-gray-500 truncate max-w-[200px]">{q.relatedChallenge}</span>
                                                </div>
                                                <div className="text-sm font-semibold text-white leading-snug">"{q.query}"</div>
                                                <div className="text-xs text-gray-400 flex items-start gap-1">
                                                    <span className="text-gray-500">Fix action:</span>
                                                    <span>{q.reason}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Reasoning Trace */}
                            <details className="group bg-gray-900/30 border border-white/5 rounded-2xl p-3">
                                <summary className="flex items-center justify-between text-xs text-gray-400 cursor-pointer list-none select-none">
                                    <span className="font-semibold uppercase tracking-wider">🛡️ NEXUS Reasoning Audit Trail</span>
                                    <span className="transition-transform group-open:rotate-180">▼</span>
                                </summary>
                                <div className="mt-3 space-y-1 font-mono text-[10px] text-gray-400 bg-black/30 p-3 rounded-xl overflow-x-auto leading-relaxed">
                                    {tpaReport.reasoningTrace.map((line, i) => (
                                        <div key={i}>{line}</div>
                                    ))}
                                </div>
                            </details>
                        </div>
                    ) : (
                        <div className="text-gray-400 text-sm text-center py-5">No review report available.</div>
                    )}
                </div>
            )}

            {/* Bottom Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
                <button onClick={onBack} className="py-3 rounded-xl font-semibold text-sm bg-gray-800 hover:bg-gray-700 text-white transition-colors">← Back</button>
                <button onClick={handleGenerate} disabled={generating}
                    className="py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white transition-all disabled:opacity-50">
                    {generating ? '⏳ Generating...' : '🚀 Generate Pre-Auth Document'}
                </button>
            </div>
            {missingDocs.length > 0 && (
                <p className="text-xs text-amber-400 text-center">⚠️ {missingDocs.length} required documents missing — pre-auth will be marked PENDING DOCUMENTS</p>
            )}
        </div>
    );
};

const guessCategory = (filename: string): WizardDocCategory => {
    const lower = filename.toLowerCase();
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
