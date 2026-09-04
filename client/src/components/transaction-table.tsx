import { useEffect, useMemo, useRef, useState } from 'react';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { BusinessType, Region, Transaction } from '../../../shared/schemas';

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, Transaction>();
const money = new Intl.NumberFormat('ko-KR');
const categories = ['아침식대', '점심식대', '저녁식대', '식대', '식대/소모품비', '숙박비', '교통비', '차량유지비', '소모품비', '복리후생비', '기타'];
const pageSize = 25;

interface Props {
  items: Transaction[];
  onUpdate: (id: string, patch: Partial<Transaction>) => void;
  onCategoryChange: (item: Transaction, category: string) => void;
  onSelectVisible: (ids: string[], selected: boolean) => void;
}

export function TransactionTable({ items, onUpdate, onCategoryChange, onSelectVisible }: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'normal' | 'issue' | 'selected'>('all');
  const [cardCompany, setCardCompany] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [page, setPage] = useState(0);
  const cardCompanies = useMemo(() => [...new Set(items.map((item) => item.cardCompany))].sort((left, right) => left.localeCompare(right, 'ko-KR')), [items]);
  const filtered = useMemo(() => [...items].sort((left, right) => String(right.transactionAt || '').localeCompare(String(left.transactionAt || ''))).filter((item) => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    const searchableText = [
      item.merchant, item.cardCompany, item.cardNumber, item.approvalNumber, item.category,
      item.customer, item.businessType, item.reason,
    ].join(' ').toLocaleLowerCase('ko-KR');
    const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);
    const transactionDate = item.transactionAt?.slice(0, 10) || '';
    const matchesDate = (!dateStart || transactionDate >= dateStart) && (!dateEnd || transactionDate <= dateEnd);
    const matchesCardCompany = !cardCompany || item.cardCompany === cardCompany;
    const matchesStatus = status === 'all' || (status === 'normal' && !item.cancelled && !item.duplicate && !item.parseErrors.length)
      || (status === 'issue' && (item.cancelled || item.duplicate || item.parseErrors.length > 0)) || (status === 'selected' && item.selected);
    return matchesQuery && matchesDate && matchesCardCompany && matchesStatus;
  }), [cardCompany, dateEnd, dateStart, items, query, status]);
  useEffect(() => setPage(0), [cardCompany, dateEnd, dateStart, query, status]);
  useEffect(() => {
    if (cardCompany && !cardCompanies.includes(cardCompany)) setCardCompany('');
  }, [cardCompanies, cardCompany]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const selectableVisible = filtered.filter((item) => !item.cancelled && !item.parseErrors.length);
  const selectableVisibleIdsRef = useRef<string[]>([]);
  const allVisibleSelectedRef = useRef(false);
  selectableVisibleIdsRef.current = selectableVisible.map((item) => item.id);
  allVisibleSelectedRef.current = Boolean(selectableVisible.length) && selectableVisible.every((item) => item.selected);
  const hasFilters = Boolean(query || cardCompany || dateStart || dateEnd || status !== 'all');

  function resetFilters() {
    setQuery('');
    setCardCompany('');
    setDateStart('');
    setDateEnd('');
    setStatus('all');
  }

  const columns = useMemo(() => columnHelper.columns([
    columnHelper.display({ id: 'select', header: () => <Checkbox aria-label="조회 결과 전체 선택" checked={allVisibleSelectedRef.current} onCheckedChange={(checked) => onSelectVisible(selectableVisibleIdsRef.current, checked === true)} />, cell: ({ row }) => <Checkbox aria-label={`${row.original.merchant} 선택`} disabled={row.original.cancelled || Boolean(row.original.parseErrors.length)} checked={row.original.selected} onCheckedChange={(checked) => onUpdate(row.original.id, { selected: checked === true })} /> }),
    columnHelper.display({ id: 'status', header: '상태', cell: ({ row }) => <StatusBadge item={row.original} /> }),
    columnHelper.accessor('transactionAt', { header: '거래일시', cell: ({ getValue }) => (getValue() || '-').replace('T', ' ') }),
    columnHelper.accessor('cardCompany', { header: '카드사' }),
    columnHelper.accessor('merchant', { header: '가맹점', cell: ({ row, getValue }) => <div className="max-w-52 truncate" title={`${row.original.sourceFile} ${row.original.sourceRow}행`}>{getValue()}</div> }),
    columnHelper.accessor('actualAmount', { header: '실사용금액', cell: ({ getValue }) => <span className="numeric block text-right">{getValue() === null ? '-' : `${money.format(getValue()!)}원`}</span> }),
    columnHelper.display({ id: 'category', header: '비용 분류', cell: ({ row }) => <NativeSelect value={row.original.category} options={categories} onChange={(value) => onCategoryChange(row.original, value)} /> }),
    columnHelper.display({ id: 'customer', header: '고객사', cell: ({ row }) => <CellInput value={row.original.customer} onChange={(customer) => onUpdate(row.original.id, { customer })} /> }),
    columnHelper.display({ id: 'businessType', header: '업무', cell: ({ row }) => <NativeSelect value={row.original.businessType} options={['프로젝트', '유지보수', '링스테크내부', '기타']} onChange={(businessType) => onUpdate(row.original.id, { businessType: businessType as BusinessType })} /> }),
    columnHelper.display({ id: 'region', header: '지역', cell: ({ row }) => <NativeSelect value={row.original.region} options={['서울', '지방']} onChange={(region) => onUpdate(row.original.id, { region: region as Region })} /> }),
    columnHelper.display({ id: 'reason', header: '지출 사유', cell: ({ row }) => <CellInput className="min-w-44" value={row.original.reason} onChange={(reason) => onUpdate(row.original.id, { reason })} /> }),
    columnHelper.display({ id: 'claimAmount', header: '청구금액', cell: ({ row }) => <input className="table-input w-28 text-right numeric" type="number" min={0} value={row.original.claimAmount ?? ''} onChange={(event) => onUpdate(row.original.id, { claimAmount: Number(event.target.value || 0) })} /> }),
    columnHelper.display({ id: 'tripPeriod', header: '출장 기간', cell: ({ row }) => <CellInput value={row.original.tripPeriod} onChange={(tripPeriod) => onUpdate(row.original.id, { tripPeriod })} /> }),
  ]), [onCategoryChange, onSelectVisible, onUpdate]);
  const table = useTable({ features, columns, data: pageData });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4">
        <div><CardTitle>3. 거래 선택 및 확인</CardTitle><CardDescription>자동 추천값을 확인하고 필요한 거래만 선택하세요. 분류 수정값은 다음 업로드부터 기억합니다.</CardDescription></div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative grow sm:max-w-80"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={query} placeholder="가맹점·승인번호·고객사·사유 검색" onChange={(event) => setQuery(event.target.value)} /></div>
          <label className="grid gap-1 text-xs text-muted-foreground"><span>시작일</span><Input className="w-40" type="date" value={dateStart} max={dateEnd || undefined} onChange={(event) => setDateStart(event.target.value)} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground"><span>종료일</span><Input className="w-40" type="date" value={dateEnd} min={dateStart || undefined} onChange={(event) => setDateEnd(event.target.value)} /></label>
          <select aria-label="카드사 필터" className="h-9 rounded-md border bg-background px-3 text-sm" value={cardCompany} onChange={(event) => setCardCompany(event.target.value)}><option value="">전체 카드</option>{cardCompanies.map((company) => <option key={company} value={company}>{company}</option>)}</select>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">전체 거래</option><option value="normal">정상 거래</option><option value="issue">오류·경고</option><option value="selected">선택 거래</option></select>
          <Button type="button" variant="outline" disabled={!hasFilters} onClick={resetFilters}><RotateCcw />필터 초기화</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-y"><Table className="min-w-[1580px]" containerClassName="max-h-[70vh]"><TableHeader className="sticky top-0 z-20 bg-background shadow-sm">{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id} className="bg-background">{header.isPlaceholder ? null : <table.FlexRender header={header} />}</TableHead>)}</TableRow>)}</TableHeader>
          <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <TableRow key={row.id} data-state={row.original.selected ? 'selected' : undefined}>{row.getAllCells().map((cell) => <TableCell key={cell.id}><table.FlexRender cell={cell} /></TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={13} className="h-32 text-center text-muted-foreground">조건에 맞는 거래가 없습니다.</TableCell></TableRow>}</TableBody>
        </Table></div>
        <div className="flex items-center justify-between px-6 py-4 text-sm text-muted-foreground"><span>조회 {filtered.length}건 / 전체 {items.length}건 · 선택 {items.filter((item) => item.selected).length}건</span><div className="flex items-center gap-2"><span>{page + 1} / {pageCount}</span><Button size="icon" variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></Button><Button size="icon" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button></div></div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ item }: { item: Transaction }) {
  if (item.parseErrors.length) return <Badge variant="destructive">파싱 오류</Badge>;
  if (item.cancelled) return <Badge variant="destructive">취소</Badge>;
  if (item.duplicate) return <Badge className="border-amber-300 bg-amber-100 text-amber-900">중복 의심</Badge>;
  return <Badge variant="secondary">{item.status || '정상'}</Badge>;
}
function CellInput({ value, onChange, className = '' }: { value: string; onChange: (value: string) => void; className?: string }) { return <input className={`table-input ${className}`} value={value} onChange={(event) => onChange(event.target.value)} />; }
function NativeSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) { return <select className="table-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>; }
