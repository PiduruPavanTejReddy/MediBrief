import React from 'react';
import { Camera, UploadCloud, FileText } from 'lucide-react';
import { MedicalRecord } from '../types';
import { TimelineView } from '../components/TimelineView';

interface RecordsPageProps {
  records: MedicalRecord[];
  onOpenScanModal: () => void;
  onSelectRecord: (record: MedicalRecord) => void;
  onDeleteRecord?: (record: MedicalRecord) => void;
  onShareRecord?: (record: MedicalRecord) => void;
}

export const RecordsPage: React.FC<RecordsPageProps> = ({
  records,
  onOpenScanModal,
  onSelectRecord,
  onDeleteRecord,
  onShareRecord
}) => {
  return (
    <div className="space-y-6 pb-24 md:pb-10">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Medical Records & Timeline
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Chronologically organized health records, lab investigations, imaging, and prescriptions
          </p>
        </div>

        <button
          onClick={onOpenScanModal}
          className="min-h-[44px] px-5 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-2 self-stretch sm:self-auto touch-press"
        >
          <Camera className="w-4 h-4" />
          <span>Add / Scan Report</span>
        </button>
      </div>

      {/* Timeline View Component */}
      <TimelineView
        records={records}
        onSelectRecord={onSelectRecord}
        onDeleteRecord={onDeleteRecord}
        onShareRecord={onShareRecord}
      />
    </div>
  );
};
