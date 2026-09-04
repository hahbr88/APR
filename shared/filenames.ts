import type { DocumentInfo } from './schemas.js';

function localDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function expenseResolutionFilename(document: DocumentInfo): string {
  const receiptDate = (document.receiptDate || localDate()).replace(/\D/g, '').slice(0, 8);
  const applicant = String(document.applicant || '미입력')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 80) || '미입력';
  return `지출결의서_${receiptDate}_${applicant}.xlsx`;
}
