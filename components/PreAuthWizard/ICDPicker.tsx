import React, { useState, useEffect } from 'react';
import { lookupICD, assignICDViaModel, IcdCandidate, validateCode } from '../../services/icdService';
import { logIcdAssignment } from '../../utils/auditLogger';

interface ICDPickerProps {
  caseId: string;
  diagnosisText: string;
  clinicalContext?: string;
  initialCode?: string;
  initialDescription?: string;
  initialMatchMethod?: string;
  onConfirm: (code: string, description: string, matchMethod: string) => void;
  doctorName?: string;
}

export const ICDPicker: React.FC<ICDPickerProps> = ({
  caseId,
  diagnosisText,
  clinicalContext = '',
  initialCode = '',
  initialDescription = '',
  initialMatchMethod = '',
  onConfirm,
  doctorName = 'Dr. Kumar'
}) => {
  const [query, setQuery] = useState(diagnosisText || '');
  const [candidates, setCandidates] = useState<IcdCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<IcdCandidate | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [confirmed, setConfirmed] = useState<{ code: string; desc: string; method: string } | null>(
    initialCode && validateCode(initialCode)
      ? { code: initialCode, desc: initialDescription, method: initialMatchMethod || 'manual' }
      : null
  );

  // Run deterministic lookup as typing happens
  useEffect(() => {
    if (query.trim().length > 1) {
      const results = lookupICD(query);
      setCandidates(results);
    } else {
      setCandidates([]);
    }
  }, [query]);

  const handleAiFallback = async () => {
    setLoadingAi(true);
    try {
      const results = await assignICDViaModel(diagnosisText, clinicalContext);
      setCandidates(results);
    } catch (err) {
      console.error('Error in AI fallback lookup:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSelect = (candidate: IcdCandidate) => {
    setSelectedCandidate(candidate);
  };

  const handleConfirm = () => {
    if (!selectedCandidate) return;

    // Log the assignment to audit ledger
    logIcdAssignment({
      caseId,
      inputText: query,
      candidatesShown: candidates.map(c => `${c.code}:${c.description}`),
      chosenCode: selectedCandidate.code,
      matchMethod: selectedCandidate.matchMethod,
      confirmedBy: doctorName
    });

    const newConfirmation = {
      code: selectedCandidate.code,
      desc: selectedCandidate.description,
      method: selectedCandidate.matchMethod
    };

    setConfirmed(newConfirmation);
    onConfirm(selectedCandidate.code, selectedCandidate.description, selectedCandidate.matchMethod);
    setSelectedCandidate(null);
    setCandidates([]);
  };

  return (
    <div className="bg-gray-950/40 border border-white/5 rounded-2xl p-4 space-y-3.5">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ICD-10 Diagnostic Coding (WHO Standard)</h4>
        {confirmed ? (
          <span className="text-[9px] uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/10 px-2 py-0.5 rounded-full font-bold">
            Confirmed
          </span>
        ) : (
          <span className="text-[9px] uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/10 px-2 py-0.5 rounded-full font-bold">
            Coding Required
          </span>
        )}
      </div>

      {/* Confirmed Code Display */}
      {confirmed && (
        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3.5 flex justify-between items-start text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-mono text-emerald-300 font-bold text-sm">
              <span>🏷️ Code:</span>
              <span className="bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/20">{confirmed.code}</span>
            </div>
            <p className="text-gray-300 font-semibold text-xs mt-1">{confirmed.desc}</p>
            <div className="text-[10px] text-gray-500 mt-1">
              Assigned via <span className="uppercase text-gray-400 font-bold">{confirmed.method.replace('_', ' ')}</span>
            </div>
          </div>
          <button
            onClick={() => setConfirmed(null)}
            className="text-[10px] text-rose-400 hover:text-rose-300 font-bold hover:underline transition-colors"
            type="button"
          >
            Reset
          </button>
        </div>
      )}

      {/* Input Selector (Only show if not confirmed) */}
      {!confirmed && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-gray-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              placeholder="Search ICD-10 description or code (e.g. pneumonia)..."
            />
            {query.trim().length > 0 && (
              <button
                onClick={() => setQuery('')}
                className="px-2 py-1 text-xs text-gray-500 hover:text-white transition-colors"
                type="button"
              >
                Clear
              </button>
            )}
          </div>

          {/* Candidates List */}
          {candidates.length > 0 && (
            <div className="bg-gray-900/50 border border-white/5 rounded-xl max-h-48 overflow-y-auto divide-y divide-white/5">
              {candidates.map((c) => (
                <div
                  key={c.code}
                  onClick={() => handleSelect(c)}
                  className={`p-2.5 text-xs cursor-pointer flex justify-between items-start transition-colors ${
                    selectedCandidate?.code === c.code
                      ? 'bg-blue-600/10 hover:bg-blue-600/25'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div className="space-y-0.5 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-blue-400">{c.code}</span>
                      <span className="text-gray-200 font-medium">{c.description}</span>
                    </div>
                    {c.note && <span className="text-[10px] text-gray-500 italic">Note: {c.note}</span>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      c.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/10' :
                      c.confidence === 'medium' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/10' :
                      'bg-amber-500/15 text-amber-400 border border-amber-500/10'
                    }`}>
                      {c.confidence}
                    </span>
                    <span className="text-[8px] text-gray-500 uppercase font-semibold">{c.matchMethod.replace('_', ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* AI Fallback trigger when rules return empty */}
          {candidates.length === 0 && query.trim().length > 2 && (
            <div className="flex items-center justify-between bg-gray-900/40 rounded-xl p-3 border border-white/5">
              <span className="text-xs text-gray-400">No official matching codes found.</span>
              <button
                onClick={handleAiFallback}
                disabled={loadingAi}
                className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/10"
                type="button"
              >
                {loadingAi ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Coding...</span>
                  </>
                ) : (
                  <>
                    <span>🤖 Ask MedGemma Fallback</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Selected Candidate Confirmation Details */}
          {selectedCandidate && (
            <div className="bg-blue-950/10 border border-blue-500/20 rounded-xl p-3.5 space-y-2.5">
              <div className="text-xs text-gray-300">
                Are you sure you want to select: <strong className="font-mono text-blue-400 font-bold">{selectedCandidate.code}</strong> - <strong>{selectedCandidate.description}</strong>?
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  type="button"
                >
                  ✓ Confirm Selection
                </button>
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-gray-900 border border-white/10 hover:bg-gray-800 text-gray-300 transition-colors"
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
