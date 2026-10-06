import React, { useState } from 'react';
import { X, Check, FileText, Plus, Trash2, Calendar, Building, User, Activity, Pill, AlertCircle, Save } from 'lucide-react';
import { ApiService } from '../services/api';

interface OCRVerificationModalProps {
  uploadData: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (savedRecord: any) => void;
}

export const OCRVerificationModal: React.FC<OCRVerificationModalProps> = ({
  uploadData,
  isOpen,
  onClose,
  onSaved
}) => {
  if (!isOpen || !uploadData) return null;

  const ocr = uploadData.ocrResult || {};

  // Editable form state initialized from OCR extraction
  const [activeMobileTab, setActiveMobileTab] = useState<'data' | 'document'>('data');
  const [title, setTitle] = useState<string>(ocr.title || uploadData.fileName || 'Medical Report');
  const [recordType, setRecordType] = useState<string>(ocr.recordType || 'Blood Test');
  const [recordDate, setRecordDate] = useState<string>(ocr.recordDate || new Date().toISOString().split('T')[0]);
  const [hospital, setHospital] = useState<string>(ocr.hospital || '');
  const [doctor, setDoctor] = useState<string>(ocr.doctor || '');
  const [findings, setFindings] = useState<any[]>(ocr.findings || []);
  const [medications, setMedications] = useState<any[]>(ocr.medications || []);
  const [diagnoses, setDiagnoses] = useState<string[]>(ocr.diagnoses || []);
  const [newDiagInput, setNewDiagInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const categories = [
    'Blood Test', 'Prescription', 'MRI', 'CT Scan', 'X-Ray', 'Ultrasound',
    'Discharge Summary', 'Consultation', 'Urine Test', 'Medication', 'Vaccination', 'Other'
  ];

  const handleUpdateFinding = (idx: number, field: string, value: any) => {
    const updated = [...findings];
    updated[idx] = { ...updated[idx], [field]: value };
    setFindings(updated);
  };

  const handleAddFinding = () => {
    setFindings([
      ...findings,
      { name: 'New Investigation', value: '', unit: '', referenceRange: '', isAbnormal: false }
    ]);
  };

  const handleRemoveFinding = (idx: number) => {
    setFindings(findings.filter((_, i) => i !== idx));
  };

  const handleUpdateMed = (idx: number, field: string, value: any) => {
    const updated = [...medications];
    updated[idx] = { ...updated[idx], [field]: value };
    setMedications(updated);
  };

  const handleAddMed = () => {
    setMedications([
      ...medications,
      { name: '', dosage: '', frequency: 'Once daily', instructions: '' }
    ]);
  };

  const handleRemoveMed = (idx: number) => {
    setMedications(medications.filter((_, i) => i !== idx));
  };

  const handleAddDiagnosis = () => {
    if (newDiagInput.trim() && !diagnoses.includes(newDiagInput.trim())) {
      setDiagnoses([...diagnoses, newDiagInput.trim()]);
      setNewDiagInput('');
    }
  };

  const handleRemoveDiagnosis = (idx: number) => {
    setDiagnoses(diagnoses.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        fileKey: uploadData.fileKey,
        fileName: uploadData.fileName,
        fileSize: uploadData.fileSize,
        mimeType: uploadData.mimeType,
        title,
        recordType,
        recordDate,
        hospital,
        doctor,
        extractedText: ocr.rawText || '',
        findings,
        medications,
        diagnoses
      };

      const result = await ApiService.verifyAndSaveRecord(payload);
      setIsSaving(false);
      onSaved(result);
      onClose();
    } catch (err: any) {
      console.error('Failed to save verified record:', err);
      setError(err.message || 'Failed to save verified record');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] sm:max-h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 sm:fade-in sm:zoom-in-95 duration-200">
        
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 bg-amber-50/60">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">Verify Extracted Data</h3>
                <span className="text-[10px] sm:text-[11px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                  CONFIRM DETAILS
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 line-clamp-1">Review lab results and details below before saving to your medical vault</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex lg:hidden border-b border-slate-200 bg-slate-100/90 p-1.5 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveMobileTab('data')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              activeMobileTab === 'data'
                ? 'bg-white text-teal-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <span>📋 Extracted Data</span>
            {findings.length > 0 && (
              <span className="bg-teal-100 text-teal-800 text-[10px] px-1.5 py-0.2 rounded-full font-extrabold">
                {findings.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveMobileTab('document')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              activeMobileTab === 'document'
                ? 'bg-white text-teal-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <span>📄 Original Document</span>
          </button>
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body - Split Screen on Desktop, Tabbed on Mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          
          {/* Document Preview Pane: On mobile only visible when activeMobileTab === 'document', always visible on lg */}
          <div className={`lg:col-span-5 p-3 sm:p-5 bg-slate-100/70 flex flex-col ${activeMobileTab === 'document' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Original Document Preview</span>
              <span className="text-[11px] text-slate-500 font-mono truncate max-w-[180px]">{uploadData.fileName}</span>
            </div>
            <div className="flex-1 bg-white rounded-xl border border-slate-200 p-2 shadow-inner overflow-auto max-h-[60vh] lg:max-h-[550px] flex items-center justify-center">
              {uploadData.previewUrl && (uploadData.mimeType?.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(uploadData.fileName)) ? (
                <img
                  src={uploadData.previewUrl}
                  alt="Original Document Preview"
                  className="max-w-full h-auto object-contain rounded-lg shadow-sm"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800 p-3 leading-relaxed w-full">
                  {ocr.rawText || 'Raw text preview not available.'}
                </pre>
              )}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 text-center flex items-center justify-center gap-2">
              <span>Zoom or pinch to inspect original document.</span>
              <button
                type="button"
                onClick={() => setActiveMobileTab('data')}
                className="lg:hidden text-teal-600 font-bold underline ml-1"
              >
                Back to Extracted Data &rarr;
              </button>
            </div>
          </div>

          {/* Right / Main: Editable Verification Form */}
          <div className={`lg:col-span-7 p-3 sm:p-5 space-y-4 sm:space-y-5 overflow-y-auto bg-white ${activeMobileTab === 'data' ? 'block' : 'hidden lg:block'}`}>
            
            {/* General Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Report Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category / Record Type</label>
                <select
                  value={recordType}
                  onChange={e => setRecordType(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Report Date</label>
                <input
                  type="date"
                  value={recordDate}
                  onChange={e => setRecordDate(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Hospital / Laboratory</label>
                <input
                  type="text"
                  value={hospital}
                  onChange={e => setHospital(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g. Apollo Diagnostics"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Doctor / Specialist</label>
                <input
                  type="text"
                  value={doctor}
                  onChange={e => setDoctor(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g. Dr. Rajesh Sharma"
                />
              </div>
            </div>

            {/* Diagnoses Editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1">
                  <Activity className="w-3.5 h-3.5 text-teal-600" />
                  <span>Documented Diagnoses</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {diagnoses.map((diag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md"
                  >
                    <span>{diag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDiagnosis(idx)}
                      className="hover:text-rose-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newDiagInput}
                  onChange={e => setNewDiagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddDiagnosis(); } }}
                  placeholder="Type condition / diagnosis and press Add"
                  className="flex-1 text-xs px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={handleAddDiagnosis}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Extracted Findings Table Editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Extracted Lab Values & Findings ({findings.length})
                </label>
                <button
                  type="button"
                  onClick={handleAddFinding}
                  className="text-xs text-teal-600 hover:text-teal-700 font-semibold flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Finding</span>
                </button>
              </div>

              {/* Mobile Findings Card Editor (< sm) */}
              <div className="sm:hidden space-y-3">
                {findings.map((finding, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl border space-y-2.5 transition-all ${
                      finding.isAbnormal ? 'bg-amber-50/60 border-amber-300' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Test Name
                      </label>
                      <input
                        type="text"
                        value={finding.name}
                        onChange={e => handleUpdateFinding(idx, 'name', e.target.value)}
                        placeholder="e.g. Hemoglobin"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white focus:ring-2 focus:ring-teal-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Result Value
                        </label>
                        <input
                          type="text"
                          value={finding.value}
                          onChange={e => handleUpdateFinding(idx, 'value', e.target.value)}
                          placeholder="e.g. 14.2"
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Unit
                        </label>
                        <input
                          type="text"
                          value={finding.unit || ''}
                          onChange={e => handleUpdateFinding(idx, 'unit', e.target.value)}
                          placeholder="e.g. g/dL"
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Reference Range
                      </label>
                      <input
                        type="text"
                        value={finding.referenceRange || finding.reference_range || ''}
                        onChange={e => handleUpdateFinding(idx, 'referenceRange', e.target.value)}
                        placeholder="e.g. 12.0 - 16.0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono text-slate-700 bg-white focus:ring-2 focus:ring-teal-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                      <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={Boolean(finding.isAbnormal || finding.abnormal_flag)}
                          onChange={e => handleUpdateFinding(idx, 'isAbnormal', e.target.checked)}
                          className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                        />
                        <span className={finding.isAbnormal ? 'text-amber-800 font-bold' : ''}>Flag as Abnormal</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleRemoveFinding(idx)}
                        className="min-h-[36px] px-2.5 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg flex items-center space-x-1 touch-press"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Findings Table (>= sm) */}
              <div className="hidden sm:block border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[520px]">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">Test Name</th>
                      <th className="py-2 px-2.5 w-24">Value</th>
                      <th className="py-2 px-2.5 w-20">Unit</th>
                      <th className="py-2 px-2.5">Ref Range</th>
                      <th className="py-2 px-2 text-center w-16">Abnormal</th>
                      <th className="py-2 px-2 text-center w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {findings.map((finding, idx) => (
                      <tr key={idx} className={finding.isAbnormal ? 'bg-amber-50/40' : ''}>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={finding.name}
                            onChange={e => handleUpdateFinding(idx, 'name', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={finding.value}
                            onChange={e => handleUpdateFinding(idx, 'value', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-bold"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={finding.unit || ''}
                            onChange={e => handleUpdateFinding(idx, 'unit', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-slate-600"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            value={finding.referenceRange || finding.reference_range || ''}
                            onChange={e => handleUpdateFinding(idx, 'referenceRange', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-slate-500"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(finding.isAbnormal || finding.abnormal_flag)}
                            onChange={e => handleUpdateFinding(idx, 'isAbnormal', e.target.checked)}
                            className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveFinding(idx)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>

            {/* Prescribed Medications Editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1">
                  <Pill className="w-3.5 h-3.5 text-teal-600" />
                  <span>Prescriptions & Medications ({medications.length})</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddMed}
                  className="text-xs text-teal-600 hover:text-teal-700 font-semibold flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Medication</span>
                </button>
              </div>

              <div className="space-y-2">
                {medications.map((med, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Drug Name (e.g. Metformin)"
                        value={med.name || med.medication_name || ''}
                        onChange={e => handleUpdateMed(idx, 'name', e.target.value)}
                        className="w-full text-xs font-semibold px-2 py-1 border border-slate-300 rounded bg-white"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        placeholder="Dosage (e.g. 500mg)"
                        value={med.dosage || ''}
                        onChange={e => handleUpdateMed(idx, 'dosage', e.target.value)}
                        className="w-full text-xs px-2 py-1 border border-slate-300 rounded bg-white"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Frequency (e.g. Twice daily)"
                        value={med.frequency || ''}
                        onChange={e => handleUpdateMed(idx, 'frequency', e.target.value)}
                        className="w-full text-xs px-2 py-1 border border-slate-300 rounded bg-white"
                      />
                    </div>
                    <div className="sm:col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveMed(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors touch-press"
          >
            Cancel
          </button>
          
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="min-h-[44px] px-5 sm:px-6 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 shadow-xs transition-colors touch-press"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Verifying & Saving...' : 'Confirm & Save to Record'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
