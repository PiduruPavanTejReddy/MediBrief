import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Building, 
  User, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Pill, 
  Activity, 
  Search, 
  Filter, 
  GitCommit, 
  X,
  ChevronRight,
  ArrowRight,
  MoreVertical,
  Trash2,
  Share2
} from 'lucide-react';
import { MedicalRecord } from '../types';
import { RecordActionSheet } from './RecordActionSheet';

interface TimelineViewProps {
  records: MedicalRecord[];
  onSelectRecord: (record: MedicalRecord) => void;
  onDeleteRecord?: (record: MedicalRecord) => void;
  onShareRecord?: (record: MedicalRecord) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ 
  records, 
  onSelectRecord,
  onDeleteRecord,
  onShareRecord
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [actionRecordForSheet, setActionRecordForSheet] = useState<MedicalRecord | null>(null);

  const recordTypes = ['All', 'Blood Test', 'Prescription', 'MRI', 'Discharge Summary', 'Consultation', 'X-Ray', 'Ultrasound'];

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchesType = selectedType === 'All' || r.record_type.toLowerCase() === selectedType.toLowerCase();
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query ||
        r.title.toLowerCase().includes(query) ||
        r.hospital?.toLowerCase().includes(query) ||
        r.doctor?.toLowerCase().includes(query) ||
        r.record_type.toLowerCase().includes(query) ||
        r.extracted_text?.toLowerCase().includes(query);

