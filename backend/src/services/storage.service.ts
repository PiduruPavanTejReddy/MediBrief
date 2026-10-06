import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';

export interface UploadResult {
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
}

export interface IStorageService {
  saveFile(buffer: Buffer, originalName: string, mimeType: string): Promise<UploadResult>;
  getFileStream(fileKey: string): { stream: fs.ReadStream; mimeType: string; size: number };
  generateSignedUrl(fileKey: string, expiresInMinutes?: number): string;
  verifySignedUrl(fileKey: string, expires: number, signature: string): boolean;
  deleteFile(fileKey: string): Promise<boolean>;
}

export class LocalStorageService implements IStorageService {
  private uploadDir: string;
  private signingSecret: string;

  constructor() {
    this.uploadDir = config.storageUploadDir;
    this.signingSecret = config.jwtSecret;

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  public async saveFile(buffer: Buffer, originalName: string, mimeType: string): Promise<UploadResult> {
    const ext = path.extname(originalName) || '.bin';
    const fileKey = `${uuidv4()}${ext}`;
    const targetPath = path.join(this.uploadDir, fileKey);

    fs.writeFileSync(targetPath, buffer);
    const stats = fs.statSync(targetPath);

    return {
      fileKey,
      fileName: originalName,
      fileSize: stats.size,
      mimeType,
      storagePath: targetPath
    };
  }

  public getFileStream(fileKey: string): { stream: fs.ReadStream; mimeType: string; size: number } {
    // Sanitize fileKey to prevent path traversal
    const safeKey = path.basename(fileKey);
    const filePath = path.join(this.uploadDir, safeKey);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${fileKey}`);
    }

    const stats = fs.statSync(filePath);
    const ext = path.extname(safeKey).toLowerCase();
    let mimeType = 'application/octet-stream';
    if (ext === '.pdf') mimeType = 'application/pdf';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';

    return {
      stream: fs.createReadStream(filePath),
      mimeType,
      size: stats.size
    };
  }

  public generateSignedUrl(fileKey: string, expiresInMinutes: number = 60): string {
    const expires = Math.floor(Date.now() / 1000) + expiresInMinutes * 60;
    const dataToSign = `${fileKey}:${expires}`;
    const signature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(dataToSign)
      .digest('hex');

    return `/api/records/file/${encodeURIComponent(fileKey)}?expires=${expires}&signature=${signature}`;
  }

  public verifySignedUrl(fileKey: string, expires: number, signature: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    if (expires < now) {
      return false; // Expired
    }

    const dataToSign = `${fileKey}:${expires}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(dataToSign)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch {
      return false;
    }
  }

  public async deleteFile(fileKey: string): Promise<boolean> {
    const safeKey = path.basename(fileKey);
    const filePath = path.join(this.uploadDir, safeKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}

export const storageService = new LocalStorageService();
