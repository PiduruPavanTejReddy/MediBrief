import React, { useState } from 'react';
import { Trash2, AlertTriangle, X, Loader2, Calendar, Building, FileText } from 'lucide-react';
import { MedicalRecord } from '../types';

interface DeleteRecordModalProps {
  isOpen: boolean;
  record: MedicalRecord | null;
  onClose: () => void;
  onConfirmDelete: (recordId: string) => Promise<void>;
}

export const DeleteRecordModal: React.FC<DeleteRecordModalProps> = ({
  isOpen,
  record,
  onClose,
  onConfirmDelete
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !record) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await onConfirmDelete(record.id);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete record. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-md overflow-hidden animate-in slide-in-from-bottom-6 sm:fade-in sm:zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-rose-50/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="delete-dialog-title" className="text-sm sm:text-base font-extrabold text-slate-900">
                Delete medical record?
              </h3>
              <p className="text-[11px] text-slate-500">Permanent record removal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center touch-press disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Are you sure you want to permanently delete this medical record? This action cannot be undone.
          </p>

          {/* Record Summary Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                  {record.record_type}
                </span>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 mt-1 truncate">
                  {record.title}
                </h4>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-1">
              {record.record_date && (
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
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

          {/* Caution Callout */}
          <div className="flex items-start space-x-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200/70 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-amber-800">
              The original file, extracted lab findings, prescriptions, and AI knowledge search citations associated with this document will be permanently deleted.
            </p>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors touch-press disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="min-h-[44px] px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-1.5 touch-press disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Record</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
