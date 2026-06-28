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
    <div className="bg-gray-900 border border-white/10 rounded-2xl p-4 space-y-3.5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ICD-10 Diagnostic Coding (WHO Standard)</h4>
        {confirmed ? (
          <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-semibold">
            ✓ Confirmed
          </span>
        ) : (
          <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
            ⚠ Coding Required
          </span>
        )}
      </div>

      {/* Confirmed Code Display */}
      {confirmed && (
        <div className="bg-gray-800/40 border border-white/5 rounded-xl p-3 flex justify-between items-start text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-mono text-blue-300 font-bold text-sm">
              <span>🏷️ Code:</span>
              <span className="bg-blue-900/50 px-2 py-0.5 rounded border border-blue-500/30">{confirmed.code}</span>
            </div>
            <p className="text-gray-300 font-medium">{confirmed.desc}</p>
            <div className="text-[10px] text-gray-500">
              Assigned via <span className="uppercase text-gray-400 font-semibold">{confirmed.method.replace('_', ' ')}</span>
            </div>
          </div>
          <button
            onClick={() => setConfirmed(null)}
            className="text-[10px] text-red-400 hover:text-red-300 hover:underline"
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
              className="flex-1 bg-gray-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
              placeholder="Search ICD-10 description or code (e.g. pneumonia, E11)..."
            />
            {query.trim().length > 0 && (
              <button
                onClick={() => setQuery('')}
                className="px-2 py-1 text-xs text-gray-500 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* Candidates List */}
          {candidates.length > 0 && (
            <div className="bg-gray-950 border border-white/10 rounded-xl max-h-48 overflow-y-auto divide-y divide-white/5">
              {candidates.map((c) => (
                <div
                  key={c.code}
                  onClick={() => handleSelect(c)}
                  className={`p-2.5 text-xs cursor-pointer flex justify-between items-start transition-colors ${
                    selectedCandidate?.code === c.code
                      ? 'bg-blue-600/20 hover:bg-blue-600/30'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div className="space-y-0.5 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-blue-300">{c.code}</span>
                      <span className="text-gray-200">{c.description}</span>
                    </div>
                    {c.note && <span className="text-[10px] text-gray-500 italic">Note: {c.note}</span>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      c.confidence === 'high' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                      c.confidence === 'medium' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                      'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {c.confidence}
                    </span>
                    <span className="text-[8px] text-gray-500 uppercase">{c.matchMethod.replace('_', ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* AI Fallback trigger when rules return empty */}
          {candidates.length === 0 && query.trim().length > 2 && (
            <div className="flex items-center justify-between bg-gray-900/60 rounded-xl p-3 border border-white/5">
              <span className="text-xs text-gray-400">No official matching codes found.</span>
              <button
                onClick={handleAiFallback}
                disabled={loadingAi}
                className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white disabled:opacity-50 transition-all flex items-center gap-1.5"
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
            <div className="bg-blue-950/20 border border-blue-500/30 rounded-xl p-3.5 space-y-2.5">
              <div className="text-xs text-gray-300">
                Are you sure you want to select: <strong className="font-mono text-blue-300 font-bold">{selectedCandidate.code}</strong> - <strong>{selectedCandidate.description}</strong>?
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors"
                >
                  ✓ Confirm Selection
                </button>
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
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
