export type {
  BusinessType, CategorySource, DocumentInfo, Draft, FileError, ImportResult, PreviewIssue,
  PreviewMapping, PreviewResult, Region, Transaction,
} from '../shared/schemas.js';

export interface UploadedCardFile { originalname: string; buffer: Buffer }
