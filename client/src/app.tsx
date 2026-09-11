import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ArrowLeft, ArrowRight, ListChecks, RotateCcw, Save, Undo2, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BulkEditor, type BulkValues } from '@/components/bulk-editor';
import { DocumentPanel, type DocumentFormValues } from '@/components/document-panel';
import { DraftPicker } from '@/components/draft-picker';
import { FileUpload } from '@/components/file-upload';
import { IssuesPanel, type DisplayIssue } from '@/components/issues-panel';
import { PreviewPanel } from '@/components/preview-panel';
import { TransactionTable } from '@/components/transaction-table';
import { ApiError, createPreview, deleteDraft, downloadPaymentRequest, getAppSettings, importFiles, listDrafts, rememberClassification, saveDraft, updateAppSettings } from '@/lib/api';
import { applicationPeriodFromReceiptDate } from '@/lib/dates';
import { documentSchema, type DocumentInfo, type Draft, type FileError, type ImportResult, type PreviewResult, type Transaction } from '../../shared/schemas';

type FunnelStep = 1 | 2 | 3 | 4;
type Notice = { type: 'success' | 'error'; message: string; undoDraft?: Draft };

const today = () => new Date().toISOString().slice(0, 10);
const initialDocument = (applicant = ''): DocumentFormValues => {
  const receiptDate = today();
  return { applicant, receiptDate, ...applicationPeriodFromReceiptDate(receiptDate)! };
};

