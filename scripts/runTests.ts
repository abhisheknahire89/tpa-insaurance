import { reviewEvidence } from '../engine/evidenceReview';
import { PreAuthRecord } from '../components/PreAuthWizard/types';
import * as llmClient from '../services/llmClient';

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

// Mock helper to simulate LLM responses
function mockLlmResponse(response: llmClient.LlmReasoningOutput) {
  llmClient.setMockReasoning(async () => response);
}

// Mock helper to simulate LLM failure
function mockLlmFailure() {
  llmClient.setMockReasoning(async () => {
    throw new Error('Local Ollama server connection refused');
  });
}


// Standard valid compliance declarations to satisfy deterministic rules
const validDeclarationsAndCosts = {
  declarations: {
    patient: {
      agreedToTerms: true,
      consentForMedicalDataSharing: true,
      agreesToPayNonPayables: true,
      capturedBy: 'Insurance Desk Officer'
    },
    doctor: {
      doctorId: 'DOC-1',
      doctorName: 'Dr. Ramesh Kumar',
      doctorQualification: 'MBBS, MD',
      doctorRegistrationNumber: 'MCI-12345',
      registrationCouncil: 'Karnataka Medical Council',
      confirmed: true,
      confirmationMethod: 'in_app' as const
    },
    hospital: {
      authorizedSignatoryName: 'Admin Head',
      designation: 'Medical Superintendent',
      hospitalSealApplied: true
    }
  },
  costEstimate: {
    totalEstimatedCost: 45000,
    amountClaimedFromInsurer: 40000,
    isPackageRate: false,
    roomRentPerDay: 4000
  },
  uploadedDocuments: [
    {
      id: 'DOC-DS',
      fileName: 'discharge_summary.pdf',
      fileSizeDisplay: '120 KB',
      fileType: 'pdf' as const,
      mimeType: 'application/pdf',
      uploadedAt: new Date().toISOString(),
      base64Data: 'dummy',
      documentCategory: 'discharge_summary' as const,
      autoClassified: false,
      isRequired: true
    }
  ]
};

