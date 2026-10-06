# MediBrief

> **“Your medical history, organized and understood.”**

MediBrief is a production-style, AI-powered Medical Records Management and Sharing Web Application built with the core clinical principle:

> **The AI should make medical records easier to understand, but the original medical documents remain the source of truth.**
>
> Every critical AI statement traces directly back: **AI Insight → Citation → Original Medical Report**.

---

## Key Features

1. **Patient Authentication**:
   - Mobile Number + OTP authentication with rate limiting and expiration.
   - Built-in development mock OTP (`123456`) and pluggable SMS provider interface (Twilio / MSG91 / Firebase).

2. **Document Capture & Medical OCR Pipeline**:
   - Live Webcam / Camera scanner mode with viewfinder alignment framing.
   - Drag-and-drop upload for PDF, JPG, PNG, and multi-page reports.
   - Multi-stage OCR pipeline: Preprocessing → Optical Character Recognition → Clinical Entity Extraction (extracts test names, numeric values, units, biological reference ranges, abnormal flags, diagnoses, and prescriptions).

3. **Side-by-Side OCR Verification**:
   - Compares the original document directly adjacent to extracted fields.
   - Patient can review, correct, or add test findings and medications before finalizing.

4. **Chronological Medical Timeline & Search**:
   - Multi-year chronological timeline (newest to oldest) and searchable list view.
   - Filters by record type, hospital, physician, date range, or clinical keyword.
   - Visual abnormal indicators and prescription tags.

5. **Patient-Scoped AI Assistant ("MediVault AI")**:
   - Retrieval-Augmented Generation (RAG) using cosine similarity over chunked medical embeddings.
   - **Strict Patient Isolation**: Retrieval query enforces `patient_id = authenticated_patient_id`.
   - **Anti-Hallucination Guardrails**: When data is not present, responds: *"I couldn't find this information in the medical records available to me."*
   - Clickable source citations (`[Blood Test — 2026-07-20]`) that immediately open the source document in the viewer.

6. **Temporary Doctor Sharing System**:
   - Zero-password patient sharing: Generates cryptographically random 8-character codes (`XXXX-XXXX`, e.g. `M7K4-XP92`) and scannable QR codes.
   - Stored securely in database as a SHA-256 hash.
   - Scoped sharing: All records, custom date range, or filtered by report category.
   - **Flexible Session Lifecycle**: The session remains active until explicitly revoked by the patient or ended by the doctor from their portal.
   - Instant revocation: When revoked, doctor access is immediately terminated with real-time feedback.

7. **Dedicated Doctor Portal & Clinical Dashboard**:
   - Fast access at `/doctor` via code entry or QR code scan.
   - Patient clinical summary: Age, blood group, active diagnoses, current medications, recent lab trends.
   - AI Clinical Medical Digest ready for rapid consultation.
   - Doctor AI Chatbot strictly constrained to the records shared in that session.
   - Single-click `[End Consultation Session]` button.

8. **Security & Immutable Audit Trail**:
   - HMAC-SHA256 signed expiring URLs for private storage files.
   - Complete audit logging of access code creation, doctor logins, document inspections, AI queries, and session endings.

---

## System Architecture

```text
                                  +-----------------------+
                                  |     MediBrief Web     |
                                  |   (React + Vite UI)   |
                                  +-----------+-----------+
                                              |
                   REST API / JSON / Multipart|
                                              v
                              +---------------+---------------+
                              |    Node.js Express Backend    |
                              |   (TypeScript Architecture)   |
                              +---------------+---------------+
                                              |
      +-------------------+-------------------+-------------------+-------------------+
      |                   |                   |                   |                   |
      v                   v                   v                   v                   v
+-----------+       +-----------+       +-----------+       +-----------+       +-----------+
|  Auth &   |       |  Private  |       |  Medical  |       | RAG & AI  |       |  Doctor   |
| OTP Serv. |       |  Storage  |       |  OCR Pipe |       |  Service  |       |  Sharing  |
+-----------+       +-----------+       +-----------+       +-----------+       +-----------+
      |                   |                   |                   |                   |
(Twilio / Mock)     (HMAC URLs)         (Regex/Vision)      (Embeddings)        (SHA-256)
      |                   |                   |                   |                   |
      +-------------------+-------------------+-------------------+-------------------+
                                              |
                                              v
                                  +-----------+-----------+
                                  |   Database (SQLite /  |
                                  | PostgreSQL + pgvector)|
                                  +-----------------------+
```

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, `qrcode.react`.
- **Backend**: Node.js v24, Express, TypeScript, `better-sqlite3`, `jsonwebtoken`, `multer`, `uuid`.
- **Database**: SQLite (high-performance, zero-config local database with WAL mode and foreign keys enabled) with direct migration compatibility to PostgreSQL (`pgvector`).
- **Storage**: Pluggable storage service (`LocalStorageService` with HMAC-SHA256 token-signed URLs, extensible to AWS S3 & Google Cloud Storage).
- **OCR Engine**: Medical OCR parser extracting clinical entities, reference intervals, abnormal flags, and prescriptions.
- **RAG / AI**: Vector cosine similarity search with patient-scoped and doctor-session whitelists, citation generation, and anti-hallucination guardrails.

