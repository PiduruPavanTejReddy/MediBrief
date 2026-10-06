export type UserRole = 'patient' | 'doctor' | 'admin';

export interface User {
  id: string;
  role: UserRole;
  mobile_number: string;
  firebase_uid?: string;
  created_at: string;
  updated_at: string;
}

export interface PatientProfile {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  blood_group: string;
  emergency_contact: string;
  email?: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

export type RecordVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface MedicalRecord {
  id: string;
  patient_id: string;
  record_type: string;
  title: string;
  hospital: string;
  doctor: string;
  record_date: string;
  uploaded_at: string;
  original_file_key: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  extracted_text: string;
  verification_status: RecordVerificationStatus;
  metadata_json?: string;
  created_at: string;
  updated_at: string;
  findings?: ExtractedFinding[];
  medications?: Medication[];
  diagnoses?: Diagnosis[];
}

export interface ExtractedFinding {
  id: string;
  record_id: string;
  finding_type: string;
  name: string;
  value: string;
  unit?: string;
  reference_range?: string;
  abnormal_flag: number; // 0 or 1
  created_at: string;
}

export interface Medication {
  id: string;
  patient_id: string;
  record_id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  instructions?: string;
  created_at: string;
}

export interface Diagnosis {
  id: string;
  patient_id: string;
  record_id: string;
  diagnosis: string;
  diagnosis_date: string;
  created_at: string;
}

export type SharingSessionStatus = 'ACTIVE' | 'REVOKED' | 'ENDED' | 'EXPIRED';

export interface SharingSession {
  id: string;
  patient_id: string;
  access_code_hash: string;
  access_code_display: string;
  scope_type: 'all' | 'date_range' | 'categories' | 'selected';
  scope_categories_json?: string;
  scope_date_from?: string;
  scope_date_to?: string;
  status: SharingSessionStatus;
  doctor_session_id?: string;
  created_at: string;
  ended_at?: string;
  revoked_at?: string;
  revoked_by?: string;
  record_count?: number;
}

export interface AuditLog {
  id: string;
  patient_id: string;
  actor_type: 'patient' | 'doctor' | 'system';
  actor_id: string;
  action: string;
  metadata_json?: string;
  timestamp: string;
}

export interface AICitation {
  record_id: string;
  record_title: string;
  record_type: string;
  record_date: string;
  hospital?: string;
  doctor?: string;
  snippet?: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  message: string;
  citations?: AICitation[];
  created_at: string;
}

export interface DoctorSessionPayload {
  doctorSessionId: string;
  sharingSessionId: string;
  patientId: string;
  role: 'doctor';
  permittedRecordIds: string[];
}
