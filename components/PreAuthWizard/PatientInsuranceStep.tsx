import React, { useState, useRef } from 'react';
import { PatientRecord, InsurancePolicyDetails, EntryPath } from '../PreAuthWizard/types';
import { INSURER_LIST, INDIAN_STATES, TPA_NAMES } from '../../config/tpaRegistry';
import { calculateAge, isPolicyActive, isPolicyExpiringSoon, todayISO } from '../../utils/formatters';
import { extractFromDocument } from '../../services/documentExtractionService';

interface PatientInsuranceStepProps {
    patient: Partial<PatientRecord>;
    insurance: Partial<InsurancePolicyDetails>;
    onPatientChange: (p: Partial<PatientRecord>) => void;
    onInsuranceChange: (ins: Partial<InsurancePolicyDetails>) => void;
    onNext: () => void;
}

export const PatientInsuranceStep: React.FC<PatientInsuranceStepProps> = ({
    patient, insurance, onPatientChange, onInsuranceChange, onNext
}) => {
    const [entryPath, setEntryPath] = useState<EntryPath | null>(insurance.policyNumber ? 'manual' : null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [ocrDone, setOcrDone] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [policyDateWarning, setPolicyDateWarning] = useState('');
    const [extractionException, setExtractionException] = useState('');
    const [extractionResult, setExtractionResult] = useState<{ filled: string[], pending: string[] } | null>(null);

    const fileRef = useRef<HTMLInputElement>(null);

    const handleDOBChange = (dob: string) => {
        onPatientChange({ ...patient, dateOfBirth: dob, age: calculateAge(dob) });
    };

    const handlePolicyEndDate = (date: string) => {
        onInsuranceChange({ ...insurance, policyEndDate: date });
        if (!isPolicyActive(date)) {
            setPolicyDateWarning('⚠️ This policy has expired. TPA will reject this pre-auth.');
        } else if (isPolicyExpiringSoon(date)) {
            setPolicyDateWarning('⚠️ Policy is expiring within 7 days. Verify renewal status.');
        } else {
            setPolicyDateWarning('');
        }
    };

    const handleDocumentUpload = async (file: File) => {
        setIsExtracting(true);
        setExtractionException('');
        setExtractionResult(null);
        
        try {
            const extracted = await extractFromDocument(file);
            
            if (extracted.document_type === 'unknown' || extracted.confidence < 40) {
                 setExtractionException("Could not read document clearly or invalid type. Please enter details manually.");
                 setIsExtracting(false);
                 return;
            }
            
            const dob = extracted.patient?.dob || patient.dateOfBirth;
            // Map according to requested mapping
            onPatientChange({
                ...patient,
                patientName: extracted.patient?.name || patient.patientName,
                dateOfBirth: dob,
                age: extracted.patient?.age || (dob ? calculateAge(dob) : patient.age),
                gender: (extracted.patient?.gender as any) || patient.gender,
                mobileNumber: extracted.patient?.phone || patient.mobileNumber,
                city: patient.city, 
                state: patient.state
            });

            const endDate = extracted.insurance?.valid_till || insurance.policyEndDate;
            onInsuranceChange({
                ...insurance,
                insurerName: extracted.insurance?.insurance_company || insurance.insurerName,
                tpaName: extracted.insurance?.tpa_name || insurance.tpaName,
                policyNumber: extracted.insurance?.policy_number || insurance.policyNumber,
                sumInsured: extracted.insurance?.sum_insured || insurance.sumInsured,
                policyEndDate: endDate,
                dataSource: 'ocr',
                ocrConfidence: extracted.confidence
            });
            if (endDate) handlePolicyEndDate(endDate);

            setExtractionResult({
                filled: extracted.extracted_fields,
                pending: extracted.missing_fields
            });

            setOcrDone(true);
            setEntryPath('manual');
        } catch (error: any) {
             setExtractionException(error.message || "Failed to parse document. Please try a clearer image.");
        } finally {
             setIsExtracting(false);
        }
    };

    const isValid = !!(
        patient.patientName && patient.age && patient.gender && patient.mobileNumber && patient.city && patient.state &&
        insurance.insurerName && insurance.tpaName && insurance.policyNumber && insurance.sumInsured
    );

    if (!entryPath) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-xl font-bold text-white">Step 1: Patient & Insurance Details</h2>
                    <p className="text-gray-400 text-sm mt-1">How would you like to start?</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { path: 'scan_card' as EntryPath, icon: '📄', title: 'Extract from PDF / Card', desc: 'Fastest — Upload hospital registration PDF or Insurance Card to auto-extract details', badge: '⚡ Recommended' },
                        { path: 'manual' as EntryPath, icon: '✏️', title: 'Enter Manually', desc: 'Type patient & policy details by hand', badge: '' },
                        { path: 'search_existing' as EntryPath, icon: '🔍', title: 'Search Existing Patient', desc: 'Reuse previously created patient from Aivana database', badge: '' },
                    ].map(opt => (
                        <button key={opt.path} onClick={() => setEntryPath(opt.path)}
                            className="flex flex-col items-center gap-3 p-6 bg-gray-800 hover:bg-gray-700 border border-white/10 hover:border-blue-500/40 rounded-2xl text-center transition-all group">
                            <div className="text-4xl">{opt.icon}</div>
                            <div>
                                <div className="font-semibold text-white">{opt.title}</div>
                                <div className="text-xs text-gray-400 mt-1">{opt.desc}</div>
                                {opt.badge && <div className="mt-2 text-xs text-blue-400 font-semibold">{opt.badge}</div>}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (entryPath === 'scan_card' && !ocrDone) {
        return (
            <div className="space-y-6">
                <button onClick={() => setEntryPath(null)} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">← Back</button>
                <h2 className="text-xl font-bold text-white">Extract from PDF or Card</h2>
                
                {isExtracting ? (
                  <div className="flex items-center gap-3 p-4 bg-blue-900/30 rounded-lg border border-blue-500/30">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <div>
                      <p className="font-medium text-white">Extracting information...</p>
                      <p className="text-sm text-gray-400">Reading document with AI</p>
                    </div>
                  </div>
                ) : (
                  <div
                      onClick={() => { if (!isExtracting) fileRef.current?.click() }}
                      className={`border-2 border-dashed ${extractionException ? 'border-red-500/40 hover:border-red-400 bg-red-500/5' : 'border-blue-500/40 hover:border-blue-400'} rounded-2xl p-10 text-center cursor-pointer transition-colors`}
                  >
                        <div className="space-y-3">
                            <div className="text-4xl mb-4">📄</div>
                            <div className="text-white font-semibold">Drop PDF or Image here, or click to upload</div>
                            <div className="text-gray-500 text-sm">Upload Hospital Registration PDF, TPA Card, ID Card, or Policy Document</div>
                            {extractionException && <div className="text-red-400 mt-3 text-sm font-medium">{extractionException}</div>}
                        </div>
                  </div>
                )}

                <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => e.target.files?.[0] && handleDocumentUpload(e.target.files[0])} />
                <button onClick={() => setEntryPath('manual')} className="text-sm text-gray-500 hover:text-gray-300 underline">Skip Extraction — enter manually instead</button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white">Step 1: Patient & Insurance Details</h2>
                </div>
                <button onClick={() => setEntryPath(null)} className="text-xs text-gray-500 hover:text-gray-300">Change entry method</button>
            </div>

            {/* Extraction Results Summary */}
            {ocrDone && extractionResult && (
                <div className="bg-gray-800/80 border border-blue-500/20 rounded-xl p-5 mb-4 font-mono text-sm max-w-full overflow-x-hidden">
                    <div className="flex gap-4 mb-4 items-center">
                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg text-xl">✨</div>
                        <div>
                            <h3 className="text-white font-medium text-base">Extraction Complete</h3>
                            <p className="text-gray-400 text-xs">AI successfully processed the document</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6 bg-black/40 p-4 rounded-lg">
                        <div>
                            <div className="text-green-400 mb-2 font-bold flex items-center gap-2"><span>✅</span> Auto-filled from document:</div>
                            <ul className="text-green-200/80 text-xs space-y-1.5 ml-6 list-disc">
                                {extractionResult.filled.length > 0 ? (
                                    extractionResult.filled.map(f => (<li key={f}>{f}</li>))
                                ) : (
                                    <li className="text-gray-500 list-none -ml-4">No fields reliably found.</li>
                                )}
                            </ul>
                        </div>
                        <div>
                            <div className="text-amber-400 mb-2 font-bold flex items-center gap-2"><span>⚠️</span> Please fill manually:</div>
                            <ul className="text-amber-200/80 text-xs space-y-1.5 ml-6 list-disc">
                                {extractionResult.pending.length > 0 ? (
                                    extractionResult.pending.map(f => (<li key={f}>{f}</li>))
                                ) : (
                                    <li className="text-gray-500 list-none -ml-4">All required fields extracted successfully.</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Patient Demographics */}
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
                <h3 className="font-semibold text-blue-300 text-sm flex items-center gap-2">👤 Patient Demographics</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-xs text-gray-400 mb-1">Full Name *</label>
                        <input value={patient.patientName ?? ''} onChange={e => onPatientChange({ ...patient, patientName: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="As on insurance card" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Date of Birth</label>
                        <input type="date" value={patient.dateOfBirth ?? ''} onChange={e => handleDOBChange(e.target.value)}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Age *</label>
                        <input type="number" value={patient.age ?? ''} onChange={e => onPatientChange({ ...patient, age: +e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="Years" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Gender *</label>
                        <select value={patient.gender ?? ''} onChange={e => onPatientChange({ ...patient, gender: e.target.value as any })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50">
                            <option value="">Select</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Marital Status</label>
                        <select value={patient.maritalStatus ?? ''} onChange={e => onPatientChange({ ...patient, maritalStatus: e.target.value as any })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50">
                            <option value="">Select</option>
                            <option>Single</option><option>Married</option><option>Widowed</option><option>Divorced</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Mobile Number *</label>
                        <input type="tel" value={patient.mobileNumber ?? ''} onChange={e => onPatientChange({ ...patient, mobileNumber: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="+91 XXXXX XXXXX" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Email</label>
                        <input type="email" value={patient.email ?? ''} onChange={e => onPatientChange({ ...patient, email: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="optional" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">City *</label>
                        <input value={patient.city ?? ''} onChange={e => onPatientChange({ ...patient, city: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">State *</label>
                        <select value={patient.state ?? ''} onChange={e => onPatientChange({ ...patient, state: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50">
                            <option value="">Select State</option>
                            {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">UHID (Hospital ID)</label>
                        <input value={patient.uhid ?? ''} onChange={e => onPatientChange({ ...patient, uhid: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="Optional" />
                    </div>
                </div>
            </div>

            {/* Insurance Details */}
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
                <h3 className="font-semibold text-blue-300 text-sm flex items-center gap-2">🛡️ Insurance & Policy Details</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Insurance Company *</label>
                        <datalist id="insurer-list">{INSURER_LIST.map(i => <option key={i} value={i} />)}</datalist>
                        <input list="insurer-list" value={insurance.insurerName ?? ''} onChange={e => onInsuranceChange({ ...insurance, insurerName: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="Start typing insurer name..." />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">TPA Name *</label>
                        <select value={insurance.tpaName ?? ''} onChange={e => onInsuranceChange({ ...insurance, tpaName: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50">
                            <option value="">Select TPA</option>
                            {TPA_NAMES.map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Policy Number *</label>
                        <input value={insurance.policyNumber ?? ''} onChange={e => onInsuranceChange({ ...insurance, policyNumber: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">TPA ID Card Number</label>
                        <input value={insurance.tpaIdCardNumber ?? ''} onChange={e => onInsuranceChange({ ...insurance, tpaIdCardNumber: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Policy Type</label>
                        <select value={insurance.policyType ?? 'Individual'} onChange={e => onInsuranceChange({ ...insurance, policyType: e.target.value as any })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50">
                            <option>Individual</option><option>Floater</option><option>Corporate</option><option>Group</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Sum Insured (₹) *</label>
                        <input type="number" value={insurance.sumInsured ?? ''} onChange={e => onInsuranceChange({ ...insurance, sumInsured: +e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="e.g. 500000" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Policy Start Date</label>
                        <input type="date" value={insurance.policyStartDate ?? ''} onChange={e => onInsuranceChange({ ...insurance, policyStartDate: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Policy End Date</label>
                        <input type="date" value={insurance.policyEndDate ?? ''} onChange={e => handlePolicyEndDate(e.target.value)}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                        {policyDateWarning && <p className="text-amber-400 text-xs mt-1">{policyDateWarning}</p>}
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Proposer Name</label>
                        <input value={insurance.proposerName ?? ''} onChange={e => onInsuranceChange({ ...insurance, proposerName: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="Defaults to patient name" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Relationship with Proposer</label>
                        <select value={insurance.relationshipWithProposer ?? 'Self'} onChange={e => onInsuranceChange({ ...insurance, relationshipWithProposer: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50">
                            <option>Self</option><option>Spouse</option><option>Son</option><option>Daughter</option><option>Father</option><option>Mother</option><option>Other</option>
                        </select>
                    </div>
                </div>
            </div>

            <button onClick={onNext} disabled={!isValid}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${isValid ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                Continue to Clinical Details →
            </button>
            {!isValid && <p className="text-xs text-amber-400 text-center">Fill all required (*) fields to continue</p>}
        </div>
    );
};
