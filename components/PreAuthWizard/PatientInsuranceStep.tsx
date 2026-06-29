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
                    <h2 className="text-lg font-semibold text-white">Patient & Insurance Details</h2>
                    <p className="text-gray-400 text-sm mt-1">Select an option to begin entering information</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    {[
                        {
                            path: 'scan_card' as EntryPath,
                            icon: (
                                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/15 group-hover:bg-blue-500/20 transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                </div>
                            ),
                            title: 'Extract from PDF / Card',
                            desc: 'Upload hospital registration PDF or Insurance Card to auto-extract details',
                            badge: '⚡ Recommended'
                        },
                        {
                            path: 'manual' as EntryPath,
                            icon: (
                                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/15 group-hover:bg-indigo-500/20 transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 11-2.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                    </svg>
                                </div>
                            ),
                            title: 'Enter Manually',
                            desc: 'Type patient & policy details by hand',
                            badge: ''
                        },
                        {
                            path: 'search_existing' as EntryPath,
                            icon: (
                                <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400 border border-sky-500/15 group-hover:bg-sky-500/20 transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632zM21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                </div>
                            ),
                            title: 'Search Patient',
                            desc: 'Reuse previously created patient from Aivana database',
                            badge: ''
                        },
                    ].map(opt => (
                        <button key={opt.path} onClick={() => setEntryPath(opt.path)}
                            className="flex flex-col items-center gap-4 p-6 bg-gray-900/40 hover:bg-gray-900 border border-white/5 hover:border-blue-500/30 rounded-2xl text-center transition-all duration-300 group hover:scale-[1.02] active:scale-[0.98] shadow-sm">
                            {opt.icon}
                            <div className="space-y-1">
                                <div className="font-semibold text-sm text-white">{opt.title}</div>
                                <div className="text-[11px] text-gray-400 leading-normal">{opt.desc}</div>
                                {opt.badge && <div className="mt-2 inline-block text-[10px] bg-blue-500/15 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/10 font-bold">{opt.badge}</div>}
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
                <button onClick={() => setEntryPath(null)} className="text-gray-400 hover:text-white text-xs flex items-center gap-1.5 font-medium transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                    Back
                </button>
                <h2 className="text-lg font-semibold text-white">Extract from Document</h2>
                
                {isExtracting ? (
                  <div className="flex items-center gap-3.5 p-5 bg-blue-950/20 rounded-2xl border border-blue-500/20">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    <div>
                      <p className="font-semibold text-xs text-white">Extracting information...</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Reading document fields with AI model</p>
                    </div>
                  </div>
                ) : (
                  <div
                      onClick={() => { if (!isExtracting) fileRef.current?.click() }}
                      className={`border-2 border-dashed ${extractionException ? 'border-red-500/40 hover:border-red-400 bg-red-500/5' : 'border-blue-500/35 hover:border-blue-400/80 bg-blue-500/5 hover:bg-blue-500/10'} rounded-2xl p-12 text-center cursor-pointer transition-all duration-300`}
                  >
                        <div className="space-y-3.5">
                            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/10 flex items-center justify-center mx-auto">
                                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div className="text-sm text-white font-bold">Drop PDF or Image here, or click to upload</div>
                            <div className="text-gray-500 text-[11px] max-w-sm mx-auto leading-normal">Upload Hospital Registration PDF, TPA Card, ID Card, or Policy Document</div>
                            {extractionException && <div className="text-red-400 mt-3 text-xs font-semibold">{extractionException}</div>}
                        </div>
                  </div>
                )}

                <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => e.target.files?.[0] && handleDocumentUpload(e.target.files[0])} />
                <button onClick={() => setEntryPath('manual')} className="text-xs text-gray-400 hover:text-white transition-colors underline block">Skip Extraction — enter manually instead</button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-semibold text-white">Patient & Insurance Details</h2>
                </div>
                <button onClick={() => setEntryPath(null)} className="text-xs text-gray-400 hover:text-white transition-colors" type="button">Change entry method</button>
            </div>

            {/* Extraction Results Summary */}
            {ocrDone && extractionResult && (
                <div className="bg-blue-950/10 border border-blue-500/20 rounded-2xl p-5 mb-4 max-w-full overflow-hidden">
                    <div className="flex gap-3 mb-4 items-center">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-lg">✨</div>
                        <div>
                            <h3 className="text-white font-semibold text-sm">Extraction Complete</h3>
                            <p className="text-gray-400 text-xs mt-0.5">AI successfully processed the document</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 bg-black/30 p-4 rounded-xl">
                        <div>
                            <div className="text-green-400 text-xs font-bold flex items-center gap-1.5 mb-2">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                                </svg>
                                Auto-filled fields:
                            </div>
                            <ul className="text-green-300/80 text-[11px] space-y-1 ml-5 list-disc leading-relaxed">
                                {extractionResult.filled.length > 0 ? (
                                    extractionResult.filled.map(f => (<li key={f}>{f}</li>))
                                ) : (
                                    <li className="text-gray-500 list-none -ml-4">No fields reliably found.</li>
                                )}
                            </ul>
                        </div>
                        <div>
                            <div className="text-amber-400 text-xs font-bold flex items-center gap-1.5 mb-2">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Fill manually:
                            </div>
                            <ul className="text-amber-300/80 text-[11px] space-y-1 ml-5 list-disc leading-relaxed">
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
            <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-5 space-y-4 shadow-sm">
                <h3 className="font-semibold text-blue-400 text-xs flex items-center gap-2 uppercase tracking-wider">👤 Patient Demographics</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Full Name <span className="text-red-400 font-bold ml-0.5">*</span></label>
                        <input value={patient.patientName ?? ''} onChange={e => onPatientChange({ ...patient, patientName: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-gray-600 transition-colors" placeholder="As on insurance card" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Date of Birth</label>
                        <input type="date" value={patient.dateOfBirth ?? ''} onChange={e => handleDOBChange(e.target.value)}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Age <span className="text-red-400 font-bold ml-0.5">*</span></label>
                        <input type="number" value={patient.age ?? ''} onChange={e => onPatientChange({ ...patient, age: +e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-gray-600 transition-colors" placeholder="Years" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Gender <span className="text-red-400 font-bold ml-0.5">*</span></label>
                        <select value={patient.gender ?? ''} onChange={e => onPatientChange({ ...patient, gender: e.target.value as any })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors">
                            <option value="">Select</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Marital Status</label>
                        <select value={patient.maritalStatus ?? ''} onChange={e => onPatientChange({ ...patient, maritalStatus: e.target.value as any })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors">
                            <option value="">Select</option>
                            <option>Single</option><option>Married</option><option>Widowed</option><option>Divorced</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Mobile Number <span className="text-red-400 font-bold ml-0.5">*</span></label>
                        <input type="tel" value={patient.mobileNumber ?? ''} onChange={e => onPatientChange({ ...patient, mobileNumber: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-gray-600 transition-colors" placeholder="+91 XXXXX XXXXX" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Email</label>
                        <input type="email" value={patient.email ?? ''} onChange={e => onPatientChange({ ...patient, email: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-gray-600 transition-colors" placeholder="optional" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">City <span className="text-red-400 font-bold ml-0.5">*</span></label>
                        <input value={patient.city ?? ''} onChange={e => onPatientChange({ ...patient, city: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">State <span className="text-red-400 font-bold ml-0.5">*</span></label>
                        <select value={patient.state ?? ''} onChange={e => onPatientChange({ ...patient, state: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors">
                            <option value="">Select State</option>
                            {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="col-span-2">
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">UHID (Hospital ID)</label>
                        <input value={patient.uhid ?? ''} onChange={e => onPatientChange({ ...patient, uhid: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-gray-600 transition-colors" placeholder="Optional identifier" />
                    </div>
                </div>
            </div>

            {/* Insurance Details */}
            <div className="bg-gray-900/30 border border-white/5 rounded-2xl p-5 space-y-4 shadow-sm">
                <h3 className="font-semibold text-blue-400 text-xs flex items-center gap-2 uppercase tracking-wider">🛡️ Insurance & Policy Details</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Insurance Company <span className="text-red-400 font-bold ml-0.5">*</span></label>
                        <datalist id="insurer-list">{INSURER_LIST.map(i => <option key={i} value={i} />)}</datalist>
                        <input list="insurer-list" value={insurance.insurerName ?? ''} onChange={e => onInsuranceChange({ ...insurance, insurerName: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-gray-600 transition-colors" placeholder="Start typing insurer..." />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">TPA Name <span className="text-red-400 font-bold ml-0.5">*</span></label>
                        <select value={insurance.tpaName ?? ''} onChange={e => onInsuranceChange({ ...insurance, tpaName: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors">
                            <option value="">Select TPA</option>
                            {TPA_NAMES.map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Policy Number <span className="text-red-400 font-bold ml-0.5">*</span></label>
                        <input value={insurance.policyNumber ?? ''} onChange={e => onInsuranceChange({ ...insurance, policyNumber: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">TPA ID Card Number</label>
                        <input value={insurance.tpaIdCardNumber ?? ''} onChange={e => onInsuranceChange({ ...insurance, tpaIdCardNumber: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Policy Type</label>
                        <select value={insurance.policyType ?? 'Individual'} onChange={e => onInsuranceChange({ ...insurance, policyType: e.target.value as any })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors">
                            <option>Individual</option><option>Floater</option><option>Corporate</option><option>Group</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Sum Insured (₹) <span className="text-red-400 font-bold ml-0.5">*</span></label>
                        <input type="number" value={insurance.sumInsured ?? ''} onChange={e => onInsuranceChange({ ...insurance, sumInsured: +e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-gray-600 transition-colors" placeholder="e.g. 500000" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Policy Start Date</label>
                        <input type="date" value={insurance.policyStartDate ?? ''} onChange={e => onInsuranceChange({ ...insurance, policyStartDate: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Policy End Date</label>
                        <input type="date" value={insurance.policyEndDate ?? ''} onChange={e => handlePolicyEndDate(e.target.value)}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
                        {policyDateWarning && <p className="text-amber-400 text-[11px] font-semibold mt-1.5">{policyDateWarning}</p>}
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Proposer Name</label>
                        <input value={insurance.proposerName ?? ''} onChange={e => onInsuranceChange({ ...insurance, proposerName: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-gray-600 transition-colors" placeholder="Defaults to patient name" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 font-semibold mb-1.5">Relationship with Proposer</label>
                        <select value={insurance.relationshipWithProposer ?? 'Self'} onChange={e => onInsuranceChange({ ...insurance, relationshipWithProposer: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors">
                            <option>Self</option><option>Spouse</option><option>Son</option><option>Daughter</option><option>Father</option><option>Mother</option><option>Other</option>
                        </select>
                    </div>
                </div>
            </div>

            <button onClick={onNext} disabled={!isValid} type="button"
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 ${isValid ? 'bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white shadow-md shadow-blue-500/10 hover:scale-[1.01] active:scale-[0.99]' : 'bg-gray-900 border border-white/5 text-gray-500 cursor-not-allowed'}`}>
                Continue to Clinical Details →
            </button>
            {!isValid && <p className="text-xs text-amber-500 font-medium text-center">Fill all required (*) fields to continue</p>}
        </div>
    );
};
