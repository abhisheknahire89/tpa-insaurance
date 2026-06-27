import React, { useState } from 'react';
import { ClinicalDetails, ClinicalDataSource, DiagnosisEntry, WizardVitals } from '../PreAuthWizard/types';
import { searchICD10 } from '../../config/icd10Database';

interface ClinicalDetailsStepProps {
    clinical: Partial<ClinicalDetails>;
    onClinicalChange: (c: Partial<ClinicalDetails>) => void;
    onNext: () => void;
    onBack: () => void;
}

const DEFAULT_VITALS: WizardVitals = { bp: '', pulse: '', temp: '', spo2: '', rr: '' };

export const ClinicalDetailsStep: React.FC<ClinicalDetailsStepProps> = ({
    clinical, onClinicalChange, onNext, onBack
}) => {
    const [dataSource, setDataSource] = useState<ClinicalDataSource | null>(clinical.chiefComplaints ? 'manual_entry' : null);
    const [icdQuery, setIcdQuery] = useState('');
    const [icdResults, setIcdResults] = useState<ReturnType<typeof searchICD10>>([]);
    const [showInjury, setShowInjury] = useState(false);
    const [showSurgery, setShowSurgery] = useState(false);
    const [showMaternity, setShowMaternity] = useState(false);

    const vitals = clinical.vitals ?? DEFAULT_VITALS;
    const c = clinical;

    const update = (partial: Partial<ClinicalDetails>) => onClinicalChange({ ...clinical, ...partial });

    const handleVitalChange = (field: keyof WizardVitals, val: string) => {
        update({ vitals: { ...vitals, [field]: val } });
    };

    const handleIcdSearch = (q: string) => {
        setIcdQuery(q);
        setIcdResults(q.length >= 2 ? searchICD10(q) : []);
    };

    const addDiagnosis = (entry: ReturnType<typeof searchICD10>[0]) => {
        const existing = c.diagnoses ?? [];
        if (existing.some(d => d.icd10Code === entry.code)) return;
        const newEntry: DiagnosisEntry = {
            diagnosis: entry.commonName ?? entry.description,
            icd10Code: entry.code,
            icd10Description: entry.description,
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
        (c.proposedLineOfTreatment?.medical || c.proposedLineOfTreatment?.surgical ||
            c.proposedLineOfTreatment?.intensiveCare || c.proposedLineOfTreatment?.investigation) &&
        c.reasonForHospitalisation
    );

    if (!dataSource) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-xl font-bold text-white">Step 2: Clinical Details</h2>
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
                        <p className="text-blue-300 text-sm">📋 No active NEXUS session found. Using manual entry mode.</p>
                        <button className="mt-2 text-xs text-blue-400 underline" onClick={() => setDataSource('manual_entry')}>Continue with manual entry →</button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Step 2: Clinical Details</h2>
                <button onClick={() => setDataSource(null)} className="text-xs text-gray-500 hover:text-gray-300">Change source</button>
            </div>

            {/* Presenting Illness */}
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
                <h3 className="font-semibold text-blue-300 text-sm">🩺 Presenting Illness</h3>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Chief Complaints *</label>
                    <textarea value={c.chiefComplaints ?? ''} onChange={e => update({ chiefComplaints: e.target.value })} rows={2}
                        className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="Fever, cough, breathlessness..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Duration *</label>
                        <input value={c.durationOfPresentAilment ?? ''} onChange={e => update({ durationOfPresentAilment: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="e.g. 5 days" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Nature of Illness *</label>
                        <select value={c.natureOfIllness ?? ''} onChange={e => update({ natureOfIllness: e.target.value as any })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50">
                            <option value="">Select</option>
                            <option>Acute</option><option>Chronic</option><option>Acute on Chronic</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">History of Present Illness</label>
                    <textarea value={c.historyOfPresentIllness ?? ''} onChange={e => update({ historyOfPresentIllness: e.target.value })} rows={3}
                        className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="Describe onset, progression, associated symptoms, prior treatment tried..." />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Relevant Clinical Findings *</label>
                    <textarea value={c.relevantClinicalFindings ?? ''} onChange={e => update({ relevantClinicalFindings: e.target.value })} rows={2}
                        className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="Examination findings, auscultation, palpation etc." />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Prior OPD Treatment (if any)</label>
                    <textarea value={c.treatmentTakenSoFar ?? ''} onChange={e => update({ treatmentTakenSoFar: e.target.value })} rows={2}
                        className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="e.g. Oral antibiotics for 3 days without relief..." />
                </div>
            </div>

            {/* Vitals */}
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-blue-300 text-sm">💊 Vitals at Presentation</h3>
                <div className="grid grid-cols-5 gap-3">
                    {([['bp', 'BP (mmHg)', '130/80'], ['pulse', 'Pulse (/min)', '80'], ['temp', 'Temp (°F)', '98.6'], ['spo2', 'SpO2 (%)', '98'], ['rr', 'RR (/min)', '16']] as [keyof WizardVitals, string, string][]).map(([f, label, ph]) => {
                        let alertClass = '';
                        if (f === 'spo2' && vitals.spo2 && parseInt(vitals.spo2) < 94) alertClass = 'border-red-500/60 text-red-300';
                        if (f === 'temp' && vitals.temp && parseFloat(vitals.temp) > 100.4) alertClass = 'border-amber-500/60';
                        if (f === 'pulse' && vitals.pulse && (parseInt(vitals.pulse) > 100 || parseInt(vitals.pulse) < 60)) alertClass = 'border-amber-500/60';
                        return (
                            <div key={f}>
                                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                                <input value={vitals[f] ?? ''} onChange={e => handleVitalChange(f, e.target.value)}
                                    className={`w-full bg-gray-900 border rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 ${alertClass || 'border-white/10'}`}
                                    placeholder={ph} />
                            </div>
                        );
                    })}
                </div>
                {spo2Val < 94 && vitals.spo2 && (
                    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-2 text-red-300 text-xs">
                        ⚠️ SpO2 {vitals.spo2}% — Hypoxia detected. This strongly supports inpatient necessity.
                    </div>
                )}
            </div>

            {/* Diagnosis */}
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-blue-300 text-sm">🔬 Diagnosis</h3>
                <div className="relative">
                    <input value={icdQuery} onChange={e => handleIcdSearch(e.target.value)}
                        className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="Search diagnosis by name or ICD-10 code (e.g. Pneumonia or J18)..." />
                    {icdResults.length > 0 && (
                        <div className="absolute z-20 w-full bg-gray-900 border border-white/20 rounded-xl mt-1 shadow-xl overflow-hidden">
                            {icdResults.map(r => (
                                <button key={r.code} onClick={() => addDiagnosis(r)}
                                    className="w-full px-4 py-2.5 text-left hover:bg-white/10 text-sm flex justify-between items-center">
                                    <span className="text-white">{r.commonName ?? r.description}</span>
                                    <span className="font-mono text-xs text-blue-400">{r.code}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {(c.diagnoses ?? []).length > 0 && (
                    <div className="space-y-2">
                        {(c.diagnoses ?? []).map((dx, i) => (
                            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${dx.isSelected ? 'bg-blue-600/20 border-blue-500/50' : 'bg-gray-900 border-white/10 hover:border-white/20'}`}
                                onClick={() => selectPrimaryDx(i)}>
                                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${dx.isSelected ? 'bg-blue-500 border-blue-400' : 'border-gray-500'}`} />
                                <div className="flex-1">
                                    <div className="text-sm font-medium text-white">{dx.diagnosis}</div>
                                    <div className="text-xs text-gray-400">{dx.icd10Code} — {dx.icd10Description}</div>
                                </div>
                                {dx.isSelected && <span className="text-xs text-blue-400 font-semibold">Primary</span>}
                                <button onClick={e => { e.stopPropagation(); removeDx(i); }} className="text-gray-600 hover:text-red-400 text-xs p-1">✕</button>
                            </div>
                        ))}
                    </div>
                )}
                {(c.diagnoses ?? []).length === 0 && <p className="text-gray-500 text-xs text-center py-4">Search and add the primary diagnosis above *</p>}
            </div>

            {/* Treatment Plan */}
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
                <h3 className="font-semibold text-blue-300 text-sm">📋 Proposed Treatment Plan</h3>
                <div>
                    <label className="block text-xs text-gray-400 mb-2">Line of Treatment * (check all that apply)</label>
                    <div className="flex flex-wrap gap-3">
                        {([['medical', 'Medical Management'], ['surgical', 'Surgical Management'], ['intensiveCare', 'Intensive Care'], ['investigation', 'Investigation Only'], ['nonAllopathic', 'Non-Allopathic']] as const).map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox"
                                    checked={c.proposedLineOfTreatment?.[key] ?? false}
                                    onChange={e => update({ proposedLineOfTreatment: { ...{ medical: false, surgical: false, intensiveCare: false, investigation: false, nonAllopathic: false }, ...c.proposedLineOfTreatment, [key]: e.target.checked } })}
                                    className="accent-blue-500" />
                                <span className="text-sm text-gray-300" onClick={() => {
                                    if (key === 'surgical') setShowSurgery(prev => !prev);
                                }}>{label}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Why is OPD management NOT appropriate? * <span className="text-gray-500">(critical for TPA approval)</span></label>
                    <textarea value={c.reasonForHospitalisation ?? ''} onChange={e => update({ reasonForHospitalisation: e.target.value })} rows={3}
                        className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="e.g. Patient requires IV antibiotics, continuous oxygen therapy, and hemodynamic monitoring which cannot be accomplished on outpatient basis." />
                </div>

                {/* Conditional Panels */}
                <div className="space-y-3">
                    <button onClick={() => setShowInjury(p => !p)} className="text-xs text-blue-400 hover:underline">
                        {showInjury ? '▼' : '▶'} Is this an injury/accident case?
                    </button>
                    {showInjury && (
                        <div className="bg-gray-900 rounded-xl p-4 grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Date of Injury</label>
                                <input type="date" value={c.injuryDetails?.dateOfInjury ?? ''} onChange={e => update({ injuryDetails: { ...c.injuryDetails as any, isInjury: true, dateOfInjury: e.target.value, isMLC: c.injuryDetails?.isMLC ?? false } })}
                                    className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Cause of Injury</label>
                                <input value={c.injuryDetails?.causeOfInjury ?? ''} onChange={e => update({ injuryDetails: { ...c.injuryDetails as any, isInjury: true, causeOfInjury: e.target.value, isMLC: c.injuryDetails?.isMLC ?? false } })}
                                    className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" placeholder="Road accident, fall..." />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={c.injuryDetails?.isMLC ?? false} onChange={e => update({ injuryDetails: { ...c.injuryDetails as any, isInjury: true, isMLC: e.target.checked } })} className="accent-blue-500" />
                                <span className="text-sm text-gray-300">Medico-Legal Case (MLC)</span>
                            </label>
                        </div>
                    )}

                    <button onClick={() => setShowSurgery(p => !p)} className="text-xs text-blue-400 hover:underline">
                        {showSurgery ? '▼' : '▶'} Add surgery details
                    </button>
                    {showSurgery && (
                        <div className="bg-gray-900 rounded-xl p-4 grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Name of Surgery *</label>
                                <input value={c.surgeryDetails?.nameOfSurgery ?? ''} onChange={e => update({ surgeryDetails: { ...c.surgeryDetails as any, nameOfSurgery: e.target.value, routeOfSurgery: c.surgeryDetails?.routeOfSurgery ?? 'Open' } })}
                                    className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" placeholder="e.g. Laparoscopic Appendicectomy" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Route of Surgery</label>
                                <select value={c.surgeryDetails?.routeOfSurgery ?? 'Open'} onChange={e => update({ surgeryDetails: { ...c.surgeryDetails as any, nameOfSurgery: c.surgeryDetails?.nameOfSurgery ?? '', routeOfSurgery: e.target.value as any } })}
                                    className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                                    <option>Open</option><option>Laparoscopic</option><option>Endoscopic</option><option>Robotic</option><option>Other</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <button onClick={onBack} className="py-3 rounded-xl font-semibold text-sm bg-gray-800 hover:bg-gray-700 text-white transition-colors">← Back</button>
                <button onClick={onNext} disabled={!isValid}
                    className={`py-3 rounded-xl font-semibold text-sm transition-all ${isValid ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                    Continue to Admission & Cost →
                </button>
            </div>
            {!isValid && <p className="text-xs text-amber-400 text-center">Add diagnosis, treatment line, and OPD justification to continue</p>}
        </div>
    );
};
