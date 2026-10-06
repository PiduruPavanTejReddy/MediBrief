import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  User, 
  Calendar, 
  Heart, 
  Phone, 
  Mail, 
  MapPin, 
  Sparkles, 
  Check, 
  AlertCircle 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiService } from '../services/api';
import { calculateAge, formatAge, getTodayDateString } from '../utils/dateUtils';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose }) => {
  const { profile, updateProfile } = useAuth();

  const [formData, setFormData] = useState({
    fullName: '',
    dateOfBirth: '',
    bloodGroup: 'Unknown',
    emergencyContact: '',
    email: '',
    address: ''
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Sync state when modal opens or profile changes
  useEffect(() => {
    if (profile) {
      // Ensure date_of_birth is formatted as YYYY-MM-DD for input[type="date"]
      let initialDOB = profile.date_of_birth || '';
      const match = initialDOB.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) {
        initialDOB = match[1];
      }

      setFormData({
        fullName: profile.full_name || '',
        dateOfBirth: initialDOB,
        bloodGroup: profile.blood_group || 'Unknown',
        emergencyContact: profile.emergency_contact || '',
        email: profile.email || '',
        address: profile.address || ''
      });
      setError(null);
      setSuccess(false);
    }
  }, [profile, isOpen]);

  const maxDate = useMemo(() => getTodayDateString(), []);

  const calculatedAge = useMemo(() => {
    return calculateAge(formData.dateOfBirth);
  }, [formData.dateOfBirth]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.fullName.trim()) {
      setError('Full Name is required.');
      return;
    }

    if (!formData.dateOfBirth.trim()) {
      setError('Date of Birth is required.');
      return;
    }

    const validAge = calculateAge(formData.dateOfBirth);
    if (validAge === null) {
      setError('Please enter a valid Date of Birth (cannot be in the future).');
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        fullName: formData.fullName.trim(),
        dateOfBirth: formData.dateOfBirth.trim(),
        gender: profile?.gender || 'Not specified',
        bloodGroup: formData.bloodGroup || 'Unknown',
        emergencyContact: formData.emergencyContact.trim() || 'None registered',
        email: formData.email.trim() || null,
        address: formData.address.trim() || null
      };

      const res: any = await ApiService.saveProfile(payload);
      if (res && res.data) {
        updateProfile(res.data);
      } else if (res) {
        updateProfile(res);
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 sm:fade-in sm:zoom-in-95 duration-200">
        {/* Mobile Grab Handle */}
        <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                Patient Profile Setup
              </h3>
              <p className="text-[11px] text-slate-500">
                Update your personal information &amp; date of birth
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors touch-press"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Profile updated successfully! Age recalculated dynamically.</span>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
              <User className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Full Name *</span>
            </label>
            <input
              type="text"
              required
              value={formData.fullName}
              onChange={e => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="e.g. Rahul Sharma"
              className="w-full text-xs font-semibold px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 min-h-[44px] text-slate-900"
            />
          </div>

          {/* Date of Birth and Blood Group side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Date of Birth *</span>
              </label>
              <input
                type="date"
                required
                max={maxDate}
                min="1900-01-01"
                value={formData.dateOfBirth}
                onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="w-full text-xs font-semibold px-2.5 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 bg-white min-h-[44px] text-slate-800"
              />
              <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                Used to calculate your age automatically.
              </p>
              {calculatedAge !== null && (
                <div className="mt-1.5 text-xs text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md inline-flex items-center space-x-1 font-medium animate-in fade-in duration-150">
                  <Sparkles className="w-3 h-3 text-teal-600 shrink-0" />
                  <span>
                    Age: <strong className="font-bold text-teal-900">{calculatedAge} {calculatedAge === 1 ? 'year' : 'years'}</strong>
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
                <Heart className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Blood Group</span>
              </label>
              <select
                value={formData.bloodGroup}
                onChange={e => setFormData({ ...formData, bloodGroup: e.target.value })}
                className="w-full text-xs font-semibold px-2.5 py-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 min-h-[44px] text-slate-800"
              >
                <option value="Unknown">Don't Know (Unknown)</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>
          </div>

          {/* Emergency Contact */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
              <Phone className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Emergency Contact Number</span>
            </label>
            <input
              type="tel"
              value={formData.emergencyContact}
              onChange={e => setFormData({ ...formData, emergencyContact: e.target.value })}
              placeholder="e.g. +91 98765 43210"
              className="w-full text-xs px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 min-h-[44px] text-slate-900"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
              <Mail className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Email Address (Optional)</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g. patient@example.com"
              className="w-full text-xs px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 min-h-[44px] text-slate-900"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center space-x-1">
              <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>City / Address (Optional)</span>
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              placeholder="e.g. Bengaluru, India"
              className="w-full text-xs px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 min-h-[44px] text-slate-900"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors touch-press"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-teal-600/20 transition-all flex items-center justify-center space-x-1.5 touch-press"
            >
              <span>{isLoading ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
