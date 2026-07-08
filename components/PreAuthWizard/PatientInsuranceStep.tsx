import React, { useState, useRef } from 'react';
import { PatientRecord, InsurancePolicyDetails, EntryPath } from '../PreAuthWizard/types';
import { INSURER_LIST, INDIAN_STATES, TPA_NAMES } from '../../config/tpaRegistry';
import { calculateAge, isPolicyActive, isPolicyExpiringSoon, todayISO } from '../../utils/formatters';
import { extractFromDocument } from '../../services/documentExtractionService';
import { searchPatients } from '../../services/storageService';

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
    const [searchResults, setSearchResults] = useState<PatientRecord[]>([]);
    const [searching, setSearching] = useState(false);
    const [policyDateWarning, setPolicyDateWarning] = useState('');
    const [extractionException, setExtractionException] = useState('');
    const [extractionResult, setExtractionResult] = useState<any | null>(null);
    const [showRawJson, setShowRawJson] = useState(false);
    const [showTables, setShowTables] = useState(true);
    const [copied, setCopied] = useState(false);

    const fileRef = useRef<HTMLInputElement>(null);

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.trim().length > 1) {
            setSearching(true);
            try {
                const results = await searchPatients(query);
                setSearchResults(results);
            } catch (err) {
                console.error("Error searching patients:", err);
            } finally {
                setSearching(false);
            }
        } else {
            setSearchResults([]);
        }
    };

    const handleSelectPatient = (p: PatientRecord) => {
        onPatientChange({
            ...patient,
            patientName: p.patientName,
            dateOfBirth: p.dateOfBirth,
            age: p.age,
            gender: p.gender,
            maritalStatus: p.maritalStatus,
            mobileNumber: p.mobileNumber,
            email: p.email,
            city: p.city,
            state: p.state,
            uhid: p.uhid
        });
        if (p.lastKnownPolicyNumber) {
            onInsuranceChange({
                ...insurance,
                policyNumber: p.lastKnownPolicyNumber,
                insurerName: p.lastKnownInsurer || '',
                tpaName: (p.lastKnownTPA as any) || ''
            });
        }
        setEntryPath('manual');
    };

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
                pending: extracted.missing_fields,
                pages: extracted.pages || [],
                clinical: extracted.clinical || null,
                rawJson: extracted.rawJson || ''
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

    if (entryPath === 'search_existing') {
        return (
            <div className="space-y-6">
                <button onClick={() => setEntryPath(null)} className="text-gray-400 hover:text-white text-xs flex items-center gap-1.5 font-medium transition-colors" type="button">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                    Back
                </button>
                <div>
                    <h2 className="text-lg font-semibold text-white">Search Patient Registry</h2>
                    <p className="text-gray-400 text-sm mt-1">Search patient by name, mobile, or UHID identifier</p>
                </div>
                <div className="space-y-4">
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => handleSearch(e.target.value)}
                            className="w-full bg-gray-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
                            placeholder="Enter Name, Mobile, UHID..."
                            autoFocus
                        />
                        <div className="absolute left-3 top-3.5 text-gray-500">
                            {searching ? (
                                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            )}
                        </div>
                    </div>

                    {searchResults.length > 0 ? (
                        <div className="bg-gray-900/40 border border-white/5 rounded-xl divide-y divide-white/5 overflow-hidden">
                            {searchResults.map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => handleSelectPatient(p)}
                                    className="p-4 hover:bg-white/5 cursor-pointer flex justify-between items-start transition-colors"
                                >
                                    <div>
                                        <div className="font-semibold text-sm text-white">{p.patientName}</div>
                                        <div className="text-xs text-gray-400 mt-1 flex gap-3 font-mono">
                                            <span>UHID: {p.uhid || 'N/A'}</span>
                                            <span>Phone: {p.mobileNumber}</span>
                                            <span>{p.gender}, {p.age}y</span>
                                        </div>
                                    </div>
                                    {p.lastKnownPolicyNumber && (
                                        <div className="text-right">
                                            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/10 block">
                                                {p.lastKnownInsurer || 'Has Policy'}
                                            </span>
                                            <span className="text-[9px] text-gray-500 font-mono block mt-1">Pol: {p.lastKnownPolicyNumber}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : searchQuery.trim().length > 1 ? (
                        <p className="text-xs text-gray-500 text-center py-6">No matching patient records found.</p>
                    ) : null}
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
                    <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Patient & Insurance Details</h2>
                </div>
                <button onClick={() => setEntryPath(null)} className="text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors" type="button">Change Entry Method</button>
            </div>

            {/* Extraction Results Summary */}
            {ocrDone && extractionResult && (
                <div className="bg-blue-950/10 border border-blue-500/20 rounded-xl p-5 mb-4 max-w-full overflow-hidden space-y-4">
                    <div className="flex gap-3 items-center justify-between">
                        <div className="flex gap-3 items-center">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-sm font-bold">✨</div>
                            <div>
                                <h3 className="text-white font-semibold text-xs uppercase tracking-wider">Extraction Pipeline Complete</h3>
                                <p className="text-gray-400 text-xs mt-0.5 font-semibold">Aivana OCR + Gemini post-processing pipeline executed</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(extractionResult.rawJson);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                            }}
                            className="text-[11px] bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg px-2.5 py-1 text-blue-400 font-semibold transition-all"
                        >
                            {copied ? '✓ Copied JSON' : '📋 Copy Pipeline JSON'}
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 bg-black/30 p-4 rounded-xl">
                        <div>
                            <div className="text-green-400 text-xs font-bold flex items-center gap-1.5 mb-2">
                                <span>✓</span>
                                <span>Auto-filled fields:</span>
                            </div>
                            <ul className="text-green-300/80 text-[11px] space-y-1 ml-5 list-disc leading-relaxed font-semibold">
                                {extractionResult.filled.length > 0 ? (
                                    extractionResult.filled.map(f => (<li key={f}>{f}</li>))
                                ) : (
                                    <li className="text-gray-500 list-none -ml-4">No fields reliably found.</li>
                                )}
                            </ul>
                        </div>
                        <div>
                            <div className="text-amber-400 text-xs font-bold flex items-center gap-1.5 mb-2">
                                <span>ℹ</span>
                                <span>Fill manually:</span>
                            </div>
                            <ul className="text-amber-300/80 text-[11px] space-y-1 ml-5 list-disc leading-relaxed font-semibold">
                                {extractionResult.pending.length > 0 ? (
                                    extractionResult.pending.map(f => (<li key={f}>{f}</li>))
                                ) : (
                                    <li className="text-gray-500 list-none -ml-4">All required fields extracted successfully.</li>
                                )}
                            </ul>
                        </div>
                    </div>

                    {/* Page-by-Page Document Classification */}
                    {extractionResult.pages && extractionResult.pages.length > 0 && (
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-2.5">
                            <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">📄 Document Page-by-Page Classification</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {extractionResult.pages.map((p: any) => (
                                    <div key={p.pageNumber} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-bold font-mono">PAGE {p.pageNumber}</span>
                                            <span className="text-xs text-white font-semibold">{p.classification}</span>
                                        </div>
                                        {p.tables && p.tables.length > 0 && (
                                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Tables Found</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Clinical Details & Tables */}
                    {extractionResult.pages && extractionResult.pages.some((p: any) => p.tables && p.tables.length > 0) && (
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-3">
                            <div className="flex justify-between items-center">
                                <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                    <span>📊 Layout OCR: Extracted Clinical Tables</span>
                                </h4>
                                <button
                                    type="button"
                                    onClick={() => setShowTables(!showTables)}
                                    className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold"
                                >
                                    {showTables ? 'Hide Tables' : 'Show Tables'}
                                </button>
                            </div>

                            {showTables && (
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                                    {extractionResult.pages.map((p: any) => 
                                        p.tables && p.tables.map((t: any, tIdx: number) => (
                                            <div key={`${p.pageNumber}-${tIdx}`} className="bg-white/[0.01] border border-white/5 rounded-lg p-3 space-y-2">
                                                <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider flex items-center justify-between">
                                                    <span>Table: {t.tableName || 'Laboratory Values'}</span>
                                                    <span className="text-[9px] text-gray-500 font-mono">Page {p.pageNumber}</span>
                                                </div>
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="border-b border-white/5 text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                                                            <th className="py-1">Test Name</th>
                                                            <th className="py-1 text-center">Result</th>
                                                            <th className="py-1 text-center">Units</th>
                                                            <th className="py-1 text-right">Normal Range</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/5 text-xs text-gray-300 font-semibold">
                                                        {t.rows && t.rows.map((r: any, rIdx: number) => (
                                                            <tr key={rIdx} className="hover:bg-white/[0.01]">
                                                                <td className="py-1.5 text-white">{r.testName}</td>
                                                                <td className="py-1.5 text-center text-blue-300 font-mono">{r.result}</td>
                                                                <td className="py-1.5 text-center text-gray-500">{r.units || '-'}</td>
                                                                <td className="py-1.5 text-right text-gray-500 font-mono">{r.normalRange || '-'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Insurance Relevant Fields Section */}
                    {extractionResult.clinical && (
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-3">
                            <h4 className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">🎯 Insurance-Relevant Fields Extracted</h4>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="bg-white/[0.01] border border-white/5 rounded-lg p-2.5 space-y-1">
                                    <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Provider / Institution</span>
                                    <div className="text-white font-semibold leading-relaxed">
                                        🏥 {extractionResult.clinical.hospital_name || 'Hospital Name Not Specified'}
                                    </div>
                                    <div className="text-gray-400 text-[11px] font-semibold">
                                        🩺 Dr. {extractionResult.clinical.doctor_name || 'Consulting Physician'}
                                    </div>
                                </div>
                                <div className="bg-white/[0.01] border border-white/5 rounded-lg p-2.5 space-y-1">
                                    <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Clinical Impression</span>
                                    <div className="text-blue-300 font-semibold leading-relaxed">
                                        🤒 {extractionResult.clinical.diagnosis_impression || 'Diagnosis / Impression Not Found'}
                                    </div>
                                    {extractionResult.clinical.consultation_date && (
                                        <div className="text-gray-500 text-[11px] font-mono">
                                            📅 Date: {extractionResult.clinical.consultation_date}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Raw JSON Code Inspect Box */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-500 font-mono font-semibold">Pipeline Output: structured_extraction.json</span>
                            <button
                                type="button"
                                onClick={() => setShowRawJson(!showRawJson)}
                                className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold"
                            >
                                {showRawJson ? 'Hide Raw JSON' : 'View Raw JSON'}
                            </button>
                        </div>
                        {showRawJson && (
                            <pre className="text-[10px] bg-[#090b10] border border-white/10 rounded-lg p-3 text-indigo-400 font-mono overflow-auto max-h-48 leading-relaxed">
                                {extractionResult.rawJson}
                            </pre>
                        )}
                    </div>
                </div>
            )}

            {/* Patient Demographics */}
            <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm">
                <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">👤 Patient Demographics</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Full Name *</label>
                        <input value={patient.patientName ?? ''} onChange={e => onPatientChange({ ...patient, patientName: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" placeholder="As on insurance card" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Date of Birth</label>
                        <input type="date" value={patient.dateOfBirth ?? ''} onChange={e => handleDOBChange(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Age *</label>
                        <input type="number" value={patient.age ?? ''} onChange={e => onPatientChange({ ...patient, age: +e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" placeholder="Years" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Gender *</label>
                        <select value={patient.gender ?? ''} onChange={e => onPatientChange({ ...patient, gender: e.target.value as any })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                            <option value="" className="bg-[#0B0F19]">Select</option>
                            <option value="Male" className="bg-[#0B0F19]">Male</option>
                            <option value="Female" className="bg-[#0B0F19]">Female</option>
                            <option value="Other" className="bg-[#0B0F19]">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Marital Status</label>
                        <select value={patient.maritalStatus ?? ''} onChange={e => onPatientChange({ ...patient, maritalStatus: e.target.value as any })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                            <option value="" className="bg-[#0B0F19]">Select</option>
                            <option className="bg-[#0B0F19]">Single</option><option className="bg-[#0B0F19]">Married</option><option className="bg-[#0B0F19]">Widowed</option><option className="bg-[#0B0F19]">Divorced</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Mobile Number *</label>
                        <input type="tel" value={patient.mobileNumber ?? ''} onChange={e => onPatientChange({ ...patient, mobileNumber: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" placeholder="+91 XXXXX XXXXX" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Email</label>
                        <input type="email" value={patient.email ?? ''} onChange={e => onPatientChange({ ...patient, email: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" placeholder="optional" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">City *</label>
                        <input value={patient.city ?? ''} onChange={e => onPatientChange({ ...patient, city: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">State *</label>
                        <select value={patient.state ?? ''} onChange={e => onPatientChange({ ...patient, state: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                            <option value="" className="bg-[#0B0F19]">Select State</option>
                            {INDIAN_STATES.map(s => <option key={s} className="bg-[#0B0F19]">{s}</option>)}
                        </select>
                    </div>
                    <div className="col-span-2">
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">UHID (Hospital ID)</label>
                        <input value={patient.uhid ?? ''} onChange={e => onPatientChange({ ...patient, uhid: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" placeholder="Optional identifier" />
                    </div>
                </div>
            </div>

            {/* Insurance Details */}
            <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm">
                <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">🛡️ Insurance & Policy Details</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Insurance Company *</label>
                        <datalist id="insurer-list">{INSURER_LIST.map(i => <option key={i} value={i} />)}</datalist>
                        <input list="insurer-list" value={insurance.insurerName ?? ''} onChange={e => onInsuranceChange({ ...insurance, insurerName: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" placeholder="Start typing insurer..." />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">TPA Name *</label>
                        <select value={insurance.tpaName ?? ''} onChange={e => onInsuranceChange({ ...insurance, tpaName: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                            <option value="" className="bg-[#0B0F19]">Select TPA</option>
                            {TPA_NAMES.map(t => <option key={t} className="bg-[#0B0F19]">{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Policy Number *</label>
                        <input value={insurance.policyNumber ?? ''} onChange={e => onInsuranceChange({ ...insurance, policyNumber: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">TPA ID Card Number</label>
                        <input value={insurance.tpaIdCardNumber ?? ''} onChange={e => onInsuranceChange({ ...insurance, tpaIdCardNumber: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Policy Type</label>
                        <select value={insurance.policyType ?? 'Individual'} onChange={e => onInsuranceChange({ ...insurance, policyType: e.target.value as any })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                            <option className="bg-[#0B0F19]">Individual</option><option className="bg-[#0B0F19]">Floater</option><option className="bg-[#0B0F19]">Corporate</option><option className="bg-[#0B0F19]">Group</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Sum Insured (₹) *</label>
                        <input type="number" value={insurance.sumInsured ?? ''} onChange={e => onInsuranceChange({ ...insurance, sumInsured: +e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" placeholder="e.g. 500000" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Policy Start Date</label>
                        <input type="date" value={insurance.policyStartDate ?? ''} onChange={e => onInsuranceChange({ ...insurance, policyStartDate: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Policy End Date</label>
                        <input type="date" value={insurance.policyEndDate ?? ''} onChange={e => handlePolicyEndDate(e.target.value)}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                        {policyDateWarning && <p className="text-amber-400 text-[11px] font-semibold mt-1.5">{policyDateWarning}</p>}
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Proposer Name</label>
                        <input value={insurance.proposerName ?? ''} onChange={e => onInsuranceChange({ ...insurance, proposerName: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" placeholder="Defaults to patient name" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Relationship with Proposer</label>
                        <select value={insurance.relationshipWithProposer ?? 'Self'} onChange={e => onInsuranceChange({ ...insurance, relationshipWithProposer: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                            <option className="bg-[#0B0F19]">Self</option><option className="bg-[#0B0F19]">Spouse</option><option className="bg-[#0B0F19]">Son</option><option className="bg-[#0B0F19]">Daughter</option><option className="bg-[#0B0F19]">Father</option><option className="bg-[#0B0F19]">Mother</option><option className="bg-[#0B0F19]">Other</option>
                        </select>
                    </div>
                </div>
            </div>

            <button onClick={onNext} disabled={!isValid} type="button"
                className={`w-full py-2.5 rounded-lg font-bold text-xs transition-all duration-150 ${isValid ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm' : 'bg-white/5 border border-white/5 text-gray-500 cursor-not-allowed'}`}>
                Continue to Clinical Details
            </button>
            {!isValid && <p className="text-[10px] text-amber-500 font-semibold text-center mt-1">Fill all required (*) fields to continue</p>}
        </div>
    );
};