      return matchesType && matchesSearch;
    });
  }, [records, selectedType, searchQuery]);

  // Group by Year for the chronological view
  const groupedByYear = useMemo(() => {
    const groups: { [year: string]: MedicalRecord[] } = {};
    filteredRecords.forEach(rec => {
      let year = 'Recent';
      if (rec.record_date) {
        const parsedYear = new Date(rec.record_date).getFullYear();
        if (!isNaN(parsedYear)) {
          year = String(parsedYear);
        } else {
          const match = rec.record_date.match(/\d{4}/);
          if (match) year = match[0];
        }
      }
      if (!groups[year]) groups[year] = [];
      groups[year].push(rec);
    });
    return groups;
  }, [filteredRecords]);

  const years = Object.keys(groupedByYear).sort((a, b) => {
    if (a === 'Recent') return -1;
    if (b === 'Recent') return 1;
    return Number(b) - Number(a);
  });

  return (
    <div className="space-y-5">
      
      {/* Controls Bar: Search & Category Pills */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        
        {/* Search Input with Clear Button */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by test, physician, medication..."
            className="w-full text-xs pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded-md touch-press"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Horizontally Scrollable Category Filter Pills (Apple Health Style) */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar pt-0.5">
          {recordTypes.map(type => {
            const isSelected = selectedType === type;
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all touch-press ${
                  isSelected
                    ? 'bg-teal-600 text-white shadow-2xs shadow-teal-600/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200/60'
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty State */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center space-y-3">
          <FileText className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No medical records match your filter</h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Try resetting your search query or choosing "All" categories.
          </p>
          {(searchQuery || selectedType !== 'All') && (
            <button
              onClick={() => { setSearchQuery(''); setSelectedType('All'); }}
              className="min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors touch-press"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        /* Chronological Medical Timeline Grouped by Year */
        <div className="space-y-8">
          {years.map(year => (
            <div key={year} className="space-y-3">
              
              {/* Year Heading Pill */}
              <div className="flex items-center space-x-2">
                <span className="px-3 py-1 bg-slate-200 text-slate-800 font-extrabold text-xs rounded-full shadow-2xs font-mono">
                  {year}
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {/* Records in this year */}
              <div className="relative pl-5 sm:pl-7 border-l-2 border-teal-200 ml-3.5 space-y-4">
                {groupedByYear[year].map((rec) => {
                  const hasAbnormal = rec.findings?.some(f => f.abnormal_flag === 1 || f.isAbnormal);

                  return (
                    <div key={rec.id} className="relative group">
                      
                      {/* Timeline Node Circle */}
                      <div className={`absolute -left-[27px] sm:-left-[35px] top-3.5 w-5 h-5 rounded-full border-3 border-white flex items-center justify-center shadow-xs transition-transform group-hover:scale-110 ${
                        hasAbnormal ? 'bg-amber-500' : 'bg-teal-600'
                      }`}>
                        <div className="w-1 h-1 rounded-full bg-white" />
                      </div>

                      {/* Record Card */}
                      <div
                        onClick={() => onSelectRecord(rec)}
                        className="bg-white rounded-2xl border border-slate-200/90 hover:border-teal-300 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all cursor-pointer space-y-3 touch-press relative"
                      >
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className="text-[10px] sm:text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 shrink-0">
                                {rec.record_type}
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition-colors truncate">
                                {rec.title}
                              </h4>
                            </div>

                            {/* Date & Facility */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                              <span className="flex items-center space-x-1 shrink-0 font-medium text-slate-600">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>{rec.record_date}</span>
                              </span>
                              {rec.hospital && (
                                <span className="flex items-center space-x-1 truncate">
                                  <Building className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="truncate">{rec.hospital}</span>
                                </span>
                              )}
                              {rec.doctor && (
                                <span className="flex items-center space-x-1 truncate">
                                  <User className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="truncate">{rec.doctor}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions & Badges */}
                          <div className="flex items-center space-x-1 shrink-0">
                            {hasAbnormal && (
                              <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                                <AlertCircle className="w-3 h-3 text-amber-600" />
                                <span>Abnormal</span>
                              </span>
                            )}

                            {/* Overflow Menu Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionRecordForSheet(rec);
                              }}
                              className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center transition-colors touch-press"
                              title="Record options"
                              aria-label="Record options"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Diagnoses Pills */}
                        {rec.diagnoses && rec.diagnoses.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {rec.diagnoses.map((d: any, idx: number) => (
                              <span
                                key={idx}
                                className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-md"
                              >
                                {typeof d === 'string' ? d : d.diagnosis}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Key Extracted Findings / Lab Metrics */}
                        {rec.findings && rec.findings.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {rec.findings.slice(0, 4).map((f: any, idx: number) => {
                              const isAbn = f.abnormal_flag === 1 || f.isAbnormal;
                              return (
                                <div 
                                  key={idx} 
                                  className={`p-2 rounded-xl text-xs transition-colors ${
                                    isAbn ? 'bg-amber-50/80 border border-amber-200' : 'bg-slate-50 border border-slate-100'
                                  }`}
                                >
                                  <div className="text-[10px] text-slate-400 font-semibold truncate">{f.name}</div>
                                  <div className={`font-bold mt-0.5 ${isAbn ? 'text-amber-900' : 'text-slate-900'}`}>
                                    {f.value} <span className="text-[10px] font-normal text-slate-500">{f.unit}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Medications Snippet */}
                        {rec.medications && rec.medications.length > 0 && (
                          <div className="flex items-center space-x-1.5 text-[11px] text-slate-600 pt-0.5">
                            <Pill className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span className="truncate">
                              Rx: {rec.medications.map((m: any) => `${m.medication_name || m.name} ${m.dosage}`).join(', ')}
                            </span>
                          </div>
                        )}

                        {/* Bottom Row / CTA */}
                        <div className="pt-1 flex items-center justify-between text-xs font-semibold text-teal-600">
                          <span className="text-[11px] text-slate-400">
                            {rec.findings?.length || 0} findings extracted
                          </span>
                          <span className="flex items-center space-x-1 text-teal-700 group-hover:translate-x-0.5 transition-transform">
                            <span>View Report</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile-Friendly Record Actions Bottom Sheet */}
      <RecordActionSheet
        isOpen={Boolean(actionRecordForSheet)}
        record={actionRecordForSheet}
        onClose={() => setActionRecordForSheet(null)}
        onViewReport={(rec) => {
          onSelectRecord(rec);
        }}
        onShare={(rec) => {
          if (onShareRecord) {
            onShareRecord(rec);
          } else {
            onSelectRecord(rec);
          }
        }}
        onDelete={(rec) => {
          onDeleteRecord?.(rec);
        }}
      />
    </div>
  );
};
