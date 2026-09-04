import { useRef, useState } from 'react';
import { FileSpreadsheet, LoaderCircle, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ImportResult } from '../../../shared/schemas';

interface Props {
  busy: boolean;
  stats: ImportResult['stats'] | null;
  onUpload: (files: FileList) => Promise<void>;
}

export function FileUpload({ busy, stats, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);

  return (
    <Card className="overflow-hidden border-primary/20 shadow-sm">
      <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet /></div>
          <div><h2 className="font-semibold">1. 카드 내역 불러오기</h2><p className="mt-1 text-sm text-muted-foreground">삼성·신한 XLSX와 현대카드 HTML XLS를 한 번에 선택할 수 있습니다.</p></div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="max-w-md" onChange={(event) => setNames(Array.from(event.target.files || []).map((file) => file.name))} />
          <Button disabled={busy || !names.length} onClick={() => inputRef.current?.files && void onUpload(inputRef.current.files)}>
            {busy ? <LoaderCircle className="animate-spin" /> : <UploadCloud />} {busy ? '분석 중' : '파일 분석'}
          </Button>
        </div>
        {stats && <div className="basis-full rounded-lg bg-primary/8 px-4 py-3 text-sm text-primary lg:order-3">{stats.files}개 파일 · {stats.parsed}건 분석 · 취소 {stats.cancelled}건 · 중복 의심 {stats.duplicates}건 · 행 오류 {stats.rowErrors}건</div>}
      </CardContent>
    </Card>
  );
}
