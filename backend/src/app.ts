import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/auth.routes';
import patientRoutes from './routes/patient.routes';
import recordRoutes from './routes/record.routes';
import aiRoutes from './routes/ai.routes';
import sharingRoutes from './routes/sharing.routes';
import doctorRoutes from './routes/doctor.routes';
import auditRoutes from './routes/audit.routes';

const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow all local dev origins or configured origins
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'MediBrief API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/sharing', sharingRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/audit', auditRoutes);

// Serve frontend build statically in production or when dist exists
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// SPA fallback for frontend routes (e.g. /doctor, /records, etc.) - Express 5 compatible
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api') || req.method !== 'GET') {
    return next();
  }
  const indexPath = path.join(frontendDist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      next();
    }
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[App Error]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

export default app;
