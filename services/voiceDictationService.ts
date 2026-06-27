import { GoogleGenAI } from '@google/genai';
import {
  PatientRecord, InsurancePolicyDetails, ClinicalDetails,
  AdmissionDetails, DiagnosisEntry, WizardVoiceFinding
} from '../components/PreAuthWizard/types';

const PROMPT = `You are a medical AI that parses a doctor's dictated clinical notes into a structured JSON for an insurance pre-authorization form.

Extract ALL available information from the transcript and return a JSON object with the following structure.
If a field is not mentioned, use null. Do NOT make up values not in the transcript.
Return ONLY valid JSON, no markdown, no code fences.

{
  "patient": {
    "patientName": "string or null",
    "age": number_or_null,
    "gender": "Male|Female|Other or null",
    "mobileNumber": "string or null",
    "address": "string or null",
    "city": "string or null",
    "occupation": "string or null"
  },
  "insurance": {
    "insurerName": "string or null",
    "policyNumber": "string or null",
    "tpaName": "string or null",
    "sumInsured": number_or_null
  },
  "clinical": {
    "chiefComplaints": "concise summary of main symptoms",
    "durationOfPresentAilment": "e.g. 5 days",
    "natureOfIllness": "Acute|Chronic|Acute on Chronic",
    "historyOfPresentIllness": "full narrative from notes",
    "relevantClinicalFindings": "examination/investigation findings",
    "treatmentTakenSoFar": "prior treatment or null",
    "reasonForHospitalisation": "why OPD is not sufficient",
    "additionalClinicalNotes": "any other relevant info",
    "diagnoses": [
      { "diagnosis": "Full condition name", "icd10Code": "best ICD-10 code", "icd10Description": "ICD-10 description" }
    ],
    "vitals": {
      "bp": "systolic/diastolic e.g. 100/70",
      "pulse": "number string e.g. 118",
      "temp": "degrees F string e.g. 102.8",
      "spo2": "percent string e.g. 86",
      "rr": "per min string e.g. 28"
    },
    "proposedLineOfTreatment": {
      "medical": true_or_false,
      "surgical": true_or_false,
      "intensiveCare": true_or_false,
      "investigation": true_or_false
    }
  },
  "admission": {
    "admissionType": "Emergency|Planned",
    "roomCategory": "General Ward|Semi-Private|Private|ICU|HDU",
    "expectedDaysInRoom": number,
    "expectedDaysInICU": number,
    "expectedLengthOfStay": number,
    "pastMedicalHistory": {
      "diabetes": { "present": true_or_false, "duration": "e.g. 8 years or null" },
      "hypertension": { "present": true_or_false },
      "heartDisease": { "present": true_or_false },
      "asthma": { "present": true_or_false },
      "epilepsy": { "present": true_or_false },
      "cancer": { "present": true_or_false },
      "kidney": { "present": true_or_false },
      "liver": { "present": true_or_false },
      "hiv": { "present": true_or_false },
      "alcoholism": { "present": true_or_false },
      "smoking": { "present": true_or_false }
    }
  }
}`;

export interface VoiceExtractedData {
  patient: Partial<PatientRecord>;
  insurance: Partial<InsurancePolicyDetails>;
  clinical: Partial<ClinicalDetails>;
  admission: Partial<AdmissionDetails>;
  rawTranscript: string;
}

