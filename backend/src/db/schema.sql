-- MediBrief Relational Database Schema
-- Production-ready schema with SQLite and PostgreSQL compatibility

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'patient',
  mobile_number TEXT UNIQUE NOT NULL,
  firebase_uid TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patient_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL,
  blood_group TEXT NOT NULL,
  emergency_contact TEXT NOT NULL,
  email TEXT,
  address TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medical_records (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,
  title TEXT NOT NULL,
  hospital TEXT NOT NULL,
  doctor TEXT NOT NULL,
  record_date TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  original_file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'verified',
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS extracted_findings (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
  finding_type TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT,
  reference_range TEXT,
  abnormal_flag INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medications (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  duration TEXT,
  instructions TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnoses (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
  diagnosis TEXT NOT NULL,
  diagnosis_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sharing_sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_code_hash TEXT UNIQUE NOT NULL,
  access_code_display TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'all',
  scope_categories_json TEXT,
  scope_date_from TEXT,
  scope_date_to TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  doctor_session_id TEXT,
  created_at TEXT NOT NULL,
  ended_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT
);

CREATE TABLE IF NOT EXISTS sharing_session_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sharing_sessions(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata_json TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL DEFAULT 'patient',
  sharing_session_id TEXT REFERENCES sharing_sessions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chat_session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  citations_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_verifications (
  id TEXT PRIMARY KEY,
  mobile_number TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_embeddings (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Indexes for performance & strict isolation
CREATE INDEX IF NOT EXISTS idx_medical_records_patient_id ON medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_date ON medical_records(record_date DESC);
CREATE INDEX IF NOT EXISTS idx_extracted_findings_record ON extracted_findings(record_id);
CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient ON diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_sharing_sessions_code ON sharing_sessions(access_code_hash);
CREATE INDEX IF NOT EXISTS idx_sharing_sessions_patient ON sharing_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_patient ON audit_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_embeddings_patient ON document_embeddings(patient_id);
