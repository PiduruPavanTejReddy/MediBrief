import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DoctorProvider, useDoctor } from './context/DoctorContext';
import { ApiService } from './services/api';
import { MedicalRecord, SharingSession, ClinicalSummary } from './types';

import { Navbar } from './components/Navbar';
import { LandingPage } from './pages/LandingPage';
import { PatientLoginPage } from './pages/PatientLoginPage';
import { PatientDashboard } from './pages/PatientDashboard';
import { RecordsPage } from './pages/RecordsPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { DoctorAccessPage } from './pages/DoctorAccessPage';
import { DoctorDashboardPage } from './pages/DoctorDashboardPage';
import { AuditHistoryPage } from './pages/AuditHistoryPage';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { CheckCircle2 } from 'lucide-react';

import { CameraScannerModal } from './components/CameraScannerModal';
import { OCRVerificationModal } from './components/OCRVerificationModal';
import { DocumentViewerModal } from './components/DocumentViewerModal';
import { DoctorSharingModal } from './components/DoctorSharingModal';
import { ClinicalSummaryModal } from './components/ClinicalSummaryModal';
import { EditProfileModal } from './components/EditProfileModal';
import { DeleteRecordModal } from './components/DeleteRecordModal';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isDoctorAuthenticated } = useDoctor();

  // Route/View navigation state
  const [view, setView] = useState<'landing' | 'patient_login' | 'patient_app' | 'doctor_login' | 'doctor_app' | 'staff_login'>('landing');
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  // Shared application state
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [activeSessions, setActiveSessions] = useState<SharingSession[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<MedicalRecord | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals state
  const [isScanModalOpen, setIsScanModalOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [uploadDataForVerification, setUploadDataForVerification] = useState<any | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);
  const [summaryData, setSummaryData] = useState<ClinicalSummary | null>(null);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);

  // Check URL parameters on mount (e.g. if someone navigated to /staff/login, /doctor, or had a QR code)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    if (pathname === '/staff/login' || pathname === '/staff') {
      setView('staff_login');
    } else if (pathname === '/doctor' || urlParams.has('code')) {
      setView('doctor_login');
    }
  }, []);

  // Sync view with authentication state
  useEffect(() => {
    if (isDoctorAuthenticated) {
      setView('doctor_app');
    } else if (isAuthenticated) {
      setView('patient_app');
      loadPatientData();
    } else if (view === 'patient_app') {
      setView('landing');
    }
  }, [isAuthenticated, isDoctorAuthenticated]);

  const loadPatientData = async () => {
    try {
      const [recs, sessions] = await Promise.all([
        ApiService.getRecords(),
        ApiService.getActiveSessions()
      ]);
      setRecords(recs);
      setActiveSessions(sessions);
    } catch (err) {
      console.warn('Error loading patient data:', err);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (window.confirm('Are you sure you want to revoke this doctor sharing session immediately?')) {
      try {
        await ApiService.revokeSession(sessionId);
        await loadPatientData();
      } catch (err: any) {
        alert(err.message || 'Failed to revoke session');
      }
    }
  };

  const handleGenerateSummary = async () => {
    try {
      const summary = await ApiService.generatePatientSummary();
      setSummaryData(summary);
      setIsSummaryModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to generate medical summary');
    }
  };

  const handleOCRComplete = (uploadPayload: any) => {
    setUploadDataForVerification(uploadPayload);
  };

  const handleRecordSaved = async () => {
    await loadPatientData();
    setCurrentTab('records');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      await ApiService.deleteRecord(recordId);
      setRecords(prev => prev.filter(r => r.id !== recordId));
      if (selectedRecord?.id === recordId) {
        setSelectedRecord(null);
      }
      setRecordToDelete(null);
      showToast("Medical record deleted.");
    } catch (err: any) {
      console.error('Delete record failed:', err);
      throw err;
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  // 1. Doctor App View
  if (view === 'doctor_app') {
    return (
      <DoctorDashboardPage
        onExit={() => setView('landing')}
      />
    );
  }

  // 2. Doctor Login Portal
  if (view === 'doctor_login') {
    return (
      <DoctorAccessPage
        onAccessGranted={() => setView('doctor_app')}
        onBackToLanding={() => setView('landing')}
      />
    );
  }

  // 3. Staff Login Portal (Clerk only for Doctor/Clerk/Staff)
  if (view === 'staff_login') {
    return (
      <StaffLoginPage
        onBackToPatient={() => setView('patient_login')}
        onBackToLanding={() => setView('landing')}
        onDoctorAccess={() => setView('doctor_login')}
      />
    );
  }

  // 4. Patient Login Page (Phone OTP only)
  if (view === 'patient_login') {
    return (
      <PatientLoginPage
        onSuccess={() => setView('patient_app')}
        onBackToLanding={() => setView('landing')}
        onStaffLogin={() => setView('staff_login')}
      />
    );
  }

  // 5. Landing Page
  if (view === 'landing' && !isAuthenticated) {
    return (
      <LandingPage
        onPatientLogin={() => setView('patient_login')}
        onDoctorAccess={() => setView('doctor_login')}
        onStaffLogin={() => setView('staff_login')}
      />
    );
  }

  // 5. Authenticated Patient Portal
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenDoctorPortal={() => setView('doctor_login')}
        onOpenEditProfile={() => setIsEditProfileOpen(true)}
      />

      <main className={`flex-1 w-full mx-auto ${
        currentTab === 'ai'
          ? 'max-w-7xl px-0 md:px-6 lg:px-8 pt-0 md:pt-4 pb-0 md:pb-6 flex flex-col h-[calc(100dvh-3.75rem)] md:h-[calc(100vh-5rem)] min-h-0 overflow-hidden'
          : 'max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-24 md:pb-10'
      }`}>
        {currentTab === 'dashboard' && (
          <PatientDashboard
            records={records}
            activeSessions={activeSessions}
            onOpenScanModal={() => setIsScanModalOpen(true)}
            onOpenShareModal={() => setIsShareModalOpen(true)}
            onNavigateTab={setCurrentTab}
            onSelectRecord={setSelectedRecord}
            onRevokeSession={handleRevokeSession}
            onGenerateSummary={handleGenerateSummary}
            onOpenEditProfile={() => setIsEditProfileOpen(true)}
            onDeleteRecord={setRecordToDelete}
          />
        )}

        {currentTab === 'records' && (
          <RecordsPage
            records={records}
            onOpenScanModal={() => setIsScanModalOpen(true)}
            onSelectRecord={setSelectedRecord}
            onDeleteRecord={setRecordToDelete}
            onShareRecord={(rec) => {
              setSelectedRecord(rec);
              setIsShareModalOpen(true);
            }}
          />
        )}

        {currentTab === 'ai' && (
          <AIAssistantPage
            onOpenRecord={async (id) => {
              const found = records.find(r => r.id === id);
              if (found) {
                setSelectedRecord(found);
              } else {
                try {
                  const rec = await ApiService.getRecordById(id);
                  setSelectedRecord(rec);
                } catch (e) {}
              }
            }}
            onGenerateSummary={handleGenerateSummary}
            onBackToDashboard={() => setCurrentTab('dashboard')}
          />
        )}

        {currentTab === 'sharing' && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="text-left">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Share With Doctor</h1>
              <p className="text-xs text-slate-500 mt-1">
                Authorize physicians with temporary access codes or manage active sharing sessions
              </p>
            </div>

            <div className="p-5 sm:p-6 bg-white rounded-3xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Need to share your records with a doctor?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Generate a secure 8-character access code with selective records</p>
              </div>
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="w-full sm:w-auto min-h-[48px] px-6 py-3 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 touch-press text-center flex items-center justify-center space-x-1"
              >
                <span>+ Generate Doctor Access Code</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Current Authorized Sessions</h3>
              <div className="space-y-2.5">
                {activeSessions.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-4 text-center">No active sessions. Your medical records are completely private.</p>
                ) : (
                  activeSessions.map(s => (
                    <div key={s.id} className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-black text-lg text-slate-900">{s.access_code_display}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">ACTIVE</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{s.record_count || 'All'} records permitted</div>
                      </div>
                      <button
                        onClick={() => handleRevokeSession(s.id)}
                        className="min-h-[40px] px-3.5 py-2 bg-white text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold touch-press"
                      >
                        Revoke Access
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {currentTab === 'audit' && (
          <AuditHistoryPage />
        )}
      </main>

      {/* Camera / Upload Modal */}
      <CameraScannerModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onOCRComplete={handleOCRComplete}
      />

      {/* OCR Verification Modal (Side-by-side Review) */}
      <OCRVerificationModal
        isOpen={Boolean(uploadDataForVerification)}
        uploadData={uploadDataForVerification}
        onClose={() => setUploadDataForVerification(null)}
        onSaved={handleRecordSaved}
      />

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />

      {/* Doctor Sharing Wizard Modal */}
      <DoctorSharingModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onSessionCreated={loadPatientData}
      />

      {/* Clinical Summary Modal */}
      <ClinicalSummaryModal
        isOpen={isSummaryModalOpen}
        summaryData={summaryData}
        onClose={() => setIsSummaryModalOpen(false)}
        onOpenRecordCitation={cite => {
          const rec = records.find(r => r.id === cite.record_id);
          if (rec) {
            setIsSummaryModalOpen(false);
            setSelectedRecord(rec);
          }
        }}
      />

      {/* Edit Patient Profile Modal */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
      />

      {/* Delete Record Confirmation Modal */}
      <DeleteRecordModal
        isOpen={Boolean(recordToDelete)}
        record={recordToDelete}
        onClose={() => setRecordToDelete(null)}
        onConfirmDelete={handleDeleteRecord}
      />

      {/* Mobile-Friendly Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center space-x-2 text-xs font-semibold backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <DoctorProvider>
        <AppContent />
      </DoctorProvider>
    </AuthProvider>
  );
}
