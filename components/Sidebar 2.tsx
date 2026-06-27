
import React, { useMemo, useState } from 'react';
import { PreCodedGpt, Chat, DoctorProfile } from '../types';
import { Icon } from './Icon';
import { MTP_PROTOCOL_JSON } from '../assets/mtpProtocol';
import { useAuth } from '../contexts/AuthContext';
import { User, LogOut, LogIn } from 'lucide-react';

interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    gpts: PreCodedGpt[];
    chats: Chat[];
    onNewChat: (gpt?: PreCodedGpt) => void;
    onSelectChat: (chatId: string) => void;
    activeChat: Chat | null;
    activeChatId: string | null;
    language: string;
    setLanguage: (language: string) => void;
    doctorProfile: DoctorProfile;
    setDoctorProfile: (profile: DoctorProfile) => void;
    onStartScribeSession: () => void;
    onStartInsuranceModule: () => void;
    activeView: 'chat' | 'scribe' | 'insurance';
    onShowPrintModal: () => void;
    onShowAboutModal: () => void;
    onGenerateCaseSummary: () => void;
    onShowAuthModal?: () => void;
}

const DoctorProfileSwitcher: React.FC<{
    profile: DoctorProfile;
    setProfile: (profile: DoctorProfile) => void;
}> = ({ profile, setProfile }) => {
    const profiles: DoctorProfile[] = [
        { qualification: 'BAMS', canPrescribeAllopathic: 'no' },
        { qualification: 'BHMS', canPrescribeAllopathic: 'no' },
        { qualification: 'MBBS', canPrescribeAllopathic: 'yes' },
    ];

    return (
        <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">
                Clinician Profile
            </label>
            <div className="flex bg-aivana-grey rounded-lg p-1 gap-1">
                {profiles.map(p => (
                    <button
                        key={p.qualification}
                        onClick={() => setProfile(p)}
                        className={`flex-1 text-xs px-2 py-1.5 rounded-md transition-colors ${profile.qualification === p.qualification ? 'bg-aivana-accent text-white font-semibold' : 'text-gray-400 hover:text-white hover:bg-aivana-light-grey'}`}
                    >
                        {p.qualification}
                    </button>
                ))}
            </div>
        </div>
    );
};

const LanguageSelector: React.FC<{ language: string; setLanguage: (lang: string) => void }> = ({ language, setLanguage }) => (
    <div className="mt-4">
        <label className="block text-xs font-medium text-gray-500 mb-2">
            Response Language
        </label>
        <div className="relative">
            <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-aivana-grey text-white text-sm rounded-lg border border-transparent px-3 py-2 appearance-none focus:ring-1 focus:ring-aivana-accent outline-none cursor-pointer hover:bg-aivana-light-grey transition-colors"
            >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Marathi">Marathi</option>
                <option value="Gujarati">Gujarati</option>
                <option value="Tamil">Tamil</option>
                <option value="Bengali">Bengali</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                <Icon name="chevronDown" className="w-4 h-4" />
            </div>
        </div>
    </div>
);

