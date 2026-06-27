import React from 'react';
import { VoiceCapturedFinding, UploadedDocument, ConsultationInfo } from '../types';

interface InsuranceStepConfirmProps {
    documentationStatus: 'complete' | 'pending_documents';
    pendingDocuments: string[];
    medicalNecessityStatement: string;
    onMedicalNecessityChange: (statement: string) => void;
    doctorConfirmed: boolean;
    onDoctorConfirmChange: (confirmed: boolean) => void;
    consultationInfo: ConsultationInfo;
}

export const InsuranceStepConfirm: React.FC<InsuranceStepConfirmProps> = ({
    documentationStatus,
    pendingDocuments,
    medicalNecessityStatement,
    onMedicalNecessityChange,
    doctorConfirmed,
    onDoctorConfirmChange,
    consultationInfo
}) => {
    return (
        <div className="space-y-6">
            {documentationStatus === 'pending_documents' && (
                <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5" role="img" aria-label="warning">⚠️</span>
                        <div>
                            <p className="text-yellow-400 font-semibold text-sm">Incomplete Documentation</p>
                            <p className="text-sm text-yellow-300/80 mt-1">
                                The following documents are missing and may cause TPA queries:
                            </p>
                            <ul className="list-disc list-inside text-sm text-yellow-300/80 mt-2">
                                {pendingDocuments.map((doc, i) => (
                                    <li key={i}>{doc}</li>
                                ))}
                            </ul>
                            <p className="text-xs text-yellow-300/60 mt-3">
                                You can still submit, but the pre-auth will be marked as "Pending Documents"
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div>
                <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2 mb-4">
                    Medical Necessity Statement
                </h3>
                <textarea
                    value={medicalNecessityStatement}
                    onChange={(e) => onMedicalNecessityChange(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-gray-300 h-48 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition resize-none custom-scrollbar"
                    placeholder="Generating medical necessity statement..."
                />
                <p className="text-xs text-gray-500 mt-2 text-right">
                    You can edit this AI-generated statement before submission.
                </p>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mt-8">
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={doctorConfirmed}
                        onChange={(e) => onDoctorConfirmChange(e.target.checked)}
                        className="mt-1 rounded bg-gray-700 border-gray-600 text-purple-600 w-4 h-4"
                    />
                    <div className="text-sm text-gray-300">
                        <p>
                            I, <strong className="text-white">{consultationInfo.doctorName}</strong>
                            {' '}(License: {consultationInfo.doctorLicense}), hereby confirm that:
                        </p>
                        <ul className="list-disc list-inside mt-3 text-gray-400 space-y-2">
                            <li>The clinical findings documented above are accurate to the best of my knowledge</li>
                            <li>The test results mentioned were reported during this consultation</li>
                            <li>The proposed hospitalization is medically necessary</li>
                            <li>I take clinical responsibility for this pre-authorization request</li>
                        </ul>
                    </div>
                </label>
            </div>
        </div>
    );
};
