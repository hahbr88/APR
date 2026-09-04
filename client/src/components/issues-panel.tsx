import { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface DisplayIssue { type: 'error' | 'warning'; message: string }

export function IssuesPanel({ issues }: { issues: DisplayIssue[] }) {
  const [open, setOpen] = useState(false);
  const errorCount = issues.filter((issue) => issue.type === 'error').length;
  const warningCount = issues.length - errorCount;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-0">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 p-6 text-left hover:bg-muted/40"
          aria-expanded={open}
          aria-controls="issues-list"
          onClick={() => setOpen((value) => !value)}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>오류 및 경고</CardTitle>
              {errorCount > 0 && <Badge variant="destructive">오류 {errorCount}건</Badge>}
              {warningCount > 0 && <Badge className="border-amber-300 bg-amber-100 text-amber-900">경고 {warningCount}건</Badge>}
              {!issues.length && <Badge variant="secondary">문제 없음</Badge>}
            </div>
            <CardDescription className="mt-1.5">확인이 필요한 항목을 보려면 펼쳐주세요.</CardDescription>
          </div>
          <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </CardHeader>
      {open && (
        <CardContent id="issues-list" className="border-t p-4 sm:p-6">
          <div className="grid max-h-96 gap-2 overflow-y-auto overscroll-contain pr-2">
            {!issues.length && <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-4 py-5 text-sm text-primary"><CheckCircle2 className="size-5" />표시할 오류가 없습니다.</div>}
            {issues.map((issue, index) => (
              <Alert key={`${issue.message}-${index}`} variant={issue.type === 'error' ? 'destructive' : 'default'} className={issue.type === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-950' : ''}>
                {issue.type === 'error' ? <AlertCircle /> : <TriangleAlert />}
                <AlertTitle>{issue.type === 'error' ? '오류' : '확인 필요'}</AlertTitle><AlertDescription>{issue.message}</AlertDescription>
              </Alert>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