async function runTests() {
  console.log('🏁 Starting NEXUS Evidence Review Engine Tests...');

  // =========================================================================
  // TEST case 1: Pneumonia Admission with Gaps (No SpO2, no duration)
  // =========================================================================
  console.log('\nRunning Test 1: Pneumonia Admission with Gaps...');
  
  mockLlmResponse({
    challengesConsidered: [
      'could this be managed as OPD?',
      'could this be a pre-existing condition?',
      'is the stated diagnosis actually supported by the documented findings?'
    ],
    anchors: [
      'Fever or elevated body temperature',
      'Productive cough',
      'Chest X-Ray showing lung infiltrate or consolidation'
    ],
    discriminators: [
      {
        challenge: 'could this be managed as OPD?',
        evidence: 'Oxygen saturation (SpO2) < 90% or clinical signs of respiratory distress',
        reason: 'To establish severity of pneumonia and justify continuous inpatient oxygen therapy.'
      },
      {
        challenge: 'could this be a pre-existing condition?',
        evidence: 'Documented onset and short duration of acute respiratory symptoms (< 7 days)',
        reason: 'To rule out chronic respiratory illness exclusions.'
      }
    ]
  });

  const pneumoniaGapsRecord: Partial<PreAuthRecord> = {
    id: 'PA-TEST-001',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    version: 1,
    createdBy: 'Insurance Desk',
    clinical: {
      dataSource: 'manual_entry',
      chiefComplaints: 'Patient has cough and high fever.',
      historyOfPresentIllness: 'Cough and high fever noticed recently. Chest crackles present.',
      vitals: {
        bp: '120/80',
        pulse: '88',
        temp: '101.5',
        spo2: '', // Missing SpO2!
        rr: '24'
      },
      diagnoses: [
        {
          diagnosis: 'Pneumonia',
          icd10Code: 'J18.9',
          icd10Description: 'Pneumonia, unspecified organism',
          probability: 0.9,
          reasoning: 'Clinical findings indicate lower respiratory tract infection',
          isSelected: true
        }
      ],
      selectedDiagnosisIndex: 0
    },
    admission: {
      admissionType: 'Emergency',
      dateOfAdmission: new Date().toISOString().split('T')[0],
      timeOfAdmission: '10:00',
      roomCategory: 'General Ward',
      expectedLengthOfStay: 5,
      expectedDaysInICU: 0,
      expectedDaysInRoom: 5,
      pastMedicalHistory: {
        diabetes: { present: false },
        hypertension: { present: false },
        heartDisease: { present: false },
        asthma: { present: false },
        epilepsy: { present: false },
        cancer: { present: false },
        kidney: { present: false },
        liver: { present: false },
        hiv: { present: false },
        alcoholism: { present: false },
        smoking: { present: false },
        anyOther: { present: false }
      },
      previousHospitalization: { wasHospitalizedBefore: false }
    },
    ...validDeclarationsAndCosts
  };

  const report1 = await reviewEvidence(pneumoniaGapsRecord);
  
  assert(report1.status === 'insufficient', 'Status should be insufficient');
  assert(report1.challengesConsidered.includes('could this be managed as OPD?'), 'OPD challenge should be raised');
  assert(report1.challengesConsidered.includes('could this be a pre-existing condition?'), 'Pre-existing challenge should be raised');
  
  // Verify missing SpO2 query
  const opdQuery = report1.anticipatedQueries.find(q => q.relatedChallenge.includes('OPD'));
  assert(!!opdQuery, 'OPD query should be generated');
  assert(opdQuery!.query.includes('SpO2') || opdQuery!.query.includes('saturation'), 'OPD query must target SpO2');
  assert(opdQuery!.severity === 'high', 'OPD query severity should be high');

  // Verify missing duration query
  const preExistingQuery = report1.anticipatedQueries.find(q => q.relatedChallenge.includes('pre-existing'));
  assert(!!preExistingQuery, 'Pre-existing query should be generated');
  assert(preExistingQuery!.query.includes('onset') || preExistingQuery!.query.includes('duration'), 'Pre-existing query must target onset/duration');

  console.log('✅ Test 1 Passed: Gapped Pneumonia case correctly reviewed.');

  // =========================================================================
  // TEST case 2: Diabetes Admission with Gaps (No duration / past papers)
  // =========================================================================
  console.log('\nRunning Test 2: Diabetes Admission with Gaps...');

  mockLlmResponse({
    challengesConsidered: [
      'could this be managed as OPD?',
      'could this be a pre-existing condition?',
      'is the stated diagnosis actually supported by the documented findings?'
    ],
    anchors: [
      'Hyperglycemia (elevated blood glucose > 200 mg/dL)',
      'Polyuria or polydipsia'
    ],
    discriminators: [
      {
        challenge: 'could this be a pre-existing condition?',
        evidence: 'Documented history of diabetes and medication log or past-treatment papers',
        reason: 'To establish if condition is pre-existing and calculate waiting period compliance.'
      }
    ]
  });

  const diabetesRecord: Partial<PreAuthRecord> = {
    id: 'PA-TEST-002',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    version: 1,
    createdBy: 'Insurance Desk',
    clinical: {
      dataSource: 'manual_entry',
      chiefComplaints: 'High blood sugar levels.',
      historyOfPresentIllness: 'High blood sugar noted during home tests.',
      vitals: {
        bp: '130/85',
        pulse: '76',
        temp: '98.6',
        spo2: '98',
        rr: '18'
      },
      diagnoses: [
        {
          diagnosis: 'Diabetes Mellitus',
          icd10Code: 'E11.9',
          icd10Description: 'Type 2 diabetes mellitus without complications',
          probability: 0.9,
          reasoning: 'Elevated glucose levels require evaluation',
          isSelected: true
        }
      ],
      selectedDiagnosisIndex: 0
    },
    admission: {
      admissionType: 'Emergency',
      dateOfAdmission: new Date().toISOString().split('T')[0],
      timeOfAdmission: '11:00',
      roomCategory: 'General Ward',
      expectedLengthOfStay: 3,
      expectedDaysInICU: 0,
      expectedDaysInRoom: 3,
      pastMedicalHistory: {
        diabetes: { present: false }, // Doctor states no history or leaves it blank
        hypertension: { present: false },
        heartDisease: { present: false },
        asthma: { present: false },
        epilepsy: { present: false },
        cancer: { present: false },
        kidney: { present: false },
        liver: { present: false },
        hiv: { present: false },
        alcoholism: { present: false },
        smoking: { present: false },
        anyOther: { present: false }
      },
      previousHospitalization: { wasHospitalizedBefore: false }
    },
    ...validDeclarationsAndCosts
  };

  const report2 = await reviewEvidence(diabetesRecord);
  assert(report2.status === 'insufficient', 'Status should be insufficient');
  
  const historyQuery = report2.anticipatedQueries.find(q => q.relatedChallenge.includes('pre-existing'));
  assert(!!historyQuery, 'Pre-existing query should be generated for Diabetes');
  assert(historyQuery!.query.includes('treatment') || historyQuery!.query.includes('history') || historyQuery!.query.includes('past'), 'Query must request history / past-treatment papers');

  console.log('✅ Test 2 Passed: Gapped Diabetes case correctly reviewed.');

  // =========================================================================
  // TEST case 3: Well-documented Case (Sufficient)
  // =========================================================================
  console.log('\nRunning Test 3: Well-documented Sufficient Case...');

  mockLlmResponse({
    challengesConsidered: [
      'could this be managed as OPD?',
      'could this be a pre-existing condition?',
      'is the stated diagnosis actually supported by the documented findings?'
    ],
    anchors: [
      'Fever or elevated body temperature',
      'Productive cough'
    ],
    discriminators: [
      {
        challenge: 'could this be managed as OPD?',
        evidence: 'Oxygen saturation (SpO2) < 90%',
        reason: 'To establish need for inpatient oxygenation.'
      },
      {
        challenge: 'could this be a pre-existing condition?',
        evidence: 'Documented acute onset of symptoms with short duration (< 7 days)',
        reason: 'To rule out chronic/pre-existing exclusion.'
      }
    ]
  });

  const sufficientRecord: Partial<PreAuthRecord> = {
    id: 'PA-TEST-003',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    version: 1,
    createdBy: 'Insurance Desk',
    clinical: {
      dataSource: 'manual_entry',
      chiefComplaints: 'Productive cough and high fever for 3 days.',
      historyOfPresentIllness: 'Acute onset productive cough and fever started 3 days ago. Patient is tachypneic.',
      vitals: {
        bp: '110/70',
        pulse: '98',
        temp: '102.1',
        spo2: '88', // Hypoxia documented!
        rr: '28'
      },
      durationOfPresentAilment: '3 days',
      diagnoses: [
        {
          diagnosis: 'Pneumonia',
          icd10Code: 'J18.9',
          icd10Description: 'Pneumonia, unspecified organism',
          probability: 0.95,
          reasoning: 'High fever, hypoxia, and productive cough support pneumonia admission',
          isSelected: true
        }
      ],
      selectedDiagnosisIndex: 0
    },
    admission: {
      admissionType: 'Emergency',
      dateOfAdmission: new Date().toISOString().split('T')[0],
      timeOfAdmission: '10:00',
      roomCategory: 'General Ward',
      expectedLengthOfStay: 5,
      expectedDaysInICU: 0,
      expectedDaysInRoom: 5,
      pastMedicalHistory: {
        diabetes: { present: false },
        hypertension: { present: false },
        heartDisease: { present: false },
        asthma: { present: false },
        epilepsy: { present: false },
        cancer: { present: false },
        kidney: { present: false },
        liver: { present: false },
        hiv: { present: false },
        alcoholism: { present: false },
        smoking: { present: false },
        anyOther: { present: false }
      },
      previousHospitalization: { wasHospitalizedBefore: false }
    },
    ...validDeclarationsAndCosts
  };

  const report3 = await reviewEvidence(sufficientRecord);
  assert(report3.status === 'sufficient', 'Status should be sufficient');
  assert(report3.anticipatedQueries.length === 0, 'Should raise 0 anticipated queries');
  assert(report3.reasoningTrace.some(line => line.includes('Status: "SUFFICIENT"')), 'Reasoning trace should include SUFFICIENT status log');

  console.log('✅ Test 3 Passed: Well-documented case marked sufficient.');

  // =========================================================================
  // TEST case 4: Accident Case without MLC
  // =========================================================================
  console.log('\nRunning Test 4: Accident Case without MLC...');

  const accidentNoMlcRecord: Partial<PreAuthRecord> = {
    ...sufficientRecord,
    id: 'PA-TEST-004',
    clinical: {
      ...sufficientRecord.clinical,
      injuryDetails: {
        isInjury: true,
        isMLC: false, // Accident case, but MLC is false!
        causeOfInjury: 'Self fall from bike',
        dateOfInjury: new Date().toISOString().split('T')[0]
      }
    }
  };

  const report4 = await reviewEvidence(accidentNoMlcRecord);
  assert(report4.status === 'insufficient', 'Accident without MLC should make case insufficient');
  assert(report4.mandatoryGaps.some(g => g.includes('MLC') || g.includes('FIR')), 'MLC gap should be flagged in mandatoryGaps');

  console.log('✅ Test 4 Passed: Accident without MLC flagged deterministically.');

  // =========================================================================
  // TEST case 5: Local LLM Failure and Graceful Degradation
  // =========================================================================
  console.log('\nRunning Test 5: LLM Failure Graceful Degradation...');

  mockLlmFailure();

  const report5 = await reviewEvidence(pneumoniaGapsRecord);
  // Should not crash, and should degrade to rule-based fallback check
  assert(report5.status === 'insufficient', 'Should still be insufficient');
  assert(report5.challengesConsidered.length > 0, 'Challenges list should be populated by fallback');
  assert(report5.reasoningTrace.some(line => line.includes('Ollama') || line.includes('degrad') || line.includes('rules-based')), 'Audit trace should record fallback degradation');

  console.log('✅ Test 5 Passed: Graceful degradation correctly processed local LLM failure.');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
  
  // Reset getReasoning to original
  llmClient.setMockReasoning(null);
}

runTests().catch(err => {
  console.error('❌ Test run failed with error:', err);
  process.exit(1);
});
