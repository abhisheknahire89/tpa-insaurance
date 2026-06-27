import React, { useState, useEffect } from 'react';
import { AdmissionDetails, CostEstimate, ClinicalDetails, RoomCategory, PastMedicalHistory } from '../PreAuthWizard/types';
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
    admission, cost, clinical, sumInsured, onAdmissionChange, onCostChange, onNext, onBack
}) => {
    const pmh = admission.pastMedicalHistory ?? DEFAULT_PMH;
    const [matchedPackage, setMatchedPackage] = useState<any>(null);

    const updateField = (partial: Partial<AdmissionDetails>) => onAdmissionChange({ ...admission, ...partial });

    const updateCost = (partial: Partial<CostEstimate>) => {
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

            // Pre-fill LOS and costs if not already set
            if (!admission.expectedDaysInRoom) {
                // Get LOS from cost DB first (100 conditions), fallback to clinical DB / rateCard
                const costLos = costCondition
                    ? { wardDays: costCondition.los.avg - costCondition.los.icu, icuDays: costCondition.los.icu }
                    : null;
                const clinicalLos = condition
                    ? { wardDays: condition.los.typical, icuDays: condition.los.icu_days }
                    : null;
                const los = costLos || clinicalLos || getLOSForDiagnosis(dx.icd10Code || dx.diagnosis);

                const defaultRoom = los.icuDays > 0 ? 'ICU' : 'General Ward';

                updateField({
                    expectedDaysInRoom: los.wardDays,
                    expectedDaysInICU: los.icuDays,
                    expectedLengthOfStay: los.wardDays + los.icuDays,
                    roomCategory: admission.roomCategory ?? (defaultRoom as RoomCategory),
                    dateOfAdmission: admission.dateOfAdmission || todayISO(),
                    timeOfAdmission: admission.timeOfAdmission || nowTimeString(),
                    admissionType: admission.admissionType ?? 'Emergency',
                });

                // Calculate costs from the 100-condition ICD cost database
                const est = calculateCost(
                    dx.icd10Code || '',
                    defaultRoom,
                    false, // default to private; PMJAY applied via button
                    los.wardDays + los.icuDays,
                    los.icuDays,
                );

                updateCost({
                    roomRentPerDay: est.breakdown.room_rent / Math.max(1, los.wardDays),
                    nursingChargesPerDay: est.breakdown.nursing_charges / Math.max(1, los.wardDays),
                    icuChargesPerDay: est.breakdown.icu_charges / Math.max(1, los.icuDays || 1),
                    expectedRoomDays: los.wardDays,
                    expectedIcuDays: los.icuDays,
                    otCharges: est.breakdown.ot_charges,
                    surgeonFee: est.breakdown.surgeon_fee,
                    anesthetistFee: est.breakdown.anesthetist_fee,
                    consultantFee: est.breakdown.consultant_fee,
                    investigationsEstimate: est.breakdown.investigations,
                    medicinesEstimate: est.breakdown.medicines,
                    consumablesEstimate: est.breakdown.consumables,
                    miscCharges: est.breakdown.miscellaneous,
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
            <h2 className="text-xl font-bold text-white">Step 3: Admission & Cost Estimation</h2>

            {/* Admission Details */}
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
                <h3 className="font-semibold text-blue-300 text-sm">🏥 Admission Details</h3>
                <div className="flex gap-4">
                    {['Emergency', 'Planned'].map(type => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="admType" value={type}
                                checked={admission.admissionType === type}
                                onChange={() => updateField({ admissionType: type as any })} className="accent-blue-500" />
                            <span className="text-sm text-gray-200">{type}</span>
                        </label>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Date of Admission *</label>
                        <input type="date" value={admission.dateOfAdmission ?? ''} onChange={e => updateField({ dateOfAdmission: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Time of Admission</label>
                        <input type="time" value={admission.timeOfAdmission ?? ''} onChange={e => updateField({ timeOfAdmission: e.target.value })}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-2">Room Category</label>
                    <div className="flex flex-wrap gap-2">
                        {ROOM_CATEGORIES.map(cat => (
                            <button key={cat} onClick={() => handleRoomCategory(cat)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${admission.roomCategory === cat ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-white/10 text-gray-400 hover:text-white'}`}>
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Ward Days</label>
                        <input type="number" value={admission.expectedDaysInRoom ?? ''} onChange={e => { updateField({ expectedDaysInRoom: +e.target.value, expectedLengthOfStay: (+e.target.value) + (admission.expectedDaysInICU ?? 0) }); updateCost({ expectedRoomDays: +e.target.value }); }}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" min={0} />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">ICU Days</label>
                        <input type="number" value={admission.expectedDaysInICU ?? ''} onChange={e => { updateField({ expectedDaysInICU: +e.target.value, expectedLengthOfStay: (+e.target.value) + (admission.expectedDaysInRoom ?? 0) }); updateCost({ expectedIcuDays: +e.target.value }); }}
                            className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" min={0} />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Total Stay</label>
                        <input readOnly value={`${(admission.expectedLengthOfStay ?? 0)} days`}
                            className="w-full bg-gray-800 border border-white/5 rounded-lg px-3 py-2 text-sm text-gray-400" />
                    </div>
                </div>
            </div>

            {/* PMJAY Package & TPA Rates Feature */}
            {matchedPackage && (
                <div className="bg-gradient-to-r from-emerald-900/40 to-teal-900/30 border border-emerald-500/30 rounded-xl p-4 space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                        <svg className="w-24 h-24 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                    </div>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-emerald-400 text-sm flex items-center gap-2">
                                    <span className="bg-emerald-500/20 px-2 py-0.5 rounded text-xs border border-emerald-500/30">HBP 2.0</span>
                                    PMJAY Package Available
                                </h3>
                                <p className="text-gray-300 text-xs mt-1">Diagnosis matches <span className="text-white font-medium">{matchedPackage.condition_name}</span></p>
                            </div>
                        </div>

                        <div className="mt-3 bg-black/40 rounded-lg p-3">
                            <div className="flex justify-between items-center mb-2">
                                <div>
                                    <div className="text-white text-sm font-medium">{matchedPackage.package_name}</div>
                                    <div className="text-emerald-300/70 text-xs font-mono">{matchedPackage.hbp_code}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-emerald-400 font-bold text-lg">{formatCostDisplay(matchedPackage.package_rate_inr)}</div>
                                    <div className="text-gray-500 text-[10px] uppercase tracking-wider">Govt Rate</div>
                                </div>
                            </div>

                            {/* TPA Ranges */}
                            {matchedPackage.private_tpa_rates && (
                                <div className="mt-3 pt-3 border-t border-white/5">
                                    <div className="text-xs text-gray-400 mb-2">Typical Private TPA Packages</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {Object.entries(matchedPackage.private_tpa_rates as Record<string, { min: number, max: number }>).map(([tpa, limits]) => (
                                            <div key={tpa} className="bg-white/5 rounded px-2 py-1.5 border border-white/5">
                                                <div className="text-[10px] text-gray-400 capitalize">{tpa.replace('_', ' ')}</div>
                                                <div className="text-xs text-blue-300 font-medium">₹{(limits.min / 1000).toFixed(0)}k - {(limits.max / 1000).toFixed(0)}k</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-3 flex gap-2">
                                <button
                                    onClick={() => applyPackage({ package_rate_inr: matchedPackage.package_rate_inr, package_name: matchedPackage.package_name, hbp_code: matchedPackage.hbp_code })}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${cost.isPackageRate && cost.packageCode === matchedPackage.hbp_code ? 'bg-emerald-600 text-white' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}
                                >
                                    {cost.isPackageRate && cost.packageCode === matchedPackage.hbp_code ? '✓ Selected Govt Package' : 'Apply Govt Package'}
                                </button>
                                {matchedPackage.private_tpa_rates?.medi_assist && (
                                    <button
                                        onClick={() => applyPackage({ package_rate_inr: matchedPackage.private_tpa_rates.medi_assist.min, package_name: matchedPackage.package_name + ' (Private)', hbp_code: '' })}
                                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${cost.isPackageRate && cost.packageAmount === matchedPackage.private_tpa_rates.medi_assist.min ? 'bg-blue-600 text-white' : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'}`}
                                    >
                                        Apply TPA Base Rate
                                    </button>
                                )}
                                {cost.isPackageRate && (
                                    <button onClick={clearPackage} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors">
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Past Medical History */}
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-blue-300 text-sm">📋 Past Medical History</h3>
                <div className="grid grid-cols-2 gap-2.5">
                    {PAST_CONDITIONS.map(([key, label]) => (
                        <div key={key} className="flex items-center gap-3">
                            <input type="checkbox"
                                checked={pmh[key]?.present ?? false}
                                onChange={e => onAdmissionChange({ ...admission, pastMedicalHistory: { ...pmh, [key]: { ...pmh[key], present: e.target.checked } } })}
                                className="accent-blue-500 w-4 h-4" />
                            <span className="text-sm text-gray-300 flex-1">{label}</span>
                            {pmh[key]?.present && (
                                <input value={pmh[key]?.duration ?? ''} placeholder="Since..."
                                    onChange={e => onAdmissionChange({ ...admission, pastMedicalHistory: { ...pmh, [key]: { ...pmh[key], duration: e.target.value } } })}
                                    className="w-20 bg-gray-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none" />
                            )}
                        </div>
                    ))}
                </div>
                <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={admission.previousHospitalization?.wasHospitalizedBefore ?? false}
                            onChange={e => updateField({ previousHospitalization: { wasHospitalizedBefore: e.target.checked } })} className="accent-blue-500" />
                        <span className="text-sm text-gray-300">Previously hospitalized?</span>
                    </label>
                    {admission.previousHospitalization?.wasHospitalizedBefore && (
                        <div className="grid grid-cols-2 gap-3 mt-2">
                            <input value={admission.previousHospitalization?.details ?? ''} placeholder="Details..."
                                onChange={e => updateField({ previousHospitalization: { ...admission.previousHospitalization as any, details: e.target.value } })}
                                className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                            <input type="date" value={admission.previousHospitalization?.dateOfLastHospitalization ?? ''}
                                onChange={e => updateField({ previousHospitalization: { ...admission.previousHospitalization as any, dateOfLastHospitalization: e.target.value } })}
                                className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
                        </div>
                    )}
                </div>
            </div>

            {/* Cost Estimation */}
            <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-blue-300 text-sm">💰 Estimated Cost Break-up</h3>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                        {cost.isPackageRate ? (
                            <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Package Rate Applied</span>
                        ) : 'Defaults from rate card — adjust as needed'}
                    </div>
                </div>

                {cost.isPackageRate ? (
                    <div className="bg-black/20 rounded-lg p-4 border border-emerald-500/10">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <div className="text-sm font-medium text-emerald-300">{cost.packageName || 'Procedure Package'}</div>
                                {cost.packageCode && <div className="text-xs text-gray-400 font-mono mt-0.5">{cost.packageCode}</div>}
                            </div>
                            <div className="text-right">
                                <label className="block text-xs text-gray-500 mb-1">Package Amount</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-400">₹</span>
                                    <input
                                        type="number"
                                        value={cost.packageAmount ?? 0}
                                        onChange={e => updateCost({ packageAmount: +e.target.value })}
                                        className="bg-gray-900 border border-emerald-500/30 text-emerald-400 rounded px-3 py-1.5 text-right w-32 focus:outline-none focus:border-emerald-400"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="text-xs text-emerald-500/80 mt-2 flex items-start gap-1.5">
                            <span className="mt-0.5">ℹ️</span>
                            <span>When a package is applied, individual line items below are zeroed out automatically to prevent double billing. Adjust 'Package Amount' directly.</span>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 border-b border-white/10">
                                    <th className="text-left py-1.5 pr-3">Cost Head</th>
                                    <th className="text-right pr-3">Rate</th>
                                    <th className="text-right pr-3">Qty / Days</th>
                                    <th className="text-right">Total (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                <tr><td className="py-2 text-gray-300">Room Rent</td>
                                    <td className="text-right pr-3"><input type="number" value={cost.roomRentPerDay ?? 0} onChange={e => updateCost({ roomRentPerDay: +e.target.value })} className="w-24 bg-gray-900 border border-white/10 rounded px-2 py-1 text-xs text-right text-white focus:outline-none" /></td>
                                    <td className="text-right pr-3 text-gray-400">{admission.expectedDaysInRoom ?? 0} days</td>
                                    <td className="text-right font-medium">{formatCostDisplay(totals.totalRoomCharges)}</td></tr>
                                <tr><td className="py-2 text-gray-300">Nursing Charges</td>
                                    <td className="text-right pr-3"><input type="number" value={cost.nursingChargesPerDay ?? 0} onChange={e => updateCost({ nursingChargesPerDay: +e.target.value })} className="w-24 bg-gray-900 border border-white/10 rounded px-2 py-1 text-xs text-right text-white focus:outline-none" /></td>
                                    <td className="text-right pr-3 text-gray-400">{admission.expectedDaysInRoom ?? 0} days</td>
                                    <td className="text-right font-medium">{formatCostDisplay(totals.totalNursingCharges)}</td></tr>
                                <tr><td className="py-2 text-gray-300">ICU Charges</td>
                                    <td className="text-right pr-3"><input type="number" value={cost.icuChargesPerDay ?? 0} onChange={e => updateCost({ icuChargesPerDay: +e.target.value })} className="w-24 bg-gray-900 border border-white/10 rounded px-2 py-1 text-xs text-right text-white focus:outline-none" /></td>
                                    <td className="text-right pr-3 text-gray-400">{admission.expectedDaysInICU ?? 0} days</td>
                                    <td className="text-right font-medium">{formatCostDisplay(totals.totalIcuCharges)}</td></tr>
                                {[['OT Charges', 'otCharges'], ['Surgeon Fee', 'surgeonFee'], ['Anesthetist Fee', 'anesthetistFee'], ['Consultant Fee', 'consultantFee'], ['Investigations', 'investigationsEstimate'], ['Medicines', 'medicinesEstimate'], ['Consumables', 'consumablesEstimate'], ['Ambulance', 'ambulanceCharges'], ['Miscellaneous', 'miscCharges']].map(([label, key]) => (
                                    <tr key={key}><td className="py-2 text-gray-300">{label}</td>
                                        <td colSpan={2} className="text-right pr-3 text-gray-500 text-xs">manual</td>
                                        <td className="text-right"><input type="number" value={(cost as any)[key] ?? 0} onChange={e => updateCost({ [key]: +e.target.value } as any)}
                                            className="w-28 bg-gray-900 border border-white/10 rounded px-2 py-1 text-xs text-right text-white focus:outline-none" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Totals */}
                <div className={`rounded-xl p-4 ${totals.exceedsSumInsured ? 'bg-red-900/20 border border-red-500/30' : 'bg-gray-900 border border-white/10'}`}>
                    <div className="flex justify-between text-lg font-bold">
                        <span>Total Estimated Cost</span>
                        <span className="text-white">{formatCostDisplay(totals.totalEstimatedCost)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-300 mt-2">
                        <span>Claimed from Insurer</span>
                        <input type="number" value={cost.amountClaimedFromInsurer ?? totals.totalEstimatedCost}
                            onChange={e => updateCost({ amountClaimedFromInsurer: +e.target.value })}
                            className="w-36 bg-gray-800 border border-white/10 rounded px-3 py-1 text-sm text-right text-white focus:outline-none" />
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-400">Patient Responsibility</span>
                        <span className="text-gray-300">{formatCostDisplay(totals.patientResponsibility)}</span>
                    </div>
                    {totals.exceedsSumInsured && (
                        <div className="mt-3 text-red-300 text-sm font-medium">
                            ⚠️ Estimated cost exceeds sum insured of {formatCostDisplay(sumInsured)} by {formatCostDisplay(totals.excessAmount)}. Patient may need to pay the difference.
                        </div>
                    )}
                    {!totals.exceedsSumInsured && sumInsured > 0 && (
                        <div className="mt-2 text-green-400 text-xs">✅ Within sum insured ({formatCostDisplay(sumInsured)})</div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <button onClick={onBack} className="py-3 rounded-xl font-semibold text-sm bg-gray-800 hover:bg-gray-700 text-white transition-colors">← Back</button>
                <button onClick={onNext} disabled={!isValid}
                    className={`py-3 rounded-xl font-semibold text-sm transition-all ${isValid ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                    Continue to Documents & Generate →
                </button>
            </div>
        </div>
    );
};