export async function parseTranscriptWithGemini(transcript: string): Promise<VoiceExtractedData> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not configured. Please set VITE_GEMINI_API_KEY in your environment variables.');
  const ai = new GoogleGenAI({ apiKey });

  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\nDoctor's transcript:\n"""\n${transcript}\n"""` }] }],
    config: { temperature: 0.1, responseMimeType: 'application/json' }
  });

  const text = result.text ?? '{}';
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { parsed = {}; }

  const c = parsed.clinical ?? {};
  const a = parsed.admission ?? {};
  const p = parsed.patient ?? {};
  const ins = parsed.insurance ?? {};

  const diagnoses: DiagnosisEntry[] = (c.diagnoses ?? []).map((d: any, i: number) => ({
    diagnosis: d.diagnosis ?? '',
    icd10Code: d.icd10Code ?? '',
    icd10Description: d.icd10Description ?? '',
    probability: 0.9,
    reasoning: '',
    isSelected: i === 0,
  }));

  // voiceCapturedFindings is WizardVoiceFinding[] — leave empty, transcript goes to additionalClinicalNotes
  const voiceCapturedFindings: WizardVoiceFinding[] = [];

  const pmh = a.pastMedicalHistory ?? {};
  const defaultCond = { present: false };

  return {
    rawTranscript: transcript,
    patient: {
      patientName: p.patientName ?? undefined,
      age: p.age ?? undefined,
      gender: p.gender ?? undefined,
      mobileNumber: p.mobileNumber ?? undefined,
      address: p.address ?? undefined,
      city: p.city ?? undefined,
      occupation: p.occupation ?? undefined,
    },
    insurance: {
      insurerName: ins.insurerName ?? undefined,
      policyNumber: ins.policyNumber ?? undefined,
      tpaName: ins.tpaName ?? undefined,
      sumInsured: ins.sumInsured ?? undefined,
    },
    clinical: {
      dataSource: 'voice_scribe',
      chiefComplaints: c.chiefComplaints ?? '',
      durationOfPresentAilment: c.durationOfPresentAilment ?? '',
      natureOfIllness: c.natureOfIllness ?? 'Acute',
      historyOfPresentIllness: c.historyOfPresentIllness ?? '',
      relevantClinicalFindings: c.relevantClinicalFindings ?? '',
      treatmentTakenSoFar: c.treatmentTakenSoFar ?? '',
      reasonForHospitalisation: c.reasonForHospitalisation ?? '',
      additionalClinicalNotes: c.additionalClinicalNotes ?? transcript,
      diagnoses,
      selectedDiagnosisIndex: 0,
      vitals: {
        bp: c.vitals?.bp ?? '',
        pulse: c.vitals?.pulse ?? '',
        temp: c.vitals?.temp ?? '',
        spo2: c.vitals?.spo2 ?? '',
        rr: c.vitals?.rr ?? '',
      },
      proposedLineOfTreatment: {
        medical: c.proposedLineOfTreatment?.medical ?? false,
        surgical: c.proposedLineOfTreatment?.surgical ?? false,
        intensiveCare: c.proposedLineOfTreatment?.intensiveCare ?? false,
        investigation: c.proposedLineOfTreatment?.investigation ?? false,
        nonAllopathic: false,
      },
      voiceCapturedFindings,
    },
    admission: {
      admissionType: a.admissionType ?? 'Emergency',
      roomCategory: a.roomCategory ?? 'General Ward',
      expectedDaysInRoom: a.expectedDaysInRoom ?? 0,
      expectedDaysInICU: a.expectedDaysInICU ?? 0,
      expectedLengthOfStay: a.expectedLengthOfStay ?? 0,
      pastMedicalHistory: {
        diabetes: pmh.diabetes ?? defaultCond,
        hypertension: pmh.hypertension ?? defaultCond,
        heartDisease: pmh.heartDisease ?? defaultCond,
        asthma: pmh.asthma ?? defaultCond,
        epilepsy: pmh.epilepsy ?? defaultCond,
        cancer: pmh.cancer ?? defaultCond,
        kidney: pmh.kidney ?? defaultCond,
        liver: pmh.liver ?? defaultCond,
        hiv: pmh.hiv ?? defaultCond,
        alcoholism: pmh.alcoholism ?? defaultCond,
        smoking: pmh.smoking ?? defaultCond,
        anyOther: { present: false },
      },
      previousHospitalization: { wasHospitalizedBefore: false },
    },
  };
}
