import React, { useState, useEffect, useMemo } from 'react';
import { 
  Stethoscope, 
  Shield, 
  LogOut, 
  FileText, 
  Bot, 
  Sparkles, 
  Activity, 
  Pill, 
  AlertCircle, 
  AlertTriangle,
  CheckCircle2, 
  User, 
  Calendar, 
  ExternalLink, 
  RefreshCw,
  Clock,
  ArrowRight,
  ClipboardList,
  Search
} from 'lucide-react';
import { useDoctor } from '../context/DoctorContext';
import { ApiService } from '../services/api';
import { MedicalRecord, AICitation } from '../types';
import { DocumentViewerModal } from '../components/DocumentViewerModal';
import { AIChatbot } from '../components/AIChatbot';
import { ClinicalSummaryModal } from '../components/ClinicalSummaryModal';

interface DoctorDashboardPageProps {
  onExit: () => void;
}

/**
 * Smartly shortens lengthy clinical investigation/ophthalmic parameter names
 * to avoid mobile clipping or ellipsis truncation (e.g. "Right Eye (RE) Distan...")
 */
function formatInvestigationName(name: string): string {
  if (!name) return '';
  return name
    .replace(/Right Eye \(RE\)\s*Distance Spherical/gi, 'RE Distance SPH')
    .replace(/Right Eye \(RE\)\s*Distance Cylindrical/gi, 'RE Distance CYL')
    .replace(/Right Eye \(RE\)\s*Distance Axis/gi, 'RE Axis')
    .replace(/Right Eye \(RE\)\s*Distance Visual Acuity/gi, 'RE Visual Acuity')
    .replace(/Right Eye \(RE\)\s*Near Addition/gi, 'RE Near Add')
    .replace(/Right Eye \(RE\)\s*Near Visual Acuity/gi, 'RE Near VA')
    .replace(/Left Eye \(LE\)\s*Distance Spherical/gi, 'LE Distance SPH')
    .replace(/Left Eye \(LE\)\s*Distance Cylindrical/gi, 'LE Distance CYL')
    .replace(/Left Eye \(LE\)\s*Distance Axis/gi, 'LE Axis')
    .replace(/Left Eye \(LE\)\s*Distance Visual Acuity/gi, 'LE Visual Acuity')
    .replace(/Left Eye \(LE\)\s*Near Addition/gi, 'LE Near Add')
    .replace(/Left Eye \(LE\)\s*Near Visual Acuity/gi, 'LE Near VA')
    .replace(/Right Eye \(RE\)/gi, 'RE')
    .replace(/Left Eye \(LE\)/gi, 'LE')
    .replace(/Spherical/gi, 'SPH')
    .replace(/Cylindrical/gi, 'CYL')
    .replace(/Visual Acuity/gi, 'VA');
}

