import React, { useState, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  Copy, 
  Check, 
  Printer, 
  FileText, 
  ExternalLink,
  User,
  Heart,
  Activity,
  Pill,
  AlertTriangle,
  Clock,
  Calendar,
  Building,
  ShieldCheck,
  Info
} from 'lucide-react';
import { ClinicalSummary, AICitation } from '../types';
import { formatAge, calculateAge } from '../utils/dateUtils';

interface ClinicalSummaryModalProps {
  isOpen: boolean;
  summaryData: ClinicalSummary | null;
  onClose: () => void;
  onOpenRecordCitation?: (cite: AICitation) => void;
}

interface StructuredInvestigation {
  test: string;
  value: string;
  unit: string;
  date?: string;
  isFlagged: boolean;
}

interface StructuredMedication {
  name: string;
  dosage: string;
  frequency: string;
}

export const ClinicalSummaryModal: React.FC<ClinicalSummaryModalProps> = ({
  isOpen,
  summaryData,
  onClose,
  onOpenRecordCitation
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  // Parse structured data from summaryData props and markdown content as fallback
  const parsedData = useMemo(() => {
    if (!summaryData) return null;

    const rawSummary = summaryData.summary || '';

    // 1. Patient Information
    let name = summaryData.patientInfo?.fullName || '';
    let age = '';
    if (summaryData.patientInfo?.dateOfBirth) {
      age = formatAge(summaryData.patientInfo.dateOfBirth);
    } else if (summaryData.patientInfo?.age && summaryData.patientInfo.age !== 'Unknown' && summaryData.patientInfo.age !== 'Age not available') {
      const parsedNum = parseInt(String(summaryData.patientInfo.age), 10);
      age = !isNaN(parsedNum) ? `${parsedNum} years` : String(summaryData.patientInfo.age);
    }
    let bloodGroup = summaryData.patientInfo?.bloodGroup || '';
    let gender = summaryData.patientInfo?.gender || '';

    // Extract patient attributes from raw markdown if missing
    if (!name || name === 'Patient') {
      const nameMatch = rawSummary.match(/(?:Patient|Name)[:\s*]+([^\n\|*]+)/i);
      if (nameMatch) name = nameMatch[1].trim();
    }
    if (!age || age === 'N/A' || age === 'Unknown') {
      const ageMatch = rawSummary.match(/Age[:\s*]+([^\n\|*]+)/i);
      if (ageMatch) {
        const rawExtracted = ageMatch[1].trim();
        const parsed = parseInt(rawExtracted, 10);
        age = !isNaN(parsed) ? `${parsed} years` : rawExtracted;
      }
    }
    const genderMatch = rawSummary.match(/Gender[:\s*]+([^\n\|*]+)/i);
    if (!gender && genderMatch) gender = genderMatch[1].trim();

    if (!bloodGroup || bloodGroup === 'N/A') {
      const bgMatch = rawSummary.match(/Blood\s*Group[:\s*]+([^\n\|*]+)/i);
      if (bgMatch) bloodGroup = bgMatch[1].trim();
    }

    // Clean any residual markdown stars or colons
    name = name.replace(/[*_#]/g, '').trim() || 'Patient';
    age = age.replace(/[*_#]/g, '').trim();
    if (!age || age === 'N/A' || age === 'Unknown' || age === '—') {
      age = 'Age not available';
    }
    gender = gender.replace(/[*_#]/g, '').trim();
    bloodGroup = bloodGroup.replace(/[*_#]/g, '').trim();

    // 2. Known Conditions
    let conditions: string[] = [];
    if (summaryData.knownConditions && summaryData.knownConditions.length > 0) {
      conditions = summaryData.knownConditions.map(c => c.replace(/[*_#•-]/g, '').trim()).filter(Boolean);
    } else {
      // Fallback: extract from markdown section
      const condMatch = rawSummary.match(/###\s*Known Conditions([\s\S]*?)(?=###|$)/i);
      if (condMatch) {
        const lines = condMatch[1].split('\n')
          .map(l => l.replace(/^[•\s\*\-#]+/, '').trim())
          .filter(l => l && !/no chronic conditions|none documented|none recorded/i.test(l));
        conditions = lines;
      }
    }

    // 3. Current Medications
    let medications: StructuredMedication[] = [];
    if (summaryData.currentMedications && summaryData.currentMedications.length > 0) {
      medications = summaryData.currentMedications.map(m => ({
        name: (m.name || '').replace(/[*_#•-]/g, '').trim(),
        dosage: (m.dosage || '').replace(/[*_#•-]/g, '').trim(),
        frequency: (m.frequency || '').replace(/[*_#•-]/g, '').trim()
      })).filter(m => Boolean(m.name));
    } else {
      // Fallback: extract from markdown section
      const medMatch = rawSummary.match(/###\s*Current Medications([\s\S]*?)(?=###|$)/i);
      if (medMatch) {
        const lines = medMatch[1].split('\n')
          .map(l => l.trim())
          .filter(l => l && !/no active prescriptions|none recorded/i.test(l));

        lines.forEach(line => {
          // Lines often formatted like: • **Metformin** 500mg — Twice daily
          const cleanLine = line.replace(/^[•\s\*\-#]+/, '');
          const parts = cleanLine.split(/—|-|--/);
          const firstPart = parts[0]?.trim() || '';
          const freqPart = parts[1]?.trim() || '';

          // Split drug name and dosage
          const tokens = firstPart.replace(/[*_]/g, '').split(/\s+/);
          if (tokens.length >= 1) {
            const medName = tokens[0];
            const dosage = tokens.slice(1).join(' ');
            medications.push({
              name: medName,
              dosage: dosage || '',
              frequency: freqPart || 'As directed'
            });
          }
        });
      }
    }

    // 4. Recent Investigations / Lab Results
    let investigations: StructuredInvestigation[] = [];
    if (summaryData.recentInvestigations && summaryData.recentInvestigations.length > 0) {
      investigations = summaryData.recentInvestigations.map(inv => {
        const rawVal = (inv.value || '').trim();
        // Separate numeric value and unit
        const valMatch = rawVal.match(/^([\d\.,><\+\-]+)\s*(.*)$/);
        const numericVal = valMatch ? valMatch[1] : rawVal;
        const unitVal = valMatch ? valMatch[2] : '';

        return {
          test: (inv.test || 'Laboratory Test').replace(/[*_#•-]/g, '').trim(),
          value: numericVal,
          unit: unitVal,
          date: inv.date || '',
          isFlagged: Boolean(inv.flag || /abnormal|flagged|high|low|critical/i.test(rawVal))
        };
      });
    } else {
      // Fallback: extract from markdown section
      const invMatch = rawSummary.match(/###\s*Recent Investigations[^\n]*([\s\S]*?)(?=###|$)/i);
      if (invMatch) {
        const lines = invMatch[1].split('\n')
          .map(l => l.trim())
          .filter(l => l && !/no laboratory investigations/i.test(l));

        lines.forEach(line => {
          // Lines like: • **HbA1c**: 7.2 % (2026-06-15) ⚠️ [Abnormal]
          const isFlagged = /⚠️|\[abnormal\]|abnormal|flagged/i.test(line);
          const clean = line.replace(/^[•\s\*\-#]+/, '').replace(/⚠️.*$/, '').trim();
          const colonIdx = clean.indexOf(':');

          if (colonIdx > 0) {
            const testName = clean.substring(0, colonIdx).replace(/[*_]/g, '').trim();
            const rest = clean.substring(colonIdx + 1).trim();

            const dateMatch = rest.match(/\(([^)]+)\)/);
            const dateStr = dateMatch ? dateMatch[1] : '';
            const valRest = rest.replace(/\([^)]+\)/, '').replace(/\[[^\]]+\]/, '').trim();

            const valMatch = valRest.match(/^([\d\.,><\+\-]+)\s*(.*)$/);
            investigations.push({
              test: testName,
              value: valMatch ? valMatch[1] : valRest,
              unit: valMatch ? valMatch[2] : '',
              date: dateStr,
              isFlagged
            });
          }
        });
      }
    }

    // 5. Document History / Historical Summary Note
    let documentHistoryNote: string | null = null;
    const histMatch = rawSummary.match(/###\s*Historical Medical Reports([\s\S]*?)(?=###|$)/i);
    if (histMatch) {
      documentHistoryNote = histMatch[1].replace(/[*_#•]/g, '').trim();
    }

    // 6. Citations
    const sources = summaryData.sourceRecords || [];

    return {
      patient: { name, age, gender, bloodGroup },
      conditions,
      medications,
      investigations,
      documentHistoryNote,
      sources
    };
  }, [summaryData]);

  if (!isOpen || !summaryData || !parsedData) return null;

  // Clean Plain-Text Medical Summary Generator for Clipboard Copying
  const handleCopyCleanText = () => {
    let cleanText = `AI MEDICAL HISTORY SUMMARY\n`;
    cleanText += `Doctor-friendly clinical digest\n`;
    cleanText += `========================================\n\n`;

    cleanText += `PATIENT INFORMATION\n`;
    cleanText += `Name: ${parsedData.patient.name}\n`;
    if (parsedData.patient.age) cleanText += `Age: ${parsedData.patient.age}\n`;
    if (parsedData.patient.gender && parsedData.patient.gender !== 'N/A') cleanText += `Gender: ${parsedData.patient.gender}\n`;
    if (parsedData.patient.bloodGroup && parsedData.patient.bloodGroup !== 'N/A') cleanText += `Blood Group: ${parsedData.patient.bloodGroup}\n`;
    cleanText += `\n`;

    cleanText += `HEALTH OVERVIEW\n`;
    cleanText += `Known Conditions:\n`;
    if (parsedData.conditions.length > 0) {
      parsedData.conditions.forEach(c => cleanText += `  • ${c}\n`);
    } else {
      cleanText += `  • No chronic conditions documented in available records.\n`;
    }
    cleanText += `\n`;

    cleanText += `Current Medications:\n`;
    if (parsedData.medications.length > 0) {
      parsedData.medications.forEach(m => {
        cleanText += `  • ${m.name} ${m.dosage} (${m.frequency})\n`;
      });
    } else {
      cleanText += `  • No active prescriptions recorded.\n`;
    }
    cleanText += `\n`;

    if (parsedData.investigations.length > 0) {
      cleanText += `RECENT INVESTIGATIONS\n`;
      parsedData.investigations.forEach(inv => {
        cleanText += `  • ${inv.test}: ${inv.value} ${inv.unit} ${inv.date ? '(' + inv.date + ')' : ''} ${inv.isFlagged ? '[Flagged]' : ''}\n`;
      });
      cleanText += `\n`;
    }

    if (parsedData.documentHistoryNote) {
      cleanText += `DOCUMENT HISTORY\n`;
      cleanText += `${parsedData.documentHistoryNote}\n\n`;
    }

    cleanText += `----------------------------------------\n`;
    cleanText += `AI-generated summary based strictly on verified MediBrief medical records.\n`;
    cleanText += `Always refer to original reports for verified clinical judgment.\n`;

    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 sm:fade-in sm:zoom-in-95 duration-200">
        
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* Sticky Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-white/95 backdrop-blur-md shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                  AI Medical History Summary
                </h3>
                <span className="hidden sm:inline-flex text-[10px] font-bold bg-teal-50 text-teal-800 px-2 py-0.5 rounded-full border border-teal-200 shrink-0">
                  CLINICAL DIGEST
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                Doctor-friendly clinical digest
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0 ml-2">
            <button
              onClick={handleCopyCleanText}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors touch-press flex items-center space-x-1 text-xs font-semibold"
              title="Copy Clean Medical Summary"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 font-bold text-[11px] hidden xs:inline">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 shrink-0" />
                  <span className="text-[11px] hidden xs:inline">Copy</span>
                </>
              )}
            </button>
            <button
              onClick={handlePrint}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors touch-press hidden sm:flex items-center space-x-1 text-xs font-semibold"
              title="Print Summary"
            >
              <Printer className="w-4 h-4" />
              <span className="text-[11px]">Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors touch-press"
              aria-label="Close summary"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 bg-slate-50/50">
          
          {/* SECTION 1: Patient Information Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
              <User className="w-4 h-4 text-teal-600" />
              <span>Patient Information</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Name</span>
                <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate block mt-0.5">
                  {parsedData.patient.name}
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Age</span>
                <span className="text-xs sm:text-sm font-extrabold text-slate-900 block mt-0.5">
                  {parsedData.patient.age || 'Age not available'}
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Blood Group</span>
                <span className="text-xs sm:text-sm font-extrabold text-teal-700 block mt-0.5">
                  {parsedData.patient.bloodGroup && parsedData.patient.bloodGroup !== 'N/A' ? parsedData.patient.bloodGroup : 'Unknown'}
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Gender</span>
                <span className="text-xs sm:text-sm font-extrabold text-slate-800 block mt-0.5">
                  {parsedData.patient.gender && parsedData.patient.gender !== 'N/A' ? parsedData.patient.gender : 'Not specified'}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: Health Overview (Known Conditions & Current Medications) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3.5">
            <div>
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
                <Activity className="w-4 h-4 text-teal-600" />
                <span>Health Overview</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Active chronic diagnoses and prescribed medication regimens
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Subsection: Known Conditions */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Known Conditions
                </span>

                {parsedData.conditions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {parsedData.conditions.map((cond, idx) => (
                      <span
                        key={idx}
                        className="text-xs font-bold px-2.5 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200/90 rounded-xl"
                      >
                        {cond}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 leading-relaxed italic pt-0.5">
                    No chronic conditions documented in the available records.
                  </p>
                )}
              </div>

              {/* Subsection: Current Medications */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Current Medications
                  </span>
                  {parsedData.medications.length > 0 && (
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.2 rounded-full border border-teal-200">
                      {parsedData.medications.length} Active
                    </span>
                  )}
                </div>

                {parsedData.medications.length > 0 ? (
                  <div className="space-y-1.5 pt-0.5">
                    {parsedData.medications.map((med, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-white rounded-lg border border-slate-200/80 flex items-start justify-between text-xs"
                      >
                        <div>
                          <strong className="text-slate-900">{med.name}</strong>
                          {med.dosage && (
                            <span className="text-teal-700 font-semibold ml-1.5">
                              {med.dosage}
                            </span>
                          )}
                        </div>
                        {med.frequency && (
                          <span className="text-[10px] font-medium text-slate-500 text-right ml-2 shrink-0">
                            {med.frequency}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 leading-relaxed italic pt-0.5">
                    No active prescriptions recorded.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: Recent Investigations / Lab Results */}
          {parsedData.investigations.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
                    <Activity className="w-4 h-4 text-teal-600" />
                    <span>Recent Investigations</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Extracted laboratory findings and diagnostic investigations
                  </p>
                </div>
                {parsedData.investigations.some(i => i.isFlagged) && (
                  <span className="inline-flex items-center space-x-1 text-[10px] font-extrabold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                    <AlertTriangle className="w-3 h-3 text-amber-700" />
                    <span>Abnormal Detected</span>
                  </span>
                )}
              </div>

              {/* Individual Result Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {parsedData.investigations.map((inv, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border transition-all ${
                      inv.isFlagged
                        ? 'bg-amber-50/70 border-amber-300/90 shadow-2xs'
                        : 'bg-slate-50/80 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900 leading-snug line-clamp-1" title={inv.test}>
                        {inv.test}
                      </span>
                      {inv.isFlagged && (
                        <span className="inline-flex items-center space-x-1 text-[10px] font-extrabold text-amber-900 bg-amber-200/90 px-2 py-0.5 rounded-full border border-amber-300 shrink-0">
                          <AlertTriangle className="w-3 h-3 text-amber-700" />
                          <span>Flagged</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between mt-2 pt-1.5 border-t border-slate-200/60 text-xs">
                      <div>
                        <span className="text-sm font-black text-slate-950">
                          {inv.value}
                        </span>
                        {inv.unit && (
                          <span className="text-[11px] font-normal text-slate-500 ml-1">
                            {inv.unit}
                          </span>
                        )}
                      </div>
                      {inv.date && (
                        <div className="text-[10px] text-slate-500 font-mono flex items-center space-x-1">
                          <Calendar className="w-2.5 h-2.5 text-slate-400" />
                          <span>{inv.date}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 4: Document History / Clinical Note */}
          {parsedData.documentHistoryNote && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-600" />
                <span>Historical Overview</span>
              </span>
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {parsedData.documentHistoryNote}
              </p>
            </div>
          )}

          {/* SECTION 5: Source Records Analyzed */}
          {parsedData.sources.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
              <div>
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
                  <FileText className="w-4 h-4 text-teal-600" />
                  <span>Source Documents ({parsedData.sources.length})</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Original clinical reports backing this synthesis
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {parsedData.sources.map(cite => (
                  <button
                    key={cite.record_id}
                    type="button"
                    onClick={() => onOpenRecordCitation && onOpenRecordCitation(cite)}
                    className="p-3 bg-slate-50 hover:bg-teal-50/60 active:bg-teal-100/60 border border-slate-200 hover:border-teal-300 rounded-xl text-left transition-all flex items-center justify-between shadow-2xs touch-press group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-slate-900 group-hover:text-teal-900 truncate">
                        {cite.record_title}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate flex items-center space-x-1.5">
                        <span>{cite.record_date}</span>
                        {cite.hospital && (
                          <>
                            <span>•</span>
                            <span className="truncate">{cite.hospital}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-teal-700 group-hover:text-teal-800 flex items-center space-x-1 shrink-0">
                      <span className="hidden xs:inline">View Report</span>
                      <ExternalLink className="w-3.5 h-3.5 text-teal-600" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI Trust Message */}
          <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200/80 flex items-start space-x-2 text-[11px] text-slate-600 leading-snug">
            <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <span>AI-generated summary based only on the available medical records. </span>
              <strong className="text-slate-800">Always refer to the original report for verified medical information.</strong>
            </div>
          </div>
        </div>

        {/* Sticky/Fixed Footer Action Bar */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0 pb-safe">
          <div className="text-[11px] text-slate-400 hidden sm:block">
            Verified MediBrief Medical Vault
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 transition-colors shadow-2xs touch-press flex items-center justify-center"
          >
            Close Summary
          </button>
        </div>
      </div>
    </div>
  );
};
