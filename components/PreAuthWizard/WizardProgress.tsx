import React from 'react';

interface WizardProgressProps {
    currentStep: 1 | 2 | 3 | 4;
    onStepClick?: (step: 1 | 2 | 3 | 4) => void;
}

const STEPS = [
    { n: 1, label: 'Patient & Insurance', icon: '👤' },
    { n: 2, label: 'Clinical Details', icon: '🩺' },
    { n: 3, label: 'Admission & Cost', icon: '🏥' },
    { n: 4, label: 'Documents & Generate', icon: '📄' },
] as const;

export const WizardProgress: React.FC<WizardProgressProps> = ({ currentStep, onStepClick }) => (
    <div className="flex items-center justify-between px-2">
        {STEPS.map((step, idx) => {
            const done = step.n < currentStep;
            const active = step.n === currentStep;
            return (
                <React.Fragment key={step.n}>
                    <button
                        className={`flex flex-col items-center gap-1 group ${onStepClick && done ? 'cursor-pointer' : 'cursor-default'}`}
                        onClick={() => onStepClick && done && onStepClick(step.n as any)}
                        disabled={!done}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-2 transition-all
              ${done ? 'bg-green-500/20 border-green-500 text-green-400' :
                                active ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30' :
                                    'bg-gray-800 border-gray-600 text-gray-500'}`}>
                            {done ? '✓' : step.icon}
                        </div>
                        <span className={`text-xs font-medium text-center max-w-[80px] leading-tight
              ${active ? 'text-blue-300' : done ? 'text-green-400' : 'text-gray-500'}`}>
                            {step.label}
                        </span>
                    </button>
                    {idx < STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-2 mb-4 transition-colors
              ${step.n < currentStep ? 'bg-green-500' : 'bg-gray-700'}`} />
                    )}
                </React.Fragment>
            );
        })}
    </div>
);
