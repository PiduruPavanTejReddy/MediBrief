export const getApiBase = (): string => {
  // 1. Check if user configured a custom backend IP/URL in app settings (useful for mobile app over Wi-Fi)
  const custom = localStorage.getItem('medibrief_api_url');
  if (custom) {
    return `${custom.replace(/\/$/, '')}/api`;
  }
  // 2. Check build-time environment variable
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`;
  }
  // 3. In native Capacitor webview, if running without a port, default to local machine Wi-Fi / emulator host
  if (typeof window !== 'undefined' && (window.location.protocol === 'capacitor:' || (window.location.hostname === 'localhost' && !window.location.port))) {
    return 'http://10.0.2.2:5000/api';
  }
  // 4. Default relative path for web browser
  return '/api';
};

export class ApiService {
  public static getBaseUrl(): string {
    return getApiBase();
  }

  public static setCustomApiUrl(url: string): void {
    if (url.trim()) {
      localStorage.setItem('medibrief_api_url', url.trim());
    } else {
      localStorage.removeItem('medibrief_api_url');
    }
  }

  private static getPatientToken(): string | null {
    return localStorage.getItem('medibrief_patient_token');
  }

  private static getDoctorToken(): string | null {
    return localStorage.getItem('medibrief_doctor_token');
  }

  private static async request<T>(
    endpoint: string,
    options: RequestInit = {},
    authType: 'patient' | 'doctor' | 'none' = 'patient'
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (authType === 'patient') {
      const token = this.getPatientToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } else if (authType === 'doctor') {
      const token = this.getDoctorToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const base = getApiBase();
    const response = await fetch(`${base}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();
    if (!response.ok || data.success === false) {
      throw new Error(data.error || 'Network request failed');
    }

    return data.data !== undefined ? data.data : data;
  }

  // --- Auth & Patient ---
  public static async sendOtp(mobileNumber: string) {
    return this.request<{
      success: boolean;
      message: string;
      devOtp?: string;
      expiresInSeconds: number;
      smsDelivered?: boolean;
      smsProvider?: string;
      smsError?: string;
    }>(
      '/auth/send-otp',
      {
        method: 'POST',
        body: JSON.stringify({ mobileNumber })
      },
      'none'
    );
  }

  public static async resendOtp(mobileNumber: string) {
    return this.request<{
      success: boolean;
      message: string;
      expiresInSeconds: number;
      devOtp?: string;
      smsDelivered?: boolean;
      smsProvider?: string;
      smsError?: string;
    }>(
      '/auth/resend-otp',
      {
        method: 'POST',
        body: JSON.stringify({ mobileNumber })
      },
      'none'
    );
  }

  public static async verifyFirebase(idToken: string, mobileNumber?: string) {
    return this.request<{ token: string; user: any; profile: any; isNewUser: boolean }>(
      '/auth/verify-firebase',
      {
        method: 'POST',
        body: JSON.stringify({ idToken, mobileNumber })
      },
      'none'
    );
  }

  public static async getSMSStatus() {
    return this.request<{
      provider: string;
      hasFirebase: boolean;
      hasMiniMoth?: boolean;
      activeProvider: string;
      firebaseConfig?: {
        apiKey: string;
        authDomain: string;
        projectId: string;
        storageBucket?: string;
        messagingSenderId?: string;
        appId?: string;
      };
    }>(
      '/auth/sms-status',
      {},
      'none'
    );
  }

  public static async configureMiniMoth(apiKey: string) {
    return this.request<{ success: boolean; message: string }>(
      '/auth/configure-minimoth',
      {
        method: 'POST',
        body: JSON.stringify({ apiKey })
      },
      'none'
    );
  }

  public static async configureFirebase(firebaseConfig: {
    apiKey: string;
    authDomain?: string;
    projectId: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
  }) {
    return this.request<{ success: boolean; message: string }>(
      '/auth/configure-firebase',
      {
        method: 'POST',
        body: JSON.stringify(firebaseConfig)
      },
      'none'
    );
  }

  public static async getGeminiStatus() {
    return this.request<{ hasGemini: boolean; aiProvider: string }>(
      '/auth/gemini-status',
      {},
      'none'
    );
  }

  public static async configureGemini(apiKey: string) {
    return this.request<{ success: boolean; message: string }>(
      '/auth/configure-gemini',
      {
        method: 'POST',
        body: JSON.stringify({ apiKey })
      },
      'none'
    );
  }

  public static async verifyOtp(mobileNumber: string, otp: string) {
    return this.request<{ token: string; user: any; profile: any; isNewUser: boolean }>(
      '/auth/verify-otp',
      {
        method: 'POST',
        body: JSON.stringify({ mobileNumber, otp })
      },
      'none'
    );
  }

  public static async getProfile() {
    return this.request<{ user: any; profile: any }>('/patients/profile', {}, 'patient');
  }

  public static async saveProfile(profileData: any) {
    return this.request('/patients/profile', {
      method: 'POST',
      body: JSON.stringify(profileData)
    }, 'patient');
  }

  // --- Records & OCR ---
  public static async uploadDocument(file: File) {
    const formData = new FormData();
    formData.append('document', file);

    const token = this.getPatientToken();
    const base = getApiBase();
    const response = await fetch(`${base}/records/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Upload failed');
    }
    return data.data;
  }

  public static async verifyAndSaveRecord(verifiedData: any) {
    return this.request('/records/verify-and-save', {
      method: 'POST',
      body: JSON.stringify(verifiedData)
    }, 'patient');
  }

  public static async getRecords(filters?: { type?: string; search?: string; doctor?: string; hospital?: string; dateFrom?: string; dateTo?: string }) {
    const params = new URLSearchParams();
    if (filters?.type && filters.type !== 'All') params.append('type', filters.type);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.doctor) params.append('doctor', filters.doctor);
    if (filters?.hospital) params.append('hospital', filters.hospital);
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);

    const qs = params.toString();
    return this.request<any[]>(`/records${qs ? `?${qs}` : ''}`, {}, 'patient');
  }

  public static async getRecordById(id: string) {
    return this.request<any>(`/records/${id}`, {}, 'patient');
  }

  public static async deleteRecord(id: string) {
    return this.request(`/records/${id}`, { method: 'DELETE' }, 'patient');
  }

  // --- AI ---
  public static async askPatientAI(question: string, history?: any[]) {
    return this.request<{ answer: string; citations: any[]; disclaimer: string }>(
      '/ai/chat',
      {
        method: 'POST',
        body: JSON.stringify({ question, history })
      },
      'patient'
    );
  }

  public static async generatePatientSummary() {
    return this.request<any>('/ai/summary', {}, 'patient');
  }

  // --- Sharing ---
  public static async createSharingSession(payload: {
    scopeType: 'all' | 'date_range' | 'categories' | 'selected';
    categories?: string[];
    dateFrom?: string;
    dateTo?: string;
    selectedRecordIds?: string[];
  }) {
    return this.request<{ session: any; accessCode: string; qrCodeUrl: string; recordCount: number }>(
      '/sharing/create',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      },
      'patient'
    );
  }

  public static async getActiveSessions() {
    return this.request<any[]>('/sharing/active', {}, 'patient');
  }

  public static async revokeSession(sessionId: string) {
    return this.request(`/sharing/${sessionId}/revoke`, { method: 'POST' }, 'patient');
  }

  // --- Doctor Portal ---
  public static async verifyDoctorCode(accessCode: string) {
    return this.request<{ doctorToken: string; sharingSessionId: string; patientId: string; recordCount: number }>(
      '/sharing/verify-code',
      {
        method: 'POST',
        body: JSON.stringify({ accessCode })
      },
      'none'
    );
  }

  public static async getDoctorSessionInfo() {
    return this.request<any>('/doctor/session', {}, 'doctor');
  }

  public static async getDoctorRecords() {
    return this.request<any[]>('/doctor/records', {}, 'doctor');
  }

  public static async askDoctorAI(question: string, history?: any[]) {
    return this.request<{ answer: string; citations: any[]; disclaimer: string }>(
      '/doctor/ai/chat',
      {
        method: 'POST',
        body: JSON.stringify({ question, history })
      },
      'doctor'
    );
  }

  public static async endDoctorSession() {
    return this.request('/doctor/end-session', { method: 'POST' }, 'doctor');
  }

  // --- Audit ---
  public static async getAuditHistory(limit: number = 50) {
    return this.request<any[]>(`/audit/history?limit=${limit}`, {}, 'patient');
  }
}
