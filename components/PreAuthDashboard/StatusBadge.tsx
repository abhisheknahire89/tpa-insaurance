import React from 'react';
import { PreAuthRecord, PreAuthStatus } from '../../components/PreAuthWizard/types';

interface StatusBadgeProps {
    status: PreAuthStatus;
    className?: string;
}

const STATUS_CONFIG: Record<PreAuthStatus, { label: string; color: string; icon: string }> = {
    draft: { label: 'Draft', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30', icon: '📝' },
    pending_documents: { label: 'Pending Docs', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: '📎' },
    ready_to_submit: { label: 'Ready', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: '✅' },
    submitted: { label: 'Submitted', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: '⏳' },
    query_raised: { label: 'Query', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30', icon: '❓' },
    approved: { label: 'Approved', color: 'bg-green-500/20 text-green-300 border-green-500/30', icon: '✅' },
    denied: { label: 'Denied', color: 'bg-red-500/20 text-red-300 border-red-500/30', icon: '❌' },
    enhancement_requested: { label: 'Enhancement', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icon: '📈' },
    closed: { label: 'Closed', color: 'bg-gray-600/20 text-gray-400 border-gray-600/30', icon: '🔒' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color} ${className}`}>
            <span>{cfg.icon}</span>
            {cfg.label}
        </span>
    );
};

export { STATUS_CONFIG };
