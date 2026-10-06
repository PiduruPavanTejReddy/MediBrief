import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  QrCode, 
  Shield, 
  CheckCircle2, 
  Calendar, 
  Filter, 
  Clock,
  ArrowRight,
  Lock
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ApiService } from '../services/api';

interface DoctorSharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: () => void;
}

export const DoctorSharingModal: React.FC<DoctorSharingModalProps> = ({
  isOpen,
  onClose,
  onSessionCreated
}) => {
  if (!isOpen) return null;

  const [step, setStep] = useState<'configure' | 'code'>('configure');
  const [scopeType, setScopeType] = useState<'all' | 'date_range' | 'categories'>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'Blood Test', 'Prescription', 'Discharge Summary', 'Consultation', 'MRI'
  ]);
  const [dateRangeOption, setDateRangeOption] = useState<string>('all');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedResult, setGeneratedResult] = useState<any | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const categories = [
    'Blood Test', 'Prescription', 'Discharge Summary', 'Consultation',
    'MRI', 'CT Scan', 'X-Ray', 'Ultrasound', 'Medication'
  ];

  const handleCategoryToggle = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      let dateFrom: string | undefined;
      let dateTo: string | undefined;
      const now = new Date();

      if (dateRangeOption === '30d') {
        const d = new Date();
        d.setDate(now.getDate() - 30);
        dateFrom = d.toISOString().split('T')[0];
      } else if (dateRangeOption === '6m') {
        const d = new Date();
        d.setMonth(now.getMonth() - 6);
        dateFrom = d.toISOString().split('T')[0];
      } else if (dateRangeOption === '1y') {
        const d = new Date();
        d.setFullYear(now.getFullYear() - 1);
        dateFrom = d.toISOString().split('T')[0];
      }

      const payload = {
        scopeType: dateRangeOption !== 'all' ? ('date_range' as const) : scopeType,
        categories: scopeType === 'categories' ? selectedCategories : undefined,
        dateFrom,
        dateTo
      };

      const result = await ApiService.createSharingSession(payload);
      setGeneratedResult(result);
      setStep('code');
      onSessionCreated();
    } catch (err: any) {
      console.error('Failed to create sharing session:', err);
      alert(err.message || 'Failed to generate code');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyCode = () => {
    if (generatedResult?.accessCode) {
      navigator.clipboard.writeText(generatedResult.accessCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const copyDoctorLink = () => {
    const fullUrl = `${window.location.origin}/doctor?code=${generatedResult?.accessCode}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-md max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 sm:fade-in sm:zoom-in-95 duration-200">
        
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">Share Medical Records</h3>
              <p className="text-[11px] text-slate-500">Give your doctor temporary access to records</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center touch-press"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {step === 'configure' ? (
            <div className="space-y-4">
              
              {/* Explanatory banner */}
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl text-xs text-teal-900 flex items-start space-x-2">
                <Lock className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  Give your doctor temporary access to selected medical records without sharing passwords or sensitive unshared files.
                </span>
              </div>

              {/* Date Scope Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-teal-600" />
                  <span>Timeframe Scope</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'all', label: 'All Records' },
                    { id: '30d', label: 'Last 30 Days' },
                    { id: '6m', label: 'Last 6 Months' },
                    { id: '1y', label: 'Last 1 Year' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDateRangeOption(opt.id)}
                      className={`min-h-[44px] py-2 px-3 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between touch-press ${
                        dateRangeOption === opt.id
                          ? 'border-teal-600 bg-teal-50 text-teal-950 font-bold shadow-2xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {dateRangeOption === opt.id && <Check className="w-3.5 h-3.5 text-teal-600" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Filter Checkboxes */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center space-x-1">
                  <Filter className="w-3.5 h-3.5 text-teal-600" />
                  <span>Filter by Report Categories</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/50">
                  {categories.map(cat => {
                    const isChecked = selectedCategories.includes(cat);
                    return (
                      <label
                        key={cat}
                        className={`flex items-center space-x-2 p-2 rounded-lg border text-[11px] cursor-pointer select-none transition-colors touch-press ${
                          isChecked
                            ? 'bg-teal-50 border-teal-300 text-teal-950 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleCategoryToggle(cat)}
                          className="w-3.5 h-3.5 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                        />
                        <span className="truncate">{cat}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Security info */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                  <Shield className="w-3.5 h-3.5 text-teal-600" />
                  <span>Temporary Access Control</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Doctor receives read-only access to chosen records. You can revoke this code anytime with 1 tap from your dashboard.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full min-h-[50px] py-3 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 transition-all flex items-center justify-center space-x-2 touch-press"
              >
                <span>{isGenerating ? 'Generating Secure Session...' : 'Generate Doctor Access Code'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="text-center space-y-4">
              
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div>
                <h4 className="text-sm font-extrabold text-slate-900">Doctor Access Session Created</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Share this temporary code or QR code with your physician
                </p>
              </div>

              {/* Large Access Code Box */}
              <div className="bg-slate-50 p-4 rounded-2xl border-2 border-teal-500/50 shadow-inner flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Doctor Access Code
                </span>
                <span className="text-3xl font-mono font-black text-slate-900 tracking-wider select-all">
                  {generatedResult?.accessCode}
                </span>
                <div className="mt-2 text-xs font-bold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
                  {generatedResult?.recordCount} Records Permitted
                </div>
              </div>

              {/* Scannable QR Code */}
              <div className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs">
                <QRCodeSVG
                  value={`${window.location.origin}/doctor?code=${generatedResult?.accessCode}`}
                  size={135}
                  level="M"
                />
                <span className="text-[10px] text-slate-400 mt-2 font-medium">
                  Doctor can scan with mobile camera to open records directly
                </span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={copyCode}
                  className="min-h-[44px] py-2.5 px-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-[11px] sm:text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-colors shadow-xs touch-press"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                  <span className="truncate">{copiedCode ? 'Code Copied!' : 'Copy Code'}</span>
                </button>

                <button
                  type="button"
                  onClick={copyDoctorLink}
                  className="min-h-[44px] py-2.5 px-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 text-[11px] sm:text-xs font-bold rounded-xl border border-slate-300 flex items-center justify-center space-x-1.5 transition-colors touch-press"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 shrink-0" /> : <QrCode className="w-3.5 h-3.5 shrink-0" />}
                  <span className="truncate">{copiedLink ? 'Link Copied!' : 'Copy Direct Link'}</span>
                </button>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 leading-relaxed text-left flex items-start space-x-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Session Active:</strong> Revocable anytime from your dashboard. Ends when you revoke or doctor exits.
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[44px] py-2.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl transition-colors touch-press"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
