import React, { useState, useEffect, useMemo } from 'react';
import { Shield, Smartphone, KeyRound, ArrowRight, AlertCircle, CheckCircle2, RefreshCw, Calendar, Heart, Phone, User, Loader2, ArrowLeft } from 'lucide-react';
import { ApiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { calculateAge, getTodayDateString } from '../utils/dateUtils';

interface PatientLoginPageProps {
  onSuccess: () => void;
  onBackToLanding: () => void;
  onStaffLogin: () => void;
}

type AuthStatus =
  | 'idle'
  | 'sending'
  | 'otp_sent'
  | 'verifying'
  | 'invalid_phone'
  | 'sms_delivery_failed'
  | 'otp_expired'
  | 'incorrect_otp'
  | 'too_many_attempts';

function maskPhoneNumber(num: string): string {
  const cleaned = num.trim();
  if (cleaned.length < 8) return cleaned;
  // If starts with country code like +91
  if (cleaned.startsWith('+')) {
    const countryCode = cleaned.slice(0, 3);
    const rest = cleaned.slice(3).replace(/\s+/g, '');
    if (rest.length >= 6) {
      const start = rest.slice(0, 2);
      const end = rest.slice(-2);
      return `${countryCode} ${start}••• ••${end}`;
    }
  }
  const start = cleaned.slice(0, 3);
  const end = cleaned.slice(-2);
  return `${start}••••••${end}`;
}

export const PatientLoginPage: React.FC<PatientLoginPageProps> = ({
  onSuccess,
  onBackToLanding,
  onStaffLogin
}) => {
  const { login } = useAuth();
  
  const [mobileNumber, setMobileNumber] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [step, setStep] = useState<'mobile' | 'otp' | 'onboarding'>('mobile');
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Resend timer
  const [resendCountdown, setResendCountdown] = useState<number>(60);
  const [canResend, setCanResend] = useState<boolean>(false);

  // Dev / sandbox OTP preview (dev testing only)
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  // Patient onboarding profile state (shown ONLY for newly registered patients)
  const [onboardingData, setOnboardingData] = useState({
    fullName: '',
    dateOfBirth: '',
    bloodGroup: 'Unknown',
    emergencyContact: '',
    email: '',
    address: ''
  });

  const [pendingSession, setPendingSession] = useState<{ token: string; user: any; profile: any } | null>(null);

  const calculatedAge = useMemo(() => {
    return calculateAge(onboardingData.dateOfBirth);
  }, [onboardingData.dateOfBirth]);

  const maxDate = useMemo(() => getTodayDateString(), []);

  // Countdown timer for resending OTP
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (step === 'otp' && resendCountdown > 0) {
      timer = setInterval(() => {
        setResendCountdown(prev => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, resendCountdown]);

  // Clean and format mobile input
  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMobileNumber(val);
    if (status === 'invalid_phone' || errorMessage) {
      setErrorMessage(null);
      setStatus('idle');
    }
  };

  // STEP 1: Send OTP
  const handleSendOtp = async (targetNumber?: string) => {
    const rawNumber = (targetNumber || mobileNumber).trim();
    if (!rawNumber) {
      setStatus('invalid_phone');
      setErrorMessage('Please enter your mobile phone number.');
      return;
    }

    // Basic format validation
    const digitsOnly = rawNumber.replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      setStatus('invalid_phone');
      setErrorMessage('Invalid phone number. Please enter a valid 10-12 digit mobile number.');
      return;
    }

    setStatus('sending');
    setErrorMessage(null);
    setDevOtpCode(null);

    try {
      const res = await ApiService.sendOtp(rawNumber);
      
      // Request succeeded - transition to OTP screen
      setStatus('otp_sent');
      setResendCountdown(60);
      setCanResend(false);
      if (res.devOtp) {
        setDevOtpCode(res.devOtp);
      }
      setStep('otp');
    } catch (err: any) {
      const msg = err.message || '';
      console.warn('[PatientLoginPage] sendOtp failed:', msg);
      
      if (/invalid (phone|mobile)|supported market|format/i.test(msg)) {
        setStatus('invalid_phone');
        setErrorMessage(
          msg.includes('supported market')
            ? "Invalid phone number, or this number's country isn't a supported market yet."
            : 'Invalid phone number. Please check the country code and digits.'
        );
      } else if (/too many|rate limit/i.test(msg)) {
        setStatus('too_many_attempts');
        setErrorMessage('Too many attempts. Please wait a few minutes before trying again.');
      } else {
        setStatus('sms_delivery_failed');
        setErrorMessage(msg || 'SMS delivery failed. Please check your number and try again.');
      }
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    const rawNumber = mobileNumber.trim();
    if (!rawNumber || !canResend) return;

    setStatus('sending');
    setErrorMessage(null);

    try {
      const res = await ApiService.resendOtp(rawNumber);
      setStatus('otp_sent');
      setResendCountdown(30);
      setCanResend(false);
      if (res.devOtp) {
        setDevOtpCode(res.devOtp);
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (/cooldown|wait|too many/i.test(msg)) {
        setStatus('too_many_attempts');
        setErrorMessage('Too many attempts. Please wait before requesting another code.');
      } else {
        setStatus('sms_delivery_failed');
        setErrorMessage(msg || 'Failed to resend OTP. Please try again.');
      }
    }
  };

  // STEP 2: Verify OTP
  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify || otp).trim();
    if (!code || code.length < 6) {
      setStatus('incorrect_otp');
      setErrorMessage('Please enter the full 6-digit verification code.');
      return;
    }

    setStatus('verifying');
    setErrorMessage(null);

    try {
      const res = await ApiService.verifyOtp(mobileNumber, code);
      const needsOnboarding = res.isNewUser || !res.profile || !res.profile.full_name;

      if (needsOnboarding) {
        localStorage.setItem('medibrief_patient_token', res.token);
        setPendingSession({ token: res.token, user: res.user, profile: res.profile });
        setStep('onboarding');
      } else {
        login(res.token, res.user, res.profile);
        onSuccess();
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (/expired/i.test(msg)) {
        setStatus('otp_expired');
        setErrorMessage('OTP expired. Please request a new code.');
      } else if (/maximum|too many|attempts/i.test(msg)) {
        setStatus('too_many_attempts');
        setErrorMessage('Too many attempts. Maximum attempts exceeded. Please request a new OTP.');
      } else {
        setStatus('incorrect_otp');
        setErrorMessage(msg || 'Incorrect OTP. Please check the code and try again.');
      }
    }
  };

  // STEP 3: Complete Patient Onboarding
  const handleSaveOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardingData.fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!onboardingData.dateOfBirth.trim()) {
      setErrorMessage('Date of Birth is required.');
      return;
    }
    const validAge = calculateAge(onboardingData.dateOfBirth);
    if (validAge === null) {
      setErrorMessage('Please select a valid Date of Birth (cannot be in the future).');
      return;
    }

    setStatus('verifying');
    setErrorMessage(null);

    try {
      const payload = {
        fullName: onboardingData.fullName.trim(),
        dateOfBirth: onboardingData.dateOfBirth.trim(),
        gender: 'Not specified',
        bloodGroup: onboardingData.bloodGroup || 'Unknown',
        emergencyContact: onboardingData.emergencyContact.trim() || 'None registered',
        email: onboardingData.email.trim() || null,
        address: onboardingData.address.trim() || null
      };

      const savedProfile = await ApiService.saveProfile(payload);
      const activeToken = pendingSession?.token || localStorage.getItem('medibrief_patient_token') || '';
      const activeUser = pendingSession?.user || { id: (savedProfile as any)?.user_id || '', role: 'patient', mobile_number: mobileNumber };
      login(activeToken, activeUser, savedProfile as any);
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save patient profile.');
      setStatus('idle');
    }
  };

  // Quick Demo Access Helper
  const handleQuickDemoLogin = async () => {
    const demoNumber = '+919876543210';
    setMobileNumber(demoNumber);
    setStatus('sending');
    setErrorMessage(null);
    try {
      const sendRes = await ApiService.sendOtp(demoNumber);
      const code = sendRes.devOtp || '123456';
      setStatus('verifying');
      const res = await ApiService.verifyOtp(demoNumber, code);
      login(res.token, res.user, res.profile);
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Demo login failed');
      setStatus('idle');
    }
  };

  const isLoading = status === 'sending' || status === 'verifying';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-3 sm:p-4 py-8 relative pt-safe pb-safe selection:bg-teal-100 selection:text-teal-900">
      
      {/* Top back navigation */}
      <div className="w-full max-w-md mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToLanding}
          className="text-xs text-slate-500 hover:text-slate-900 flex items-center space-x-1 font-medium transition-colors py-1.5 touch-press"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </button>

        <button
          type="button"
          onClick={onStaffLogin}
          className="text-xs text-teal-700 hover:text-teal-900 font-semibold transition-colors py-1.5 touch-press"
        >
          Staff Login →
        </button>
      </div>

      {/* Main Authentication Card */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200/90 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Card Header: MediBrief Branding */}
        <div className="p-6 sm:p-8 pb-5 text-center border-b border-slate-100 bg-slate-50/60">
          <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-3 shadow-md shadow-teal-900/20 bg-slate-900 border border-slate-700/50">
            <img src="/app-icon.png" alt="MediBrief App Icon" className="w-full h-full object-cover" />
          </div>
          <span className="inline-block text-[10px] font-extrabold uppercase tracking-widest text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200/70 mb-1.5">
            Patient Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {step === 'onboarding'
              ? 'Patient Profile Setup'
              : step === 'otp'
              ? 'Verify your number'
              : 'Sign in to your health vault'}
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
            {step === 'onboarding'
              ? 'Complete your profile to personalize your health records'
              : step === 'otp'
              ? `We sent a 6-digit verification code to ${maskPhoneNumber(mobileNumber)}`
              : 'Secure, passwordless access to your medical records & AI summaries'}
          </p>
        </div>

        {/* Card Body */}
        <div className="p-6 sm:p-8 space-y-5">
          
          {/* Status / Error Alerts */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start space-x-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-snug">
                <span className="font-bold block">
                  {status === 'invalid_phone' && 'Invalid phone number'}
                  {status === 'sms_delivery_failed' && 'SMS delivery failed'}
                  {status === 'otp_expired' && 'OTP expired'}
                  {status === 'incorrect_otp' && 'Incorrect OTP'}
                  {status === 'too_many_attempts' && 'Too many attempts'}
                  {status === 'idle' && 'Notice'}
                </span>
                <span className="text-rose-700">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Dev / Sandbox OTP Banner (Only shown if local test OTP is returned) */}
          {devOtpCode && step === 'otp' && (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl flex items-center justify-between animate-in fade-in">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                <div className="text-xs">
                  <span className="text-teal-900 font-bold block">Sandbox Test Code:</span>
                  <span className="font-mono font-extrabold text-sm text-teal-700 tracking-wider">{devOtpCode}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setOtp(devOtpCode); handleVerifyOtp(devOtpCode); }}
                className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl transition-colors shadow-xs touch-press"
              >
                Auto-fill
              </button>
            </div>
          )}

          {/* ============================================================= */}
          {/* STEP 1: MOBILE NUMBER INPUT */}
          {/* ============================================================= */}
          {step === 'mobile' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-teal-600" />
                  <span>Mobile Phone Number</span>
                </label>
                
                <div className="relative">
                  <input
                    type="tel"
                    autoFocus
                    value={mobileNumber}
                    onChange={handleMobileChange}
                    placeholder="+91 98765 43210"
                    disabled={isLoading}
                    className="w-full text-base font-semibold px-4 py-3.5 bg-slate-50 focus:bg-white border-2 border-slate-200 focus:border-teal-500 rounded-2xl focus:outline-none focus:ring-4 focus:ring-teal-500/10 transition-all text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Enter mobile number with country code (e.g. <code>+91</code>, <code>+1</code>).
                </p>
              </div>

              {/* Send OTP Button */}
              <button
                type="button"
                onClick={() => handleSendOtp()}
                disabled={isLoading || !mobileNumber.trim()}
                className="w-full min-h-[52px] py-3.5 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-sm rounded-2xl shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center space-x-2 touch-press"
              >
                {status === 'sending' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Sending OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Send OTP</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Quick Demo Account Helper */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleQuickDemoLogin}
                  disabled={isLoading}
                  className="text-xs text-slate-500 hover:text-teal-700 font-medium py-1 transition-colors touch-press"
                >
                  Or sign in with demo account (Rahul Sharma) →
                </button>
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* STEP 2: 6-DIGIT OTP VERIFICATION */}
          {/* ============================================================= */}
          {step === 'otp' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-teal-600" />
                    <span>Enter 6-Digit Code</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => { setStep('mobile'); setErrorMessage(null); setStatus('idle'); }}
                    className="text-xs text-teal-600 hover:text-teal-800 font-bold hover:underline touch-press"
                  >
                    Change number
                  </button>
                </div>

                <input
                  type="text"
                  maxLength={6}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={e => {
                    const cleaned = e.target.value.replace(/\D/g, '');
                    setOtp(cleaned);
                    if (status === 'incorrect_otp' || errorMessage) {
                      setErrorMessage(null);
                      setStatus('idle');
                    }
                  }}
                  placeholder="••••••"
                  className="w-full text-center tracking-[0.5em] sm:tracking-[0.6em] font-mono text-2xl font-black py-3.5 px-4 rounded-2xl border-2 border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 bg-slate-50 focus:bg-white text-slate-900 transition-all placeholder:text-slate-300"
                />

                {/* Resend Countdown */}
                <div className="flex items-center justify-between text-xs text-slate-500 mt-2 px-1">
                  <span>Sent to <strong>{maskPhoneNumber(mobileNumber)}</strong></span>
                  {canResend ? (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isLoading}
                      className="font-bold text-teal-600 hover:text-teal-700 hover:underline flex items-center space-x-1 touch-press"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Resend OTP</span>
                    </button>
                  ) : (
                    <span className="text-slate-400 font-mono text-[11px]">Resend in {resendCountdown}s</span>
                  )}
                </div>
              </div>

              {/* Verify & Continue Button */}
              <button
                type="button"
                onClick={() => handleVerifyOtp()}
                disabled={isLoading || otp.length < 6}
                className="w-full min-h-[52px] py-3.5 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-sm rounded-2xl shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center space-x-2 touch-press"
              >
                {status === 'verifying' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Continue</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* ============================================================= */}
          {/* STEP 3: NEW PATIENT PROFILE ONBOARDING */}
          {/* ============================================================= */}
          {step === 'onboarding' && (
            <form onSubmit={handleSaveOnboarding} className="space-y-4">
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl text-xs text-teal-900 leading-relaxed">
                🎉 <strong>Account Created!</strong> Complete your profile below so your health vault, clinical summaries, and reports are personalized for you.
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <User className="w-3.5 h-3.5 text-teal-600" />
                  <span>Full Name *</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={onboardingData.fullName}
                  onChange={e => setOnboardingData({ ...onboardingData, fullName: e.target.value })}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full text-sm font-semibold px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Date of Birth and Blood Group */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>Date of Birth *</span>
                  </label>
                  <input
                    type="date"
                    required
                    max={maxDate}
                    min="1900-01-01"
                    value={onboardingData.dateOfBirth}
                    onChange={e => setOnboardingData({ ...onboardingData, dateOfBirth: e.target.value })}
                    className="w-full text-xs font-semibold px-2.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white min-h-[44px] text-slate-800"
                  />
                  {calculatedAge !== null && (
                    <div className="mt-1 text-xs text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md inline-flex items-center space-x-1 font-medium">
                      <span>Age: <strong>{calculatedAge} {calculatedAge === 1 ? 'year' : 'years'}</strong></span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                    <Heart className="w-3.5 h-3.5 text-teal-600" />
                    <span>Blood Group</span>
                  </label>
                  <select
                    value={onboardingData.bloodGroup}
                    onChange={e => setOnboardingData({ ...onboardingData, bloodGroup: e.target.value })}
                    className="w-full text-xs font-semibold px-3 py-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 min-h-[44px]"
                  >
                    <option value="Unknown">Don't Know (Unknown)</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              </div>

              {/* Emergency Contact Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                  <Phone className="w-3.5 h-3.5 text-teal-600" />
                  <span>Emergency Contact Number</span>
                </label>
                <input
                  type="tel"
                  value={onboardingData.emergencyContact}
                  onChange={e => setOnboardingData({ ...onboardingData, emergencyContact: e.target.value })}
                  placeholder="e.g. +91 98765 43210 (family member)"
                  className="w-full text-xs px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full min-h-[50px] py-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 transition-all mt-2 flex items-center justify-center space-x-2 touch-press"
              >
                <span>{isLoading ? 'Saving Patient Profile...' : 'Complete Profile & Open Vault'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ============================================================= */}
          {/* FOOTER: SMALL STAFF LOGIN LINK */}
          {/* ============================================================= */}
          <div className="pt-4 text-center border-t border-slate-100">
            <button
              type="button"
              onClick={onStaffLogin}
              className="text-xs text-slate-600 hover:text-teal-700 font-medium py-1 transition-colors touch-press inline-flex items-center space-x-1"
            >
              <span>Are you a doctor or clerk?</span>
              <span className="text-teal-600 underline font-bold ml-1">Staff Login</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
