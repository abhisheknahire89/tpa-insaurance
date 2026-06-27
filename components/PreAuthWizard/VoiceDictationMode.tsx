/**
 * VoiceDictationMode.tsx
 *
 * Full voice-to-form pipeline:
 * 1. Doctor speaks → live Web Speech API transcript
 * 2. "Process with AI" → Gemini parses → structured data
 * 3. Review panel shows every extracted field
 * 4. "Confirm & Fill All Fields" → wizard jumps to step 4 with everything pre-filled
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { parseTranscriptWithGemini, VoiceExtractedData } from '../../services/voiceDictationService';
import { PreAuthRecord } from './types';
import { calculateTotals } from '../../utils/costCalculator';

interface VoiceDictationModeProps {
    onComplete: (data: VoiceExtractedData) => void;
    onCancel: () => void;
}

type Phase = 'idle' | 'recording' | 'recorded' | 'processing' | 'review' | 'error';

// ─── Web Speech shim ─────────────────────────────────────────────────────────
const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export const VoiceDictationMode: React.FC<VoiceDictationModeProps> = ({
    onComplete, onCancel,
}) => {
    const [phase, setPhase] = useState<Phase>('idle');
    const [transcript, setTranscript] = useState('');
    const [interimText, setInterimText] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [extracted, setExtracted] = useState<VoiceExtractedData | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const recognitionRef = useRef<any>(null);
    const shouldRestartRef = useRef(false);   // stable flag survives instance recreation
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── timer ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (phase === 'recording') {
            timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [phase]);

    const formatElapsed = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    // ── start recording ────────────────────────────────────────────────────────
    const startRecording = useCallback(() => {
        if (!SpeechRecognition) {
            setErrorMsg('Your browser does not support voice input. Please use Chrome and try again.');
            setPhase('error');
            return;
        }

        shouldRestartRef.current = true;   // mark that we want recording to keep going

        const launchRec = () => {
            if (!shouldRestartRef.current) return;   // bail if user stopped

            const rec = new SpeechRecognition();
            rec.lang = 'en-IN';
            rec.continuous = true;
            rec.interimResults = true;
            rec.maxAlternatives = 1;

            let finalText = transcript;

            rec.onresult = (e: any) => {
                let interim = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) {
                        finalText += e.results[i][0].transcript + ' ';
                        setTranscript(finalText);
                    } else {
                        interim = e.results[i][0].transcript;
                    }
                }
                setInterimText(interim);
            };

            rec.onerror = (e: any) => {
                // 'no-speech' and 'aborted' are normal — just restart; don't surface as error
                if (e.error === 'no-speech' || e.error === 'aborted') return;
                setErrorMsg(`Mic error: ${e.error}. Please try again.`);
                setPhase('error');
                shouldRestartRef.current = false;
            };

            // onend fires whenever recognition stops (timeout, network hiccup, pause)
            // auto-restart as long as user hasn't clicked Stop
            rec.onend = () => {
                if (shouldRestartRef.current) {
                    setTimeout(launchRec, 100);   // slight delay avoids rapid spinning
                }
            };

            try {
                rec.start();
                recognitionRef.current = rec;
            } catch (err) {
                // ignore "already started" errors
            }
        };

        launchRec();
        setElapsed(0);
        setPhase('recording');
    }, [transcript]);

    // ── stop recording ─────────────────────────────────────────────────────────
    const stopRecording = () => {
        shouldRestartRef.current = false;   // prevent auto-restart
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;   // detach before calling stop
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setInterimText('');
        setPhase('recorded');
    };

    // ── process with Gemini ────────────────────────────────────────────────────
    const processWithAI = async () => {
        const full = (transcript + ' ' + interimText).trim();
        if (!full) { setErrorMsg('No speech captured. Please record first.'); setPhase('error'); return; }
        setPhase('processing');
        try {
            const data = await parseTranscriptWithGemini(full);
            setExtracted(data);
            setPhase('review');
        } catch (err: any) {
            setErrorMsg(`AI processing failed: ${err?.message ?? 'Unknown error'}. You can still edit the transcript manually.`);
            setPhase('error');
        }
    };

    // ── confirm & fill ─────────────────────────────────────────────────────────
    const confirmAndFill = () => {
        if (extracted) onComplete(extracted);
    };

    // ─── Render helpers ────────────────────────────────────────────────────────

    const FIELD_ROW = ({ label, value }: { label: string; value?: string | number | null }) =>
        value != null && value !== '' && value !== 0 ? (
            <div className="flex items-start gap-2 text-xs">
                <span className="text-gray-500 min-w-[130px] flex-shrink-0">{label}</span>
                <span className="text-white font-medium break-words">{String(value)}</span>
            </div>
        ) : null;

    // ─── IDLE ──────────────────────────────────────────────────────────────────
    if (phase === 'idle' || phase === 'error') {
        return (
            <div className="space-y-6 text-center">
                <div className="space-y-2">
                    <div className="text-5xl">🎙️</div>
                    <h2 className="text-xl font-bold text-white">Voice Dictation Mode</h2>
                    <p className="text-gray-400 text-sm max-w-md mx-auto">
                        Speak the patient's full clinical notes — name, age, diagnosis, vitals, history, treatment plan, cost estimate.
                        AI will extract and fill <strong className="text-white">every field</strong> automatically.
                    </p>
                </div>

                <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4 text-left space-y-1 text-xs text-gray-400">
                    <div className="text-blue-300 font-semibold mb-2">🗣️ What to include in your dictation:</div>
                    {[
                        'Patient: name, age, gender, phone, city',
                        'Insurance: insurer name, TPA, policy number, sum insured',
                        'Presenting complaints and duration',
                        'Vitals: BP, pulse, temperature, SpO2, RR',
                        'Clinical examination findings',
                        'Investigation results (CBC, X-ray, etc.)',
                        'Past history: diabetes, hypertension, etc.',
                        'Diagnosis with reasoning',
                        'Treatment plan: IV antibiotics, O2, ICU, etc.',
                        'Expected stay and cost estimates',
                    ].map(t => <div key={t}>✓ {t}</div>)}
                </div>

                {phase === 'error' && (
                    <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm text-left">
                        ⚠️ {errorMsg}
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={onCancel}
                        className="flex-1 py-3 rounded-xl text-sm border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                        ← Back
                    </button>
                    <button onClick={startRecording}
                        className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white transition-all hover:scale-[1.02] shadow-lg shadow-red-900/40">
                        🎙️ Start Recording
                    </button>
                </div>
            </div>
        );
    }

    // ─── RECORDING ─────────────────────────────────────────────────────────────
    if (phase === 'recording') {
        return (
            <div className="space-y-5 text-center">
                <div className="space-y-3">
                    {/* Animated mic */}
                    <div className="relative inline-flex items-center justify-center">
                        <div className="absolute w-24 h-24 rounded-full bg-red-500/20 animate-ping" />
                        <div className="absolute w-20 h-20 rounded-full bg-red-500/30 animate-ping" style={{ animationDelay: '0.15s' }} />
                        <div className="relative w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-xl shadow-red-900/60">
                            <span className="text-2xl">🎙️</span>
                        </div>
                    </div>
                    <div className="text-red-400 font-mono text-lg">{formatElapsed(elapsed)}</div>
                    <div className="text-sm text-gray-300 font-semibold">Recording... Speak clearly</div>
                </div>

                {/* Live transcript */}
                <div className="bg-gray-900 border border-white/10 rounded-xl p-4 min-h-[120px] text-left text-sm font-mono leading-relaxed max-h-48 overflow-y-auto">
                    <span className="text-gray-300">{transcript}</span>
                    <span className="text-gray-500 italic">{interimText}</span>
                    {!transcript && !interimText && (
                        <span className="text-gray-600 italic">Listening for speech...</span>
                    )}
                </div>

                <div className="flex gap-3">
                    <button onClick={() => { stopRecording(); setPhase('idle'); setTranscript(''); }}
                        className="flex-1 py-3 rounded-xl text-sm border border-white/10 text-gray-400 hover:bg-white/5 transition-colors">
                        Discard
                    </button>
                    <button onClick={stopRecording}
                        className="flex-1 py-3 rounded-xl text-sm font-bold bg-gray-700 hover:bg-gray-600 text-white border border-white/10 transition-colors">
                        ⏹ Stop Recording
                    </button>
                </div>
            </div>
        );
    }

    // ─── RECORDED (review transcript before processing) ────────────────────────
    if (phase === 'recorded') {
        return (
            <div className="space-y-4">
                <div>
                    <h2 className="text-lg font-bold text-white">Recording Complete</h2>
                    <p className="text-gray-400 text-sm mt-1">Review or edit the transcript, then let AI extract all fields.</p>
                </div>

                <div className="flex gap-2">
                    <button onClick={() => setEditMode(e => !e)}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${editMode ? 'border-blue-500 text-blue-300 bg-blue-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}>
                        {editMode ? '✓ Editing' : '✏️ Edit transcript'}
                    </button>
                    <button onClick={() => { setTranscript(''); setPhase('idle'); }}
                        className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-gray-500 hover:text-white transition-colors">
                        🔄 Re-record
                    </button>
                    <button onClick={startRecording}
                        className="px-3 py-1.5 rounded-lg text-xs border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors">
                        ➕ Add more
                    </button>
                </div>

                {editMode ? (
                    <textarea
                        ref={textareaRef}
                        value={transcript}
                        onChange={e => setTranscript(e.target.value)}
                        rows={10}
                        className="w-full bg-gray-900 border border-blue-500/40 rounded-xl px-4 py-3 text-sm text-gray-200 font-mono focus:outline-none resize-none"
                    />
                ) : (
                    <div className="bg-gray-900 border border-white/10 rounded-xl p-4 text-sm font-mono text-gray-300 leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
                        {transcript || <span className="text-gray-600 italic">No speech captured</span>}
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={() => setPhase('idle')}
                        className="flex-1 py-3 rounded-xl text-sm border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                        ← Back
                    </button>
                    <button onClick={processWithAI} disabled={!transcript.trim()}
                        className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                        ✨ Process with AI →
                    </button>
                </div>
            </div>
        );
    }

    // ─── PROCESSING ────────────────────────────────────────────────────────────
    if (phase === 'processing') {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-6">
                <div className="relative">
                    <div className="w-20 h-20 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center text-2xl">🧠</div>
                </div>
                <div className="text-center space-y-2">
                    <div className="text-white font-bold">Gemini AI is extracting clinical data...</div>
                    <div className="text-gray-400 text-sm">Parsing patient details, vitals, diagnosis, treatment plan, and cost estimates</div>
                </div>
                <div className="flex gap-1.5">
                    {['Patient', 'Clinical', 'Admission', 'Billing'].map((label, i) => (
                        <div key={label} className="flex items-center gap-1 text-xs text-gray-500">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                            {label}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ─── REVIEW ────────────────────────────────────────────────────────────────
    if (phase === 'review' && extracted) {
        const { patient, insurance, clinical, admission } = extracted;
        const vitals = clinical.vitals;
        const dx = clinical.diagnoses?.[0];
        const pmh = admission.pastMedicalHistory;
        const presentConditions = pmh ? Object.entries(pmh).filter(([, v]: any) => v?.present).map(([k]) => k) : [];

        return (
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-base">✅</div>
                    <div>
                        <h2 className="text-lg font-bold text-white">AI Extraction Complete</h2>
                        <p className="text-gray-400 text-xs">Review extracted data, then confirm to fill all wizard fields</p>
                    </div>
                </div>

                <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">

                    {/* Patient */}
                    <Section title="👤 Patient Details" color="blue">
                        <FIELD_ROW label="Name" value={patient.patientName} />
                        <FIELD_ROW label="Age / Gender" value={patient.age ? `${patient.age}Y · ${patient.gender ?? ''}` : null} />
                        <FIELD_ROW label="Phone" value={patient.mobileNumber} />
                        <FIELD_ROW label="City" value={patient.city} />
                        <FIELD_ROW label="Address" value={patient.address} />
                        <FIELD_ROW label="Occupation" value={patient.occupation} />
                    </Section>

                    {/* Insurance */}
                    <Section title="🏥 Insurance Details" color="purple">
                        <FIELD_ROW label="Insurer" value={insurance.insurerName} />
                        <FIELD_ROW label="TPA" value={insurance.tpaName} />
                        <FIELD_ROW label="Policy No." value={insurance.policyNumber} />
                        <FIELD_ROW label="Sum Insured" value={insurance.sumInsured ? `₹${insurance.sumInsured.toLocaleString('en-IN')}` : null} />
                    </Section>

                    {/* Clinical */}
                    <Section title="🩺 Clinical Details" color="cyan">
                        <FIELD_ROW label="Chief Complaints" value={clinical.chiefComplaints} />
                        <FIELD_ROW label="Duration" value={clinical.durationOfPresentAilment} />
                        <FIELD_ROW label="Nature" value={clinical.natureOfIllness} />
                        {dx && <FIELD_ROW label="Primary Diagnosis" value={`${dx.diagnosis} (${dx.icd10Code})`} />}
                        {clinical.diagnoses && clinical.diagnoses.length > 1 && (
                            <FIELD_ROW label="Other Diagnoses" value={clinical.diagnoses.slice(1).map(d => d.diagnosis).join(', ')} />
                        )}
                        <FIELD_ROW label="History" value={clinical.historyOfPresentIllness} />
                        <FIELD_ROW label="Exam Findings" value={clinical.relevantClinicalFindings} />
                        <FIELD_ROW label="Prior Treatment" value={clinical.treatmentTakenSoFar} />
                        <FIELD_ROW label="OPD Justification" value={clinical.reasonForHospitalisation} />
                    </Section>

                    {/* Vitals */}
                    {vitals && (vitals.bp || vitals.pulse || vitals.spo2) && (
                        <Section title="💊 Vitals" color="amber">
                            <div className="grid grid-cols-5 gap-2">
                                {([['BP', vitals.bp], ['Pulse', vitals.pulse], ['Temp', vitals.temp ? `${vitals.temp}°F` : ''], ['SpO2', vitals.spo2 ? `${vitals.spo2}%` : ''], ['RR', vitals.rr]] as [string, string][]).map(([l, v]) => v ? (
                                    <div key={l} className={`bg-gray-900 rounded-lg p-2 text-center ${l === 'SpO2' && parseInt(v) < 94 ? 'border border-red-500/60' : ''}`}>
                                        <div className={`text-sm font-bold ${l === 'SpO2' && parseInt(v) < 94 ? 'text-red-400' : 'text-white'}`}>{v}</div>
                                        <div className="text-gray-500 text-xs">{l}</div>
                                    </div>
                                ) : null)}
                            </div>
                            {vitals.spo2 && parseInt(vitals.spo2) < 94 && (
                                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-2 text-red-300 text-xs">
                                    ⚠️ SpO2 {vitals.spo2}% — Critical hypoxia. This strongly supports inpatient necessity.
                                </div>
                            )}
                        </Section>
                    )}

                    {/* Admission */}
                    <Section title="🏨 Admission & Stay" color="green">
                        <FIELD_ROW label="Type" value={admission.admissionType} />
                        <FIELD_ROW label="Room Category" value={admission.roomCategory} />
                        <FIELD_ROW label="Expected Stay" value={admission.expectedLengthOfStay ? `${admission.expectedLengthOfStay} days` : null} />
                        <FIELD_ROW label="ICU Days" value={admission.expectedDaysInICU ? `${admission.expectedDaysInICU} days` : null} />
                        {presentConditions.length > 0 && (
                            <FIELD_ROW label="Past History" value={presentConditions.join(', ')} />
                        )}
                    </Section>

                    {/* Treatment */}
                    {clinical.proposedLineOfTreatment && (
                        <Section title="💊 Treatment Plan" color="rose">
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(clinical.proposedLineOfTreatment).filter(([, v]) => v).map(([k]) => (
                                    <span key={k} className="px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded-lg text-xs text-blue-300 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                                ))}
                            </div>
                        </Section>
                    )}
                </div>

                <div className="flex gap-3 pt-1">
                    <button onClick={() => setPhase('recorded')}
                        className="flex-1 py-3 rounded-xl text-sm border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                        ← Re-process
                    </button>
                    <button onClick={confirmAndFill}
                        className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white transition-all hover:scale-[1.02]">
                        ✅ Fill All Fields & Continue →
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

// ─── Section wrapper ───────────────────────────────────────────────────────────
const COLOR_MAP: Record<string, string> = {
    blue: 'border-blue-500/20 bg-blue-900/5',
    purple: 'border-purple-500/20 bg-purple-900/5',
    cyan: 'border-cyan-500/20 bg-cyan-900/5',
    amber: 'border-amber-500/20 bg-amber-900/5',
    green: 'border-green-500/20 bg-green-900/5',
    rose: 'border-rose-500/20 bg-rose-900/5',
};

const Section: React.FC<{ title: string; color: string; children: React.ReactNode }> = ({ title, color, children }) => {
    const hasContent = React.Children.toArray(children).some(c => c !== null && c !== undefined && c !== false);
    if (!hasContent) return null;
    return (
        <div className={`rounded-xl border p-3 space-y-2 ${COLOR_MAP[color] ?? ''}`}>
            <div className="text-xs font-semibold text-gray-300 mb-1">{title}</div>
            {children}
        </div>
    );
};
