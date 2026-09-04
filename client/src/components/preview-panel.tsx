import { Download, Eye, FileOutput, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { PreviewResult } from '../../../shared/schemas';

const money = new Intl.NumberFormat('ko-KR');

export function PreviewPanel({ preview, busy, onPreview, onExport }: {
  preview: PreviewResult | null; busy: boolean; onPreview: () => void; onExport: () => void;
}) {
  const summary = preview?.summary;
  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><CardTitle>4. 요약 및 내보내기</CardTitle><CardDescription>금액과 실제 템플릿 입력 위치를 확인한 후 다운로드합니다.</CardDescription></div>
        <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={onPreview}><Eye />미리보기</Button><Button disabled={busy || !summary?.selectedCount || Boolean(preview?.errors.length)} onClick={onExport}>{busy ? <LoaderCircle className="animate-spin" /> : <Download />}다운로드</Button></div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="선택 건수" value={`${summary?.selectedCount || 0}건`} />
          <Metric label="실사용 총액" value={`${money.format(summary?.actualTotal || 0)}원`} />
          <Metric label="청구 총액" value={`${money.format(summary?.claimTotal || 0)}원`} />
          <Metric label="제외 금액" value={`${money.format(summary?.excludedAmount || 0)}원`} />
        </div>
        {!preview?.mappings.length ? <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-sm text-muted-foreground"><FileOutput />미리보기를 실행하면 템플릿 입력 행이 표시됩니다.</div> : (
          <div className="grid gap-3"><p className="text-sm font-medium">지출결의서 추가 행 {summary?.insertedResolutionRows}개 · 경비사용내역서 추가 행 {summary?.insertedExpenseRows}개</p>
            <div className="max-h-80 overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>가맹점</TableHead><TableHead>비용 분류</TableHead><TableHead>지출결의서</TableHead><TableHead>경비사용내역서</TableHead></TableRow></TableHeader><TableBody>
              {preview.mappings.map((item) => <TableRow key={item.id}><TableCell>{item.merchant}</TableCell><TableCell>{item.category}</TableCell><TableCell>{item.resolutionRow}행</TableCell><TableCell>{item.expenseRow}행</TableCell></TableRow>)}
            </TableBody></Table></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted p-5"><span className="text-xs font-medium text-muted-foreground">{label}</span><strong className="numeric mt-2 block text-2xl">{value}</strong></div>;
}
