import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeMerchant } from './src/classifier.js';
import { classificationStore, draftStore } from './src/storage.js';
import { markDuplicates, parseCardFile } from './src/parsers.js';
import { createPaymentRequest, validateAndPreview } from './src/exporter.js';
import type { Transaction } from './src/types.js';
import { classificationBodySchema, draftSchema, itemsBodySchema } from './shared/schemas.js';
import { expenseResolutionFilename } from './shared/filenames.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const projectRoot = process.cwd();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 20, fileSize: 20 * 1024 * 1024 },
});

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(projectRoot, 'dist', 'client')));

app.get('/api/health', (_request, response) => response.json({ ok: true }));

app.post('/api/import', upload.array('files', 20), async (request, response) => {
  const files = (request.files || []) as Express.Multer.File[];
  if (!files.length) return response.status(400).json({ message: '업로드할 파일을 선택해 주세요.' });
  const remembered = await classificationStore.all();
  const transactions: Transaction[] = [];
  const fileErrors: Array<{ file: string; message: string }> = [];

  for (const file of files) {
    try {
      transactions.push(...await parseCardFile(file, remembered));
    } catch (error) {
      fileErrors.push({ file: file.originalname, message: errorMessage(error) });
    }
  }

  markDuplicates(transactions);
  return response.json({
    batchId: randomUUID(),
    transactions,
    fileErrors,
    stats: {
      files: files.length,
      parsed: transactions.length,
      rowErrors: transactions.filter((item) => item.parseErrors.length > 0).length,
      cancelled: transactions.filter((item) => item.cancelled).length,
      duplicates: transactions.filter((item) => item.duplicate).length,
    },
  });
});

app.get('/api/classifications', async (_request, response) => {
  response.json(await classificationStore.all());
});

app.post('/api/classifications', async (request, response) => {
  const parsed = classificationBodySchema.safeParse(request.body);
  if (!parsed.success) return invalidBody(response, parsed.error.issues);
  const merchant = normalizeMerchant(parsed.data.merchant);
  const category = parsed.data.category;
  await classificationStore.remember(merchant, category);
  return response.json({ merchant, category });
});

app.get('/api/drafts', async (_request, response) => {
  response.json(await draftStore.all());
});

app.post('/api/drafts', async (request, response) => {
  const parsed = draftSchema.safeParse(request.body);
  if (!parsed.success) return invalidBody(response, parsed.error.issues);
  return response.json(await draftStore.save(parsed.data));
});

app.delete('/api/drafts/:id', async (request, response) => {
  const removed = await draftStore.remove(request.params.id);
  response.status(removed ? 204 : 404).end();
});

app.post('/api/preview', (request, response) => {
  const parsed = itemsBodySchema.safeParse(request.body);
  if (!parsed.success) return invalidBody(response, parsed.error.issues);
  return response.json(validateAndPreview(parsed.data.items, parsed.data.document));
});

app.post('/api/export', async (request, response) => {
  const parsed = itemsBodySchema.safeParse(request.body);
  if (!parsed.success) return invalidBody(response, parsed.error.issues);
  const output = await createPaymentRequest(parsed.data.items, parsed.data.document);
  const filename = encodeURIComponent(expenseResolutionFilename(parsed.data.document || {}));
  response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  return response.send(output);
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function invalidBody(response: Response, issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  return response.status(400).json({
    message: '입력값이 올바르지 않습니다.',
    issues: issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  const multerError = error instanceof multer.MulterError;
  response.status(multerError ? 400 : 500).json({
    message: multerError ? `파일 업로드 오류: ${error.message}` : (errorMessage(error) || '처리 중 오류가 발생했습니다.'),
  });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Expense Resolution: http://localhost:${port}`);
});