const UserMenu: React.FC<{ onShowAuthModal?: () => void }> = ({ onShowAuthModal }) => {
    const { user, logout } = useAuth();
    const [showMenu, setShowMenu] = useState(false);

    if (!user) {
        return (
            <button
                onClick={onShowAuthModal}
                className="w-full flex items-center gap-2 px-3 py-2 bg-aivana-accent hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
                <LogIn className="w-4 h-4" />
                <span>Login / Sign Up</span>
            </button>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={() => setShowMenu(!showMenu)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-aivana-grey hover:bg-aivana-light-grey text-white rounded-lg transition-colors text-sm"
            >
                <User className="w-4 h-4" />
                <span className="flex-1 text-left truncate">{user.firstName} {user.lastName}</span>
                <Icon name="chevronDown" className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
            </button>

            {showMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-aivana-grey border border-gray-700 rounded-lg shadow-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-700">
                        <p className="text-xs text-gray-400">Signed in as</p>
                        <p className="text-sm text-white truncate">{user.email}</p>
                    </div>
                    <button
                        onClick={() => {
                            logout();
                            setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-aivana-light-grey transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                    </button>
                </div>
            )}
        </div>
    );
};


export const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    setIsOpen,
    gpts,
    chats,
    onNewChat,
    onSelectChat,
    activeChat,
    activeChatId,
    language,
    setLanguage,
    doctorProfile,
    setDoctorProfile,
    onStartScribeSession,
    onStartInsuranceModule,
    activeView,
    onShowPrintModal,
    onShowAboutModal,
    onGenerateCaseSummary,
    onShowAuthModal,
}) => {
    const handleDownloadMtpJson = () => {
        const dataStr = JSON.stringify(MTP_PROTOCOL_JSON, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'general_sepsis_protocol.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const canGenerateSummary = activeChat && activeChat.messages.length > 0;

    const displayedGpts = useMemo(() => {
        const priorityIds = ['doctor-emergency', 'doctor-lab', 'doctor-risk-assessment'];
        const priority = gpts.filter(g => priorityIds.includes(g.id));
        const others = gpts.filter(g => !priorityIds.includes(g.id));
        return [...priority, ...others];
    }, [gpts]);

    return (
        <>
            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-60 z-20 md:hidden"
                    onClick={() => setIsOpen(false)}
                ></div>
            )}

            {/* Sidebar */}
            <div
                className={`fixed top-0 left-0 w-72 h-full bg-black z-30 transform transition-transform duration-300 ease-in-out border-r border-gray-800 no-print ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    } md:relative md:translate-x-0 md:flex-shrink-0 flex flex-col`}
            >
                {/* Header */}
                <div className="p-4 flex-shrink-0 flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                        <Icon name="logo" className="w-6 h-6 text-white" />
                        <span className="font-bold text-lg text-white">OPD Platform</span>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="md:hidden p-1 rounded-md hover:bg-gray-800 text-white">
                        <Icon name="close" className="w-6 h-6" />
                    </button>
                </div>

                {/* Primary Actions */}
                <div className="px-3 pb-4 flex-shrink-0 space-y-3">
                    <button
                        onClick={onStartScribeSession}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all border border-gray-800 ${activeView === 'scribe'
                            ? 'bg-gray-800 text-white'
                            : 'bg-[#1c1c1c] hover:bg-gray-800 text-gray-200'
                            }`}
                    >
                        <Icon name="sparkles" className="w-5 h-5 text-aivana-accent" />
                        <span className="font-medium text-sm">Start Veda Session</span>
                    </button>

                    <button
                        onClick={onStartInsuranceModule}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all border border-gray-800 ${activeView === 'insurance'
                            ? 'bg-gray-800 text-white'
                            : 'bg-[#1c1c1c] hover:bg-gray-800 text-gray-200'
                            }`}
                    >
                        <Icon name="document-text" className="w-5 h-5 text-blue-400" />
                        <span className="font-medium text-sm text-blue-400">Insurance Center</span>
                    </button>

                    <button
                        onClick={() => onNewChat()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-aivana-accent hover:bg-purple-700 text-white font-medium text-sm rounded-lg transition-colors"
                    >
                        <Icon name="newChat" className="w-5 h-5" />
                        New Chat
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6">

                    {/* Explore Section */}
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-2">Explore</h3>
                        <div className="space-y-1">
                            {displayedGpts.slice(0, 5).map((gpt) => (
                                <button
                                    key={gpt.id}
                                    onClick={() => onNewChat(gpt)}
                                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${activeChatId && chats.find(c => c.id === activeChatId)?.gptId === gpt.id
                                        ? 'bg-gray-800 text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                        }`}
                                >
                                    <div className="text-gray-500 group-hover:text-white transition-colors">
                                        {React.cloneElement(gpt.icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
                                    </div>
                                    <span className="text-sm truncate">
                                        {gpt.title}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tools Section */}
                    <div className="mt-4">
                        <div className="space-y-1">
                            <button
                                onClick={onGenerateCaseSummary}
                                disabled={!canGenerateSummary}
                                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-50"
                            >
                                <Icon name="document-text" className="w-4 h-4" />
                                <span className="text-sm">Case Summary</span>
                            </button>
                            <button
                                onClick={onShowPrintModal}
                                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800"
                            >
                                <Icon name="print" className="w-4 h-4" />
                                <span className="text-sm">Print Cards</span>
                            </button>
                            <button
                                onClick={handleDownloadMtpJson}
                                className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800"
                            >
                                <Icon name="download" className="w-4 h-4" />
                                <span className="text-sm">Download Protocol JSON</span>
                            </button>
                        </div>
                    </div>

                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800 flex-shrink-0 bg-black space-y-3">
                    {/* User Menu */}
                    <UserMenu onShowAuthModal={onShowAuthModal} />

                    <DoctorProfileSwitcher profile={doctorProfile} setProfile={setDoctorProfile} />
                    <LanguageSelector language={language} setLanguage={setLanguage} />
                </div>
            </div>
        </>
    );
};
