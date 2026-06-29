import React from 'react';

interface WizardProgressProps {
    currentStep: 1 | 2 | 3 | 4;
    onStepClick?: (step: 1 | 2 | 3 | 4) => void;
}

const STEPS = [
    {
        n: 1,
        label: 'Patient & Insurance',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
        )
    },
    {
        n: 2,
        label: 'Clinical Details',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
        )
    },
    {
        n: 3,
        label: 'Admission & Cost',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.053.2-7.5.582V21M3 21h18" />
            </svg>
        )
    },
    {
        n: 4,
        label: 'Documents & Generate',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
        )
    },
] as const;

export const WizardProgress: React.FC<WizardProgressProps> = ({ currentStep, onStepClick }) => (
    <div className="flex items-center justify-between px-2 select-none">
        {STEPS.map((step, idx) => {
            const done = step.n < currentStep;
            const active = step.n === currentStep;
            return (
                <React.Fragment key={step.n}>
                    <button
                        className={`flex flex-col items-center gap-2 group transition-all outline-none ${onStepClick && done ? 'cursor-pointer' : 'cursor-default'}`}
                        onClick={() => onStepClick && done && onStepClick(step.n as any)}
                        disabled={!done}
                        type="button"
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
              ${done ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 group-hover:bg-emerald-500/25 group-hover:scale-105' :
                                active ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/20 scale-105' :
                                    'bg-gray-900 border-white/10 text-gray-500'}`}>
                            {done ? (
                                <svg className="w-5 h-5 stroke-current" fill="none" strokeWidth="3" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                            ) : (
                                step.icon
                            )}
                        </div>
                        <span className={`text-[11px] font-semibold text-center max-w-[85px] leading-tight transition-colors duration-300
              ${active ? 'text-blue-400' : done ? 'text-emerald-400 group-hover:text-emerald-300' : 'text-gray-500'}`}>
                            {step.label}
                        </span>
                    </button>
                    {idx < STEPS.length - 1 && (
                        <div className={`flex-1 h-[2px] mx-4 mb-6 rounded-full transition-colors duration-500
              ${step.n < currentStep ? 'bg-emerald-500 shadow-sm shadow-emerald-500/35' : 'bg-white/5'}`} />
                    )}
                </React.Fragment>
            );
        })}
    </div>
);
