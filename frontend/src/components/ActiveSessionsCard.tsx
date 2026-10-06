import React from 'react';
import { Share2, ShieldAlert, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { SharingSession } from '../types';

interface ActiveSessionsCardProps {
  sessions: SharingSession[];
  onRevoke: (sessionId: string) => void;
  onNewShareClick: () => void;
}

export const ActiveSessionsCard: React.FC<ActiveSessionsCardProps> = ({
  sessions,
  onRevoke,
  onNewShareClick
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
            <Share2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Active Doctor Sharing Sessions</h3>
            <p className="text-xs text-slate-500">Doctors currently authorized to review your records</p>
          </div>
        </div>
        <button
          onClick={onNewShareClick}
          className="text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline"
        >
          + New Share
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="py-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <p className="text-xs text-slate-500">No active doctor sharing sessions.</p>
          <button
            onClick={onNewShareClick}
            className="mt-2 min-h-[44px] px-4 py-2 text-xs font-bold text-teal-600 hover:text-teal-700 inline-flex items-center justify-center touch-press"
          >
            Generate Access Code
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <div
              key={s.id}
              className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-extrabold text-sm text-slate-900 tracking-wider">
                    {s.access_code_display}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ACTIVE
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    • {s.record_count || 'All'} records permitted
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                  <span>Created: {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</span>
                  <span>• Status: Active until revoked</span>
                </div>
              </div>

              <button
                onClick={() => onRevoke(s.id)}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-white hover:bg-rose-50 active:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-2xs touch-press"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revoke Access</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
