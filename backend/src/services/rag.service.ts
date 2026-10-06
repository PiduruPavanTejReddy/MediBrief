import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { AICitation, MedicalRecord } from '../types';

export interface RetrievedChunk {
  recordId: string;
  chunkText: string;
  score: number;
  citation: AICitation;
}

export class RAGService {
  /**
   * Generates a deterministic high-dimensional embedding vector (128-d)
   * using character n-grams and medical domain vocabulary hashing.
   * This provides fast, offline, repeatable vector cosine similarity.
   */
  public static generateEmbedding(text: string): number[] {
    const dim = 128;
    const vector = new Array(dim).fill(0);
    const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = clean.split(/\s+/).filter(t => t.length > 1);

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let hash = 0;
      for (let j = 0; j < token.length; j++) {
        hash = (hash << 5) - hash + token.charCodeAt(j);
        hash |= 0;
      }
      const idx = Math.abs(hash) % dim;
      vector[idx] += 1;

      // Also hash bi-grams for semantic context
      if (i < tokens.length - 1) {
        const bigram = `${token}_${tokens[i + 1]}`;
        let biHash = 0;
        for (let j = 0; j < bigram.length; j++) {
          biHash = (biHash << 5) - biHash + bigram.charCodeAt(j);
          biHash |= 0;
        }
        const biIdx = Math.abs(biHash) % dim;
        vector[biIdx] += 1.5;
      }
    }

