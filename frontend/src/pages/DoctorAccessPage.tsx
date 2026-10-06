import React, { useState, useEffect } from 'react';
import { Stethoscope, Shield, ArrowRight, AlertCircle, CheckCircle2, QrCode } from 'lucide-react';
import { ApiService } from '../services/api';
import { useDoctor } from '../context/DoctorContext';

interface DoctorAccessPageProps {
  onAccessGranted: () => void;
  onBackToLanding: () => void;
}

export const DoctorAccessPage: React.FC<DoctorAccessPageProps> = ({
  onAccessGranted,
  onBackToLanding
}) => {
  const { loginDoctor } = useDoctor();
  const [accessCode, setAccessCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Check URL query parameters for ?code=... (QR code scanning flow)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam) {
      setAccessCode(codeParam.toUpperCase());
    }
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      const cleanCode = accessCode.trim().toUpperCase();
      const res = await ApiService.verifyDoctorCode(cleanCode);
      await loginDoctor(res.doctorToken, res.sharingSessionId, res.recordCount);
      onAccessGranted();
    } catch (err: any) {
      console.error('Doctor code verification failed:', err);
      setError(err.message || 'Invalid or revoked doctor access code. Please verify with the patient.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-3 sm:p-4 py-8 pt-safe pb-safe">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-700 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 sm:p-8 text-center bg-slate-800 text-white border-b border-slate-700">
          <div className="w-14 h-14 rounded-2xl overflow-hidden mx-auto mb-3 shadow-lg shadow-teal-500/20 bg-slate-900 border border-slate-700/50">
            <img src="/app-icon.png" alt="MediBrief App Icon" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">Doctor Consultation Portal</h2>
          <p className="text-xs text-slate-400 mt-1">
            Access authorized patient medical records via temporary sharing code
          </p>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center justify-between">
                <span>Enter Patient Access Code</span>
                <span className="text-[11px] text-slate-400 font-normal">Format: XXXX-XXXX</span>
              </label>
              <input
                type="text"
                autoFocus
                value={accessCode}
                onChange={e => setAccessCode(e.target.value.toUpperCase())}
                placeholder="e.g. M7K4-XP92"
                maxLength={9}
                className="w-full text-center tracking-widest font-mono text-xl font-extrabold px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 uppercase bg-slate-50 focus:bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || accessCode.trim().length < 4}
              className="w-full min-h-[50px] py-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 transition-all flex items-center justify-center space-x-2 touch-press"
            >
              <span>{isLoading ? 'Validating Session...' : 'Access Patient Records'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Security details box */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
            <div className="font-bold text-slate-900 flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-teal-600" />
              <span>Temporary Scoped Access</span>
            </div>
            <ul className="text-[11px] text-slate-500 space-y-1 list-disc list-inside">
              <li>No patient password required</li>
              <li>You only see records explicitly permitted by the patient</li>
              <li>Access can be revoked by the patient or ended by you</li>
              <li>All record views and AI inquiries are audit logged</li>
            </ul>
          </div>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={onBackToLanding}
              className="min-h-[44px] px-4 py-2 text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center justify-center touch-press"
            >
              ← Back to MediBrief Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
