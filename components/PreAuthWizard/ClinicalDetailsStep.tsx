import React, { useState } from 'react';
import { ClinicalDetails, ClinicalDataSource, DiagnosisEntry, WizardVitals, CaseComplexity } from '../PreAuthWizard/types';
import { lookupICD, IcdCandidate } from '../../services/icdService';
import { ICDPicker } from './ICDPicker';

interface ClinicalDetailsStepProps {
    clinical: Partial<ClinicalDetails>;
    caseId: string;
    doctorName?: string;
    onClinicalChange: (c: Partial<ClinicalDetails>) => void;
    onNext: () => void;
    onBack: () => void;
    complexity?: CaseComplexity;
}

const DEFAULT_VITALS: WizardVitals = { bp: '', pulse: '', temp: '', spo2: '', rr: '' };

export const ClinicalDetailsStep: React.FC<ClinicalDetailsStepProps> = ({
    clinical, caseId, doctorName, onClinicalChange, onNext, onBack, complexity
}) => {
    const [dataSource, setDataSource] = useState<ClinicalDataSource | null>(clinical.chiefComplaints ? 'manual_entry' : null);
    const [showOptionalFields, setShowOptionalFields] = useState(false);
    const [icdQuery, setIcdQuery] = useState('');
    const [icdResults, setIcdResults] = useState<IcdCandidate[]>([]);
    const [showInjury, setShowInjury] = useState(false);
    const [showSurgery, setShowSurgery] = useState(false);
    const [showMaternity, setShowMaternity] = useState(false);

    // Auto-prefill hospitalisation reason for Low-complexity cases to speed up desk throughput
    if (complexity === 'Low' && !clinical.reasonForHospitalisation) {
        setTimeout(() => {
            onClinicalChange({
                ...clinical,
                reasonForHospitalisation: 'Patient requires safe clinical environment for planned elective procedure.'
            });
        }, 0);
    }

    const vitals = clinical.vitals ?? DEFAULT_VITALS;
    const c = clinical;

    const update = (partial: Partial<ClinicalDetails>) => onClinicalChange({ ...clinical, ...partial });

    const handleVitalChange = (field: keyof WizardVitals, val: string) => {
        update({ vitals: { ...vitals, [field]: val } });
    };

    const handleIcdSearch = (q: string) => {
        setIcdQuery(q);
        setIcdResults(q.length >= 2 ? lookupICD(q) : []);
    };

    const addDiagnosis = (entry: IcdCandidate) => {
        const existing = c.diagnoses ?? [];
        if (existing.some(d => d.icd10Code === entry.code)) return;
        const newEntry: DiagnosisEntry = {
            diagnosis: entry.description,
            icd10Code: 'Pending ICD-10',
            icd10Description: 'Selection required',
            probability: 0.85,
            reasoning: '',
            isSelected: existing.length === 0,
        };
        update({ diagnoses: [...existing, newEntry], selectedDiagnosisIndex: existing.length === 0 ? 0 : (c.selectedDiagnosisIndex ?? 0) });
        setIcdQuery('');
        setIcdResults([]);
    };

    const selectPrimaryDx = (idx: number) => {
        update({
            selectedDiagnosisIndex: idx,
            diagnoses: (c.diagnoses ?? []).map((d, i) => ({ ...d, isSelected: i === idx }))
        });
    };

    const removeDx = (idx: number) => {
        const updated = (c.diagnoses ?? []).filter((_, i) => i !== idx);
        update({ diagnoses: updated, selectedDiagnosisIndex: 0 });
    };

    const spo2Val = parseInt(vitals.spo2 || '100');
    const pulseVal = parseInt(vitals.pulse || '80');
    const tempVal = parseFloat(vitals.temp || '98.6');

    const isValid = !!(
        c.chiefComplaints && c.durationOfPresentAilment && c.natureOfIllness &&
        c.diagnoses && c.diagnoses.length > 0 &&
        c.diagnoses.every(d => d.icd10Code && !d.icd10Code.toLowerCase().includes('pending')) &&
        (c.proposedLineOfTreatment?.medical || c.proposedLineOfTreatment?.surgical ||
            c.proposedLineOfTreatment?.intensiveCare || c.proposedLineOfTreatment?.investigation) &&
        c.reasonForHospitalisation
    );

    if (!dataSource) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold text-white">Clinical Details</h2>
                    <p className="text-gray-400 text-sm mt-1">How would you like to enter clinical details?</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setDataSource('voice_scribe')}
                        className="flex flex-col items-center gap-3 p-6 bg-gray-800 hover:bg-gray-700 border border-white/10 hover:border-blue-500/30 rounded-2xl text-center transition-all">
                        <div className="text-4xl">🎙️</div>
                        <div>
                            <div className="font-semibold text-white">Import from Voice Scribe</div>
                            <div className="text-xs text-gray-400 mt-1">Auto-fill from today's consultation recording</div>
                            <div className="mt-2 text-xs text-blue-400 font-semibold">⚡ Recommended</div>
                        </div>
                    </button>
                    <button onClick={() => setDataSource('manual_entry')}
                        className="flex flex-col items-center gap-3 p-6 bg-gray-800 hover:bg-gray-700 border border-white/10 hover:border-blue-500/30 rounded-2xl text-center transition-all">
                        <div className="text-4xl">✏️</div>
                        <div>
                            <div className="font-semibold text-white">Enter Manually</div>
                            <div className="text-xs text-gray-400 mt-1">Type clinical details into structured form</div>
                        </div>
                    </button>
                </div>
                {dataSource === 'voice_scribe' && (
                    <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-4">
                        <p className="text-blue-300 text-sm">No active voice session found. Continuing in manual entry mode.</p>
                        <button className="mt-2 text-xs text-blue-400 underline" onClick={() => setDataSource('manual_entry')}>Continue with manual entry →</button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Clinical Details</h2>
                <button onClick={() => setDataSource(null)} className="text-xs text-gray-400 hover:text-white transition-colors" type="button">Change source</button>
            </div>

            {/* Presenting Illness */}
            <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm shadow-black/10">
                <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">🩺 Presenting Illness</h3>
                <div>
                    <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Chief Complaints *</label>
                    <textarea value={c.chiefComplaints ?? ''} onChange={e => update({ chiefComplaints: e.target.value })} rows={2}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all"
                        placeholder="Fever, cough, breathlessness..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Duration of Ailment *</label>
                        <input value={c.durationOfPresentAilment ?? ''} onChange={e => update({ durationOfPresentAilment: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" placeholder="e.g. 5 days" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Nature of Illness *</label>
                        <select value={c.natureOfIllness ?? ''} onChange={e => update({ natureOfIllness: e.target.value as any })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                            <option value="" className="bg-[#0B0F19]">Select</option>
                            <option className="bg-[#0B0F19]">Acute</option><option className="bg-[#0B0F19]">Chronic</option><option className="bg-[#0B0F19]">Acute on Chronic</option>
                        </select>
                    </div>
                </div>
                {complexity === 'Low' ? (
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
                        <button
                            type="button"
                            onClick={() => setShowOptionalFields(!showOptionalFields)}
                            className="w-full flex items-center justify-between text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-wider transition-colors"
                        >
                            <span>📂 Optional Clinical Fields ({showOptionalFields ? 'Expanded' : 'Collapsed'})</span>
                            <span>{showOptionalFields ? '▲' : '▼'}</span>
                        </button>
                        {showOptionalFields && (
                            <div className="space-y-4 pt-2 border-t border-white/5 mt-2 animate-fade-in">
                                <div>
                                    <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">History of Present Illness</label>
                                    <textarea value={c.historyOfPresentIllness ?? ''} onChange={e => update({ historyOfPresentIllness: e.target.value })} rows={3}
                                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all"
                                        placeholder="Describe onset, progression, associated symptoms..." />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Relevant Clinical Findings</label>
                                    <textarea value={c.relevantClinicalFindings ?? ''} onChange={e => update({ relevantClinicalFindings: e.target.value })} rows={2}
                                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all"
                                        placeholder="Examination findings, auscultation, palpation..." />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Prior OPD Treatment (if any)</label>
                                    <textarea value={c.treatmentTakenSoFar ?? ''} onChange={e => update({ treatmentTakenSoFar: e.target.value })} rows={2}
                                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all"
                                        placeholder="OPD treatment tried..." />
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div>
                            <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">History of Present Illness</label>
                            <textarea value={c.historyOfPresentIllness ?? ''} onChange={e => update({ historyOfPresentIllness: e.target.value })} rows={3}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all"
                                placeholder="Describe onset, progression, associated symptoms, prior treatment tried..." />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Relevant Clinical Findings *</label>
                            <textarea value={c.relevantClinicalFindings ?? ''} onChange={e => update({ relevantClinicalFindings: e.target.value })} rows={2}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all"
                                placeholder="Examination findings, auscultation, palpation etc." />
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Prior OPD Treatment (if any)</label>
                            <textarea value={c.treatmentTakenSoFar ?? ''} onChange={e => update({ treatmentTakenSoFar: e.target.value })} rows={2}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all"
                                placeholder="e.g. Oral antibiotics for 3 days without relief..." />
                        </div>
                    </>
                )}
            </div>

            {/* Vitals */}
            <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm">
                <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">💊 Vitals at Presentation</h3>
                <div className="grid grid-cols-5 gap-3">
                    {([['bp', 'BP (mmHg)', '130/80'], ['pulse', 'Pulse (/min)', '80'], ['temp', 'Temp (°F)', '98.6'], ['spo2', 'SpO2 (%)', '98'], ['rr', 'RR (/min)', '16']] as [keyof WizardVitals, string, string][]).map(([f, label, ph]) => {
                        let alertClass = 'border-white/10 focus:border-blue-500';
                        if (f === 'spo2' && vitals.spo2 && parseInt(vitals.spo2) < 94) alertClass = 'border-red-500/40 text-red-300 bg-red-500/5 focus:border-red-500 focus:ring-2 focus:ring-red-500/20';
                        else if (f === 'temp' && vitals.temp && parseFloat(vitals.temp) > 100.4) alertClass = 'border-amber-500/40 text-amber-300 bg-amber-500/5 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20';
                        else if (f === 'pulse' && vitals.pulse && (parseInt(vitals.pulse) > 100 || parseInt(vitals.pulse) < 60)) alertClass = 'border-amber-500/40 text-amber-300 bg-amber-500/5 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20';
                        return (
                            <div key={f}>
                                <label className="block text-[10px] text-gray-400 font-semibold mb-1">{label}</label>
                                <input value={vitals[f] ?? ''} onChange={e => handleVitalChange(f, e.target.value)}
                                    className={`w-full bg-white/[0.03] border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none transition-all ${alertClass}`}
                                    placeholder={ph} />
                            </div>
                        );
                    })}
                </div>
                {spo2Val < 94 && vitals.spo2 && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-red-300 text-xs font-semibold leading-relaxed">
                        ⚠️ SpO2 {vitals.spo2}% — Hypoxia detected. This strongly supports inpatient medical necessity.
                    </div>
                )}
            </div>

            {/* Diagnosis */}
            <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm">
                <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">🔬 Diagnosis</h3>
                <div className="relative">
                    <input value={icdQuery} onChange={e => handleIcdSearch(e.target.value)}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all"
                        placeholder="Search diagnosis by name or ICD-10 code (e.g. Pneumonia)..." />
                    {icdResults.length > 0 && (
                        <div className="absolute z-20 w-full bg-gray-900 border border-white/10 rounded-lg mt-1 shadow-xl max-h-56 overflow-y-auto divide-y divide-white/5">
                            {icdResults.map(r => (
                                <button key={r.code} onClick={() => addDiagnosis(r)}
                                    className="w-full px-4 py-2.5 text-left hover:bg-white/5 text-xs flex justify-between items-center transition-all"
                                    type="button">
                                    <span className="text-white font-medium">{r.commonName ?? r.description}</span>
                                    <span className="font-mono text-[10px] bg-blue-500/10 border border-blue-500/10 text-blue-400 px-2 py-0.5 rounded">{r.code}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {(c.diagnoses ?? []).length > 0 && (
                    <div className="space-y-2">
                        {(c.diagnoses ?? []).map((dx, i) => (
                            <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${dx.isSelected ? 'bg-blue-600/10 border-blue-500/40' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}
                                onClick={() => selectPrimaryDx(i)}>
                                <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${dx.isSelected ? 'border-blue-400' : 'border-gray-600'}`}>
                                    {dx.isSelected && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs font-semibold text-white">{dx.diagnosis}</div>
                                    <div className="text-[10px] text-gray-400 mt-0.5">
                                        {dx.icd10Code.includes('Pending') ? (
                                            <span className="text-amber-400 font-medium">⚠️ {dx.icd10Code} — {dx.icd10Description}</span>
                                        ) : (
                                            <span className="font-medium">{dx.icd10Code} — {dx.icd10Description}</span>
                                        )}
                                    </div>
                                </div>
                                {dx.isSelected && <span className="text-[9px] bg-blue-500/15 border border-blue-500/10 text-blue-300 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Primary</span>}
                                <button onClick={e => { e.stopPropagation(); removeDx(i); }} className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-white/5 rounded-lg transition-all" type="button">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                {(c.diagnoses ?? []).length === 0 && <p className="text-gray-500 text-xs text-center py-4">Search and add the primary diagnosis above *</p>}

                {/* Render ICD Picker for the selected (primary) diagnosis */}
                {c.diagnoses && c.diagnoses.length > 0 && (() => {
                    const primaryIdx = c.selectedDiagnosisIndex ?? 0;
                    const primaryDx = c.diagnoses[primaryIdx];
                    if (!primaryDx) return null;
                    return (
                        <div className="mt-2">
                            <ICDPicker
                                caseId={caseId}
                                diagnosisText={primaryDx.diagnosis}
                                clinicalContext={c.chiefComplaints || ''}
                                initialCode={primaryDx.icd10Code && !primaryDx.icd10Code.toLowerCase().includes('pending') ? primaryDx.icd10Code : ''}
                                initialDescription={primaryDx.icd10Description && !primaryDx.icd10Description.toLowerCase().includes('pending') ? primaryDx.icd10Description : ''}
                                initialMatchMethod={primaryDx.icd10MatchMethod}
                                doctorName={doctorName}
                                onConfirm={(code, description, matchMethod) => {
                                    const updated = (c.diagnoses ?? []).map((dx, idx) => {
                                        if (idx === primaryIdx) {
                                            return {
                                                ...dx,
                                                icd10Code: code,
                                                icd10Description: description,
                                                icd10MatchMethod: matchMethod
                                            };
                                        }
                                        return dx;
                                    });
                                    update({ diagnoses: updated });
                                }}
                            />
                        </div>
                    );
                })()}
            </div>

            {/* Treatment Plan */}
            <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm">
                <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">📋 Proposed Treatment Plan</h3>
                <div>
                    <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Line of Treatment *</label>
                    <div className="flex flex-wrap gap-2.5">
                        {([['medical', 'Medical Management'], ['surgical', 'Surgical Management'], ['intensiveCare', 'Intensive Care'], ['investigation', 'Investigation Only'], ['nonAllopathic', 'Non-Allopathic']] as const).map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-lg px-3.5 py-2 text-xs text-gray-300 transition-all select-none">
                                <input type="checkbox"
                                    checked={c.proposedLineOfTreatment?.[key] ?? false}
                                    onChange={e => update({ proposedLineOfTreatment: { ...{ medical: false, surgical: false, intensiveCare: false, investigation: false, nonAllopathic: false }, ...c.proposedLineOfTreatment, [key]: e.target.checked } })}
                                    className="accent-blue-500 w-3.5 h-3.5 rounded" />
                                <span className="font-medium" onClick={() => {
                                    if (key === 'surgical') setShowSurgery(prev => !prev);
                                }}>{label}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Why is OPD management NOT appropriate? *</label>
                    <textarea value={c.reasonForHospitalisation ?? ''} onChange={e => update({ reasonForHospitalisation: e.target.value })} rows={3}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all"
                        placeholder="e.g. Patient requires IV antibiotics, continuous oxygen therapy, and hemodynamic monitoring which cannot be accomplished on outpatient basis." />
                </div>

                {/* Conditional Panels */}
                <div className="space-y-3 pt-2">
                    <button onClick={() => setShowInjury(p => !p)} className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors" type="button">
                        <span className="text-[10px]">{showInjury ? '▼' : '▶'}</span> Is this an injury/accident case?
                    </button>
                    {showInjury && (
                        <div className="bg-black/30 border border-white/5 rounded-xl p-4 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Date of Injury</label>
                                <input type="date" value={c.injuryDetails?.dateOfInjury ?? ''} onChange={e => update({ injuryDetails: { ...c.injuryDetails as any, isInjury: true, dateOfInjury: e.target.value, isMLC: c.injuryDetails?.isMLC ?? false } })}
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Cause of Injury</label>
                                <input value={c.injuryDetails?.causeOfInjury ?? ''} onChange={e => update({ injuryDetails: { ...c.injuryDetails as any, isInjury: true, causeOfInjury: e.target.value, isMLC: c.injuryDetails?.isMLC ?? false } })}
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600" placeholder="Road accident, fall..." />
                            </div>
                            <div className="col-span-2 flex items-center mt-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={c.injuryDetails?.isMLC ?? false} onChange={e => update({ injuryDetails: { ...c.injuryDetails as any, isInjury: true, isMLC: e.target.checked } })} className="accent-blue-500 w-3.5 h-3.5 rounded" />
                                    <span className="text-xs text-gray-300 font-medium select-none">Medico-Legal Case (MLC)</span>
                                </label>
                            </div>
                        </div>
                    )}

                    <button onClick={() => setShowSurgery(p => !p)} className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors" type="button">
                        <span className="text-[10px]">{showSurgery ? '▼' : '▶'}</span> Add surgery details
                    </button>
                    {showSurgery && (
                        <div className="bg-black/30 border border-white/5 rounded-xl p-4 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Name of Surgery *</label>
                                <input value={c.surgeryDetails?.nameOfSurgery ?? ''} onChange={e => update({ surgeryDetails: { ...c.surgeryDetails as any, nameOfSurgery: e.target.value, routeOfSurgery: c.surgeryDetails?.routeOfSurgery ?? 'Open' } })}
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600" placeholder="e.g. Laparoscopic Appendicectomy" />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Route of Surgery</label>
                                <select value={c.surgeryDetails?.routeOfSurgery ?? 'Open'} onChange={e => update({ surgeryDetails: { ...c.surgeryDetails as any, nameOfSurgery: c.surgeryDetails?.nameOfSurgery ?? '', routeOfSurgery: e.target.value as any } })}
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                                    <option className="bg-[#0B0F19]">Open</option><option className="bg-[#0B0F19]">Laparoscopic</option><option className="bg-[#0B0F19]">Endoscopic</option><option className="bg-[#0B0F19]">Robotic</option><option className="bg-[#0B0F19]">Other</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
                <button onClick={onBack} className="py-2 rounded-lg font-semibold text-xs bg-white/5 border border-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all duration-150 active:scale-[0.98]" type="button">
                    ← Back
                </button>
                <button onClick={onNext} disabled={!isValid} type="button"
                    className={`py-2 rounded-lg font-semibold text-xs transition-all duration-150 ${isValid ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm' : 'bg-white/5 border border-white/5 text-gray-500 cursor-not-allowed'}`}>
                    Continue to Admission & Cost
                </button>
            </div>
            {!isValid && <p className="text-[10px] text-amber-500 font-semibold text-center mt-1">Add diagnosis (with confirmed ICD-10 code), treatment line, and OPD justification to continue</p>}
        </div>
    );
};