    // L2 Normalize
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        vector[i] = vector[i] / norm;
      }
    }

    return vector;
  }

  public static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    return dot;
  }

  /**
   * Indexes a medical record into document_embeddings
   */
  public static indexRecord(record: MedicalRecord, fullDetails?: { findings?: any[]; medications?: any[]; diagnoses?: any[] }): void {
    // Remove existing chunks for this record
    db.prepare('DELETE FROM document_embeddings WHERE record_id = ?').run(record.id);

    const chunks: string[] = [];

    // Header chunk
    chunks.push(
      `Record: ${record.title} (${record.record_type}). Date: ${record.record_date}. Hospital: ${record.hospital}. Doctor: ${record.doctor}.`
    );

    // Findings chunk
    if (fullDetails?.findings && fullDetails.findings.length > 0) {
      const findingsSummary = fullDetails.findings
        .map(f => `${f.name}: ${f.value} ${f.unit || ''} (Ref: ${f.reference_range || 'N/A'})${f.abnormal_flag ? ' [ABNORMAL]' : ''}`)
        .join('; ');
      chunks.push(`Lab Findings & Investigations for ${record.title}: ${findingsSummary}`);
    }

    // Medications chunk
    if (fullDetails?.medications && fullDetails.medications.length > 0) {
      const medsSummary = fullDetails.medications
        .map(m => `${m.medication_name} ${m.dosage} - ${m.frequency} (${m.instructions || ''})`)
        .join('; ');
      chunks.push(`Prescribed Medications: ${medsSummary}`);
    }

    // Diagnoses chunk
    if (fullDetails?.diagnoses && fullDetails.diagnoses.length > 0) {
      const diagSummary = fullDetails.diagnoses.map(d => d.diagnosis).join(', ');
      chunks.push(`Documented Diagnoses: ${diagSummary}`);
    }

    // Text chunks
    if (record.extracted_text) {
      const paragraphs = record.extracted_text.split(/\n\s*\n/).filter(p => p.trim().length > 30);
      for (const p of paragraphs) {
        chunks.push(p.trim());
      }
    }

    const insertStmt = db.prepare(`
      INSERT INTO document_embeddings (id, record_id, patient_id, chunk_text, embedding_json, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const chunk of chunks) {
      const embedding = this.generateEmbedding(chunk);
      const metadata = {
        record_id: record.id,
        record_title: record.title,
        record_type: record.record_type,
        record_date: record.record_date,
        hospital: record.hospital,
        doctor: record.doctor
      };

      insertStmt.run(
        uuidv4(),
        record.id,
        record.patient_id,
        chunk,
        JSON.stringify(embedding),
        JSON.stringify(metadata),
        now
      );
    }
  }

  /**
   * Retrieves relevant chunks with strict patient and doctor scoping
   */
  public static retrieveRelevantChunks(
    patientId: string,
    query: string,
    allowedRecordIds?: string[], // When supplied (e.g. for doctor sessions), strictly whitelists these records
    limit: number = 6
  ): RetrievedChunk[] {
    const queryEmbedding = this.generateEmbedding(query);

    let rows: any[] = [];
    if (allowedRecordIds && allowedRecordIds.length > 0) {
      // Scoped doctor retrieval
      const placeholders = allowedRecordIds.map(() => '?').join(',');
      const stmt = db.prepare(`
        SELECT de.*, mr.title, mr.record_type, mr.record_date, mr.hospital, mr.doctor
        FROM document_embeddings de
        JOIN medical_records mr ON de.record_id = mr.id
        WHERE de.patient_id = ? AND de.record_id IN (${placeholders})
      `);
      rows = stmt.all(patientId, ...allowedRecordIds);
    } else if (allowedRecordIds && allowedRecordIds.length === 0) {
      // Doctor session has 0 records shared
      return [];
    } else {
      // Full patient retrieval (strictly scoped to this authenticated patient)
      const stmt = db.prepare(`
        SELECT de.*, mr.title, mr.record_type, mr.record_date, mr.hospital, mr.doctor
        FROM document_embeddings de
        JOIN medical_records mr ON de.record_id = mr.id
        WHERE de.patient_id = ?
      `);
      rows = stmt.all(patientId);
    }

    const scoredChunks: RetrievedChunk[] = [];

    for (const row of rows) {
      try {
        const embedding = JSON.parse(row.embedding_json);
        const sim = this.cosineSimilarity(queryEmbedding, embedding);

        // Check meaningful keyword overlap (filtering common question, English, and generic filler stopwords)
        const stopwords = new Set([
          'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
          'up', 'about', 'into', 'over', 'after', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
          'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'shall', 'should', 'will', 'would',
          'may', 'might', 'must', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'what', 'which', 'who',
          'whom', 'this', 'that', 'these', 'those', 'there', 'here', 'when', 'where', 'why', 'how', 'all',
          'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
          'own', 'same', 'so', 'than', 'too', 'very', 'dose', 'tell', 'show', 'give', 'please', 'time', 'years',
          'regimen', 'treatment', 'therapy', 'result', 'results', 'report', 'reports', 'record', 'records',
          'test', 'tests', 'level', 'levels', 'status', 'value', 'values', 'take', 'taking', 'prescribed'
        ]);
        const lowerQuery = query.toLowerCase();
        const lowerChunk = row.chunk_text.toLowerCase();
        const queryTerms = lowerQuery.split(/[^a-z0-9]+/).filter(t => t.length > 2 && !stopwords.has(t));
        
        let matchCount = 0;
        for (const term of queryTerms) {
          const regex = new RegExp(`\\b${term}\\b`, 'i');
          if (regex.test(lowerChunk)) {
            matchCount++;
          }
        }

        const boost = matchCount * 0.35;
        const totalScore = sim + boost;

        // If specific meaningful query terms were provided (e.g. chemotherapy, cancer),
        // require at least one meaningful term to match
        if (queryTerms.length > 0 && matchCount === 0) {
          continue; // Not relevant
        }

        scoredChunks.push({
          recordId: row.record_id,
          chunkText: row.chunk_text,
          score: totalScore,
          citation: {
            record_id: row.record_id,
            record_title: row.title,
            record_type: row.record_type,
            record_date: row.record_date,
            hospital: row.hospital,
            doctor: row.doctor,
            snippet: row.chunk_text.slice(0, 160) + '...'
          }
        });
      } catch (err) {
        // Skip malformed
      }
    }

    // Sort descending by score
    scoredChunks.sort((a, b) => b.score - a.score);

    // Deduplicate citations while preserving top results
    const uniqueRecords = new Set<string>();
    const topResults: RetrievedChunk[] = [];

    for (const chunk of scoredChunks) {
      if (topResults.length >= limit) break;
      topResults.push(chunk);
      uniqueRecords.add(chunk.recordId);
    }

    return topResults;
  }
}
