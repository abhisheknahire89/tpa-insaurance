import React, { useState, useEffect } from 'react';
import { AdmissionDetails, CostEstimate, ClinicalDetails, RoomCategory, PastMedicalHistory, CaseComplexity } from '../PreAuthWizard/types';
import { getRateForCategory, getLOSForDiagnosis } from '../../config/rateCard';
import { calculateTotals, formatCostDisplay } from '../../utils/costCalculator';
import { todayISO, nowTimeString } from '../../utils/formatters';
import { getConditionByCode, getConditionByName } from '../../config/icd10Database';
import { calculateCost, findConditionByICD } from '../../services/costEstimationService';

interface AdmissionCostStepProps {
    admission: Partial<AdmissionDetails>;
    cost: Partial<CostEstimate>;
    clinical: Partial<ClinicalDetails>;
    sumInsured: number;
    onAdmissionChange: (a: Partial<AdmissionDetails>) => void;
    onCostChange: (c: CostEstimate) => void;
    onNext: () => void;
    onBack: () => void;
    complexity?: CaseComplexity;
}

const ROOM_CATEGORIES: RoomCategory[] = ['General Ward', 'Semi-Private', 'Private', 'Deluxe', 'ICU', 'ICCU', 'NICU', 'HDU'];

const PAST_CONDITIONS = [
    ['diabetes', 'Diabetes'],
    ['hypertension', 'Hypertension'],
    ['heartDisease', 'Heart Disease'],
    ['asthma', 'Asthma / COPD'],
    ['epilepsy', 'Epilepsy'],
    ['cancer', 'Cancer'],
    ['kidney', 'Kidney Disease'],
    ['liver', 'Liver Disease'],
    ['hiv', 'HIV'],
    ['alcoholism', 'Alcoholism'],
    ['smoking', 'Smoking'],
] as const;

const DEFAULT_PMH: PastMedicalHistory = {
    diabetes: { present: false }, hypertension: { present: false }, heartDisease: { present: false },
    asthma: { present: false }, epilepsy: { present: false }, cancer: { present: false },
    kidney: { present: false }, liver: { present: false }, hiv: { present: false },
    alcoholism: { present: false }, smoking: { present: false },
    anyOther: { present: false },
};

