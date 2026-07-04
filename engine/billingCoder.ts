import { extractBillingCodesAI, BillingCodingOutput } from '../services/geminiService';

export interface BillingInput {
    clinicalNote: string;
    insurerName: string;
    sumInsured: number;
    wardType: 'General' | 'Semi-Private' | 'Private' | 'ICU';
    requestedAmount: number;
}

export const runBillingCodingWorkflow = async (input: BillingInput): Promise<BillingCodingOutput> => {
    // 1. Run AI Coder & claim scrubber
    const codingOutput = await extractBillingCodesAI(
        input.clinicalNote,
        input.insurerName,
        input.sumInsured,
        input.wardType,
        input.requestedAmount
    );

    // 2. Deterministic Scrubbing Overlay
    const additionalWarnings: string[] = [];
    const noteLower = input.clinicalNote.toLowerCase();

    // Check for surgical unbundling (CCI edits)
    if (noteLower.includes('cholecystectomy') && noteLower.includes('laparotomy')) {
        additionalWarnings.push("Potential Unbundling: Laparotomy access is included in Laparoscopic Cholecystectomy (SG001). Separate billing for access is disallowed under CGI guidelines.");
    }
    if (noteLower.includes('appendectomy') && noteLower.includes('drainage')) {
        additionalWarnings.push("Potential Over-coding: Peritoneal lavage/drainage is considered integral to Appendectomy (SG002) and should not be billed as a secondary procedure.");
    }

    // Check room rent capping proportional deductions
    let cashlessApproved = codingOutput.cashlessApproved;
    let patientShare = codingOutput.patientShare;

    // Standard room rent caps (1% normal ward, 2% ICU)
    const normalCap = input.sumInsured * 0.01;
    const icuCap = input.sumInsured * 0.02;

    let excessRent = 0;
    let rentRate = 0;

    if (input.wardType === 'ICU') {
        rentRate = icuCap;
    } else {
        rentRate = normalCap;
    }

    // Let's assume the hospital requested room rent is coded, and we simulate excess check
    // We'll read the requested room rent from clinical note or guess based on ward type private/semi-private
    let requestedRent = 0;
    if (input.wardType === 'Private') {
        requestedRent = input.sumInsured * 0.02; // e.g. 10,000 for 5L policy
        if (requestedRent > normalCap) {
            excessRent = requestedRent - normalCap;
            additionalWarnings.push(`Room Rent Limit Warning: Private room rent (₹${requestedRent}/day) exceeds normal policy cap (₹${normalCap}/day). Proportional billing deductions will apply to all hospital charges.`);
        }
    }

    const finalWarnings = Array.from(new Set([...codingOutput.validationWarnings, ...additionalWarnings]));
    const finalStatus = finalWarnings.length > 0 ? 'Warnings' : 'Clean';

    // If warnings indicate unbundling or excess rent, recalculate patient share
    if (excessRent > 0) {
        // Hospital charges are reduced by the same proportion that room rent was exceeded
        // e.g. if capped at 5000 and patient stays in 10000 room, TPA deducts 50% from doctor fees, diagnostics, nursing etc.
        const reductionRatio = normalCap / requestedRent;
        const disallowedRentContribution = excessRent * 3; // assuming 3 days stay
        patientShare += disallowedRentContribution + (cashlessApproved * (1 - reductionRatio));
        cashlessApproved = Math.max(0, input.requestedAmount - patientShare);
    }

    return {
        ...codingOutput,
        validationWarnings: finalWarnings,
        scrubbingStatus: finalStatus,
        cashlessApproved: Math.round(cashlessApproved),
        patientShare: Math.round(patientShare)
    };
};
