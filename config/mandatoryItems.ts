import { PreAuthRecord } from '../components/PreAuthWizard/types';

/**
 * Checks for administrative and legal must-haves that do not require clinical reasoning.
 * Returns an array of gap description strings.
 */
export const checkMandatoryGaps = (record: Partial<PreAuthRecord>): string[] => {
  const gaps: string[] = [];

  // 1. Discharge Summary Check
  const hasDischargeSummary = record.uploadedDocuments?.some(
    (doc) => doc.documentCategory === 'discharge_summary'
  );
  if (!hasDischargeSummary) {
    gaps.push('Discharge summary is missing from uploaded documents.');
  }

  // 2. MLC/FIR for Accident cases
  const isInjury = record.clinical?.injuryDetails?.isInjury;
  if (isInjury) {
    const isMLC = record.clinical?.injuryDetails?.isMLC;
    const firNumber = record.clinical?.injuryDetails?.firNumber;
    if (!isMLC && !firNumber) {
      gaps.push('Accident/Injury case requires MLC (Medico-Legal Case) registration or FIR details.');
    }
  }

  // 3. Doctor Registration Number
  const docReg = record.declarations?.doctor?.doctorRegistrationNumber;
  if (!docReg || docReg.trim() === '') {
    gaps.push('Doctor Registration Number (SMC/MCI) is missing from the doctor declaration.');
  }

  // 4. Required Signatures / Seals
  const sealApplied = record.declarations?.hospital?.hospitalSealApplied;
  if (!sealApplied) {
    gaps.push('Hospital seal must be applied to the pre-authorization form.');
  }

  const doctorConfirmed = record.declarations?.doctor?.confirmed;
  if (!doctorConfirmed) {
    gaps.push('Treating doctor signature/in-app confirmation is missing.');
  }

  const patientAgreed = record.declarations?.patient?.agreedToTerms;
  if (!patientAgreed) {
    gaps.push('Patient signature/terms agreement is missing.');
  }

  // 5. Itemized Cost Estimate Present
  const totalCost = record.costEstimate?.totalEstimatedCost;
  if (!totalCost || totalCost <= 0) {
    gaps.push('Itemized cost estimate is missing or total estimated cost is zero.');
  }

  return gaps;
};
