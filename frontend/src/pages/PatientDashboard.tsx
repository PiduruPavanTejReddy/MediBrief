import React, { useState, useMemo } from 'react';
import { 
  Camera, 
  UploadCloud, 
  Bot, 
  Share2, 
  Sparkles, 
  Activity, 
  User, 
  Phone, 
  ArrowRight, 
  ShieldCheck, 
  FilePlus2, 
  FileText,
  Calendar,
  AlertCircle,
  Clock,
  ChevronRight,
  MoreVertical,
  Trash2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MedicalRecord, SharingSession } from '../types';
import { ActiveSessionsCard } from '../components/ActiveSessionsCard';
import { RecordActionSheet } from '../components/RecordActionSheet';
import { formatAge } from '../utils/dateUtils';

interface PatientDashboardProps {
  records: MedicalRecord[];
  activeSessions: SharingSession[];
  onOpenScanModal: () => void;
  onOpenShareModal: () => void;
  onNavigateTab: (tab: string) => void;
  onSelectRecord: (record: MedicalRecord) => void;
  onRevokeSession: (sessionId: string) => void;
  onGenerateSummary: () => void;
  onOpenEditProfile?: () => void;
  onDeleteRecord?: (record: MedicalRecord) => void;
}

export const PatientDashboard: React.FC<PatientDashboardProps> = ({
  records,
  activeSessions,
  onOpenScanModal,
  onOpenShareModal,
  onNavigateTab,
  onSelectRecord,
  onRevokeSession,
  onGenerateSummary,
  onOpenEditProfile,
  onDeleteRecord
}) => {
  const { profile, user } = useAuth();
  const [actionRecordForSheet, setActionRecordForSheet] = useState<MedicalRecord | null>(null);
  const isDemoUser = user?.mobile_number === '+919876543210';

  // Dynamically calculate age from date of birth
  const ageDisplay = useMemo(() => {
    return formatAge(profile?.date_of_birth, { short: true });
  }, [profile?.date_of_birth]);

  const latestRecord = records[0];

  return (
    <div className="space-y-6 pb-6">
      
      {/* Patient Header & Profile Card */}
      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-7 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50/60 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Welcome, {profile?.full_name || 'Patient'}
              </h1>
              
              {isDemoUser ? (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wider">
                  DEMO DATA
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center space-x-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>SECURE VAULT</span>
                </span>
              )}
            </div>

            {/* Profile Vitals Pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-2">
              <div className="bg-slate-100 px-2.5 py-1 rounded-xl font-medium flex items-center space-x-1.5" title={profile?.date_of_birth ? `DOB: ${profile.date_of_birth}` : undefined}>
                <User className="w-3.5 h-3.5 text-teal-600" />
                <span>Age: <strong className="text-slate-800">{ageDisplay}</strong></span>
              </div>
              <div className="bg-slate-100 px-2.5 py-1 rounded-xl font-medium flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-teal-600" />
                <span>Blood: <strong className="text-teal-700">{profile?.blood_group || 'Unknown'}</strong></span>
              </div>
              {profile?.emergency_contact && (
                <div className="bg-slate-100 px-2.5 py-1 rounded-xl font-medium flex items-center space-x-1.5">
                  <Phone className="w-3.5 h-3.5 text-teal-600" />
                  <span>Emergency: <strong className="text-slate-800">{profile.emergency_contact}</strong></span>
                </div>
              )}
              {onOpenEditProfile && (
                <button
                  onClick={onOpenEditProfile}
                  className="bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 px-2.5 py-1 rounded-xl font-bold flex items-center space-x-1 transition-colors touch-press text-xs"
                  title="Update profile & Date of Birth"
                >
                  <span>Edit Profile</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 pt-1 md:pt-0">
            <button
              onClick={onGenerateSummary}
              disabled={records.length === 0}
              className="flex-1 sm:flex-none min-h-[44px] px-2.5 sm:px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 disabled:opacity-40 text-indigo-700 border border-indigo-200 text-[11px] sm:text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-colors touch-press shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="truncate">Clinical Summary</span>
            </button>

            <button
              onClick={onOpenShareModal}
              disabled={records.length === 0}
              className="flex-1 sm:flex-none min-h-[44px] px-2.5 sm:px-4 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-40 text-white text-[11px] sm:text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 shadow-sm shadow-teal-600/20 transition-colors touch-press"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span className="truncate">Share With Doctor</span>
            </button>
          </div>
        </div>

        {/* Knowledge Base Snapshot */}
        {records.length > 0 ? (
          <div className="mt-5 p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200/80 text-xs text-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-900 flex items-center space-x-1.5">
                <Bot className="w-4 h-4 text-teal-600" />
                <span>MediVault Health Insights</span>
              </span>
              <span className="text-[11px] font-semibold text-teal-800">
                {records.length} Verified Records
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
              <div className="bg-white/90 p-2.5 rounded-xl border border-teal-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Latest Test</div>
                <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">{latestRecord?.title || 'None'}</div>
              </div>
              <div className="bg-white/90 p-2.5 rounded-xl border border-teal-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Date</div>
                <div className="text-xs font-bold text-slate-900 mt-0.5">{latestRecord?.record_date || 'N/A'}</div>
              </div>
              <div className="bg-white/90 p-2.5 rounded-xl border border-teal-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Provider</div>
                <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">{latestRecord?.doctor || latestRecord?.hospital || 'General Lab'}</div>
              </div>
              <div className="bg-white/90 p-2.5 rounded-xl border border-teal-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Shared Sessions</div>
                <div className="text-xs font-bold text-teal-700 mt-0.5">{activeSessions.length} Active</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center space-x-3">
            <FilePlus2 className="w-5 h-5 text-teal-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-800">Your Medical Vault is ready! </span>
              Scan your first lab report or prescription below to start building your chronological health timeline.
            </div>
          </div>
        )}
      </section>

      {/* Quick Actions Grid (Mobile-First: 2 columns on small screens, touch targets >= 44px) */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Quick Actions</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          
          <button
            onClick={onOpenScanModal}
            className="p-3.5 bg-white hover:bg-teal-50/50 active:bg-teal-100/50 border border-slate-200/90 hover:border-teal-300 rounded-2xl text-left shadow-2xs transition-all touch-press flex flex-col justify-between h-28"
          >
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Scan Report</div>
              <div className="text-[10px] text-slate-500">Camera OCR capture</div>
            </div>
          </button>

          <button
            onClick={onOpenScanModal}
            className="p-3.5 bg-white hover:bg-teal-50/50 active:bg-teal-100/50 border border-slate-200/90 hover:border-teal-300 rounded-2xl text-left shadow-2xs transition-all touch-press flex flex-col justify-between h-28"
          >
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Upload PDF / File</div>
              <div className="text-[10px] text-slate-500">PDF, JPG, or PNG</div>
            </div>
          </button>

          <button
            onClick={() => onNavigateTab('ai')}
            className="p-3.5 bg-white hover:bg-indigo-50/50 active:bg-indigo-100/50 border border-slate-200/90 hover:border-indigo-300 rounded-2xl text-left shadow-2xs transition-all touch-press flex flex-col justify-between h-28"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Ask MediVault AI</div>
              <div className="text-[10px] text-slate-500">Query your records</div>
            </div>
          </button>

          <button
            onClick={onGenerateSummary}
            disabled={records.length === 0}
            className="p-3.5 bg-white hover:bg-indigo-50/50 active:bg-indigo-100/50 disabled:opacity-40 border border-slate-200/90 hover:border-indigo-300 rounded-2xl text-left shadow-2xs transition-all touch-press flex flex-col justify-between h-28"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Generate Summary</div>
              <div className="text-[10px] text-slate-500">Clinical overview</div>
            </div>
          </button>

          <button
            onClick={onOpenShareModal}
            disabled={records.length === 0}
            className="p-3.5 bg-white hover:bg-emerald-50/50 active:bg-emerald-100/50 disabled:opacity-40 border border-slate-200/90 hover:border-emerald-300 rounded-2xl text-left shadow-2xs transition-all touch-press flex flex-col justify-between h-28 col-span-2 sm:col-span-1"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Share With Doctor</div>
              <div className="text-[10px] text-slate-500">8-char code or QR</div>
            </div>
          </button>
        </div>
      </section>

      {/* Active Sharing Sessions */}
      <ActiveSessionsCard
        sessions={activeSessions}
        onRevoke={onRevokeSession}
        onNewShareClick={onOpenShareModal}
      />

      {/* Recent Medical History Timeline Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-bold text-slate-900">Recent Medical History</h2>
            <span className="text-xs font-semibold text-slate-400">({records.length})</span>
          </div>
          {records.length > 0 && (
            <button
              onClick={() => onNavigateTab('records')}
              className="text-xs font-bold text-teal-600 hover:text-teal-700 active:text-teal-800 flex items-center space-x-1 touch-press"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {records.length === 0 ? (
          <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="max-w-xs mx-auto">
              <h3 className="text-sm font-bold text-slate-800">No medical records added yet</h3>
              <p className="text-xs text-slate-500 mt-1">
                Scan or upload a blood test, prescription, or scan report to organize your health history.
              </p>
            </div>
            <button
              onClick={onOpenScanModal}
              className="min-h-[44px] px-6 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors touch-press"
            >
              + Add First Record
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {records.slice(0, 3).map((rec) => {
              const hasAbnormal = rec.findings?.some(f => f.abnormal_flag === 1 || f.isAbnormal);
              return (
                <div
                  key={rec.id}
                  onClick={() => onSelectRecord(rec)}
                  className="bg-white rounded-2xl border border-slate-200/90 hover:border-teal-300 p-4 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center justify-between touch-press gap-3"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 truncate">{rec.title}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                          {rec.record_type}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-0.5">
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{rec.record_date}</span>
                        </span>
                        {rec.hospital && (
                          <span className="truncate hidden sm:inline">{rec.hospital}</span>
                        )}
                        {hasAbnormal && (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded-full shrink-0">
                            <AlertCircle className="w-2.5 h-2.5" />
                            <span>Abnormal</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    <span className="text-xs font-semibold text-teal-600 hidden sm:inline">View</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionRecordForSheet(rec);
                      }}
                      className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center transition-colors touch-press"
                      title="Record options"
                      aria-label="Record options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Mobile-Friendly Record Actions Bottom Sheet */}
      <RecordActionSheet
        isOpen={Boolean(actionRecordForSheet)}
        record={actionRecordForSheet}
        onClose={() => setActionRecordForSheet(null)}
        onViewReport={(rec) => {
          onSelectRecord(rec);
        }}
        onShare={(rec) => {
          onOpenShareModal();
        }}
        onDelete={(rec) => {
          onDeleteRecord?.(rec);
        }}
      />
    </div>
  );
};
