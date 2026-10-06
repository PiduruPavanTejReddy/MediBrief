import React, { useState, useEffect } from 'react';
import { History, Shield, CheckCircle2, RefreshCw, User, Stethoscope, FileText, Bot } from 'lucide-react';
import { ApiService } from '../services/api';
import { AuditLog } from '../types';

export const AuditHistoryPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const data = await ApiService.getAuditHistory(50);
      setLogs(data);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const getActionBadge = (action: string) => {
    if (action.includes('DOCTOR') || action.includes('SHARING')) {
      return {
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        icon: <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
      };
    }
    if (action.includes('AI')) {
      return {
        bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        icon: <Bot className="w-3.5 h-3.5 text-indigo-600" />
      };
    }
    if (action.includes('DOCUMENT') || action.includes('RECORD')) {
      return {
        bg: 'bg-teal-50 text-teal-800 border-teal-200',
        icon: <FileText className="w-3.5 h-3.5 text-teal-600" />
      };
    }
    return {
      bg: 'bg-slate-100 text-slate-800 border-slate-200',
      icon: <User className="w-3.5 h-3.5 text-slate-600" />
    };
  };

  return (
    <div className="space-y-6 pb-24 md:pb-10">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Security & Access History
            </h1>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
              Audit Trail
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete, transparent log of all document access, doctor sharing sessions, and AI queries
          </p>
        </div>

        <button
          onClick={loadLogs}
          disabled={isLoading}
          className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs transition-colors flex items-center justify-center space-x-1.5 self-start sm:self-auto touch-press"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Trail</span>
        </button>
      </div>

      {/* Security Assurance Banner */}
      <div className="p-4 bg-teal-50/70 border border-teal-200/80 rounded-2xl flex items-start space-x-3 text-xs text-teal-900">
        <Shield className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Zero-Trust Audit Enforcement: </span>
          Every time a temporary access code is generated, used by a physician, a medical record is inspected, or an AI summary is requested, an append-only audit event is recorded with cryptographic timestamps.
        </div>
      </div>

      {/* Audit Log Timeline */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No audit logs recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map(log => {
              const badge = getActionBadge(log.action);
              let meta: any = null;
              try {
                if (log.metadata_json) meta = JSON.parse(log.metadata_json);
              } catch (e) {}

              return (
                <div key={log.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-start space-x-3">
                    <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${badge.bg}`}>
                      {badge.icon}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900">
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.2 rounded bg-slate-100 text-slate-600">
                          {log.actor_type}
                        </span>
                      </div>

                      {meta && (
                        <div className="text-[11px] text-slate-500 font-mono">
                          {meta.title && <span>Document: <strong>{meta.title}</strong> </span>}
                          {meta.question && <span>Query: "{meta.question}" </span>}
                          {meta.scopeType && <span>Scope: {meta.scopeType} </span>}
                          {meta.recordCount !== undefined && <span>({meta.recordCount} records)</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-semibold text-slate-700">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(log.timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
