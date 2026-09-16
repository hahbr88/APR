import { useRef, useState, type DragEvent } from 'react';
import { FileSpreadsheet, LoaderCircle, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ImportResult } from '../../../shared/schemas';

interface Props {
  busy: boolean;
  stats: ImportResult['stats'] | null;
  onUpload: (files: File[]) => Promise<void>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function FileUpload({ busy, stats, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [unsupportedCount, setUnsupportedCount] = useState(0);

  function selectFiles(selected: FileList | File[]) {
    const allFiles = Array.from(selected);
    const accepted = allFiles.filter((file) => /\.xlsx$/i.test(file.name));
    setFiles(accepted);
    setUnsupportedCount(allFiles.length - accepted.length);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    selectFiles(event.dataTransfer.files);
  }

  return <Card className="overflow-hidden border-primary/20 shadow-sm">
    <CardHeader className="text-center">
      <CardTitle>카드 내역 불러오기</CardTitle>
      <CardDescription>삼성·신한·현대카드의 XLSX 이용내역에 최적화되어 있습니다.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-5">
      <div role="button" tabIndex={0} className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? 'border-primary bg-primary/10' : 'border-primary/30 bg-primary/5 hover:border-primary/60 hover:bg-primary/8'}`} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={drop}>
        <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><UploadCloud className="size-8" /></div>
        <p className="text-lg font-semibold">파일을 끌어다 놓으세요</p>
        <p className="mt-2 text-sm text-muted-foreground">또는 이 영역을 눌러 파일을 선택하세요</p>
        <p className="mt-4 text-xs text-muted-foreground">지원 형식: .xlsx · 파일당 최대 20MB</p>
      </div>
      <input ref={inputRef} className="sr-only" type="file" accept=".xlsx" multiple onChange={(event) => selectFiles(event.target.files || [])} />
      {unsupportedCount > 0 && <p className="text-sm text-destructive" role="alert">지원하지 않는 형식의 파일 {unsupportedCount}개를 제외했습니다.</p>}
      {files.length > 0 && <div className="grid gap-2"><div className="flex items-center justify-between"><p className="text-sm font-medium">선택한 파일 {files.length}개</p><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setFiles([]); setUnsupportedCount(0); if (inputRef.current) inputRef.current.value = ''; }}><X />선택 해제</Button></div><div className="grid gap-2 sm:grid-cols-2">
        {files.map((file) => <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex min-w-0 items-center gap-3 rounded-lg border bg-background px-3 py-2"><FileSpreadsheet className="size-4 shrink-0 text-primary" /><span className="truncate text-sm">{file.name}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span></div>)}
      </div></div>}
      <Button className="h-11 w-full sm:mx-auto sm:max-w-72" disabled={busy || !files.length} onClick={() => void onUpload(files)}>{busy ? <LoaderCircle className="animate-spin" /> : <UploadCloud />}{busy ? '카드 내역 분석 중' : '선택한 파일 분석'}</Button>
      {stats && <div className="rounded-xl bg-primary/8 px-4 py-3 text-center text-sm text-primary">{stats.files}개 파일 · {stats.parsed}건 분석 · 취소 {stats.cancelled}건(원거래 연결 {stats.linkedCancellations}건 · 확인 필요 {stats.unmatchedCancellations}건) · 중복 의심 {stats.duplicates}건 · 행 오류 {stats.rowErrors}건</div>}
    </CardContent>
  </Card>;
}
