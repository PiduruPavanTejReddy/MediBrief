import { Router } from 'express';
import multer from 'multer';
import { RecordController } from '../controllers/record.controller';
import { patientAuth } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB max
  }
});

// File streaming via HMAC signed URL (does not require Bearer token because signed token is in query params)
router.get('/file/:key', RecordController.serveFile);

// Protected patient routes
router.use(patientAuth);
router.post('/upload', upload.single('document'), RecordController.uploadDocument);
router.post('/verify-and-save', RecordController.verifyAndSaveRecord);
router.get('/', RecordController.getRecords);
router.get('/:id', RecordController.getRecordById);
router.delete('/:id', RecordController.deleteRecord);

export default router;
