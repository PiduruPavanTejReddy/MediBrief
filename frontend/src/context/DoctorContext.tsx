import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiService } from '../services/api';

interface DoctorContextType {
  doctorToken: string | null;
  sharingSessionId: string | null;
  patientInfo: any | null;
  permittedRecordCount: number;
  clinicalSummary: any | null;
  isDoctorAuthenticated: boolean;
  isLoading: boolean;
  sessionEndedReason: string | null;
  loginDoctor: (token: string, sessionId: string, count: number) => Promise<void>;
  endSession: () => Promise<void>;
  checkSessionStatus: () => Promise<boolean>;
}

const DoctorContext = createContext<DoctorContextType | undefined>(undefined);

export const DoctorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [doctorToken, setDoctorToken] = useState<string | null>(localStorage.getItem('medibrief_doctor_token'));
  const [sharingSessionId, setSharingSessionId] = useState<string | null>(localStorage.getItem('medibrief_doctor_session_id'));
  const [patientInfo, setPatientInfo] = useState<any | null>(null);
  const [permittedRecordCount, setPermittedRecordCount] = useState<number>(0);
  const [clinicalSummary, setClinicalSummary] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionEndedReason, setSessionEndedReason] = useState<string | null>(null);

  const loadSession = async () => {
    const token = localStorage.getItem('medibrief_doctor_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const data = await ApiService.getDoctorSessionInfo();
      setPatientInfo(data.patient);
      setPermittedRecordCount(data.permittedRecordCount);
      setClinicalSummary(data.clinicalSummary);
      setSessionEndedReason(null);
    } catch (err: any) {
      console.warn('Doctor session expired or ended:', err.message);
      setSessionEndedReason(err.message || 'This doctor access session is no longer active.');
      localStorage.removeItem('medibrief_doctor_token');
      localStorage.removeItem('medibrief_doctor_session_id');
      setDoctorToken(null);
      setPatientInfo(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  const loginDoctor = async (token: string, sessionId: string, count: number) => {
    localStorage.setItem('medibrief_doctor_token', token);
    localStorage.setItem('medibrief_doctor_session_id', sessionId);
    setDoctorToken(token);
    setSharingSessionId(sessionId);
    setPermittedRecordCount(count);
    setSessionEndedReason(null);
    setIsLoading(true);
    await loadSession();
  };

  const endSession = async () => {
    try {
      await ApiService.endDoctorSession();
    } catch (e) {
      // ignore
    } finally {
      localStorage.removeItem('medibrief_doctor_token');
      localStorage.removeItem('medibrief_doctor_session_id');
      setDoctorToken(null);
      setSharingSessionId(null);
      setPatientInfo(null);
      setClinicalSummary(null);
      setSessionEndedReason('You have successfully ended this consultation session.');
    }
  };

  const checkSessionStatus = async (): Promise<boolean> => {
    try {
      await ApiService.getDoctorSessionInfo();
      return true;
    } catch (err: any) {
      setSessionEndedReason(err.message || 'Session ended');
      endSession();
      return false;
    }
  };

  return (
    <DoctorContext.Provider
      value={{
        doctorToken,
        sharingSessionId,
        patientInfo,
        permittedRecordCount,
        clinicalSummary,
        isDoctorAuthenticated: !!doctorToken && !sessionEndedReason,
        isLoading,
        sessionEndedReason,
        loginDoctor,
        endSession,
        checkSessionStatus
      }}
    >
      {children}
    </DoctorContext.Provider>
  );
};

export const useDoctor = (): DoctorContextType => {
  const context = useContext(DoctorContext);
  if (!context) {
    throw new Error('useDoctor must be used within a DoctorProvider');
  }
  return context;
};
