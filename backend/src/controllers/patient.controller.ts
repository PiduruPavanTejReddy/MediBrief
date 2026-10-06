import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { PatientProfile } from '../types';
import { AuditService } from '../services/audit.service';
import { calculateAge } from '../utils/date.utils';

export class PatientController {
  public static async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId!;
      const profile = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(patientId) as PatientProfile | undefined;
      const user = db.prepare('SELECT id, mobile_number, role, created_at FROM users WHERE id = ?').get(patientId);

      const dynamicAge = profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null;

      res.json({
        success: true,
        data: {
          user,
          profile: profile ? {
            ...profile,
            age: dynamicAge !== null ? dynamicAge : 'Age not available'
          } : null
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static async saveProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const patientId = req.patientId!;
      const {
        fullName,
        dateOfBirth,
        gender,
        bloodGroup,
        emergencyContact,
        email,
        address
      } = req.body;

      if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
        res.status(400).json({
          success: false,
          error: 'Full Name is required.'
        });
        return;
      }

      if (!dateOfBirth || typeof dateOfBirth !== 'string' || !dateOfBirth.trim()) {
        res.status(400).json({
          success: false,
          error: 'Date of Birth is required.'
        });
        return;
      }

      const cleanDOB = dateOfBirth.trim();
      const calculatedAge = calculateAge(cleanDOB);
      if (calculatedAge === null) {
        res.status(400).json({
          success: false,
          error: 'Please enter a valid Date of Birth (cannot be in the future).'
        });
        return;
      }

      const cleanFullName = fullName.trim();
      const cleanBloodGroup = (bloodGroup && bloodGroup.trim()) ? bloodGroup.trim() : 'Unknown';
      const cleanEmergencyContact = (emergencyContact && emergencyContact.trim()) ? emergencyContact.trim() : 'None registered';
      const cleanGender = (gender && gender.trim()) ? gender.trim() : 'Other';

      const now = new Date().toISOString();
      const existing = db.prepare('SELECT id FROM patient_profiles WHERE user_id = ?').get(patientId) as any;

      if (existing) {
        db.prepare(`
          UPDATE patient_profiles 
          SET full_name = ?, date_of_birth = ?, gender = ?, blood_group = ?, 
              emergency_contact = ?, email = ?, address = ?, updated_at = ?
          WHERE user_id = ?
        `).run(cleanFullName, cleanDOB, cleanGender, cleanBloodGroup, cleanEmergencyContact, email || null, address || null, now, patientId);

        AuditService.log(patientId, 'patient', patientId, 'PROFILE_UPDATED', { fullName: cleanFullName });
      } else {
        const id = uuidv4();
        db.prepare(`
          INSERT INTO patient_profiles (id, user_id, full_name, date_of_birth, gender, blood_group, emergency_contact, email, address, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, patientId, cleanFullName, cleanDOB, cleanGender, cleanBloodGroup, cleanEmergencyContact, email || null, address || null, now, now);

        AuditService.log(patientId, 'patient', patientId, 'PROFILE_CREATED', { fullName: cleanFullName });
      }

      const updatedProfile = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(patientId) as any;
      res.json({
        success: true,
        data: updatedProfile ? {
          ...updatedProfile,
          age: calculatedAge
        } : null
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
