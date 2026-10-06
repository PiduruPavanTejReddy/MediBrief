import React, { useState } from 'react';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react';
import { 
  Shield, 
  FileText, 
  Bot, 
  Share2, 
  Stethoscope, 
  ArrowRight, 
  CheckCircle2, 
  Lock, 
  Camera, 
  Sparkles, 
  Menu, 
  X, 
  KeyRound, 
  ChevronRight,
  Database,
  History
} from 'lucide-react';

interface LandingPageProps {
  onPatientLogin: () => void;
  onDoctorAccess: () => void;
  onStaffLogin?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onPatientLogin, onDoctorAccess, onStaffLogin }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-900 selection:bg-teal-100 selection:text-teal-900">
      
      {/* Mobile-First Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 pt-safe">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden shadow-xs shrink-0 bg-slate-900 border border-slate-700/40">
              <img src="/app-icon.png" alt="MediBrief Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">MediBrief</span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-200">
                Healthcare AI
              </span>
            </div>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-2.5">
            <button
              onClick={onDoctorAccess}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-300 transition-colors flex items-center space-x-1.5 touch-press"
            >
              <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
              <span>Doctor Portal</span>
            </button>

            {onStaffLogin && (
              <button
                onClick={onStaffLogin}
                className="px-3.5 py-2 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-xl border border-teal-200 transition-colors touch-press"
              >
                Staff Login
              </button>
            )}

            <Show when="signed-in">
              <div className="flex items-center space-x-2">
                <button
                  onClick={onPatientLogin}
                  className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs shadow-teal-200 transition-colors touch-press"
                >
                  Enter Vault
                </button>
                <UserButton />
              </div>
            </Show>

            <button
              onClick={onPatientLogin}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors touch-press"
            >
              Patient Sign In
            </button>
          </div>

          {/* Mobile Right Action Bar */}
          <div className="flex md:hidden items-center space-x-2">
            <button
              onClick={onPatientLogin}
              className="h-10 px-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1 touch-press"
            >
              <span>Sign In</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 touch-press"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer / Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3 animate-in slide-in-from-top duration-200 shadow-xl">
            <div className="space-y-2">
              <button
                onClick={() => { setMobileMenuOpen(false); onPatientLogin(); }}
                className="w-full min-h-[48px] px-4 py-3 bg-teal-50 hover:bg-teal-100 text-teal-900 rounded-xl text-left text-sm font-bold flex items-center justify-between touch-press border border-teal-200"
              >
                <div className="flex items-center space-x-2.5">
                  <Shield className="w-4 h-4 text-teal-600" />
                  <span>Patient Login & OTP Vault</span>
                </div>
                <ChevronRight className="w-4 h-4 text-teal-600" />
              </button>

              <button
                onClick={() => { setMobileMenuOpen(false); onDoctorAccess(); }}
                className="w-full min-h-[48px] px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl text-left text-sm font-bold flex items-center justify-between touch-press border border-slate-200"
              >
                <div className="flex items-center space-x-2.5">
                  <Stethoscope className="w-4 h-4 text-teal-600" />
                  <span>Doctor Consultation Portal</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <Show when="signed-out">
                <div className="grid grid-cols-2 gap-2 w-full">
                  <SignInButton mode="modal">
                    <button className="min-h-[44px] w-full text-center py-2.5 text-xs font-bold text-teal-800 bg-slate-100 hover:bg-slate-200 rounded-xl touch-press">
                      Clerk Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="min-h-[44px] w-full text-center py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl touch-press shadow-xs">
                      Sign Up
                    </button>
                  </SignUpButton>
                </div>
              </Show>
              <Show when="signed-in">
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs text-slate-500 font-medium">Logged in with Clerk</span>
                  <UserButton />
                </div>
              </Show>
            </div>
          </div>
        )}
      </header>

      {/* Main Hero & Content */}
      <main className="flex-1">
        
        {/* Mobile-First Hero */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 sm:pb-16 text-center">
          
          {/* Trust / Product Badge */}
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-teal-50/80 border border-teal-200 text-teal-800 text-[11px] sm:text-xs font-semibold mb-6 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>AI-Powered Medical Records Management & Secure Sharing</span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15]">
            Your medical history, <br />
            <span className="text-teal-600">organized and understood.</span>
          </h1>

          {/* Supporting Text */}
          <p className="mt-4 sm:mt-6 text-sm sm:text-base md:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed px-1">
            Securely store your medical reports, understand your history with patient-scoped AI, and share selected records with doctors in seconds without giving away passwords.
          </p>

          {/* Action CTAs: Full width on mobile, 52-56px touch target */}
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-md sm:max-w-none mx-auto">
            <button
              onClick={onPatientLogin}
              className="w-full sm:w-auto min-h-[52px] sm:min-h-[54px] px-8 py-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-sm rounded-2xl shadow-md shadow-teal-600/20 transition-all flex items-center justify-center space-x-2 touch-press"
            >
              <span>Get Started as Patient</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onDoctorAccess}
              className="w-full sm:w-auto min-h-[52px] sm:min-h-[54px] px-8 py-3.5 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-bold text-sm rounded-2xl border border-slate-300 transition-all flex items-center justify-center space-x-2 shadow-xs touch-press"
            >
              <Stethoscope className="w-4 h-4 text-teal-600" />
              <span>Access Records with Doctor Code</span>
            </button>
          </div>

          {/* Quick Demo Account Helper Pill */}
          <div className="mt-6 max-w-sm sm:max-w-md mx-auto p-3 sm:p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex items-center justify-between text-left">
            <div>
              <span className="font-bold text-[11px] sm:text-xs text-slate-900 block">Pre-Seeded Demo Vault:</span>
              <span className="text-[11px] text-slate-500 font-mono">+91 98765 43210 (OTP: 123456)</span>
            </div>
            <button
              onClick={onPatientLogin}
              className="min-h-[40px] px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 active:bg-teal-200 text-xs font-bold rounded-xl border border-teal-200 transition-colors touch-press shrink-0"
            >
              Quick Test
            </button>
          </div>
        </section>

        {/* Compact, Elegant Feature Section */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
          <div className="text-center mb-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-teal-700">Capabilities</h2>
            <p className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">Designed for Patients & Physicians</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            
            {/* Feature 1 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-teal-300 transition-all flex flex-col justify-between space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Scan & Organize</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Capture physical reports with your camera or upload PDFs. Clinical OCR extracts test values, units, and ranges into a chronological timeline.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-teal-300 transition-all flex flex-col justify-between space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Understand With AI</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  MediVault AI uses strict patient-scoped RAG. Ask about your lab trends, medications, and imaging results with zero hallucination.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-teal-300 transition-all flex flex-col justify-between space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Share Securely</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Generate temporary 8-character access codes (e.g. M7K4-XP92) or QR codes. Doctors see only permitted records, revocable anytime.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-teal-300 transition-all flex flex-col justify-between space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Original Records</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Every AI response cites its verified source document. AI aids understanding, but original medical documents remain immutable.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy & Clinical Integrity Section */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
          <div className="bg-gradient-to-b from-teal-900 to-slate-900 text-white rounded-3xl p-6 sm:p-10 shadow-xl border border-teal-800/40 space-y-6">
            <div className="max-w-2xl text-center sm:text-left space-y-2">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-teal-800/50 text-teal-300 text-xs font-semibold">
                <Shield className="w-3.5 h-3.5" />
                <span>Zero-Compromise Security</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight">Built for Clinical Integrity & Patient Privacy</h3>
              <p className="text-xs sm:text-sm text-teal-100/90 leading-relaxed">
                Cryptographic session tokens, private file storage with signed expiring URLs, and strict query isolation ensure complete safety.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-white">Zero-Knowledge Sharing</h4>
                <p className="text-[11px] text-teal-200/80 leading-snug">
                  Doctors never need your password. Access is strictly scoped to chosen records.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-white">Source Citations</h4>
                <p className="text-[11px] text-teal-200/80 leading-snug">
                  Every AI insight links directly to verifiable pages of original uploaded medical reports.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center">
                  <History className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-white">Complete Audit History</h4>
                <p className="text-[11px] text-teal-200/80 leading-snug">
                  Every doctor access event and record view is tracked in your personal immutable audit log.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Mobile-Friendly Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 px-4 sm:px-6 text-center text-xs text-slate-500 space-y-3 pb-safe">
        <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 font-medium text-slate-600">
          <span className="font-bold text-slate-900">MediBrief</span>
          <a href="#privacy" className="hover:text-teal-600 transition-colors">Privacy</a>
          <a href="#security" className="hover:text-teal-600 transition-colors">Security</a>
          <a href="#terms" className="hover:text-teal-600 transition-colors">Terms</a>
          <a href="#contact" className="hover:text-teal-600 transition-colors">Contact</a>
        </div>

        <p>© 2026 MediBrief. Your medical history, organized and understood.</p>

        {/* Mandatory Clinical Disclaimer */}
        <div className="max-w-xl mx-auto p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-[11px] text-slate-400 leading-snug">
          Demo Prototype — Not for actual clinical emergency use. All sample medical data is synthetic.
        </div>
      </footer>
    </div>
  );
};
