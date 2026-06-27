import React, { useState, useEffect } from 'react';
import {
    NexusInsuranceInput,
    PatientInfo,
    ConsultationInfo,
    PreAuthSubmission,
    UploadedDocument,
    VoiceCapturedFinding,
    IRDAIPreAuthForm
} from '../types';
import { generateMedicalNecessityStatement, createPreAuthSubmission, formatPreAuthForTPA, generateIRDAIPreAuthForm, generateOPDJustification } from '../services/insuranceService';
import { InsuranceStepReview } from './InsuranceStepReview';
import { InsuranceStepDocuments } from './InsuranceStepDocuments';
import { InsuranceStepConfirm } from './InsuranceStepConfirm';
import { InsuranceStepPolicy } from './InsuranceStepPolicy';
import { InsuranceStepCost } from './InsuranceStepCost';

interface InsurancePreAuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (preAuthData: PreAuthSubmission, tpaDocument: string) => void;
    nexusOutput: NexusInsuranceInput | null;
    patientInfo: PatientInfo;
    consultationInfo: ConsultationInfo;
}

export const InsurancePreAuthModal: React.FC<InsurancePreAuthModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    nexusOutput,
    patientInfo,
    consultationInfo
}) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [severityOverride, setSeverityOverride] = useState({
        overridden: false,
        newSeverity: '',
        justification: ''
    });

    const [testResults, setTestResults] = useState<VoiceCapturedFinding[]>([]);
    const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
    const [medicalNecessity, setMedicalNecessity] = useState('');
    const [doctorConfirmed, setDoctorConfirmed] = useState(false);
    const [generatingStatement, setGeneratingStatement] = useState(false);
    const [selectedDxIndex, setSelectedDxIndex] = useState(0);

    const [formData, setFormData] = useState<Partial<IRDAIPreAuthForm>>({
        metadata: {
            formVersion: '1.0',
            generatedAt: new Date().toISOString(),
            generatedBy: 'Aivana System',
            preAuthRequestId: `PA-${Date.now()}`,
            submissionChannel: 'Online'
        },
        section1_TpaInsurer: {
            insuranceCompanyName: '',
            tpaName: patientInfo.tpaName || '',
            tpaId: '',
            hospitalName: 'Aivana Partner Hospital',
            hospitalAddress: '123 Health Ave',
            hospitalCity: 'Mumbai',
            hospitalState: 'Maharashtra',
            hospitalPincode: '400001',
            hospitalPhoneNumber: '1800-123-4567',
            hospitalEmail: 'tpa@hospital.com',
            hospitalRohiniId: 'ROH12345',
            nabhAccredited: true,
            nablAccredited: true,
            nodalOfficerName: 'Dr. Admin',
            nodalOfficerPhone: '9876543210',
            nodalOfficerEmail: 'nodal@hospital.com'
        },
        section2_PolicyDetails: {
            policyNumber: patientInfo.policyNumber || '',
            policyType: 'Individual',
            policyStartDate: '2024-01-01',
            policyEndDate: '2024-12-31',
            sumInsured: 500000,
            proposerName: patientInfo.name,
            insuredName: patientInfo.name,
            relationshipWithProposer: 'Self',
            tpaIdCardNumber: '',
            hasOtherHealthPolicy: false
        },
        section3_PatientDetails: {
            patientName: patientInfo.name,
            dateOfBirth: '1980-01-01',
            age: patientInfo.age,
            gender: patientInfo.gender,
            maritalStatus: 'Single',
            occupation: 'Software Engineer',
            address: '456 User Lane',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400002',
            mobileNumber: '9999999999',
            email: 'patient@example.com'
        },
        section4_ClinicalDetails: {
            chiefComplaints: nexusOutput?.ddx[0]?.rationale || '',
            durationOfPresentAilment: '3 days',
            natureOfIllness: 'Acute',
            relevantClinicalFindings: nexusOutput?.keyFindings?.join(', ') || '',
            provisionalDiagnosis: nexusOutput?.ddx[0]?.diagnosis || '',
            icd10Code: '',
            icd10Description: '',
            proposedLineOfTreatment: {
                medical: true,
                surgical: false,
                intensiveCare: false,
                investigation: true,
                nonAllopathic: false
            }
        },
        section5_AdmissionDetails: {
            dateOfAdmission: new Date().toISOString().split('T')[0],
            timeOfAdmission: new Date().toTimeString().substring(0, 5),
            admissionType: 'Emergency',
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
                alcoholism: { present: false },
                smoking: { present: false },
                anyOther: { present: false }
            }
        },
        section6_CostEstimate: {
            roomRentPerDay: 0,
            expectedRoomDays: 0,
            totalRoomCharges: 0,
            nursingChargesPerDay: 0,
            totalNursingCharges: 0,
            icuChargesPerDay: 0,
            expectedIcuDays: 0,
            totalIcuCharges: 0,
            otCharges: 0,
            professionalFees: {
                surgeonFee: 0,
                anesthetistFee: 0,
                consultantFee: 0,
                otherDoctorFees: 0
            },
            investigationsEstimate: 0,
            medicinesEstimate: 0,
            consumablesEstimate: 0,
            totalImplantsCost: 0,
            ambulanceCharges: 0,
            miscCharges: 0,
            totalEstimatedCost: 0,
            amountClaimedFromInsurer: 0,
            isEmergency: true
        },
        section7_Declarations: {
            patientDeclaration: {
                agreedToTerms: true,
                consentForMedicalDataSharing: true,
                agreesToPayNonPayables: true,
                signatureDate: new Date().toISOString().split('T')[0],
                signatureTime: new Date().toTimeString().substring(0, 5)
            },
            doctorDeclaration: {
                doctorName: consultationInfo.doctorName,
                doctorQualification: 'MBBS, MD',
                doctorRegistrationNumber: consultationInfo.doctorLicense,
                hospitalName: 'Aivana Partner Hospital',
                declarationText: 'Verified',
                signatureDate: new Date().toISOString().split('T')[0]
            },
            hospitalDeclaration: {
                authorizedSignatoryName: 'Admin',
                designation: 'Nodal Officer',
                hospitalSealApplied: true,
                signatureDate: new Date().toISOString().split('T')[0]
            }
        }
    });

    const updateFormData = (updates: Partial<IRDAIPreAuthForm>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    };

    const handleDiagnosisSelect = (index: number) => {
        setSelectedDxIndex(index);
        if (nexusOutput && nexusOutput.ddx[index]) {
            const dx = nexusOutput.ddx[index];
            updateFormData({
                section4_ClinicalDetails: {
                    ...formData.section4_ClinicalDetails as any,
                    provisionalDiagnosis: dx.diagnosis,
                    chiefComplaints: dx.rationale,
                }
            });
        }
    };

    useEffect(() => {
        if (nexusOutput?.voiceCapturedFindings) {
            setTestResults(nexusOutput.voiceCapturedFindings);
        }
    }, [nexusOutput]);

    const calculateDocumentationStatus = () => {
        const testsNeedingDocs = testResults.filter(t =>
            t.interpretation !== 'normal' && !t.documentAttached
        );

        if (testsNeedingDocs.length === 0) {
            return { status: 'complete' as const, pendingList: [] };
        }

        return {
            status: 'pending_documents' as const,
            pendingList: testsNeedingDocs.map(t => `${t.testName} report`)
        };
    };

    const handleNextStep = async () => {
        if (currentStep === 4) {
            if (nexusOutput) {
                setGeneratingStatement(true);

                // 1. Generate the concise OPD justification logic based on Nexus AI severities
                const justification = generateOPDJustification(nexusOutput);

                // 2. Inject it into the form data for Section 4
                const updatedFormData = {
                    ...formData,
                    section4_ClinicalDetails: {
                        ...formData.section4_ClinicalDetails as any,
                        medicalNecessityJustification: justification
                    }
                };
                setFormData(updatedFormData);

                // 3. Generate the rigid 7-section IRDAI text output
                const statement = generateIRDAIPreAuthForm(updatedFormData as IRDAIPreAuthForm);
                setMedicalNecessity(statement);
                setGeneratingStatement(false);
            }
        }
        setCurrentStep(prev => prev + 1);
    };

    const handlePrevStep = () => setCurrentStep(prev => prev - 1);

    const handleSubmit = () => {
        if (!doctorConfirmed || !nexusOutput) return;

        setIsSubmitting(true);

        setTimeout(() => {
            const submission = createPreAuthSubmission(
                nexusOutput,
                selectedDxIndex,
                severityOverride.overridden ? {
                    original: nexusOutput.severity.phenoIntensity,
                    overridden: Number(severityOverride.newSeverity) || 0,
                    justification: severityOverride.justification
                } : null,
                '',
                uploadedDocuments,
                testResults,
                consultationInfo.doctorName,
                consultationInfo.doctorLicense
            );

            submission.medicalNecessityStatement = medicalNecessity; // Override if doctor edited it

            const tpaDocument = medicalNecessity; // Use IRDAI form
            setIsSubmitting(false);
            onSubmit(submission, tpaDocument);
            onClose();
        }, 1500);
    };

    const handleFileUpload = (file: File) => {
        const documentId = Math.random().toString(36).substring(7);
        const newDoc: UploadedDocument = {
            id: documentId,
            fileName: file.name,
            fileSize: (file.size / 1024).toFixed(1) + ' KB',
            fileType: file.type.includes('pdf') ? 'pdf' : 'image',
            uploadedAt: new Date().toISOString()
        };

        setUploadedDocuments([...uploadedDocuments, newDoc]);
    };

    const handleLinkDocument = (documentId: string, testName: string) => {
        setUploadedDocuments(docs => docs.map(d =>
            d.id === documentId ? { ...d, linkedToTest: testName } : d
        ));

        setTestResults(results => results.map(r =>
            r.testName === testName
                ? { ...r, documentAttached: true, documentId }
                : r
        ));
    };

    const handleRemoveDocument = (documentId: string, testName?: string) => {
        setUploadedDocuments(docs => docs.filter(d => d.id !== documentId));

        if (testName) {
            setTestResults(results => results.map(r =>
                r.testName === testName
                    ? { ...r, documentAttached: false, documentId: undefined }
                    : r
            ));
        }
    };

    if (!isOpen || !nexusOutput) return null;

    const { status, pendingList } = calculateDocumentationStatus();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 w-full max-w-4xl max-h-[90vh] rounded-xl flex flex-col shadow-2xl">
                <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl sticky top-0 z-10">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="text-blue-400">⚡</span>
                            Insurance Pre-Authorization
                        </h2>
                        <p className="text-sm text-gray-400 mt-1 flex gap-4">
                            <span>Patient: {patientInfo.name} ({patientInfo.uhid})</span>
                            <span>•</span>
                            <span>TPA: {patientInfo.tpaName || 'Not specified'}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition p-2">
                        ✕
                    </button>
                </div>

                <div className="flex border-b border-gray-800 bg-gray-900/50">
                    {[
                        { num: 1, label: 'Review Admission' },
                        { num: 2, label: 'Policy Details' },
                        { num: 3, label: 'Cost Estimation' },
                        { num: 4, label: 'Attach Documents' },
                        { num: 5, label: 'Confirm & Submit' }
                    ].map((step) => (
                        <div
                            key={step.num}
                            className={`flex-1 py-3 px-2 md:px-4 text-center text-xs md:text-sm font-medium border-b-2 transition-colors
                ${currentStep === step.num
                                    ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                                    : currentStep > step.num
                                        ? 'border-gray-600 text-gray-300'
                                        : 'border-transparent text-gray-600'
                                }`}
                        >
                            Step {step.num}: {step.label}
                        </div>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-900 relative">
                    {currentStep === 1 && (
                        <InsuranceStepReview
                            nexusData={nexusOutput}
                            selectedDiagnosisIndex={selectedDxIndex}
                            onDiagnosisSelect={handleDiagnosisSelect}
                            patientName={patientInfo.name}
                            severityOverride={severityOverride}
                            onSeverityOverrideChange={setSeverityOverride}
                        />
                    )}

                    {currentStep === 2 && (
                        <InsuranceStepPolicy
                            formData={formData}
                            onUpdate={updateFormData}
                        />
                    )}

                    {currentStep === 3 && (
                        <InsuranceStepCost
                            formData={formData}
                            onUpdate={updateFormData}
                            diagnosis={nexusOutput.ddx[0]?.diagnosis}
                        />
                    )}

                    {currentStep === 4 && (
                        <InsuranceStepDocuments
                            testResults={testResults}
                            uploadedDocuments={uploadedDocuments}
                            onFileUpload={handleFileUpload}
                            onLinkDocument={handleLinkDocument}
                            onRemoveDocument={handleRemoveDocument}
                            provisionalDiagnosis={formData.section4_ClinicalDetails?.provisionalDiagnosis}
                        />
                    )}

                    {currentStep === 5 && (
                        generatingStatement ? (
                            <div className="flex flex-col items-center justify-center h-48 space-y-4">
                                <div className="w-8 h-8 rounded-full border-4 border-gray-700 border-t-purple-500 animate-spin" />
                                <p className="text-gray-400 animate-pulse">Generating Medical Necessity Statement...</p>
                            </div>
                        ) : (
                            <InsuranceStepConfirm
                                documentationStatus={status}
                                pendingDocuments={pendingList}
                                medicalNecessityStatement={medicalNecessity}
                                onMedicalNecessityChange={setMedicalNecessity}
                                doctorConfirmed={doctorConfirmed}
                                onDoctorConfirmChange={setDoctorConfirmed}
                                consultationInfo={consultationInfo}
                            />
                        )
                    )}
                </div>

                <div className="p-4 border-t border-gray-700 bg-gray-900 rounded-b-xl flex justify-between items-center">
                    <button
                        onClick={currentStep === 1 ? onClose : handlePrevStep}
                        disabled={isSubmitting}
                        className="px-6 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 transition disabled:opacity-50"
                    >
                        {currentStep === 1 ? 'Cancel' : '← Back'}
                    </button>

                    {currentStep < 5 ? (
                        <button
                            onClick={handleNextStep}
                            className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50"
                        >
                            Next Step →
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={!doctorConfirmed || isSubmitting}
                            className={`px-8 py-2 rounded-lg text-sm font-medium flex items-center justify-center min-w-[140px] transition
                ${!doctorConfirmed
                                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20'
                                }`}
                        >
                            {isSubmitting ? (
                                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            ) : 'Submit Pre-Authorization'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