export const AdmissionCostStep: React.FC<AdmissionCostStepProps> = ({
    admission, cost, clinical, sumInsured, onAdmissionChange, onCostChange, onNext, onBack, complexity
}) => {
    const pmh = admission.pastMedicalHistory ?? DEFAULT_PMH;
    const [matchedPackage, setMatchedPackage] = useState<any>(null);

    const updateField = (partial: Partial<AdmissionDetails>) => onAdmissionChange({ ...admission, ...partial });

    const updateCost = (partial: Partial<CostEstimate>) => {
        if ('totalImplantsCost' in partial) {
            const costVal = partial.totalImplantsCost ?? 0;
            partial.implants = [{ implantName: 'Procedure Implant', implantCost: costVal }];
        }
        const merged = { ...cost, ...partial };
        onCostChange(calculateTotals(merged, sumInsured));
    };

    useEffect(() => {
        const dx = clinical?.diagnoses?.[clinical.selectedDiagnosisIndex ?? 0];

        if (dx) {
            // Check ICD clinical database for PMJAY package
            const condition = dx.icd10Code ? getConditionByCode(dx.icd10Code) : getConditionByName(dx.diagnosis);
            if (condition?.pmjay_package) {
                setMatchedPackage(condition.pmjay_package);
            }

            // Also check cost database for PMJAY package (covers more conditions)
            const costCondition = findConditionByICD(dx.icd10Code || '');
            if (!matchedPackage && costCondition?.pmjay?.eligible) {
                setMatchedPackage({
                    hbp_code: costCondition.pmjay.hbp_code,
                    package_name: costCondition.condition,
                    package_rate_inr: costCondition.pmjay.rate,
                });
            }

            // Pre-fill LOS and costs if not already set or cost is zero
            const hasEmptyCosts = !cost || (cost.totalEstimatedCost ?? 0) === 0;
            if (!admission.expectedDaysInRoom || hasEmptyCosts) {
                // Get LOS from cost DB first (100 conditions), fallback to clinical DB / rateCard
                const costLos = costCondition
                    ? { wardDays: costCondition.los.avg - costCondition.los.icu, icuDays: costCondition.los.icu }
                    : null;
                const clinicalLos = condition
                    ? { wardDays: condition.los.typical, icuDays: condition.los.icu_days }
                    : null;
                const los = costLos || clinicalLos || getLOSForDiagnosis(dx.icd10Code || dx.diagnosis);

                const finalWardDays = admission.expectedDaysInRoom || los.wardDays;
                const finalIcuDays = admission.expectedDaysInICU || los.icuDays;
                const finalLOS = finalWardDays + finalIcuDays;

                const defaultRoom = finalIcuDays > 0 ? 'ICU' : 'General Ward';

                updateField({
                    expectedDaysInRoom: finalWardDays,
                    expectedDaysInICU: finalIcuDays,
                    expectedLengthOfStay: finalLOS,
                    roomCategory: admission.roomCategory ?? (defaultRoom as RoomCategory),
                    dateOfAdmission: admission.dateOfAdmission || todayISO(),
                    timeOfAdmission: admission.timeOfAdmission || nowTimeString(),
                    admissionType: admission.admissionType ?? 'Emergency',
                });

                // Calculate costs from the 100-condition ICD cost database
                const est = calculateCost(
                    dx.icd10Code || '',
                    admission.roomCategory ?? defaultRoom,
                    false, // default to private; PMJAY applied via button
                    finalLOS,
                    finalIcuDays,
                );

                updateCost({
                    roomRentPerDay: cost.roomRentPerDay || (est.breakdown.room_rent / Math.max(1, finalWardDays)),
                    nursingChargesPerDay: cost.nursingChargesPerDay || (est.breakdown.nursing_charges / Math.max(1, finalWardDays)),
                    icuChargesPerDay: cost.icuChargesPerDay || (finalIcuDays > 0 ? est.breakdown.icu_charges / finalIcuDays : 0),
                    expectedRoomDays: finalWardDays,
                    expectedIcuDays: finalIcuDays,
                    otCharges: cost.otCharges || est.breakdown.ot_charges,
                    surgeonFee: cost.surgeonFee || est.breakdown.surgeon_fee,
                    anesthetistFee: cost.anesthetistFee || est.breakdown.anesthetist_fee,
                    consultantFee: cost.consultantFee || est.breakdown.consultant_fee,
                    investigationsEstimate: cost.investigationsEstimate || est.breakdown.investigations,
                    medicinesEstimate: cost.medicinesEstimate || est.breakdown.medicines,
                    consumablesEstimate: cost.consumablesEstimate || est.breakdown.consumables,
                    miscCharges: cost.miscCharges || est.breakdown.miscellaneous,
                });
            }
        }
    }, []);

    const handleRoomCategory = (cat: RoomCategory) => {
        const rate = getRateForCategory(cat);
        updateField({ roomCategory: cat });
        if (!cost.isPackageRate) {
            updateCost({
                roomRentPerDay: rate.roomRentPerDay,
                nursingChargesPerDay: rate.nursingChargesPerDay,
                icuChargesPerDay: rate.icuChargesPerDay,
                expectedRoomDays: cost.expectedRoomDays ?? rate.defaultStayDays,
            });
        }
    };

    const applyPackage = (pkg: any) => {
        updateCost({
            isPackageRate: true,
            packageName: pkg.package_name,
            packageCode: pkg.hbp_code,
            packageAmount: pkg.package_rate_inr,
            // Zero out standard heads when packaged
            roomRentPerDay: 0, nursingChargesPerDay: 0, icuChargesPerDay: 0,
            otCharges: 0, surgeonFee: 0, anesthetistFee: 0, consultantFee: 0,
            investigationsEstimate: 0, medicinesEstimate: 0, consumablesEstimate: 0,
        });
    };

    const clearPackage = () => {
        const rateInfo = getRateForCategory(admission.roomCategory ?? 'General Ward');
        updateCost({
            isPackageRate: false,
            packageName: undefined,
            packageCode: undefined,
            packageAmount: undefined,
            roomRentPerDay: rateInfo.roomRentPerDay,
            nursingChargesPerDay: rateInfo.nursingChargesPerDay,
            icuChargesPerDay: rateInfo.icuChargesPerDay,
            investigationsEstimate: 8000,
            medicinesEstimate: 15000,
            consumablesEstimate: 6000,
        });
    };

    const totals = calculateTotals(cost, sumInsured);
    const isValid = !!(admission.admissionType && admission.dateOfAdmission && admission.roomCategory && totals.totalEstimatedCost > 0);

    return (
        <div className="space-y-5">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Admission & Cost Estimation</h2>

            {/* Admission Details */}
            <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm">
                <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">🏥 Admission Details</h3>
                <div className="flex gap-4">
                    {['Emergency', 'Planned'].map(type => (
                        <label key={type} className="flex items-center gap-2.5 cursor-pointer bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-lg px-4 py-2 text-xs text-gray-300 transition-all select-none">
                            <input type="radio" name="admType" value={type}
                                checked={admission.admissionType === type}
                                onChange={() => updateField({ admissionType: type as any })} className="accent-blue-500 w-3.5 h-3.5" />
                            <span className="font-semibold">{type} Admission</span>
                        </label>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Date of Admission *</label>
                        <input type="date" value={admission.dateOfAdmission ?? ''} onChange={e => updateField({ dateOfAdmission: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Time of Admission</label>
                        <input type="time" value={admission.timeOfAdmission ?? ''} onChange={e => updateField({ timeOfAdmission: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Room Category</label>
                    <div className="flex flex-wrap gap-2">
                        {ROOM_CATEGORIES.map(cat => (
                            <button key={cat} onClick={() => handleRoomCategory(cat)}
                                className={`px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${admission.roomCategory === cat ? 'bg-blue-600 border-blue-500 text-white shadow-sm' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
                                type="button">
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Ward Days</label>
                        <input type="number" value={admission.expectedDaysInRoom ?? ''} onChange={e => { updateField({ expectedDaysInRoom: +e.target.value, expectedLengthOfStay: (+e.target.value) + (admission.expectedDaysInICU ?? 0) }); updateCost({ expectedRoomDays: +e.target.value }); }}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" min={0} />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">ICU Days</label>
                        <input type="number" value={admission.expectedDaysInICU ?? ''} onChange={e => { updateField({ expectedDaysInICU: +e.target.value, expectedLengthOfStay: (+e.target.value) + (admission.expectedDaysInRoom ?? 0) }); updateCost({ expectedIcuDays: +e.target.value }); }}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder-gray-600 transition-all" min={0} />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Total Length of Stay</label>
                        <input readOnly value={`${(admission.expectedLengthOfStay ?? 0)} days`}
                            className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-gray-500 select-none outline-none font-semibold" />
                    </div>
                </div>
            </div>

            {/* PMJAY Package & TPA Rates Feature */}
            {matchedPackage && (
                <div className="bg-gradient-to-r from-emerald-950/20 via-teal-950/10 to-transparent border border-emerald-500/20 rounded-xl p-5 space-y-3.5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-5">
                        <svg className="w-24 h-24 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                    </div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-emerald-400 text-xs flex items-center gap-2 uppercase tracking-wider">
                                    <span className="bg-emerald-500/10 px-2 py-0.5 rounded text-[10px] border border-emerald-500/20 font-bold font-sans">HBP 2.0</span>
                                    PMJAY Package Available
                                </h3>
                                <p className="text-gray-400 text-xs mt-1">Diagnosis matches <span className="text-white font-semibold">{matchedPackage.condition_name}</span></p>
                            </div>
                        </div>

                        <div className="mt-3.5 bg-black/30 border border-white/5 rounded-xl p-4">
                            <div className="flex justify-between items-center mb-3">
                                <div>
                                    <div className="text-white text-xs font-semibold">{matchedPackage.package_name}</div>
                                    <div className="text-emerald-400 text-[10px] font-mono font-bold mt-0.5">{matchedPackage.hbp_code}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-emerald-400 font-bold text-base font-mono">{formatCostDisplay(matchedPackage.package_rate_inr)}</div>
                                    <div className="text-gray-500 text-[9px] font-bold uppercase tracking-wider mt-0.5">Govt Rate</div>
                                </div>
                            </div>

                            {/* TPA Ranges */}
                            {matchedPackage.private_tpa_rates && (
                                <div className="mt-3.5 pt-3.5 border-t border-white/5">
                                    <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-2">Typical Private TPA Packages</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {Object.entries(matchedPackage.private_tpa_rates as Record<string, { min: number, max: number }>).map(([tpa, limits]) => (
                                            <div key={tpa} className="bg-white/5 rounded-lg px-3 py-1.5 border border-white/5 text-center">
                                                <div className="text-[9px] text-gray-400 font-medium capitalize">{tpa.replace('_', ' ')}</div>
                                                <div className="text-xs text-blue-400 font-bold mt-0.5 font-mono">₹{(limits.min / 1000).toFixed(0)}k - {(limits.max / 1000).toFixed(0)}k</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 flex gap-2">
                                <button
                                    onClick={() => applyPackage({ package_rate_inr: matchedPackage.package_rate_inr, package_name: matchedPackage.package_name, hbp_code: matchedPackage.hbp_code })}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${cost.isPackageRate && cost.packageCode === matchedPackage.hbp_code ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/10'}`}
                                    type="button"
                                >
                                    {cost.isPackageRate && cost.packageCode === matchedPackage.hbp_code ? '✓ Selected Govt Package' : 'Apply Govt Package'}
                                </button>
                                {matchedPackage.private_tpa_rates?.medi_assist && (
                                    <button
                                        onClick={() => applyPackage({ package_rate_inr: matchedPackage.private_tpa_rates.medi_assist.min, package_name: matchedPackage.package_name + ' (Private)', hbp_code: '' })}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${cost.isPackageRate && cost.packageAmount === matchedPackage.private_tpa_rates.medi_assist.min ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/10'}`}
                                        type="button"
                                    >
                                        Apply TPA Base Rate
                                    </button>
                                )}
                                {cost.isPackageRate && (
                                    <button onClick={clearPackage} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg font-bold border border-white/5 transition-all" type="button">
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Past Medical History */}
            <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm">
                <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2">📋 Past Medical History</h3>
                <div className="grid grid-cols-2 gap-3">
                    {PAST_CONDITIONS.map(([key, label]) => (
                        <div key={key} className="flex items-center gap-3 bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-lg px-4 py-2.5 text-xs text-gray-300 transition-all select-none">
                            <input type="checkbox"
                                checked={pmh[key]?.present ?? false}
                                onChange={e => onAdmissionChange({ ...admission, pastMedicalHistory: { ...pmh, [key]: { ...pmh[key], present: e.target.checked } } })}
                                className="accent-blue-500 w-3.5 h-3.5 rounded" />
                            <span className="font-semibold flex-1">{label}</span>
                            {pmh[key]?.present && (
                                <input value={pmh[key]?.duration ?? ''} placeholder="Duration..."
                                    onChange={e => onAdmissionChange({ ...admission, pastMedicalHistory: { ...pmh, [key]: { ...pmh[key], duration: e.target.value } } })}
                                    className="w-24 bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none placeholder-gray-600 transition-all" />
                            )}
                        </div>
                    ))}
                </div>
                <div className="pt-2 border-t border-white/5">
                    <label className="flex items-center gap-2.5 cursor-pointer bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-lg px-4 py-3 text-xs text-gray-300 transition-all select-none">
                        <input type="checkbox" checked={admission.previousHospitalization?.wasHospitalizedBefore ?? false}
                            onChange={e => updateField({ previousHospitalization: { wasHospitalizedBefore: e.target.checked } })} className="accent-blue-500 w-3.5 h-3.5 rounded" />
                        <span className="font-semibold">Previously hospitalized?</span>
                    </label>
                    {admission.previousHospitalization?.wasHospitalizedBefore && (
                        <div className="grid grid-cols-2 gap-4 mt-3 animate-fade-in">
                            <input value={admission.previousHospitalization?.details ?? ''} placeholder="Hospital/Diagnosis details..."
                                onChange={e => updateField({ previousHospitalization: { ...admission.previousHospitalization as any, details: e.target.value } })}
                                className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none placeholder-gray-600" />
                            <input type="date" value={admission.previousHospitalization?.dateOfLastHospitalization ?? ''}
                                onChange={e => updateField({ previousHospitalization: { ...admission.previousHospitalization as any, dateOfLastHospitalization: e.target.value } })}
                                className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none" />
                        </div>
                    )}
                </div>
            </div>

            {/* Cost Estimation */}
            <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-300 text-[10px] uppercase tracking-wider border-b border-white/5 pb-2 w-full flex justify-between items-center">
                        <span>💰 Estimated Cost Break-up</span>
                        <span className="text-gray-500 font-normal normal-case italic">
                            {cost.isPackageRate ? 'Package Rate Applied' : 'Rate card defaults — adjust as needed'}
                        </span>
                    </h3>
                </div>

                {cost.isPackageRate ? (
                    <div className="bg-black/35 rounded-xl p-4 border border-emerald-500/10">
                        <div className="flex justify-between items-center">
                            <div>
                                <div className="text-xs font-semibold text-emerald-300">{cost.packageName || 'Procedure Package'}</div>
                                {cost.packageCode && <div className="text-[9px] text-gray-500 font-mono font-bold mt-1">{cost.packageCode}</div>}
                            </div>
                            <div className="text-right">
                                <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Package Amount</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500 font-bold text-xs">₹</span>
                                    <input
                                        type="number"
                                        value={cost.packageAmount ?? 0}
                                        onChange={e => updateCost({ packageAmount: +e.target.value })}
                                        className="bg-white/[0.03] border border-emerald-500/30 text-emerald-400 font-bold font-mono rounded-lg px-3 py-1 text-right w-32 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all text-xs"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="text-[10px] text-emerald-500/75 mt-3 flex items-start gap-1.5 leading-normal">
                            <span>ℹ</span>
                            <span>When a package is applied, individual line items below are zeroed out automatically to prevent double billing. Adjust 'Package Amount' directly.</span>
                        </div>
                    </div>
                ) : (
                    <div className="border border-white/5 rounded-lg overflow-hidden bg-black/20">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="text-[9px] text-gray-500 uppercase tracking-wider bg-white/[0.02] border-b border-white/5">
                                    <th className="px-4 py-2 font-bold">Billing Head</th>
                                    <th className="px-4 py-2 text-right font-bold w-32">Rate Details</th>
                                    <th className="px-4 py-2 text-right font-bold w-32">Amount (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-semibold text-gray-300">
                                <tr>
                                    <td className="px-4 py-2">Room Rent (Daily)</td>
                                    <td className="px-4 py-2 text-right text-gray-500 text-[10px]">₹{cost.roomRentPerDay ?? 0} × {cost.expectedRoomDays ?? 0} days</td>
                                    <td className="px-4 py-2 text-right text-white font-mono">{(cost.roomRentPerDay ?? 0) * (cost.expectedRoomDays ?? 0)}</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2">Nursing Charges (Daily)</td>
                                    <td className="px-4 py-2 text-right text-gray-500 text-[10px]">₹{cost.nursingChargesPerDay ?? 0} × {cost.expectedRoomDays ?? 0} days</td>
                                    <td className="px-4 py-2 text-right text-white font-mono">{(cost.nursingChargesPerDay ?? 0) * (cost.expectedRoomDays ?? 0)}</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2">ICU Charges (Daily)</td>
                                    <td className="px-4 py-2 text-right text-gray-500 text-[10px]">₹{cost.icuChargesPerDay ?? 0} × {cost.expectedIcuDays ?? 0} days</td>
                                    <td className="px-4 py-2 text-right text-white font-mono">{(cost.icuChargesPerDay ?? 0) * (cost.expectedIcuDays ?? 0)}</td>
                                </tr>
                                {[
                                    ['OT Charges', 'otCharges'],
                                    ['Surgeon Fee', 'surgeonFee'],
                                    ['Anesthetist Fee', 'anesthetistFee'],
                                    ['Consultant Fee', 'consultantFee'],
                                    ['Investigations', 'investigationsEstimate'],
                                    ['Medicines', 'medicinesEstimate'],
                                    ['Consumables', 'consumablesEstimate'],
                                    ['Implants Cost', 'totalImplantsCost'],
                                    ['Ambulance', 'ambulanceCharges'],
                                    ['Miscellaneous', 'miscCharges']
                                ].map(([label, key]) => (
                                    <tr key={key}>
                                        <td className="px-4 py-1.5 text-gray-300">{label}</td>
                                        <td className="px-4 py-1.5 text-right text-gray-500 italic text-[9px]">manual override</td>
                                        <td className="px-4 py-1.5 text-right">
                                            <input type="number" value={(cost as any)[key] ?? 0} onChange={e => updateCost({ [key]: +e.target.value } as any)}
                                                className="w-24 bg-white/[0.03] border border-white/10 rounded px-2 py-0.5 text-xs text-right text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Totals */}
                <div className={`rounded-xl p-4 border transition-all ${totals.exceedsSumInsured ? 'bg-red-900/10 border-red-500/20' : 'bg-emerald-950/5 border-emerald-500/10'}`}>
                    <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-gray-300 uppercase tracking-wider">Total Estimated Cost</span>
                        <span className="text-white text-sm font-mono">{formatCostDisplay(totals.totalEstimatedCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-3">
                        <span className="text-gray-400 font-semibold">Amount Claimed from Insurer</span>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-500">₹</span>
                            <input type="number" value={cost.amountClaimedFromInsurer ?? totals.totalEstimatedCost}
                                onChange={e => updateCost({ amountClaimedFromInsurer: +e.target.value })}
                                className="w-32 bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-right text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" />
                        </div>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-3 border-t border-white/5 pt-3">
                        <span className="text-gray-400 font-semibold">Patient Co-pay Responsibility</span>
                        <span className="text-gray-300 font-mono font-bold">{formatCostDisplay(totals.patientResponsibility)}</span>
                    </div>
                    {totals.exceedsSumInsured && (
                        <div className="mt-3 bg-red-500/5 border border-red-500/15 rounded-lg p-3 text-red-300 text-xs font-semibold leading-relaxed">
                            ⚠️ Estimated cost exceeds sum insured of {formatCostDisplay(sumInsured)} by {formatCostDisplay(totals.excessAmount)}. Patient is responsible for difference.
                        </div>
                    )}
                    {!totals.exceedsSumInsured && sumInsured > 0 && (
                        <div className="mt-3 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                            <span>✓</span>
                            <span>Within policy sum insured ({formatCostDisplay(sumInsured)})</span>
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
                    Continue to Documents & Generate
                </button>
            </div>
        </div>
    );
};
