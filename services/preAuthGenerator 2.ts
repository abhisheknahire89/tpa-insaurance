// ============================================================================
// PRE-AUTH DOCUMENT GENERATOR — With ICD Cost Database Integration
// ============================================================================

import { calculateCost, findConditionByICD, CostEstimateResult } from './costEstimationService';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

export interface PreAuthInput {
    patient: {
        name: string;
        age: number;
        gender: 'Male' | 'Female' | 'Other';
        dob?: string;
        address?: string;
        phone?: string;
        uhid?: string;
        abha_id?: string;
    };
    insurance: {
        policy_number: string;
        insurance_company: string;
        tpa_name: string;
        tpa_card_no?: string;
        sum_insured?: number;
        policy_type?: string;
        is_pmjay: boolean;
    };
    clinical: {
        chief_complaints: string;
        duration: string;
        clinical_findings: string;
        diagnosis: string;
        icd_code: string;
        is_surgical: boolean;
        vitals: {
            bp: string;
            pulse: number;
            temp: number;
            spo2: number;
            rr: number;
        };
        medical_necessity_statement: string;
        proposed_treatment: string[];
    };
    admission: {
        date: string;
        time: string;
        type: 'Emergency' | 'Planned';
        room_category: 'General Ward' | 'Semi-Private' | 'Private' | 'ICU';
    };
    hospital: {
        name: string;
        address: string;
        rohini_id?: string;
    };
    doctor: {
        name: string;
        registration_no: string;
        specialty: string;
    };
}

export interface PreAuthDocument {
    ref_no: string;
    generated_at: string;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
    patient_details: {
        name: string;
        age: number;
        gender: string;
        dob: string;
        address: string;
        phone: string;
        uhid: string;
        abha_id: string;
    };
    insurance_details: {
        insurance_company: string;
        tpa_name: string;
        tpa_card_no: string;
        policy_number: string;
        policy_type: string;
        sum_insured: number;
        is_pmjay: boolean;
    };
    clinical_details: {
        chief_complaints: string;
        duration: string;
        nature_of_illness: string;
        clinical_findings: string;
        provisional_diagnosis: string;
        icd_code: string;
        icd_description: string;
        vitals: {
            bp: string;
            pulse: number;
            temp: number;
            spo2: number;
            rr: number;
        };
        treatment_type: {
            medical: boolean;
            surgical: boolean;
            icu: boolean;
            investigation: boolean;
        };
        medical_necessity: string;
        proposed_treatment: string[];
    };
    admission_details: {
        date: string;
        time: string;
        type: string;
        room_category: string;
        expected_los: {
            total: number;
            ward: number;
            icu: number;
        };
    };
    cost_estimate: {
        source: 'PMJAY' | 'Private';
        pmjay_package: {
            hbp_code: string;
            package_name: string;
            package_rate: number;
        } | null;
        breakdown: {
            room_rent: number;
            nursing_charges: number;
            icu_charges: number;
            ot_charges: number;
            surgeon_fee: number;
            anesthetist_fee: number;
            consultant_fee: number;
            investigations: number;
            medicines: number;
            consumables: number;
            implants: number;
            miscellaneous: number;
        };
        total_estimated: number;
        claimed_amount: number;
    };
    declarations: {
        doctor: {
            name: string;
            registration: string;
            confirmed: boolean;
        };
        patient_consent: boolean;
        hospital_signatory: {
            name: string;
            designation: string;
        };
    };
}

// -----------------------------------------------------------------------------
// GENERATE PRE-AUTH DOCUMENT
// -----------------------------------------------------------------------------

export function generatePreAuthDocument(input: PreAuthInput): PreAuthDocument {
    const refNo = `PA-AIVANA-${formatDate(new Date())}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Look up condition in cost database
    const condition = findConditionByICD(input.clinical.icd_code);

    // Calculate costs from ICD cost database
    const costEstimate: CostEstimateResult = calculateCost(
        input.clinical.icd_code,
        input.admission.room_category,
        input.insurance.is_pmjay,
    );

    return {
        ref_no: refNo,
        generated_at: new Date().toISOString(),
        status: 'DRAFT',

        insurance_details: {
            insurance_company: input.insurance.insurance_company || 'N/A',
            tpa_name: input.insurance.tpa_name || 'N/A',
            tpa_card_no: input.insurance.tpa_card_no || 'N/A',
            policy_number: input.insurance.policy_number || 'N/A',
            policy_type: input.insurance.policy_type || 'N/A',
            sum_insured: input.insurance.sum_insured || 0,
            is_pmjay: input.insurance.is_pmjay,
        },

        patient_details: {
            name: input.patient.name || 'N/A',
            age: input.patient.age,
            gender: input.patient.gender,
            dob: input.patient.dob || 'N/A',
            address: input.patient.address || 'N/A',
            phone: input.patient.phone || 'N/A',
            uhid: input.patient.uhid || 'N/A',
            abha_id: input.patient.abha_id || 'N/A',
        },

        clinical_details: {
            chief_complaints: input.clinical.chief_complaints,
            duration: input.clinical.duration,
            nature_of_illness: 'Acute',
            clinical_findings: input.clinical.clinical_findings,
            provisional_diagnosis: input.clinical.diagnosis,
            icd_code: input.clinical.icd_code,
            icd_description: condition?.condition || input.clinical.diagnosis,
            vitals: input.clinical.vitals,
            treatment_type: {
                medical: !input.clinical.is_surgical,
                surgical: input.clinical.is_surgical,
                icu: costEstimate.los.icu_days > 0,
                investigation: true,
            },
            medical_necessity: input.clinical.medical_necessity_statement,
            proposed_treatment: input.clinical.proposed_treatment,
        },

        admission_details: {
            date: input.admission.date,
            time: input.admission.time,
            type: input.admission.type,
            room_category: input.admission.room_category,
            expected_los: {
                total: costEstimate.los.total_days,
                ward: costEstimate.los.ward_days,
                icu: costEstimate.los.icu_days,
            },
        },

        cost_estimate: {
            source: costEstimate.source,
            pmjay_package: costEstimate.pmjay_details ?? null,
            breakdown: costEstimate.breakdown,
            total_estimated: costEstimate.total_estimated,
            claimed_amount: costEstimate.claimed_amount,
        },

        declarations: {
            doctor: {
                name: input.doctor.name || 'N/A',
                registration: input.doctor.registration_no || 'N/A',
                confirmed: false,
            },
            patient_consent: false,
            hospital_signatory: {
                name: 'N/A',
                designation: 'N/A',
            },
        },
    };
}

// -----------------------------------------------------------------------------
// HELPER
// -----------------------------------------------------------------------------

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0].replace(/-/g, '');
}