---

## Project Structure

```text
MediBrief/
│
├── frontend/                     # React + Vite + Tailwind frontend
│   ├── src/
│   │   ├── components/           # Reusable clinical UI components
│   │   │   ├── Navbar.tsx
│   │   │   ├── DocumentViewerModal.tsx
│   │   │   ├── CameraScannerModal.tsx
│   │   │   ├── OCRVerificationModal.tsx
│   │   │   ├── AIChatbot.tsx
│   │   │   ├── DoctorSharingModal.tsx
│   │   │   ├── ActiveSessionsCard.tsx
│   │   │   ├── TimelineView.tsx
│   │   │   └── ClinicalSummaryModal.tsx
│   │   ├── pages/                # Application views
│   │   │   ├── LandingPage.tsx
│   │   │   ├── PatientLoginPage.tsx
│   │   │   ├── PatientDashboard.tsx
│   │   │   ├── RecordsPage.tsx
│   │   │   ├── AIAssistantPage.tsx
│   │   │   ├── DoctorAccessPage.tsx
│   │   │   ├── DoctorDashboardPage.tsx
│   │   │   └── AuditHistoryPage.tsx
│   │   ├── context/              # Auth & Doctor session state
│   │   ├── services/             # API client
│   │   └── types/                # Domain models
│   └── vite.config.ts
│
├── backend/                      # Node.js + Express TypeScript backend
│   ├── src/
│   │   ├── config/               # Environment & provider config
│   │   ├── controllers/          # Request handlers
│   │   ├── db/                   # Database schema & connection
│   │   ├── middleware/           # Patient & Doctor auth guards
│   │   ├── routes/               # API route definitions
│   │   ├── seeds/                # Demo data seeder
│   │   ├── services/             # Core business logic services
│   │   │   ├── auth.service.ts
│   │   │   ├── storage.service.ts
│   │   │   ├── ocr.service.ts
│   │   │   ├── rag.service.ts
│   │   │   ├── ai.service.ts
│   │   │   ├── sharing.service.ts
│   │   │   └── audit.service.ts
│   │   ├── types/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/                    # Automated test suite
│   └── uploads/                  # Private document storage
│
├── .env.example
├── package.json                  # Root runner
└── README.md
```

---

## Quick Start & Local Setup

### Prerequisites
- **Node.js**: v18 or higher (v24 tested)
- **npm**: v9 or higher

