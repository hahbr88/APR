import type { DocumentInfo, Draft, ImportResult, PreviewResult, Transaction } from '../../../shared/schemas';
import { expenseResolutionFilename } from '../../../shared/filenames';

export class ApiError extends Error {
  constructor(message: string, readonly issues: Array<{ path: string; message: string }> = []) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (response.status === 204 ? null : await response.json()) as T;
  const body = await response.json().catch(() => ({ message: response.statusText })) as {
    message?: string; issues?: Array<{ path: string; message: string }>;
  };
  throw new ApiError(body.message || '요청을 처리하지 못했습니다.', body.issues || []);
}

export async function importFiles(files: FileList | File[]): Promise<ImportResult> {
  const form = new FormData();
  Array.from(files).forEach((file) => form.append('files', file));
  return parseResponse(await fetch('/api/import', { method: 'POST', body: form }));
}

export async function createPreview(items: Transaction[], document: DocumentInfo): Promise<PreviewResult> {
  return parseResponse(await fetch('/api/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, document }),
  }));
}

export async function rememberClassification(merchant: string, category: string): Promise<void> {
  await parseResponse(await fetch('/api/classifications', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, category }),
  }));
}

export async function listDrafts(): Promise<Draft[]> {
  return parseResponse(await fetch('/api/drafts'));
}

export async function saveDraft(draft: Draft): Promise<Draft> {
  return parseResponse(await fetch('/api/drafts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
  }));
}

export async function downloadPaymentRequest(items: Transaction[], document: DocumentInfo): Promise<void> {
  const response = await fetch('/api/export', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, document }),
  });
  if (!response.ok) await parseResponse(response);
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement('a');
  link.href = url;
  link.download = expenseResolutionFilename(document);
  link.click();
  URL.revokeObjectURL(url);
}