export function App() {
  const [step, setStep] = useState<FunnelStep>(1);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [items, setItems] = useState<Transaction[]>([]);
  const [fileErrors, setFileErrors] = useState<FileError[]>([]);
  const [stats, setStats] = useState<ImportResult['stats'] | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [rememberedApplicant, setRememberedApplicant] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [applicantOverride, setApplicantOverride] = useState<string | null>(null);
  const [pendingApplicantChange, setPendingApplicantChange] = useState<{ previous: string | null; next: string } | null>(null);
  const form = useForm<DocumentFormValues>({ defaultValues: initialDocument() });
  const [applicationPeriodStart, applicationPeriodEnd] = useWatch({ control: form.control, name: ['periodStart', 'periodEnd'] });
  const selectedCount = items.filter((item) => item.selected).length;

  useEffect(() => { void refreshDrafts(); void loadSettings(); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.undoDraft || notice.type === 'error' ? 6000 : 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!selectedCount) setBulkEditorOpen(false);
  }, [selectedCount]);
  useEffect(() => {
    if (!bulkEditorOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setBulkEditorOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [bulkEditorOpen]);

  async function refreshDrafts() {
    try { setDrafts(await listDrafts()); } catch (error) { showError(error); }
  }
  async function loadSettings() {
    try {
      const settings = await getAppSettings();
      setRememberedApplicant(settings.rememberedApplicant);
      if (settings.rememberedApplicant && !form.getValues('applicant')) {
        form.setValue('applicant', settings.rememberedApplicant, { shouldDirty: false });
      }
    } catch (error) { showError(error); } finally { setSettingsLoaded(true); }
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

  async function handleDocumentNext() {
    const documentInfo = currentDocument();
    if (!documentInfo) return;
    const applicant = documentInfo.applicant?.trim() || '';
    if (rememberedApplicant && applicant && applicant !== rememberedApplicant && applicant !== applicantOverride) {
      setPendingApplicantChange({ previous: rememberedApplicant, next: applicant });
      return;
    }
    if (!rememberedApplicant && applicant && applicant !== applicantOverride) {
      setPendingApplicantChange({ previous: null, next: applicant });
      return;
    }
    setStep(3);
  }

  async function rememberChangedApplicant() {
    if (!pendingApplicantChange) return;
    setBusy(true);
    try {
      const settings = await updateAppSettings({ rememberedApplicant: pendingApplicantChange.next });
      setRememberedApplicant(settings.rememberedApplicant);
      setApplicantOverride(null);
      setPendingApplicantChange(null);
      setStep(3);
      setNotice({ type: 'success', message: pendingApplicantChange.previous
        ? `기본 접수자를 “${pendingApplicantChange.next}”(으)로 변경했습니다.`
        : `접수자 “${pendingApplicantChange.next}”을 다음 문서에도 사용합니다.` });
    } catch (error) { showError(error); } finally { setBusy(false); }
  }

  function useApplicantOnce() {
    if (!pendingApplicantChange) return;
    setApplicantOverride(pendingApplicantChange.next);
    setPendingApplicantChange(null);
    setStep(3);
  }

  const handleUpload = async (files: File[]) => {
    setBusy(true);
    try {
      const result = await importFiles(files);
      setItems(result.transactions); setFileErrors(result.fileErrors); setStats(result.stats); setPreview(null); setActiveDraft(null);
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
      .then(() => setNotice({ type: 'success', message: `${item.merchant} 실사용 내역 구분을 기억했습니다.` })).catch(showError);
  }, [updateTransaction]);
  const selectVisible = useCallback((ids: string[], selected: boolean) => {
    const idSet = new Set(ids);
    setItems((current) => current.map((item) => idSet.has(item.id) ? { ...item, selected } : item));
    setPreview(null);
  }, []);

  function applyBulk(values: BulkValues) {
    if (!selectedCount) return setNotice({ type: 'error', message: '먼저 거래를 선택해 주세요.' });
    setItems((current) => current.map((item) => !item.selected ? item : {
      ...item,
      customer: values.customer || item.customer,
      businessType: values.businessType,
      region: values.region,
      tripPeriod: values.region === '서울' ? '' : (values.tripPeriod || item.tripPeriod),
    }));
    invalidatePreview();
    setBulkEditorOpen(false);
    setNotice({ type: 'success', message: `${selectedCount}건에 공통 정보를 적용했습니다.` });
  }

  function clearSelectedTransactions() {
    setItems((current) => current.map((item) => item.selected ? { ...item, selected: false } : item));
    setPreview(null);
    setBulkEditorOpen(false);
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
  async function handleReview() {
    if (!selectedCount) return setNotice({ type: 'error', message: '내보낼 거래를 먼저 선택해 주세요.' });
    if (await runPreview()) setStep(4);
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
    const name = activeDraft?.name || window.prompt('초안 이름을 입력하세요.', `지출결의서 ${new Date().toLocaleDateString('ko-KR')}`)?.trim();
    if (!name) return;
    const draft: Draft = activeDraft
      ? { ...activeDraft, name, document, items, fileErrors }
      : { name, document, items, fileErrors };
    try {
      const saved = await saveDraft(draft);
      setActiveDraft(saved);
      await refreshDrafts();
      setNotice({ type: 'success', message: '초안을 저장했습니다.' });
    } catch (error) { showError(error); }
  }
  function handleLoadDraft(draft: Draft) {
    setItems(structuredClone(draft.items)); setFileErrors(structuredClone(draft.fileErrors || [])); setStats(null); setPreview(null); setActiveDraft(draft);
    form.reset({ applicant: draft.document?.applicant || '', receiptDate: draft.document?.receiptDate || today(), periodStart: draft.document?.periodStart || '', periodEnd: draft.document?.periodEnd || '' });
    setApplicantOverride(draft.document?.applicant && draft.document.applicant !== rememberedApplicant ? draft.document.applicant : null);
    setStep(3);
    setNotice({ type: 'success', message: `“${draft.name}” 초안을 불러왔습니다.` });
  }
  async function handleDeleteDraft(draft: Draft) {
    if (!draft.id || !window.confirm(`“${draft.name}” 초안을 삭제할까요?`)) return;
    try {
      await deleteDraft(draft.id);
      if (activeDraft?.id === draft.id) setActiveDraft(null);
      await refreshDrafts();
      setNotice({ type: 'success', message: '초안을 삭제했습니다. 현재 편집 내용은 유지됩니다.', undoDraft: draft });
    } catch (error) { showError(error); }
  }
  async function restoreDraft(draft: Draft) {
    try {
      await saveDraft(draft);
      await refreshDrafts();
      setNotice({ type: 'success', message: '삭제한 초안을 복구했습니다.' });
    } catch (error) { showError(error); }
  }
  function resetWorkspace() {
    if ((items.length > 0 || form.formState.isDirty || activeDraft) && !window.confirm('현재 업로드 및 편집 내용을 모두 비우고 새로 작성할까요?')) return;
    setStep(1); setItems([]); setFileErrors([]); setStats(null); setPreview(null); setActiveDraft(null); setBulkEditorOpen(false); setWorkspaceKey((value) => value + 1);
    form.reset(initialDocument(rememberedApplicant || ''));
    setApplicantOverride(null); setPendingApplicantChange(null);
    setNotice({ type: 'success', message: '새 작업을 시작합니다.' });
  }

  const issues = useMemo<DisplayIssue[]>(() => [
    ...fileErrors.map((error) => ({ type: 'error' as const, message: `${error.file}: ${error.message}` })),
    ...items.flatMap((item) => item.parseErrors.map((message) => ({ type: 'error' as const, message: `${item.sourceFile} ${item.sourceRow}행: ${message}` }))),
    ...items.filter((item) => item.cancelled).map((item) => ({ type: 'warning' as const, message: item.cancellationOf ? `${item.merchant}: 취소 거래이며 원승인 거래와 연결했습니다.` : `${item.merchant}: 취소 거래의 원승인을 자동으로 찾지 못했습니다.` })),
    ...items.filter((item) => item.cancelledBy).map((item) => ({ type: 'warning' as const, message: `${item.merchant}: 취소된 원승인 거래이므로 내보내기에서 제외됩니다.` })),
    ...items.filter((item) => item.duplicate).map((item) => ({ type: 'warning' as const, message: `${item.merchant}: 중복 거래인지 확인해 주세요.` })),
    ...(preview?.errors || []).map((issue) => ({ type: 'error' as const, message: issue.message })),
    ...(preview?.warnings || []).map((issue) => ({ type: 'warning' as const, message: issue.message })),
  ], [fileErrors, items, preview]);

  return <div className={`min-h-screen ${step === 3 && selectedCount ? 'pb-28' : 'pb-20'}`}>
    <header className="sticky top-0 z-40 border-b bg-background/95 shadow-sm backdrop-blur">
      <div className="app-shell flex items-center gap-4 py-3">
        <div className="min-w-0 flex-1"><FunnelProgress step={step} onStep={setStep} /></div>
        {activeDraft?.name && <Badge variant="secondary" className="max-w-48 truncate" title={activeDraft.name}>{activeDraft.name}</Badge>}
        <Button type="button" variant="outline" className="shrink-0" onClick={resetWorkspace}><RotateCcw />새로 작성</Button>
      </div>
    </header>
    {notice && <Alert role="status" variant={notice.type === 'error' ? 'destructive' : 'default'} className={`fixed right-6 top-20 z-[60] w-[min(28rem,calc(100vw-3rem))] animate-in fade-in slide-in-from-top-2 shadow-lg duration-200 ${notice.type === 'success' ? 'border-primary/30 bg-background text-primary' : 'bg-background'}`}><div className="flex items-center justify-between gap-3"><AlertDescription>{notice.message}</AlertDescription>{notice.undoDraft && <Button type="button" size="sm" variant="outline" onClick={() => void restoreDraft(notice.undoDraft!)}><Undo2 />삭제 취소</Button>}</div></Alert>}
    <main className="app-shell mt-6 grid gap-6">
      {step === 1 && <section className="mx-auto grid w-full max-w-4xl gap-5">
        <StepHeading step={1} title="어떻게 시작할까요?" description="새 카드 내역을 불러오거나 저장한 초안에서 이어서 작성하세요." />
        <FileUpload key={workspaceKey} busy={busy} stats={stats} onUpload={handleUpload} />
        {drafts.length > 0 && <DraftPicker drafts={drafts} busy={busy} onLoad={handleLoadDraft} onDelete={(draft) => void handleDeleteDraft(draft)} />}
        <StepNavigation nextLabel="문서 정보 입력" nextDisabled={!items.length || busy} onNext={() => setStep(2)} />
      </section>}

      {step === 2 && <section className="mx-auto grid w-full max-w-4xl gap-5">
        <StepHeading step={2} title="문서 정보를 입력해 주세요" description="접수일을 기준으로 신청기간이 자동 계산되며 직접 수정할 수도 있습니다." />
        <DocumentPanel register={form.register} onReceiptDateChange={handleReceiptDateChange} />
        <StepNavigation onBack={() => setStep(1)} nextLabel="거래 선택하기" nextDisabled={busy || !settingsLoaded} onNext={() => void handleDocumentNext()} />
      </section>}

      {step === 3 && <section className="grid gap-5">
        <div className="flex items-end justify-between gap-3"><StepHeading step={3} title="거래를 선택하고 내용을 확인해 주세요" description="선택한 거래를 편집하고 필요하면 현재 작업을 초안으로 저장하세요." /><Button type="button" variant="outline" className="shrink-0" disabled={busy} onClick={() => void handleSaveDraft()}><Save />초안 저장</Button></div>
        <TransactionTable applicationPeriodStart={applicationPeriodStart} applicationPeriodEnd={applicationPeriodEnd} items={items} onUpdate={updateTransaction} onCategoryChange={changeCategory} onSelectVisible={selectVisible} />
        <IssuesPanel issues={issues} />
        <StepNavigation onBack={() => setStep(2)} />
      </section>}

      {step === 4 && <section className="grid gap-5">
        <StepHeading step={4} title="마지막으로 확인해 주세요" description="금액과 입력 위치를 확인한 뒤 지출결의서를 다운로드하세요." />
        <IssuesPanel issues={issues} />
        <PreviewPanel preview={preview} busy={busy} onPreview={() => void runPreview()} onExport={() => void handleExport()} />
        <StepNavigation onBack={() => setStep(3)} />
      </section>}
    </main>
    {step === 3 && selectedCount > 0 && <div className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border bg-background px-4 py-3 shadow-xl">
      <strong className="whitespace-nowrap text-sm text-primary">{selectedCount}건 선택됨</strong>
      <Button type="button" size="sm" variant="ghost" onClick={clearSelectedTransactions}>선택 해제</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setBulkEditorOpen(true)}><ListChecks />일괄편집</Button>
      <Button type="button" size="sm" disabled={busy} onClick={() => void handleReview()}>확인으로<ArrowRight /></Button>
    </div>}
    {bulkEditorOpen && <><button type="button" className="fixed inset-0 z-40 cursor-default bg-black/20" aria-label="일괄편집 닫기" onClick={() => setBulkEditorOpen(false)} /><aside className="fixed inset-y-0 right-0 z-50 w-[440px] max-w-[calc(100vw-2rem)] overflow-y-auto border-l bg-background shadow-2xl" role="dialog" aria-modal="true" aria-label="선택 거래 일괄 편집">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-5 py-4"><div><p className="font-semibold">일괄편집</p><p className="text-xs text-muted-foreground">선택한 {selectedCount}건에 적용</p></div><Button type="button" size="icon" variant="ghost" aria-label="닫기" onClick={() => setBulkEditorOpen(false)}><X /></Button></div>
      <BulkEditor layout="panel" selectedCount={selectedCount} onApply={applyBulk} />
    </aside></>}
    <AlertDialog open={Boolean(pendingApplicantChange)} onOpenChange={(open) => { if (!open) setPendingApplicantChange(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pendingApplicantChange?.previous ? '기본 접수자를 변경할까요?' : '접수자를 기억할까요?'}</AlertDialogTitle>
          <AlertDialogDescription>{pendingApplicantChange?.previous
            ? <>저장된 접수자 “{pendingApplicantChange.previous}”와 현재 입력한 “{pendingApplicantChange.next}”이(가) 다릅니다. 현재 이름을 다음 문서에도 사용하시겠습니까?</>
            : <>입력한 접수자 “{pendingApplicantChange?.next}”을 다음 문서에도 자동으로 입력할 수 있습니다.</>}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
          <AlertDialogAction disabled={busy} className="border border-input bg-background text-foreground hover:bg-accent" onClick={useApplicantOnce}>이번 문서에서만 사용</AlertDialogAction>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void rememberChangedApplicant(); }}>{pendingApplicantChange?.previous ? '변경하여 기억' : '기억하기'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

const funnelSteps = ['카드 내역', '문서 정보', '거래 편집', '확인 및 다운로드'];

function FunnelProgress({ step, onStep }: { step: FunnelStep; onStep: (step: FunnelStep) => void }) {
  return <ol className="grid grid-cols-4 gap-2" aria-label="작성 단계">{funnelSteps.map((label, index) => {
    const number = (index + 1) as FunnelStep;
    const active = number === step;
    const completed = number < step;
    return <li key={label}><button type="button" className={`flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${active ? 'bg-primary text-primary-foreground' : completed ? 'bg-primary/10 font-medium text-primary hover:bg-primary/15' : 'bg-muted text-muted-foreground'}`} disabled={number > step} aria-current={active ? 'step' : undefined} onClick={() => onStep(number)}><span className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-white/20' : completed ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>{number}</span><span>{label}</span></button></li>;
  })}</ol>;
}

function StepHeading({ step, title, description }: { step: FunnelStep; title: string; description: string }) {
  return <div><p className="mb-1 text-sm font-semibold text-primary">STEP {step}</p><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p></div>;
}

function StepNavigation({ onBack, onNext, nextLabel, nextDisabled = false }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean }) {
  return <div className="flex items-center justify-between border-t pt-5">{onBack ? <Button type="button" variant="ghost" onClick={onBack}><ArrowLeft />이전</Button> : <span />}{onNext && <Button type="button" disabled={nextDisabled} onClick={onNext}>{nextLabel || '다음'}<ArrowRight /></Button>}</div>;
}
