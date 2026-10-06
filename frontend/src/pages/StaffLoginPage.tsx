import React from 'react';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react';
import { Stethoscope, Shield, ArrowRight, Lock, Hospital, ArrowLeft, KeyRound, CheckCircle2 } from 'lucide-react';

interface StaffLoginPageProps {
  onBackToPatient: () => void;
  onBackToLanding: () => void;
  onDoctorAccess: () => void;
}

export const StaffLoginPage: React.FC<StaffLoginPageProps> = ({
  onBackToPatient,
  onBackToLanding,
  onDoctorAccess
}) => {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-3 sm:p-4 py-8 pt-safe pb-safe selection:bg-teal-500 selection:text-slate-950">
      
      {/* Top back navigation */}
      <div className="w-full max-w-md mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToLanding}
          className="text-xs text-slate-400 hover:text-white flex items-center space-x-1 font-medium transition-colors py-1.5 touch-press"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>MediBrief Home</span>
        </button>

        <button
          type="button"
          onClick={onBackToPatient}
          className="text-xs text-teal-400 hover:text-teal-300 font-semibold transition-colors py-1.5 touch-press"
        >
          Patient Login →
        </button>
      </div>

      {/* Main Staff Card */}
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-700/60 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-6 sm:p-8 text-center bg-slate-800 text-white border-b border-slate-700 relative">
          <div className="w-14 h-14 rounded-2xl overflow-hidden mx-auto mb-3 shadow-lg shadow-teal-500/20 bg-slate-900 border border-slate-700/50">
            <img src="/app-icon.png" alt="MediBrief App Icon" className="w-full h-full object-cover" />
          </div>
          <span className="inline-block text-[10px] font-extrabold uppercase tracking-widest text-teal-300 bg-teal-950/60 px-2.5 py-0.5 rounded-full border border-teal-500/30 mb-2">
            Clinical & Hospital Staff
          </span>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Staff Portal Sign In
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto leading-relaxed">
            Provider authentication for doctors, clinical clerks, and healthcare administrators
          </p>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 space-y-6">
          
          {/* Clerk Provider Authentication */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Lock className="w-3.5 h-3.5 text-teal-600" />
              <span>Hospital Staff Single Sign-On</span>
            </div>

            <Show when="signed-out">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Sign in using your institutional email or Clerk staff account credentials.
                </p>

                <div className="space-y-2 pt-1">
                  <SignInButton mode="modal">
                    <button className="w-full min-h-[48px] py-3 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 transition-all flex items-center justify-center space-x-2 touch-press">
                      <Hospital className="w-4 h-4" />
                      <span>Sign In with Clerk (Staff)</span>
                    </button>
                  </SignInButton>

                  <SignUpButton mode="modal">
                    <button className="w-full min-h-[44px] py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-1 touch-press">
                      <span>Register Staff Account</span>
                    </button>
                  </SignUpButton>
                </div>
              </div>
            </Show>

            <Show when="signed-in">
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    <span className="text-xs font-bold text-teal-900">Authenticated via Clerk</span>
                  </div>
                  <UserButton />
                </div>
                <p className="text-xs text-teal-800">
                  Your staff session is active. You have clinical consultation privileges.
                </p>
              </div>
            </Show>
          </div>

          {/* Divider */}
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-slate-400 text-[10px] font-bold uppercase tracking-wider">or patient consultation code</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Quick Doctor Sharing Access Code Option */}
          <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5">
            <div className="flex items-center space-x-2">
              <KeyRound className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-bold text-slate-800">Temporary Access Code</span>
            </div>
            <p className="text-xs text-slate-500 leading-snug">
              Have a patient sharing access code (e.g. <code>XXXX-XXXX</code>)? Access the consultation session directly.
            </p>
            <button
              type="button"
              onClick={onDoctorAccess}
              className="w-full min-h-[44px] py-2.5 bg-slate-800 hover:bg-slate-900 active:bg-black text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-1.5 touch-press"
            >
              <span>Enter Patient Access Code</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Patient Redirect Link */}
          <div className="pt-2 text-center border-t border-slate-100">
            <button
              type="button"
              onClick={onBackToPatient}
              className="text-xs text-slate-600 hover:text-teal-700 font-semibold transition-colors inline-flex items-center space-x-1 py-1 touch-press"
            >
              <span>Are you a patient?</span>
              <span className="text-teal-600 underline font-bold ml-1">Patient Sign In →</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
