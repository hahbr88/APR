import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Sparkles, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { expenseCategories, type AiSuggestion, type Transaction } from '../../../shared/schemas';

export function AiSuggestionPanel({ items, suggestions, partial = false, onClose, onApply, onUpdateSuggestion, onDeleteSuggestions }: {
  items: Transaction[];
  suggestions: AiSuggestion[];
  partial?: boolean;
  onClose: () => void;
  onApply: (suggestions: AiSuggestion[]) => void;
  onUpdateSuggestion: (suggestion: AiSuggestion) => void;
  onDeleteSuggestions: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(suggestions.filter((item) => !item.needsReview).map((item) => item.id)));
  const [editedSuggestions, setEditedSuggestions] = useState(() => suggestions.map((item) => ({ ...item })));
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => {
    setEditedSuggestions(suggestions.map((item) => ({ ...item })));
    setSelectedIds(new Set(suggestions.filter((item) => !item.needsReview).map((item) => item.id)));
    setEditingId(null);
  }, [suggestions]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selected = editedSuggestions.filter((item) => selectedIds.has(item.id));
  const reviewCount = editedSuggestions.filter((item) => item.needsReview).length;

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  }

  function updateSuggestion(id: string, patch: Partial<AiSuggestion>) {
    setEditedSuggestions((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function finishEdit(id: string) {
    const edited = editedSuggestions.find((item) => item.id === id);
    if (edited) {
      const reviewed = { ...edited, needsReview: false };
      updateSuggestion(id, reviewed);
      setSelectedIds((current) => new Set(current).add(id));
      onUpdateSuggestion(reviewed);
    }
    setEditingId(null);
  }

  function cancelEdit(id: string) {
    const original = suggestions.find((item) => item.id === id);
    if (original) updateSuggestion(id, original);
    setEditingId(null);
  }

  return <><button type="button" className="fixed inset-0 z-40 cursor-default bg-black/20" aria-label="AI 추천 닫기" onClick={onClose} />
    <aside className="fixed inset-y-0 right-0 z-50 w-[680px] overflow-y-auto border-l bg-background shadow-2xl" role="dialog" aria-modal="true" aria-label="AI 자동완성 결과">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-4"><div><p className="flex items-center gap-2 font-semibold"><Sparkles className="text-primary" />AI 자동완성 결과</p><p className="text-xs text-muted-foreground">{partial ? '완료된 추천입니다. 닫고 다시 실행하면 미완료 거래부터 이어집니다.' : reviewCount ? `상세 사유 확인이 필요한 거래가 ${reviewCount}건 있습니다.` : '추천 내용을 확인하고 적용할 거래만 선택하세요.'}</p></div><Button type="button" size="icon" variant="ghost" aria-label="닫기" onClick={onClose}><X /></Button></div>
      <div className="divide-y">{editedSuggestions.map((suggestion) => { const item = itemsById.get(suggestion.id); if (!item) return null; const editing = editingId === suggestion.id; return <div key={suggestion.id} className="flex gap-3 px-6 py-4 hover:bg-muted/40"><Checkbox className="mt-1" checked={selectedIds.has(suggestion.id)} aria-label={`${item.merchant} 추천 적용`} onCheckedChange={(checked) => toggle(suggestion.id, checked === true)} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{item.merchant}</strong><div className="flex items-center gap-1"><Evidence item={item} suggestion={suggestion} />{editing ? <><Button type="button" size="icon" variant="ghost" className="size-8" aria-label="수정 완료" disabled={!suggestion.reason.trim()} onClick={() => finishEdit(suggestion.id)}><Check /></Button><Button type="button" size="icon" variant="ghost" className="size-8" aria-label="수정 취소" onClick={() => cancelEdit(suggestion.id)}><X /></Button></> : <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="추천 수정" onClick={() => setEditingId(suggestion.id)}><Pencil /></Button>}</div></div><TransactionContext item={item} />{editing ? <div className="mt-3 grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2 text-sm"><span className="text-muted-foreground">실사용 내역 구분</span><select className="h-9 rounded-md border bg-background px-3 text-sm" value={suggestion.category} onChange={(event) => updateSuggestion(suggestion.id, { category: event.target.value as AiSuggestion['category'] })}>{expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select><span className="text-muted-foreground">구분(상세 사유)</span><input className="h-9 rounded-md border bg-background px-3 text-sm" value={suggestion.reason} maxLength={100} onChange={(event) => updateSuggestion(suggestion.id, { reason: event.target.value })} /></div> : <div className="mt-3 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm"><span className="text-muted-foreground">실사용 내역 구분</span><span>{item.category} → <strong className="text-primary">{suggestion.category}</strong></span><span className="text-muted-foreground">구분(상세 사유)</span><span>{item.reason} → <strong className="text-primary">{suggestion.reason}</strong></span></div>}</div></div>; })}</div>
      <div className="sticky bottom-0 flex items-center justify-between border-t bg-background px-6 py-4"><div><span className="text-sm text-muted-foreground">{selected.length} / {suggestions.length}건 적용</span><Button type="button" size="sm" variant="ghost" className="ml-2 text-destructive" onClick={onDeleteSuggestions}>AI 결과 삭제</Button></div><div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>취소</Button><Button type="button" disabled={!selected.length || Boolean(editingId)} onClick={() => onApply(selected)}><Sparkles />선택 추천 적용</Button></div></div>
    </aside></>;
}

function TransactionContext({ item }: { item: Transaction }) {
  const dateTime = item.transactionAt ? item.transactionAt.replace('T', ' ').slice(0, 16) : '거래일시 없음';
  const amount = item.amount === null ? '금액 없음' : `${item.amount.toLocaleString('ko-KR')}원`;
  const cardCompany = item.cardCompany.replace(/카드$/u, '');
  const workContext = [item.customer, item.businessType, item.region].filter(Boolean).join(' · ');
  return <span className="mt-2 block rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{dateTime}</span><span className="mx-2">·</span><strong className="text-foreground">{amount}</strong><span className="mx-2">·</span>{cardCompany}{workContext && <><br /><span className="mt-1 inline-block">{workContext}</span></>}</span>;
}

function Evidence({ item, suggestion }: { item: Transaction; suggestion: AiSuggestion }) {
  if (suggestion.needsReview) return <Badge variant="outline" className="border-amber-500 text-amber-700">상세 사유 확인 필요</Badge>;
  if (item.categorySource === 'remembered' && item.category === suggestion.category) return <Badge variant="secondary">기억한 가맹점 기준</Badge>;
  if (mealCategoryFromTime(item.transactionAt) === suggestion.category) return <Badge variant="secondary">결제 시간 기준</Badge>;
  if (item.category === suggestion.category) return <Badge variant="outline">기존 구분과 일치</Badge>;
  return <Badge variant="outline">AI 추정 · 확인 필요</Badge>;
}

function mealCategoryFromTime(transactionAt: string | null): string | null {
  if (!transactionAt) return null;
  const hour = Number(transactionAt.slice(11, 13));
  const minute = Number(transactionAt.slice(14, 16));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const minutes = hour * 60 + minute;
  if (minutes >= 5 * 60 && minutes < 10 * 60 + 30) return '아침식대';
  if (minutes >= 10 * 60 + 30 && minutes < 15 * 60 + 30) return '점심식대';
  if (minutes >= 17 * 60 && minutes < 24 * 60) return '저녁식대';
  return null;
}
