import { FilePenLine, FolderOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Draft } from '../../../shared/schemas';

export function DraftPicker({ drafts, busy, onLoad, onDelete }: {
  drafts: Draft[];
  busy: boolean;
  onLoad: (draft: Draft) => void;
  onDelete: (draft: Draft) => void;
}) {
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><FilePenLine className="size-5 text-primary" />저장한 초안 이어하기</CardTitle>
      <CardDescription>카드 파일을 다시 올리지 않고 이전 작업을 계속할 수 있습니다.</CardDescription>
    </CardHeader>
    <CardContent>
      {!drafts.length ? <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">저장한 초안이 없습니다.</div> : <div className="grid gap-2">
        {drafts.map((draft) => <div key={draft.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="truncate font-medium">{draft.name}</p><p className="mt-1 text-xs text-muted-foreground">거래 {draft.items.length}건 · {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString('ko-KR') : '저장 시각 없음'}</p></div>
          <div className="flex shrink-0 gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onLoad(draft)}><FolderOpen />이어서 작성</Button><Button type="button" size="icon" variant="outline" disabled={busy} aria-label={`${draft.name} 삭제`} onClick={() => onDelete(draft)}><Trash2 /></Button></div>
        </div>)}
      </div>}
    </CardContent>
  </Card>;
}
