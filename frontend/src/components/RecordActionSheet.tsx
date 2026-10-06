import React, { useEffect } from 'react';
import { 
  FileText, 
  Share2, 
  Trash2, 
  X, 
  ChevronRight,
  Calendar,
  Building
} from 'lucide-react';
import { MedicalRecord } from '../types';

interface RecordActionSheetProps {
  isOpen: boolean;
  record: MedicalRecord | null;
  onClose: () => void;
  onViewReport: (record: MedicalRecord) => void;
  onShare: (record: MedicalRecord) => void;
  onDelete: (record: MedicalRecord) => void;
}

export const RecordActionSheet: React.FC<RecordActionSheetProps> = ({
  isOpen,
  record,
  onClose,
  onViewReport,
  onShare,
  onDelete
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet / Modal Container */}
      <div 
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200/90 overflow-hidden z-10 animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Record Actions"
      >
        {/* Mobile Pull / Grab Handle */}
        <div className="sm:hidden w-12 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 mb-1 shrink-0" />

        {/* Header with Record Context */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/60">
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 shrink-0">
                {record.record_type}
              </span>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Record Actions
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
              {record.title}
            </h3>
            <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-1">
              {record.record_date && (
                <span className="flex items-center space-x-1 shrink-0">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>{record.record_date}</span>
                </span>
              )}
              {record.hospital && (
                <span className="flex items-center space-x-1 truncate">
                  <Building className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{record.hospital}</span>
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center shrink-0 touch-press"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Items List */}
        <div className="p-4 sm:p-5 space-y-2 overflow-y-auto">
          {/* Action 1: View Report */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onViewReport(record);
            }}
            className="w-full min-h-[56px] p-3.5 bg-white hover:bg-teal-50/60 active:bg-teal-100/60 border border-slate-200/90 hover:border-teal-300 rounded-2xl flex items-center justify-between transition-all touch-press group text-left"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-900">View Report</div>
                <div className="text-[11px] text-slate-500 truncate">Open full report & extracted findings</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
          </button>

          {/* Action 2: Share */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onShare(record);
            }}
            className="w-full min-h-[56px] p-3.5 bg-white hover:bg-indigo-50/60 active:bg-indigo-100/60 border border-slate-200/90 hover:border-indigo-300 rounded-2xl flex items-center justify-between transition-all touch-press group text-left"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Share2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-900">Share</div>
                <div className="text-[11px] text-slate-500 truncate">Generate doctor access code or QR</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
          </button>

          {/* Divider */}
          <div className="h-px bg-slate-100 my-1" />

          {/* Action 3: Delete Record (Destructive Action) */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onDelete(record);
            }}
            className="w-full min-h-[56px] p-3.5 bg-rose-50/40 hover:bg-rose-100/60 active:bg-rose-200/60 border border-rose-200/80 rounded-2xl flex items-center justify-between transition-all touch-press group text-left"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-rose-700">Delete Record</div>
                <div className="text-[11px] text-rose-500/90 truncate">Permanently remove from medical vault</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-rose-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
          </button>
        </div>

        {/* Footer Cancel Action */}
        <div className="p-4 pt-1 pb-6 sm:pb-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[46px] bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors touch-press flex items-center justify-center"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
