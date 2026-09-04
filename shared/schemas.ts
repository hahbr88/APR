import * as z from 'zod';

const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, '거래일시 형식이 올바르지 않습니다.');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD여야 합니다.');
const optionalDateSchema = z.union([dateSchema, z.literal('')]).optional();
const nullableAmountSchema = z.number().finite().nullable();

export const businessTypeSchema = z.enum(['프로젝트', '유지보수', '링스테크내부', '기타']);
export const regionSchema = z.enum(['서울', '지방']);
export const categorySourceSchema = z.enum(['remembered', 'rule', 'default']);

export const documentSchema = z.strictObject({
  applicant: z.string().trim().max(50).optional(), receiptDate: optionalDateSchema,
  periodStart: optionalDateSchema, periodEnd: optionalDateSchema,
});
export const transactionSchema = z.strictObject({
  id: z.string().min(1), sourceFile: z.string().min(1).max(260), sourceRow: z.number().int().positive(),
  cardCompany: z.string().min(1).max(50), cardNumber: z.string().max(50), transactionAt: localDateTimeSchema.nullable(),
  merchant: z.string().trim().max(200), amount: nullableAmountSchema, approvalNumber: z.string().max(100),
  status: z.string().max(50), cancellationDate: z.string().max(50), installment: z.string().max(50),
  cancelled: z.boolean(), parseErrors: z.array(z.string().max(300)).max(20), fingerprint: z.string().max(500),
  duplicate: z.boolean().optional(), duplicateOf: z.string().optional(), category: z.string().trim().min(1).max(50),
  categorySource: categorySourceSchema, selected: z.boolean(), customer: z.string().trim().max(100),
  businessType: businessTypeSchema, region: regionSchema, reason: z.string().trim().max(300),
  actualAmount: nullableAmountSchema, claimAmount: nullableAmountSchema, tripPeriod: z.string().trim().max(50),
}).superRefine((transaction, context) => {
  if (transaction.cancelled) return;
  for (const [field, label] of [['actualAmount', '실사용금액'], ['claimAmount', '청구금액']] as const) {
    const value = transaction[field];
    if (value !== null && value < 0) context.addIssue({ code: 'custom', path: [field], message: `${label}은 0 이상이어야 합니다.` });
  }
});
export const itemsBodySchema = z.strictObject({
  items: z.array(transactionSchema).max(5000, '한 번에 처리할 수 있는 거래는 최대 5,000건입니다.'),
  document: documentSchema.optional(),
});
export const classificationBodySchema = z.strictObject({
  merchant: z.string().trim().min(1).max(200), category: z.string().trim().min(1).max(50),
});
export const fileErrorSchema = z.strictObject({ file: z.string().max(260), message: z.string().max(500) });
export const draftSchema = z.strictObject({
  id: z.string().optional(), name: z.string().trim().min(1).max(100).optional(), document: documentSchema.optional(),
  items: z.array(transactionSchema).max(5000), fileErrors: z.array(fileErrorSchema).max(100).optional(),
  createdAt: z.string().optional(), updatedAt: z.string().optional(),
});
export const draftListSchema = z.array(draftSchema);

export type Transaction = z.infer<typeof transactionSchema>;
export type DocumentInfo = z.infer<typeof documentSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type BusinessType = z.infer<typeof businessTypeSchema>;
export type Region = z.infer<typeof regionSchema>;
export type CategorySource = z.infer<typeof categorySourceSchema>;
export type FileError = z.infer<typeof fileErrorSchema>;

export interface PreviewIssue { id: string; message: string }
export interface PreviewMapping { id: string; merchant: string; category: string; resolutionRow: number; expenseRow: number }
export interface PreviewResult {
  document: DocumentInfo;
  summary: {
    selectedCount: number; actualTotal: number; claimTotal: number; excludedAmount: number;
    insertedResolutionRows: number; insertedExpenseRows: number;
  };
  mappings: PreviewMapping[];
  errors: PreviewIssue[];
  warnings: PreviewIssue[];
}
export interface ImportResult {
  batchId: string;
  transactions: Transaction[];
  fileErrors: FileError[];
  stats: { files: number; parsed: number; rowErrors: number; cancelled: number; duplicates: number };
}
