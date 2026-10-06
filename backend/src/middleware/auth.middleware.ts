import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { db } from '../db/database';
import { DoctorSessionPayload, SharingSession } from '../types';

export interface AuthenticatedRequest extends Request {
  patientId?: string;
  userRole?: string;
  doctorSession?: DoctorSessionPayload;
}

export function patientAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    if (decoded.role !== 'patient' && decoded.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Forbidden: Patient role required' });
      return;
    }
    req.patientId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Unauthorized: Session has expired or token is invalid' });
  }
}

export function doctorAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized: Missing doctor session token' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as DoctorSessionPayload;
    if (decoded.role !== 'doctor') {
      res.status(403).json({ success: false, error: 'Forbidden: Doctor session token required' });
      return;
    }

    // Crucial check: verify that this sharing session has not been revoked by the patient or ended by the doctor
    const session = db.prepare('SELECT * FROM sharing_sessions WHERE id = ?').get(
      decoded.sharingSessionId
    ) as SharingSession | undefined;

    if (!session) {
      res.status(403).json({ success: false, error: 'Doctor session not found.' });
      return;
    }

    if (session.status !== 'ACTIVE') {
      const reason = session.status === 'REVOKED'
        ? 'This sharing session was revoked by the patient.'
        : 'This doctor consultation session has ended.';
      res.status(403).json({
        success: false,
        error: reason,
        sessionStatus: session.status
      });
      return;
    }

    req.doctorSession = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Unauthorized: Doctor session token invalid or expired' });
  }
}
