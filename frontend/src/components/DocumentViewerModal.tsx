import React, { useState } from 'react';
import { X, Download, FileText, Calendar, Building, User, AlertCircle, CheckCircle2, Pill, Activity, ZoomIn, ZoomOut, ChevronDown, ChevronUp, Image as ImageIcon, Eye, Maximize2, Minimize2 } from 'lucide-react';
import { MedicalRecord } from '../types';
import { ApiService } from '../services/api';

interface DocumentViewerModalProps {
  record: MedicalRecord | null;
  onClose: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ record, onClose }) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isArchiveMinimized, setIsArchiveMinimized] = useState<boolean>(false);
  const [archiveViewMode, setArchiveViewMode] = useState<'preview' | 'formatted' | 'raw'>('formatted');
  const [mobileActiveTab, setMobileActiveTab] = useState<'findings' | 'document'>('findings');
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);

  if (!record) return null;

  // Build full file URL
  const fileUrl = record.signedUrl 
    ? (record.signedUrl.startsWith('http') ? record.signedUrl : `${ApiService.getBaseUrl()}${record.signedUrl.replace(/^\/api/, '')}`)
    : null;

  const isImageFile = !imageLoadError && Boolean(
    record.original_file_key?.match(/\.(jpe?g|png|webp|gif|bmp)$/i) ||
    record.file_name?.match(/\.(jpe?g|png|webp|gif|bmp)$/i) ||
    (fileUrl && /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(fileUrl))
  );

  // Formatter helper to render OCR text into neat structured document sections
  const renderFormattedArchive = (text: string) => {
    if (!text || text.trim().length === 0) {
      return (
        <div className="text-center py-8 text-slate-400 text-xs italic">
          No raw document text available in archive.
        </div>
      );
    }

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    return (
      <div className="space-y-3 font-sans text-xs">
        {lines.map((line, idx) => {
          // Detect headers/titles (all caps or contains typical header markers)
          const isHeader = /^(NAME|PATIENT|HOSPITAL|CLINIC|LABORATORY|DEPARTMENT|REPORT|INVESTIGATION|HAEMOGRAM|CBC|TEST|DOCTOR|REF BY|DATE|REG NO)/i.test(line) && line.length < 80;
          const hasKeyValue = line.includes(':');

          if (hasKeyValue) {
            const parts = line.split(':');
            const key = parts[0].trim();
            const val = parts.slice(1).join(':').trim();

            return (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-baseline py-1 border-b border-slate-100 last:border-0">
                <span className="font-semibold text-slate-600 sm:w-2/5 shrink-0 text-[11px] uppercase tracking-wider">{key}:</span>
                <span className="font-medium text-slate-900 sm:w-3/5 break-words">{val}</span>
              </div>
            );
          }

          if (isHeader) {
            return (
              <div key={idx} className="pt-2 pb-1 border-b border-teal-100">
                <h5 className="font-bold text-teal-800 uppercase tracking-wide text-[11px]">{line}</h5>
              </div>
            );
          }

          return (
            <p key={idx} className="text-slate-700 leading-relaxed">
              {line}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[94vh] sm:max-h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 sm:fade-in sm:zoom-in-95 duration-200">
        
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">{record.title}</h3>
                <span className="text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full font-semibold bg-teal-100 text-teal-800 border border-teal-200 shrink-0">
                  {record.record_type}
                </span>
              </div>
              <div className="flex items-center space-x-3 text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">
                <span className="flex items-center space-x-1 shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{record.record_date}</span>
                </span>
                {record.hospital && (
                  <span className="hidden sm:flex items-center space-x-1 truncate">
                    <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{record.hospital}</span>
                  </span>
                )}
                {record.doctor && (
                  <span className="hidden sm:flex items-center space-x-1 truncate">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{record.doctor}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 ml-2">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="hidden sm:flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-300 transition-colors shadow-xs"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Original File</span>
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile View Toggle Bar: Findings vs Document */}
        <div className="flex lg:hidden bg-slate-100 border-b border-slate-200 p-1">
          <button
            type="button"
            onClick={() => setMobileActiveTab('findings')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-colors ${
              mobileActiveTab === 'findings'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Findings & Investigations ({record.findings?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileActiveTab('document')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-colors ${
              mobileActiveTab === 'document'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Document Archive</span>
          </button>
        </div>

        {/* Modal Body - Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          
          {/* Left Column: Original Document Archive (Collapsible & Multi-View) */}
          <div
            className={`transition-all duration-200 p-4 sm:p-5 bg-slate-50/70 flex flex-col ${
              isArchiveMinimized ? 'lg:col-span-3' : 'lg:col-span-5'
            } ${mobileActiveTab === 'document' ? 'block' : 'hidden lg:flex'}`}
          >
            {/* Archive Toolbar & Header */}
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200/80">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-teal-600" />
                  <span>Document Archive</span>
                </span>
                
                {/* Minimise / Maximise Button */}
                <button
                  type="button"
                  onClick={() => setIsArchiveMinimized(!isArchiveMinimized)}
                  className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 flex items-center space-x-1 shadow-2xs"
                  title={isArchiveMinimized ? 'Expand Document Archive' : 'Minimise to focus on Findings'}
                >
                  {isArchiveMinimized ? (
                    <>
                      <Maximize2 className="w-3 h-3 text-teal-600" />
                      <span>Expand</span>
                    </>
                  ) : (
                    <>
                      <Minimize2 className="w-3 h-3 text-slate-500" />
                      <span>Minimise</span>
                    </>
                  )}
                </button>
              </div>

              {!isArchiveMinimized && (
                <div className="flex items-center space-x-1 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => setZoomLevel(prev => Math.max(prev - 15, 70))}
                    className="p-1 hover:bg-white rounded-lg border border-slate-200 text-slate-600"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-[11px] px-1 text-slate-600 font-semibold">{zoomLevel}%</span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(prev => Math.min(prev + 15, 150))}
                    className="p-1 hover:bg-white rounded-lg border border-slate-200 text-slate-600"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Archive View Sub-Tabs (Formatted / Image Preview / Raw Text) */}
            {!isArchiveMinimized && (
              <div className="flex items-center space-x-1 mb-2.5 bg-slate-200/70 p-1 rounded-xl text-xs font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => setArchiveViewMode('formatted')}
                  className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-colors ${
                    archiveViewMode === 'formatted'
                      ? 'bg-white text-teal-800 shadow-2xs'
                      : 'hover:text-slate-900'
                  }`}
                >
                  Formatted
                </button>
                {isImageFile && fileUrl && (
                  <button
                    type="button"
                    onClick={() => setArchiveViewMode('preview')}
                    className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center space-x-1 ${
                      archiveViewMode === 'preview'
                        ? 'bg-white text-teal-800 shadow-2xs'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    <ImageIcon className="w-3 h-3" />
                    <span>Scan Image</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setArchiveViewMode('raw')}
                  className={`flex-1 py-1 px-2 rounded-lg text-[11px] font-bold transition-colors ${
                    archiveViewMode === 'raw'
                      ? 'bg-white text-teal-800 shadow-2xs'
                      : 'hover:text-slate-900'
                  }`}
                >
                  Raw OCR
                </button>
              </div>
            )}

            {/* Minimized Quick Card */}
            {isArchiveMinimized ? (
              <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-4 shadow-inner flex flex-col justify-between text-xs space-y-3">
                <div className="space-y-2">
                  <div className="p-2.5 bg-teal-50 border border-teal-200 rounded-xl text-teal-900 text-xs">
                    <p className="font-bold">Archive Minimised</p>
                    <p className="text-[11px] text-teal-700 mt-0.5">Focus is now on Extracted Findings and Lab Values.</p>
                  </div>
                  <div className="text-[11px] text-slate-500 space-y-1">
                    <p><strong>File:</strong> {record.file_name || 'Medical Document'}</p>
                    <p><strong>Date:</strong> {record.record_date}</p>
                    <p><strong>Type:</strong> {record.record_type}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsArchiveMinimized(false)}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-1.5"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>Expand Document</span>
                </button>
              </div>
            ) : (
              /* Expanded Archive Content */
              <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-inner overflow-auto max-h-[420px] lg:max-h-[560px]">
                <div style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }}>
                  {archiveViewMode === 'preview' && isImageFile && fileUrl ? (
                    <div className="flex flex-col items-center justify-center">
                      <img
                        src={fileUrl}
                        alt="Original Scanned Document"
                        onError={() => setImageLoadError(true)}
                        className="max-w-full h-auto rounded-xl shadow-xs border border-slate-200 object-contain"
                      />
                    </div>
                  ) : archiveViewMode === 'raw' ? (
                    <pre className="whitespace-pre-wrap font-mono text-xs text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
                      {record.extracted_text || 'No raw document text available.'}
                    </pre>
                  ) : (
                    /* Default: Formatted Presentable Archive */
                    <div className="bg-slate-50/50 p-3.5 rounded-xl border border-slate-100 shadow-2xs">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 text-xs">
                        <span className="font-bold text-slate-800">Verified Medical Transcription</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          CLEAN ARCHIVE
                        </span>
                      </div>
                      {renderFormattedArchive(record.extracted_text || '')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isArchiveMinimized && (
              <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between px-1">
                <span className="truncate max-w-[170px]" title={record.file_name}>File: {record.file_name}</span>
                <span className="text-teal-600 font-semibold text-[10px]">HMAC Signed Security</span>
              </div>
            )}
          </div>

          {/* Right Column: Structured Clinical Findings (Expands when archive is minimized) */}
          <div
            className={`p-4 sm:p-6 space-y-6 overflow-y-auto bg-white transition-all duration-200 ${
              isArchiveMinimized ? 'lg:col-span-9' : 'lg:col-span-7'
            } ${mobileActiveTab === 'findings' ? 'block' : 'hidden lg:block'}`}
          >
            
            {/* Quick Summary Pill Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-800">Clinical Overview:</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 bg-white rounded-lg border border-slate-200 text-slate-700">
                  {record.findings?.length || 0} Investigations
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 bg-white rounded-lg border border-slate-200 text-slate-700">
                  {record.medications?.length || 0} Medications
                </span>
              </div>

              {/* Toggle to minimize archive right from findings column */}
              <button
                type="button"
                onClick={() => setIsArchiveMinimized(!isArchiveMinimized)}
                className="hidden lg:flex items-center space-x-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1 rounded-xl border border-teal-200 transition-colors"
              >
                {isArchiveMinimized ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Split View (Restore Archive)</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Expand Findings Full Width</span>
                  </>
                )}
              </button>
            </div>

            {/* Diagnoses Section */}
            {record.diagnoses && record.diagnoses.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center space-x-1.5">
                  <Activity className="w-3.5 h-3.5 text-teal-600" />
                  <span>Associated Diagnoses</span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  {record.diagnoses.map((d: any, idx: number) => {
                    const text = typeof d === 'string' ? d : d.diagnosis;
                    return (
                      <span
                        key={idx}
                        className="text-xs font-bold px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs"
                      >
                        {text}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Lab Findings Table */}
            {record.findings && record.findings.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                    <span>Extracted Findings & Investigation Values</span>
                  </h4>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {record.findings.filter((f: any) => f.abnormal_flag === 1 || f.isAbnormal).length} Abnormal Flags
                  </span>
                </div>

                {/* Mobile Findings Card List (< sm) */}
                <div className="sm:hidden space-y-2">
                  {record.findings.map((finding: any, idx: number) => {
                    const isAbn = finding.abnormal_flag === 1 || finding.isAbnormal;
                    return (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-2xl border transition-all ${
                          isAbn 
                            ? 'bg-amber-50/80 border-amber-300 shadow-2xs' 
                            : 'bg-slate-50/70 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-xs text-slate-900 leading-snug">{finding.name}</span>
                          {isAbn ? (
                            <span className="inline-flex items-center space-x-1 text-[10px] font-extrabold text-amber-900 bg-amber-200/90 px-2 py-0.5 rounded-full border border-amber-300 shrink-0">
                              <AlertCircle className="w-3 h-3 text-amber-700" />
                              <span>Abnormal</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                              Normal
                            </span>
                          )}
                        </div>

                        <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-slate-200/60">
                          <div>
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Observed Value</span>
                            <span className="text-sm font-black text-slate-950">
                              {finding.value} <span className="text-xs font-normal text-slate-500">{finding.unit}</span>
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Reference Interval</span>
                            <span className="text-xs font-mono font-medium text-slate-600">
                              {finding.reference_range || finding.referenceRange || '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Findings Table (>= sm) */}
                <div className="hidden sm:block border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-3.5">Test / Investigation</th>
                        <th className="py-3 px-3.5">Result</th>
                        <th className="py-3 px-3.5">Reference Range</th>
                        <th className="py-3 px-3.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {record.findings.map((finding: any, idx: number) => {
                        const isAbn = finding.abnormal_flag === 1 || finding.isAbnormal;
                        return (
                          <tr key={idx} className={isAbn ? 'bg-amber-50/70 hover:bg-amber-100/50' : 'hover:bg-slate-50/80'}>
                            <td className="py-3 px-3.5 font-bold text-slate-900">{finding.name}</td>
                            <td className="py-3 px-3.5 font-extrabold text-slate-950">
                              {finding.value} <span className="text-slate-500 text-[11px] font-normal">{finding.unit}</span>
                            </td>
                            <td className="py-3 px-3.5 text-slate-600 font-mono text-[11px]">
                              {finding.reference_range || finding.referenceRange || '—'}
                            </td>
                            <td className="py-3 px-3.5 text-center">
                              {isAbn ? (
                                <span className="inline-flex items-center space-x-1 text-[11px] font-extrabold text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-full border border-amber-300">
                                  <AlertCircle className="w-3 h-3 text-amber-700" />
                                  <span>Abnormal</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                  Normal
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Prescribed Medications */}
            {record.medications && record.medications.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5 flex items-center space-x-1.5">
                  <Pill className="w-3.5 h-3.5 text-teal-600" />
                  <span>Prescribed Medications</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {record.medications.map((med: any, idx: number) => (
                    <div key={idx} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-start justify-between">
                      <div>
                        <div className="font-bold text-xs text-slate-900">
                          {med.medication_name || med.name} <span className="text-teal-700 font-semibold">{med.dosage}</span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          Schedule: <strong>{med.frequency}</strong>
                        </div>
                        {med.instructions && (
                          <div className="text-[11px] text-slate-500 italic mt-0.5">
                            Note: {med.instructions}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-full border border-teal-200">
                        Rx
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Record Verification Status */}
            <div className="p-4 rounded-2xl bg-teal-50/90 border border-teal-200 text-xs text-teal-950 flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Verified Medical Record: </span>
                This document has undergone clinical entity extraction and is indexed in your private, encrypted vector knowledge base for MediBrief AI queries and Doctor Consultations.
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50/80 flex justify-between items-center text-xs text-slate-500">
          <span>Record ID: <span className="font-mono">{record.id.slice(0, 12)}...</span></span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};

