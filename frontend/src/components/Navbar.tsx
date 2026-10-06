import React, { useState } from 'react';
import { Show, UserButton } from '@clerk/react';
import { 
  Shield, 
  FileText, 
  Bot, 
  Share2, 
  History, 
  LogOut, 
  Stethoscope, 
  User as UserIcon, 
  Menu, 
  X, 
  ChevronRight,
  Activity,
  Heart,
  Phone,
  Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatAge } from '../utils/dateUtils';
import { useKeyboard } from '../utils/useKeyboard';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenDoctorPortal: () => void;
  onOpenEditProfile?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  currentTab, 
  setCurrentTab, 
  onOpenDoctorPortal,
  onOpenEditProfile
}) => {
  const { profile, user, logout } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const { isKeyboardOpen } = useKeyboard();

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: FileText },
    { id: 'records', label: 'Timeline', icon: Activity },
    { id: 'ai', label: 'MediVault AI', icon: Bot },
    { id: 'sharing', label: 'Share', icon: Share2 }
  ];

  return (
    <>
      {/* Top Mobile & Desktop Header */}
      <header className={`sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 pt-safe ${currentTab === 'ai' ? 'hidden md:block' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-15 sm:h-16 flex items-center justify-between">
          
          {/* Logo & Brand */}
          <div 
            className="flex items-center space-x-2.5 cursor-pointer select-none touch-press"
            onClick={() => setCurrentTab('dashboard')}
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden shadow-xs shrink-0 bg-slate-900 border border-slate-700/40">
              <img src="/app-icon.png" alt="MediBrief Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">MediBrief</span>
                <span className="text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-200">
                  VAULT
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden lg:block -mt-0.5">Your medical history, organized and understood</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 touch-press ${
                    isActive
                      ? 'bg-teal-50 text-teal-800 shadow-2xs border border-teal-200/70'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              onClick={() => setCurrentTab('audit')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 touch-press ${
                currentTab === 'audit'
                  ? 'bg-teal-50 text-teal-800 shadow-2xs border border-teal-200/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <History className="w-4 h-4 text-slate-400" />
              <span>Audit Log</span>
            </button>
          </nav>

          {/* Right Action Bar */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            
            {/* Desktop Doctor Portal Switcher */}
            <button
              onClick={onOpenDoctorPortal}
              className="hidden lg:flex items-center space-x-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl border border-slate-300 transition-colors touch-press"
              title="Open Doctor Consultation Portal"
            >
              <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
              <span>Doctor Portal</span>
            </button>

            {/* Profile Avatar Pill */}
            {profile ? (
              <div 
                onClick={() => setMobileDrawerOpen(true)}
                className="flex items-center space-x-2 cursor-pointer p-1 sm:px-2 sm:py-1 rounded-xl hover:bg-slate-100 transition-colors touch-press"
              >
                <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {profile.full_name?.charAt(0) || 'P'}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-slate-800 leading-tight max-w-[120px] truncate">
                    {profile.full_name}
                  </div>
                  <div className="text-[10px] text-teal-700 font-semibold">
                    {profile.blood_group}
                  </div>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => setMobileDrawerOpen(true)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors"
              >
                <UserIcon className="w-4 h-4" />
              </div>
            )}

            {/* Clerk User Button if signed in via Clerk */}
            <Show when="signed-in">
              <div className="pl-1 hidden sm:block">
                <UserButton />
              </div>
            </Show>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open menu drawer"
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 touch-press"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop Logout Button */}
            <button
              onClick={logout}
              className="hidden md:flex items-center space-x-1 px-3 py-2 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-bold transition-colors shadow-2xs touch-press"
              title="Sign Out of MediBrief Vault"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer / Slide-over Menu Sheet */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex justify-end animate-in fade-in duration-200">
          <div 
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileDrawerOpen(false)}
          />

          <div className="relative w-4/5 max-w-sm bg-white h-full shadow-2xl z-10 flex flex-col justify-between p-6 animate-in slide-in-from-right duration-200 pt-safe pb-safe">
            <div className="space-y-6">
              
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                    {profile?.full_name?.charAt(0) || 'P'}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      {profile?.full_name || 'Patient'}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {user?.mobile_number || 'Verified Vault'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center touch-press"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Patient Quick Vitals Card */}
              {profile && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient Summary</div>
                    {onOpenEditProfile && (
                      <button
                        onClick={() => { setMobileDrawerOpen(false); onOpenEditProfile(); }}
                        className="text-[10px] font-bold text-teal-700 hover:text-teal-800 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200 touch-press"
                      >
                        Edit Profile
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white p-2 rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Blood Group</span>
                      <strong className="text-teal-700">{profile.blood_group}</strong>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Age</span>
                      <strong className="text-slate-800">{formatAge(profile.date_of_birth, { short: true })}</strong>
                    </div>
                  </div>
                  {profile.emergency_contact && (
                    <div className="text-[11px] text-slate-600 pt-1 flex items-center space-x-1.5">
                      <Phone className="w-3 h-3 text-teal-600 shrink-0" />
                      <span className="truncate">Emergency: <strong>{profile.emergency_contact}</strong></span>
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Links */}
              <div className="space-y-1.5">
                <button
                  onClick={() => { setMobileDrawerOpen(false); setCurrentTab('dashboard'); }}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between touch-press ${
                    currentTab === 'dashboard' ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <FileText className="w-4 h-4 text-teal-600" />
                    <span>Medical Dashboard</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => { setMobileDrawerOpen(false); setCurrentTab('records'); }}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between touch-press ${
                    currentTab === 'records' ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Activity className="w-4 h-4 text-teal-600" />
                    <span>Chronological Timeline</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => { setMobileDrawerOpen(false); setCurrentTab('ai'); }}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between touch-press ${
                    currentTab === 'ai' ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Bot className="w-4 h-4 text-teal-600" />
                    <span>MediVault AI Inquiries</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => { setMobileDrawerOpen(false); setCurrentTab('sharing'); }}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between touch-press ${
                    currentTab === 'sharing' ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Share2 className="w-4 h-4 text-teal-600" />
                    <span>Share With Doctor (Code / QR)</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => { setMobileDrawerOpen(false); setCurrentTab('audit'); }}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between touch-press ${
                    currentTab === 'audit' ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <History className="w-4 h-4 text-slate-500" />
                    <span>Access History & Audit Log</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => { setMobileDrawerOpen(false); onOpenDoctorPortal(); }}
                    className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-between touch-press border border-slate-300"
                  >
                    <div className="flex items-center space-x-2.5">
                      <Stethoscope className="w-4 h-4 text-teal-600" />
                      <span>Doctor Consultation Portal</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Logout Action in Mobile Drawer */}
            <div className="pt-4 border-t border-slate-100">
              <button
                onClick={() => { setMobileDrawerOpen(false); logout(); }}
                className="w-full min-h-[48px] py-3 px-4 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 border border-rose-200 transition-colors touch-press"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out of MediBrief</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Apple Health Style) */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 pb-safe shadow-lg transition-all duration-150 ${isKeyboardOpen ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
        <div className="grid grid-cols-4 h-15">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`flex flex-col items-center justify-center touch-press min-h-[44px] py-1 ${
                  isActive ? 'text-teal-600 font-bold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <div className={`p-1 rounded-xl transition-all ${isActive ? 'bg-teal-50 text-teal-600' : ''}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