export const DoctorDashboardPage: React.FC<DoctorDashboardPageProps> = ({ onExit }) => {
  const { patientInfo, permittedRecordCount, clinicalSummary, endSession, sessionEndedReason, checkSessionStatus } = useDoctor();

  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'records' | 'ai'>('overview');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEnding, setIsEnding] = useState<boolean>(false);
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [showClinicalSummaryModal, setShowClinicalSummaryModal] = useState<boolean>(false);

  // Patient age directly from session info (no DOB calculation in doctor portal)
  const doctorPatientAge = useMemo(() => {
    if (typeof patientInfo?.age === 'number') {
      return `${patientInfo.age} years`;
    }
    if (patientInfo?.age && patientInfo.age !== 'Unknown' && patientInfo.age !== 'Age not available') {
      return `${patientInfo.age} years`;
    }
    return 'Age not available';
  }, [patientInfo?.age]);

  // Short patient age for mobile header: e.g. "19 yrs"
  const doctorPatientAgeShort = useMemo(() => {
    if (typeof patientInfo?.age === 'number') {
      return `${patientInfo.age} yrs`;
    }
    if (patientInfo?.age && patientInfo.age !== 'Unknown' && patientInfo.age !== 'Age not available') {
      return `${patientInfo.age} yrs`;
    }
    return 'Age not available';
  }, [patientInfo?.age]);

  // Parse clinical summary into structured sections for single natural vertical scroll
  const parsedDigestSections = useMemo(() => {
    if (!clinicalSummary?.summary) {
      return null;
    }

    const raw = clinicalSummary.summary;

    // Extract Known Conditions section
    const condMatch = raw.match(/###\s*Known Conditions([\s\S]*?)(?=###|$)/i);
    const conditions = condMatch 
      ? condMatch[1].split('\n')
          .map((l: string) => l.replace(/^[•\s\*\-#]+/, '').trim())
          .filter((l: string) => Boolean(l) && !/no chronic conditions/i.test(l))
      : [];

    // Extract Current Medications section
    const medMatch = raw.match(/###\s*Current Medications([\s\S]*?)(?=###|$)/i);
    const medications = medMatch
      ? medMatch[1].split('\n')
          .map((l: string) => l.replace(/^[•\s\*\-#]+/, '').trim())
          .filter((l: string) => Boolean(l) && !/no active prescriptions/i.test(l))
      : [];

    // Extract Recent Investigations section
    const invMatch = raw.match(/###\s*Recent Investigations[^\n]*([\s\S]*?)(?=###|$)/i);
    const investigations = invMatch
      ? invMatch[1].split('\n')
          .map((l: string) => l.replace(/^[•\s\*\-#]+/, '').trim())
          .filter((l: string) => Boolean(l) && !/no laboratory investigations/i.test(l))
      : [];

    // Extract Historical Medical Reports section
    const histMatch = raw.match(/###\s*Historical Medical Reports([\s\S]*?)(?=###|$)/i);
    const historical = histMatch ? histMatch[1].replace(/^[•\s\*\-#]+/, '').trim() : '';

    return {
      conditions,
      medications,
      investigations,
      historical
    };
  }, [clinicalSummary?.summary]);

  useEffect(() => {
    loadSharedRecords();
    const interval = setInterval(async () => {
      const active = await checkSessionStatus();
      if (!active) {
        clearInterval(interval);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadSharedRecords = async () => {
    try {
      const data = await ApiService.getDoctorRecords();
      setRecords(data);
    } catch (err: any) {
      console.warn('Failed to load doctor records:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmEndSession = async () => {
    try {
      setIsEnding(true);
      await endSession();
      setShowEndModal(false);
      onExit();
    } catch (e) {
      console.error('Error ending consultation:', e);
    } finally {
      setIsEnding(false);
    }
  };

  const handleOpenCitation = (cite: AICitation) => {
    const found = records.find(r => r.id === cite.record_id);
    if (found) {
      setSelectedRecord(found);
    }
  };

  const handleInvestigationClick = (inv: any) => {
    // Attempt to locate matching report by date or fallback to latest record
    const found = records.find(r => r.record_date === inv.date) || records[0];
    if (found) {
      setSelectedRecord(found);
    }
  };

  if (sessionEndedReason) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Session Terminated</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            {sessionEndedReason}
          </p>
          <button
            onClick={onExit}
            className="w-full min-h-[44px] py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 touch-press"
          >
            Return to Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-teal-100 selection:text-teal-900">
      
      {/* ================================================== */}
      {/* 2. COMPACT MOBILE-FIRST DOCTOR CLINICAL HEADER      */}
      {/* ================================================== */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md pt-safe">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
          
          {/* Patient Overview & Session Status */}
          <div className="flex items-center justify-between sm:justify-start space-x-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 shadow-xs bg-slate-900 border border-slate-700/50">
                <img src="/app-icon.png" alt="MediBrief" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5 flex-wrap">
                  <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white">MediBrief Doctor Portal</span>
                  <span className="inline-flex items-center space-x-1 text-[9px] sm:text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/30 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>ACTIVE</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Patient: <strong className="text-white">{patientInfo?.fullName || 'Patient'}</strong>
                  {doctorPatientAgeShort !== 'Age not available' ? (
                    <span className="text-slate-300 font-medium">
                      {` (${doctorPatientAgeShort}${patientInfo?.bloodGroup && patientInfo.bloodGroup !== 'N/A' ? `, ${patientInfo.bloodGroup}` : ''})`}
                    </span>
                  ) : (
                    patientInfo?.bloodGroup && patientInfo.bloodGroup !== 'N/A' ? (
                      <span className="text-slate-300 font-medium">{` (${patientInfo.bloodGroup})`}</span>
                    ) : null
                  )}
                </p>
              </div>
            </div>

            {/* Mobile-only Compact End Consultation Button */}
            <div className="sm:hidden shrink-0">
              <button
                onClick={() => setShowEndModal(true)}
                disabled={isEnding}
                className="min-h-[38px] px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-[11px] font-bold rounded-xl flex items-center space-x-1 shadow-xs transition-colors touch-press"
                aria-label="End consultation"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>End</span>
              </button>
            </div>
          </div>

          {/* Desktop Right Action Bar */}
          <div className="hidden sm:flex items-center justify-end space-x-3">
            <span className="text-xs font-semibold text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
              {permittedRecordCount} Records Permitted
            </span>
            <button
              onClick={() => setShowEndModal(true)}
              disabled={isEnding}
              className="min-h-[38px] px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-xs transition-colors touch-press"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>End Consultation</span>
            </button>
          </div>
        </div>

        {/* ================================================== */}
        {/* 3. HORIZONTALLY SCROLLABLE MOBILE TAB BAR         */}
        {/* ================================================== */}
        <div className="bg-slate-800/90 px-3 sm:px-6 flex space-x-1 sm:space-x-2 text-xs border-t border-slate-800 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('overview')}
            className={`min-h-[44px] py-2.5 px-3 font-bold border-b-2 whitespace-nowrap transition-colors touch-press flex items-center justify-center ${
              activeTab === 'overview'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Clinical Overview
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={`min-h-[44px] py-2.5 px-3 font-bold border-b-2 whitespace-nowrap transition-colors touch-press flex items-center justify-center ${
              activeTab === 'records'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Records & Timeline ({records.length})
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`min-h-[44px] py-2.5 px-3 font-bold border-b-2 whitespace-nowrap transition-colors touch-press flex items-center justify-center ${
              activeTab === 'ai'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Ask Clinical AI
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3.5 sm:p-6 lg:p-8 pb-24">
        
        {activeTab === 'overview' && (
          <div className="space-y-4 sm:space-y-6">
            
            {/* Top 4 Clinical Overview Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              
              {/* ================================================== */}
              {/* 4. IMPROVED COMPACT 2-COLUMN DEMOGRAPHICS CARD    */}
              {/* ================================================== */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                    <User className="w-3 h-3 text-teal-600" />
                    <span>Demographics</span>
                  </span>
                  <span className="text-[10px] text-teal-700 bg-teal-50 font-bold px-1.5 py-0.5 rounded border border-teal-200/60">
                    Verified
                  </span>
                </div>
                
                <h4 className="text-base font-extrabold text-slate-900 truncate">
                  {patientInfo?.fullName || 'Patient'}
                </h4>

                {/* Patient Demographics Grid: Age, Gender, Blood Group (No DOB) */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {/* Age */}
                  <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      Age
                    </span>
                    <strong className="text-slate-900 block truncate text-[11px] sm:text-xs">
                      {doctorPatientAge}
                    </strong>
                  </div>

                  {/* Gender */}
                  <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      Gender
                    </span>
                    <strong className="text-slate-900 block truncate text-[11px] sm:text-xs">
                      {patientInfo?.gender && patientInfo.gender !== 'N/A' ? patientInfo.gender : 'Not specified'}
                    </strong>
                  </div>

                  {/* Blood Group */}
                  <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      Blood Group
                    </span>
                    <strong className="text-teal-700 block truncate text-[11px] sm:text-xs">
                      {patientInfo?.bloodGroup && patientInfo.bloodGroup !== 'N/A' ? patientInfo.bloodGroup : 'Not specified'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* ================================================== */}
              {/* 5. ACTIVE DIAGNOSES CARD                          */}
              {/* ================================================== */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                  <Activity className="w-3 h-3 text-teal-600" />
                  <span>Active Diagnoses</span>
                </span>
                
                <h4 className="text-xs font-bold text-slate-500">Documented Conditions</h4>

                <div className="pt-0.5">
                  {clinicalSummary?.knownConditions && clinicalSummary.knownConditions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {clinicalSummary.knownConditions.map((cond: string, idx: number) => (
                        <span 
                          key={idx} 
                          className="text-xs font-bold px-2.5 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200/80 rounded-lg inline-flex items-center space-x-1"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                          <span>{cond}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="py-2 text-xs text-slate-400 italic">
                      No active diagnoses documented in shared records.
                    </div>
                  )}
                </div>
              </div>

              {/* ================================================== */}
              {/* 6. CURRENT MEDICATIONS CARD                       */}
              {/* ================================================== */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                  <Pill className="w-3 h-3 text-teal-600" />
                  <span>Current Medications</span>
                </span>

                <h4 className="text-xs font-bold text-slate-500">Active Prescriptions</h4>

                <div className="pt-0.5">
                  {clinicalSummary?.currentMedications && clinicalSummary.currentMedications.length > 0 ? (
                    <div className="space-y-1.5 text-xs">
                      {clinicalSummary.currentMedications.slice(0, 3).map((m: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-slate-900 block truncate">{m.name}</span>
                            <span className="text-[10px] text-slate-500 block truncate">{m.frequency || 'As directed'}</span>
                          </div>
                          <span className="shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                            {m.dosage}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-2 text-xs text-slate-400 italic">
                      No active medications recorded.
                    </div>
                  )}
                </div>
              </div>

              {/* ================================================== */}
              {/* 7. RECENT INVESTIGATIONS (NON-TRUNCATED ROWS)     */}
              {/* ================================================== */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                  <ClipboardList className="w-3 h-3 text-teal-600" />
                  <span>Recent Investigations</span>
                </span>

                <h4 className="text-xs font-bold text-slate-500">Key Diagnostic Findings</h4>

                <div className="pt-0.5">
                  {clinicalSummary?.recentInvestigations && clinicalSummary.recentInvestigations.length > 0 ? (
                    <div className="space-y-1.5 text-xs">
                      {clinicalSummary.recentInvestigations.slice(0, 4).map((inv: any, idx: number) => {
                        const shortName = formatInvestigationName(inv.test);
                        return (
                          <div 
                            key={idx}
                            onClick={() => handleInvestigationClick(inv)}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-teal-50/70 border border-slate-100 hover:border-teal-200 transition-colors cursor-pointer group touch-press"
                            title="Tap to view source medical report"
                          >
                            <div className="flex items-center space-x-1.5 min-w-0 pr-2">
                              <span className="font-semibold text-slate-700 truncate group-hover:text-teal-900">
                                {shortName}
                              </span>
                              <ExternalLink className="w-2.5 h-2.5 text-slate-300 group-hover:text-teal-600 shrink-0" />
                            </div>
                            <span className={`shrink-0 font-bold font-mono text-[11px] px-1.5 py-0.5 rounded ${
                              inv.flag 
                                ? 'text-amber-800 bg-amber-100/80 border border-amber-300' 
                                : 'text-slate-900 bg-white border border-slate-200'
                            }`}>
                              {inv.value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-2 text-xs text-slate-400 italic">
                      No laboratory investigations on file.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ================================================== */}
            {/* 8 & 9. REDESIGNED CLINICAL HISTORY DIGEST & ACTIONS */}
            {/* ================================================== */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs p-4 sm:p-7 space-y-4">
              
              {/* Header with Title & Top Mobile-Friendly Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 shadow-2xs">
                    <Sparkles className="w-4 h-4 text-teal-700" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900">Clinical History Digest</h3>
                    <p className="text-[11px] text-slate-500">Synthesized from {records.length} shared patient reports</p>
                  </div>
                </div>

                {/* 9. Top Summary Actions (Touch friendly >=44px) */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowClinicalSummaryModal(true)}
                    className="min-h-[44px] flex-1 sm:flex-none px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-xl flex items-center justify-center space-x-2 touch-press shadow-xs transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-200" />
                    <span>View Structured Summary</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('ai')}
                    className="min-h-[44px] flex-1 sm:flex-none px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center space-x-1.5 touch-press border border-slate-200 transition-colors"
                  >
                    <Bot className="w-3.5 h-3.5 text-slate-500" />
                    <span>Ask Clinical AI →</span>
                  </button>
                </div>
              </div>

              {/* 8. Natural Vertical Scroll Structured Presentation (No cramped inner scrollbox) */}
              <div className="space-y-3.5">
                {parsedDigestSections ? (
                  <div className="space-y-3">
                    
                    {/* Section: Known Conditions */}
                    {parsedDigestSections.conditions.length > 0 && (
                      <div className="bg-slate-50/90 rounded-2xl p-3.5 sm:p-4 border border-slate-200/80">
                        <div className="flex items-center space-x-2 mb-2">
                          <Activity className="w-4 h-4 text-indigo-600" />
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                            Documented Chronic Conditions
                          </h4>
                        </div>
                        <ul className="space-y-1.5">
                          {parsedDigestSections.conditions.map((item: string, idx: number) => (
                            <li key={idx} className="text-xs text-slate-700 font-medium flex items-start space-x-2">
                              <span className="text-indigo-500 font-bold">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Section: Current Prescriptions */}
                    {parsedDigestSections.medications.length > 0 && (
                      <div className="bg-slate-50/90 rounded-2xl p-3.5 sm:p-4 border border-slate-200/80">
                        <div className="flex items-center space-x-2 mb-2">
                          <Pill className="w-4 h-4 text-teal-600" />
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                            Current Active Prescriptions
                          </h4>
                        </div>
                        <ul className="space-y-1.5">
                          {parsedDigestSections.medications.map((item: string, idx: number) => (
                            <li key={idx} className="text-xs text-slate-700 font-medium flex items-start space-x-2">
                              <span className="text-teal-600 font-bold">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Section: Recent Investigations */}
                    {parsedDigestSections.investigations.length > 0 && (
                      <div className="bg-slate-50/90 rounded-2xl p-3.5 sm:p-4 border border-slate-200/80">
                        <div className="flex items-center space-x-2 mb-2">
                          <ClipboardList className="w-4 h-4 text-teal-600" />
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                            Recent Investigations & Key Findings
                          </h4>
                        </div>
                        <ul className="space-y-1.5">
                          {parsedDigestSections.investigations.map((item: string, idx: number) => {
                            const hasFlag = item.includes('⚠️') || item.includes('Abnormal');
                            const cleanText = item.replace(/⚠️|\[Abnormal\]/g, '').trim();
                            return (
                              <li key={idx} className="text-xs text-slate-700 font-medium flex items-start space-x-2">
                                <span className={hasFlag ? 'text-amber-600 font-bold' : 'text-slate-400 font-bold'}>•</span>
                                <span className="flex-1">{cleanText}</span>
                                {hasFlag && (
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300 shrink-0">
                                    Abnormal
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Section: Historical Records Overview */}
                    {parsedDigestSections.historical && (
                      <div className="bg-slate-50/90 rounded-2xl p-3.5 sm:p-4 border border-slate-200/80">
                        <div className="flex items-center space-x-2 mb-1.5">
                          <Clock className="w-4 h-4 text-slate-500" />
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                            Historical Coverage
                          </h4>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed font-medium">
                          {parsedDigestSections.historical}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 bg-slate-50 p-4 rounded-2xl border border-slate-200 leading-relaxed">
                    Synthesizing clinical summary from patient medical records...
                  </div>
                )}
              </div>

              {/* ================================================== */}
              {/* 10. COMPACT TAPPABLE SOURCE RECORDS CARDS         */}
              {/* ================================================== */}
              {clinicalSummary?.sourceRecords && clinicalSummary.sourceRecords.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Source Records Cited ({clinicalSummary.sourceRecords.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {clinicalSummary.sourceRecords.map((cite: AICitation) => (
                      <button
                        key={cite.record_id}
                        onClick={() => handleOpenCitation(cite)}
                        className="min-h-[44px] text-xs px-3 py-2 bg-slate-50 hover:bg-teal-50 text-slate-800 hover:text-teal-900 border border-slate-200 hover:border-teal-300 rounded-xl font-medium transition-all flex items-center justify-between touch-press group text-left"
                      >
                        <div className="flex items-center space-x-2 min-w-0 pr-2">
                          <FileText className="w-4 h-4 text-slate-400 group-hover:text-teal-600 shrink-0" />
                          <span className="truncate font-semibold">{cite.record_title}</span>
                        </div>
                        <div className="flex items-center space-x-1 shrink-0 text-slate-500 font-mono text-[10px]">
                          <span>{cite.record_date}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Records & Timeline */}
        {activeTab === 'records' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">Shared Patient Reports</h3>
                <p className="text-xs text-slate-500">Tap any report to inspect verified diagnostic findings and original document archive</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {records.map(r => (
                <div
                  key={r.id}
                  onClick={() => setSelectedRecord(r)}
                  className="bg-white p-4 rounded-2xl border border-slate-200/90 hover:border-teal-300 shadow-2xs hover:shadow-xs cursor-pointer transition-all space-y-2.5 touch-press"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                      {r.record_type}
                    </span>
                    <span className="text-xs font-mono font-semibold text-slate-500">
                      {r.record_date}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{r.title}</h4>
                  <p className="text-xs text-slate-500 truncate">{r.hospital || r.doctor || 'Clinical Laboratory'}</p>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-teal-600 font-bold">
                    <span>Inspect Findings & Original →</span>
                    <FileText className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Ask Clinical AI */}
        {activeTab === 'ai' && (
          <div className="h-[75vh]">
            <AIChatbot
              actorType="doctor"
              onOpenRecord={(id) => {
                const found = records.find(r => r.id === id);
                if (found) setSelectedRecord(found);
              }}
              onViewRecordDetail={handleOpenCitation}
            />
          </div>
        )}
      </main>

      {/* ================================================== */}
      {/* 2b. END CONSULTATION CONFIRMATION MODAL            */}
      {/* ================================================== */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>
            
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-slate-900">End consultation?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                This will close the current patient consultation session and revoke access to shared medical records.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowEndModal(false)}
                disabled={isEnding}
                className="min-h-[44px] py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl touch-press transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEndSession}
                disabled={isEnding}
                className="min-h-[44px] py-2.5 px-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 touch-press shadow-sm transition-colors"
              >
                {isEnding ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Ending...</span>
                  </>
                ) : (
                  <span>End Consultation</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />

      {/* AI Clinical Summary Modal */}
      <ClinicalSummaryModal
        isOpen={showClinicalSummaryModal}
        summaryData={clinicalSummary}
        onClose={() => setShowClinicalSummaryModal(false)}
        onOpenRecordCitation={handleOpenCitation}
      />
    </div>
  );
};
