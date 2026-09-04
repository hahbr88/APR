import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CreditCard, LockKeyhole, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { BulkEditor, type BulkValues } from '@/components/bulk-editor';
import { DocumentPanel, type DocumentFormValues } from '@/components/document-panel';
import { FileUpload } from '@/components/file-upload';
import { IssuesPanel, type DisplayIssue } from '@/components/issues-panel';
import { PreviewPanel } from '@/components/preview-panel';
import { TransactionTable } from '@/components/transaction-table';
import { ApiError, createPreview, downloadPaymentRequest, importFiles, listDrafts, rememberClassification, saveDraft } from '@/lib/api';
import { applicationPeriodFromReceiptDate } from '@/lib/dates';
import { documentSchema, type DocumentInfo, type Draft, type FileError, type ImportResult, type PreviewResult, type Transaction } from '../../shared/schemas';

const today = () => new Date().toISOString().slice(0, 10);

export function App() {
  const initialReceiptDate = today();
  const initialPeriod = applicationPeriodFromReceiptDate(initialReceiptDate)!;
  const [items, setItems] = useState<Transaction[]>([]);
  const [fileErrors, setFileErrors] = useState<FileError[]>([]);
  const [stats, setStats] = useState<ImportResult['stats'] | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const form = useForm<DocumentFormValues>({ defaultValues: { applicant: '', receiptDate: initialReceiptDate, ...initialPeriod } });

  useEffect(() => { void refreshDrafts(); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function refreshDrafts() {
    try { setDrafts(await listDrafts()); } catch (error) { showError(error); }
  }
  function showError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const details = error instanceof ApiError ? error.issues.slice(0, 3).map((issue) => `${issue.path}: ${issue.message}`).join(' · ') : '';
    setNotice({ type: 'error', message: details ? `${message} ${details}` : message });
  }
  function currentDocument(): DocumentInfo | null {
    const parsed = documentSchema.safeParse(form.getValues());
    if (!parsed.success) {
      setNotice({ type: 'error', message: parsed.error.issues.map((issue) => issue.message).join(' · ') });
      return null;
    }
    return parsed.data;
  }
  function invalidatePreview() { setPreview(null); }
  function handleReceiptDateChange(receiptDate: string) {
    const period = applicationPeriodFromReceiptDate(receiptDate);
    if (!period) return;
    form.setValue('periodStart', period.periodStart, { shouldDirty: true });
    form.setValue('periodEnd', period.periodEnd, { shouldDirty: true });
    invalidatePreview();
  }

  const handleUpload = async (files: FileList) => {
    setBusy(true);
    try {
      const result = await importFiles(files);
      setItems(result.transactions); setFileErrors(result.fileErrors); setStats(result.stats); setPreview(null);
      const dates = result.transactions.map((item) => item.transactionAt?.slice(0, 10)).filter((value): value is string => Boolean(value)).sort();
      if (!form.getValues('periodStart') && dates[0]) form.setValue('periodStart', dates[0]);
      if (!form.getValues('periodEnd') && dates.at(-1)) form.setValue('periodEnd', dates.at(-1)!);
      setNotice({ type: 'success', message: `${result.transactions.length}건의 카드 내역을 분석했습니다.` });
    } catch (error) { showError(error); } finally { setBusy(false); }
  };

  const updateTransaction = useCallback((id: string, patch: Partial<Transaction>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setPreview(null);
  }, []);
  const changeCategory = useCallback((item: Transaction, category: string) => {
    updateTransaction(item.id, { category, categorySource: 'remembered' });
    void rememberClassification(item.merchant, category)
      .then(() => setNotice({ type: 'success', message: `${item.merchant} 분류를 기억했습니다.` })).catch(showError);
  }, [updateTransaction]);
  const selectVisible = useCallback((ids: string[], selected: boolean) => {
    const idSet = new Set(ids);
    setItems((current) => current.map((item) => idSet.has(item.id) ? { ...item, selected } : item));
    setPreview(null);
  }, []);

  function applyBulk(values: BulkValues) {
    const count = items.filter((item) => item.selected).length;
    if (!count) return setNotice({ type: 'error', message: '먼저 거래를 선택해 주세요.' });
    setItems((current) => current.map((item) => !item.selected ? item : {
      ...item,
      customer: values.customer || item.customer,
      businessType: values.businessType,
      region: values.region,
      tripPeriod: values.region === '서울' ? '' : (values.tripPeriod || item.tripPeriod),
    }));
    invalidatePreview();
    setNotice({ type: 'success', message: `${count}건에 공통 정보를 적용했습니다.` });
  }

  async function runPreview(): Promise<PreviewResult | null> {
    const document = currentDocument();
    if (!document) return null;
    setBusy(true);
    try {
      const result = await createPreview(items, document);
      setPreview(result);
      setNotice({ type: 'success', message: '내보내기 미리보기를 갱신했습니다.' });
      return result;
    } catch (error) { showError(error); return null; } finally { setBusy(false); }
  }
  async function handleExport() {
    const result = preview || await runPreview();
    const document = currentDocument();
    if (!result || !document || result.errors.length) return;
    setBusy(true);
    try { await downloadPaymentRequest(items, document); setNotice({ type: 'success', message: '지출결의서를 생성했습니다.' }); }
    catch (error) { showError(error); } finally { setBusy(false); }
  }
  async function handleSaveDraft() {
    if (!items.length) return setNotice({ type: 'error', message: '저장할 거래가 없습니다.' });
    const document = currentDocument(); if (!document) return;
    const name = window.prompt('초안 이름을 입력하세요.', `지출결의서 ${new Date().toLocaleDateString('ko-KR')}`)?.trim();
    if (!name) return;
    try { await saveDraft({ name, document, items, fileErrors }); await refreshDrafts(); setNotice({ type: 'success', message: '초안을 저장했습니다.' }); }
    catch (error) { showError(error); }
  }
  function handleLoadDraft() {
    const draft = drafts.find((item) => item.id === selectedDraftId);
    if (!draft) return setNotice({ type: 'error', message: '불러올 초안을 선택해 주세요.' });
    setItems(structuredClone(draft.items)); setFileErrors(structuredClone(draft.fileErrors || [])); setStats(null); setPreview(null);
    form.reset({ applicant: draft.document?.applicant || '', receiptDate: draft.document?.receiptDate || today(), periodStart: draft.document?.periodStart || '', periodEnd: draft.document?.periodEnd || '' });
    setNotice({ type: 'success', message: '초안을 불러왔습니다.' });
  }

  const issues = useMemo<DisplayIssue[]>(() => [
    ...fileErrors.map((error) => ({ type: 'error' as const, message: `${error.file}: ${error.message}` })),
    ...items.flatMap((item) => item.parseErrors.map((message) => ({ type: 'error' as const, message: `${item.sourceFile} ${item.sourceRow}행: ${message}` }))),
    ...items.filter((item) => item.cancelled).map((item) => ({ type: 'warning' as const, message: `${item.merchant}: 취소 거래입니다.` })),
    ...items.filter((item) => item.duplicate).map((item) => ({ type: 'warning' as const, message: `${item.merchant}: 중복 거래인지 확인해 주세요.` })),
    ...(preview?.errors || []).map((issue) => ({ type: 'error' as const, message: issue.message })),
    ...(preview?.warnings || []).map((issue) => ({ type: 'warning' as const, message: issue.message })),
  ], [fileErrors, items, preview]);

  return (
    <div className="min-h-screen pb-20">
      <header className="bg-[radial-gradient(circle_at_top_right,oklch(0.62_0.14_155),transparent_42%),linear-gradient(125deg,oklch(0.36_0.09_155),oklch(0.48_0.13_155))] py-12 text-white shadow-sm">
        <div className="app-shell flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="mb-4 flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-white/75"><CreditCard className="size-4" />EXPENSE RESOLUTION</div><h1 className="text-3xl font-bold tracking-tight sm:text-5xl">지출결의서</h1><p className="mt-3 max-w-2xl text-sm text-white/75 sm:text-base">여러 카드사 내역을 합치고 검토한 뒤 회사 엑셀 양식으로 안전하게 내보냅니다.</p></div>
          <div className="flex flex-wrap gap-2"><Badge className="bg-white/15 text-white"><Sparkles />자동 분류</Badge><Badge className="bg-white/15 text-white"><LockKeyhole />로컬 전용</Badge></div>
        </div>
      </header>
      <main className="app-shell mt-6 grid gap-5">
        {notice && <Alert variant={notice.type === 'error' ? 'destructive' : 'default'} className={notice.type === 'success' ? 'border-primary/30 bg-primary/8 text-primary' : ''}><AlertDescription>{notice.message}</AlertDescription></Alert>}
        <FileUpload busy={busy} stats={stats} onUpload={handleUpload} />
        <DocumentPanel register={form.register} drafts={drafts} selectedDraftId={selectedDraftId} onSelectedDraftId={setSelectedDraftId} onLoadDraft={handleLoadDraft} onSaveDraft={() => void handleSaveDraft()} onReceiptDateChange={handleReceiptDateChange} />
        <BulkEditor onApply={applyBulk} />
        <TransactionTable items={items} onUpdate={updateTransaction} onCategoryChange={changeCategory} onSelectVisible={selectVisible} />
        <IssuesPanel issues={issues} />
        <PreviewPanel preview={preview} busy={busy} onPreview={() => void runPreview()} onExport={() => void handleExport()} />
      </main>
    </div>
  );
}