### 1. Clone & Install Dependencies
```bash
# Navigate to project root
cd c:\MediBrief

# Install root dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Configure Environment Variables
Copy `.env.example` to `backend/.env`:
```bash
cp .env.example backend/.env
```
Default values work out of the box with zero external accounts required!

### 3. Run Automated Tests
Run the comprehensive test suite to verify authentication rate limiting, chronological ordering, doctor sharing revocation, and mandatory cross-patient isolation:
```bash
npm run test
```
All 12 tests will execute and verify the system integrity.

### 4. Start the Application
Run both the backend API server and frontend development client with a single command:
```bash
npm run dev
```

- **Patient Portal & Landing**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **API Health Check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)
- **Direct Doctor Portal**: [http://localhost:3000/doctor](http://localhost:3000/doctor)

---

## Demo Credentials & Pre-Seeded Patient

To make demonstration instantaneous, MediBrief includes a pre-seeded patient account:

- **Patient Name**: Rahul Sharma (Age 42, Blood Group O+)
- **Mobile Number**: `+91 98765 43210`
- **Verification OTP**: `123456`
- **Pre-seeded Records**: 12 multi-year medical reports spanning **2023 → 2026** (Blood tests, HbA1c tests, Renal profiles, Ophthalmology screening, Lipid profiles, Chest X-Rays, Inpatient Cholecystectomy discharge summary, Ultrasound, MRI Brain, and annual Cardiology evaluations).
- Clearly labeled in the UI as: **`DEMO DATA — NOT REAL MEDICAL RECORDS`**.

On the login page, you can also click **"1-Click Demo Login (Rahul Sharma)"** to log in immediately.

---

## Doctor Sharing Workflow

1. Patient logs in and clicks **Share With Doctor**.
2. Patient selects scope (e.g. *Last 6 Months* or specific categories like *Blood Tests*).
3. System generates an 8-character cryptographically random access code (e.g. `M7K4-XP92`) and a scannable QR code.
4. Doctor navigates to `/doctor` and enters the code (or scans the QR code).
5. System validates the code against the SHA-256 hash in the database and creates a doctor session.
6. Doctor dashboard opens:
   - Patient Demographics & Active Diagnoses
   - Current Medication List
   - AI Clinical Medical Digest
   - Chronological Timeline of shared reports
   - Doctor AI Chatbot strictly scoped to the shared records, citing sources.
7. Either the patient clicks **[Revoke Access]** from their dashboard OR the doctor clicks **[End Consultation Session]**.
8. Access is immediately terminated and subsequent doctor requests receive HTTP 403 Forbidden.
9. Every action is recorded in the immutable **Access History** audit log.

---

## Mandatory Security & Isolation Guarantees

1. **Strict Cross-Patient Isolation**:
   Every database query and vector retrieval explicitly filters by `patient_id = authenticated_patient_id`. Patient A cannot access Patient B's records or vector embeddings under any circumstances.
2. **Strict Doctor Scoping**:
   Doctor queries enforce:
   ```sql
   WHERE patient_id = :shared_patient_id AND record_id IN (:permitted_record_ids)
   ```
3. **No Stored Plaintext Sharing Codes**:
   Sharing codes are hashed using SHA-256 upon generation. Only the hash is stored in the database.
4. **No Public Document URLs**:
   Medical files are stored privately. Access requires HMAC-SHA256 signed expiring URLs with time-limited tokens.
5. **Anti-Hallucination Guardrails**:
   MediVault AI refuses to speculate or fabricate nonexistent medical events, directing users to discuss with qualified medical professionals.

---

## Production Deployment Guide

### Database (PostgreSQL + pgvector)
To deploy with PostgreSQL and pgvector:
1. Update `backend/.env`:
   ```env
   DATABASE_URL=postgresql://medibrief:password@localhost:5432/medibrief
   ```
2. Enable pgvector:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### Cloud Storage (AWS S3)
Set in `backend/.env`:
```env
STORAGE_PROVIDER=s3
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket
```

### Mobile Authentication: Firebase Phone Authentication (Production +91)

MediBrief integrates **Firebase Authentication Phone Number Sign-In** with invisible reCAPTCHA for real SMS delivery to Indian (+91) and international mobile numbers.

#### Why Firebase Phone Authentication?
- **Global & Indian SMS Delivery**: Backed by Google's telecom routing infrastructure. No DLT registration bottlenecks or external carrier delays.
- **Security & No Leaks**: The client uses only public Firebase Web Config keys. Admin tokens are cryptographically verified on the backend via `FirebaseService` (`firebase-admin`), and the Firebase UID is securely linked against the MediBrief patient record in SQLite/PostgreSQL.
- **Pluggable Architecture**: Built on top of an abstract authentication layer so other providers can be swapped in seamlessly.
- **White-listed Test Numbers**: Supports Firebase test phone numbers for deterministic CI/CD and automated development without consuming real cellular SMS quotas.

#### 1. Setup Firebase Project & Phone Authentication
1. Go to the [Firebase Console](https://console.firebase.google.com).
2. Create or select a project (e.g. `medibrief-prod`).
3. Navigate to **Build** → **Authentication** → **Sign-in method**.
4. Click **Phone** and toggle **Enable**.
5. *(Optional for Dev)* Under **Phone numbers for testing**, add test numbers (e.g. `+91 98765 43210` with test OTP `123456`). Real numbers will automatically receive physical cellular SMS!
6. Navigate to **Project settings** → **General** → **Your apps** → click the **Web app** (`</>`) icon.
7. Copy the `firebaseConfig` keys (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).

#### 2. Backend Environment Variables (`backend/.env`)
```env
OTP_PROVIDER=firebase

# Firebase Admin Credentials (Backend verification)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
# Or provide service account JSON path:
# FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./serviceAccountKey.json

# Web App Configuration (optional, automatically sent to frontend)
FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:...
```

#### 3. Frontend In-App Setup or Local Storage
You can also configure Firebase directly in the UI without editing code:
1. Open [http://localhost:3000](http://localhost:3000) and click **Patient Sign In**.
2. Click **"Connect Firebase"** or **"Firebase Config"**.
3. Paste your `apiKey` and `projectId`.
4. Click **Save & Enable Firebase**.

#### 4. Real SMS Flow
1. User enters real 10-digit Indian phone number (e.g. `+91 98765 00000`).
2. Firebase triggers invisible reCAPTCHA and dispatches a real SMS OTP directly to the phone.
3. User enters the received 6-digit OTP in the input field.
4. Firebase verifies the OTP and generates a cryptographic Firebase ID token.
5. The backend verifies the token, creates or locates the patient record, stores the `firebase_uid`, and issues a MediBrief session JWT.



### LLM Provider (Gemini / OpenAI)
Set in `backend/.env`:
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
# OR
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
```

---

## License & Medical Disclaimer

MediBrief is designed for medical record organization, clinical synthesis, and secure sharing. It is not an emergency response system and does not replace professional medical judgment or formal medical diagnosis.
