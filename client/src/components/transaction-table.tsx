import { useEffect, useMemo, useRef, useState } from 'react';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dateRangeFromTripPeriod, tripPeriodFromDateRange } from '@/lib/dates';
import { expenseCategories, type BusinessType, type Region, type Transaction } from '../../../shared/schemas';

const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, Transaction>();
const money = new Intl.NumberFormat('ko-KR');
const pageSize = 25;

function isWeekend(transactionAt: string | null) {
  if (!transactionAt) return false;
  const day = new Date(`${transactionAt.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function displayCardCompany(cardCompany: string) {
  return cardCompany.replace(/\s*카드$/, '');
}

const stickyColumnClasses: Record<string, string> = {
  select: 'sticky left-0 w-10 min-w-10 max-w-10',
  status: 'sticky left-10 w-20 min-w-20 max-w-20',
  transactionAt: 'sticky left-[7.5rem] w-28 min-w-28 max-w-28',
  cardCompany: 'sticky left-[14.5rem] w-14 min-w-14 max-w-14',
  merchant: 'sticky left-[18rem] w-52 min-w-52 max-w-52 border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.18)]',
};

function stickyColumnClass(columnId: string, header = false) {
  const position = stickyColumnClasses[columnId];
  if (!position) return header ? 'bg-background' : '';
  return `${position} ${header ? 'z-30 bg-background' : 'z-10 bg-background group-hover:bg-muted/50 group-data-[state=selected]:bg-muted'}`;
}

interface Props {
  applicationPeriodStart: string;
  applicationPeriodEnd: string;
  items: Transaction[];
  onUpdate: (id: string, patch: Partial<Transaction>) => void;
  onCategoryChange: (item: Transaction, category: string) => void;
  onSelectVisible: (ids: string[], selected: boolean) => void;
}

export function TransactionTable({ applicationPeriodStart, applicationPeriodEnd, items, onUpdate, onCategoryChange, onSelectVisible }: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'normal' | 'cancelled' | 'issue' | 'selected'>('all');
  const [cardCompany, setCardCompany] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [useApplicationPeriod, setUseApplicationPeriod] = useState(false);
  const [excludeWeekends, setExcludeWeekends] = useState(false);
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
    const matchesWeekend = !excludeWeekends || !isWeekend(item.transactionAt);
    const matchesStatus = status === 'all' || (status === 'normal' && !item.cancelled && !item.cancelledBy && !item.duplicate && !item.parseErrors.length && item.status !== '상태 미상')
      || (status === 'cancelled' && (item.cancelled || Boolean(item.cancelledBy)))
      || (status === 'issue' && (item.duplicate || item.parseErrors.length > 0 || item.status === '상태 미상' || item.cancellationMatch === 'ambiguous' || item.cancellationMatch === 'unmatched')) || (status === 'selected' && item.selected);
    return matchesQuery && matchesDate && matchesCardCompany && matchesWeekend && matchesStatus;
  }), [cardCompany, dateEnd, dateStart, excludeWeekends, items, query, status]);
  useEffect(() => setPage(0), [cardCompany, dateEnd, dateStart, excludeWeekends, query, status]);
  useEffect(() => {
    if (!useApplicationPeriod) return;
    setDateStart(applicationPeriodStart);
    setDateEnd(applicationPeriodEnd);
  }, [applicationPeriodEnd, applicationPeriodStart, useApplicationPeriod]);
  useEffect(() => {
    if (cardCompany && !cardCompanies.includes(cardCompany)) setCardCompany('');
  }, [cardCompanies, cardCompany]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const selectableVisible = filtered.filter((item) => !item.cancelled && !item.cancelledBy && !item.parseErrors.length);
  const selectableVisibleIdsRef = useRef<string[]>([]);
  const allVisibleSelectedRef = useRef(false);
  selectableVisibleIdsRef.current = selectableVisible.map((item) => item.id);
  allVisibleSelectedRef.current = Boolean(selectableVisible.length) && selectableVisible.every((item) => item.selected);
  const hasFilters = Boolean(query || cardCompany || dateStart || dateEnd || useApplicationPeriod || excludeWeekends || status !== 'all');

  function resetFilters() {
    setQuery('');
    setCardCompany('');
    setDateStart('');
    setDateEnd('');
    setUseApplicationPeriod(false);
    setExcludeWeekends(false);
    setStatus('all');
  }

  function toggleApplicationPeriod(checked: boolean) {
    setUseApplicationPeriod(checked);
    if (!checked) return;
    setDateStart(applicationPeriodStart);
    setDateEnd(applicationPeriodEnd);
  }

  const columns = useMemo(() => columnHelper.columns([
    columnHelper.display({ id: 'select', header: () => <Checkbox aria-label="조회 결과 전체 선택" checked={allVisibleSelectedRef.current} onCheckedChange={(checked) => onSelectVisible(selectableVisibleIdsRef.current, checked === true)} />, cell: ({ row }) => <Checkbox aria-label={`${row.original.merchant} 선택`} disabled={row.original.cancelled || Boolean(row.original.cancelledBy) || Boolean(row.original.parseErrors.length)} checked={row.original.selected} onCheckedChange={(checked) => onUpdate(row.original.id, { selected: checked === true })} /> }),
    columnHelper.display({ id: 'status', header: () => <span className="whitespace-nowrap">상태</span>, cell: ({ row }) => <div className="min-w-16 whitespace-nowrap"><StatusBadge item={row.original} /></div> }),
    columnHelper.accessor('transactionAt', { header: '거래일시', cell: ({ getValue }) => {
      const [date = '-', time = ''] = (getValue() || '').split('T');
      return <span className="numeric whitespace-nowrap">{date}{time && <><br />{time.slice(0, 5)}</>}</span>;
    } }),
    columnHelper.accessor('cardCompany', { header: () => <span className="whitespace-nowrap">카드사</span>, cell: ({ getValue }) => <span className="whitespace-nowrap" title={getValue()}>{displayCardCompany(getValue())}</span> }),
    columnHelper.accessor('merchant', { header: '가맹점', cell: ({ row, getValue }) => <div className="max-w-52 truncate" title={`${row.original.sourceFile} ${row.original.sourceRow}행`}>{getValue()}</div> }),
    columnHelper.accessor('actualAmount', { header: '실사용금액', cell: ({ getValue }) => <span className="numeric block text-right">{getValue() === null ? '-' : `${money.format(getValue()!)}원`}</span> }),
    columnHelper.display({ id: 'category', header: '실사용 내역 구분', cell: ({ row }) => <NativeSelect value={row.original.category} options={[...expenseCategories]} onChange={(value) => onCategoryChange(row.original, value)} /> }),
    columnHelper.display({ id: 'customer', header: '고객사', cell: ({ row }) => <CellInput compact value={row.original.customer} onChange={(customer) => onUpdate(row.original.id, { customer })} /> }),
    columnHelper.display({ id: 'businessType', header: '업무', cell: ({ row }) => <NativeSelect value={row.original.businessType} options={['프로젝트', '유지보수', '링스테크내부', '기타']} onChange={(businessType) => onUpdate(row.original.id, { businessType: businessType as BusinessType })} /> }),
    columnHelper.display({ id: 'region', header: '지역', cell: ({ row }) => <NativeSelect value={row.original.region} options={['서울', '지방']} onChange={(region) => onUpdate(row.original.id, { region: region as Region, ...(region === '서울' ? { tripPeriod: '' } : {}) })} /> }),
    columnHelper.display({ id: 'reason', header: '구분(상세 사유)', cell: ({ row }) => <CellInput className="min-w-44" value={row.original.reason} onChange={(reason) => onUpdate(row.original.id, { reason })} /> }),
    columnHelper.display({ id: 'claimAmount', header: '청구금액', cell: ({ row }) => <input className="table-input w-28 text-right numeric" type="number" min={0} value={row.original.claimAmount ?? ''} onChange={(event) => onUpdate(row.original.id, { claimAmount: Number(event.target.value || 0) })} /> }),
    columnHelper.display({ id: 'tripPeriod', header: '출장 기간', cell: ({ row }) => <TripPeriodInput merchant={row.original.merchant} disabled={row.original.region === '서울'} value={row.original.tripPeriod} onChange={(tripPeriod) => onUpdate(row.original.id, { tripPeriod })} /> }),
  ]), [onCategoryChange, onSelectVisible, onUpdate]);
  const table = useTable({ features, columns, data: pageData });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4">
        <div><CardTitle>거래 선택 및 확인</CardTitle><CardDescription>자동 추천값을 확인하고 필요한 거래만 선택하세요. 실사용 내역 구분 수정값은 다음 업로드부터 기억합니다.</CardDescription></div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative grow sm:max-w-80"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={query} placeholder="가맹점·승인번호·고객사·사유 검색" onChange={(event) => setQuery(event.target.value)} /></div>
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm"><Checkbox aria-label="신청기간과 동일 기간" checked={useApplicationPeriod} onCheckedChange={(checked) => toggleApplicationPeriod(checked === true)} /><span>신청기간과 동일 기간</span></label>
          <label className="grid gap-1 text-xs text-muted-foreground"><span>시작일</span><Input className="w-40" type="date" disabled={useApplicationPeriod} value={dateStart} max={dateEnd || undefined} onChange={(event) => setDateStart(event.target.value)} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground"><span>종료일</span><Input className="w-40" type="date" disabled={useApplicationPeriod} value={dateEnd} min={dateStart || undefined} onChange={(event) => setDateEnd(event.target.value)} /></label>
          <select aria-label="카드사 필터" className="h-9 rounded-md border bg-background px-3 text-sm" value={cardCompany} onChange={(event) => setCardCompany(event.target.value)}><option value="">전체 카드사</option>{cardCompanies.map((company) => <option key={company} value={company}>{displayCardCompany(company)}</option>)}</select>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">전체 거래</option><option value="normal">결제</option><option value="cancelled">취소</option><option value="issue">확인 필요</option><option value="selected">선택 거래</option></select>
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm"><Checkbox aria-label="주말 제외" checked={excludeWeekends} onCheckedChange={(checked) => setExcludeWeekends(checked === true)} /><span>주말 제외</span></label>
          <Button type="button" variant="outline" disabled={!hasFilters} onClick={resetFilters}><RotateCcw />필터 초기화</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-y"><Table className="min-w-[1580px]" containerClassName="max-h-[70vh]"><TableHeader className="sticky top-0 z-20 bg-background shadow-sm">{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id} className={stickyColumnClass(header.column.id, true)}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</TableHead>)}</TableRow>)}</TableHeader>
          <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <TableRow key={row.id} className="group" data-state={row.original.selected ? 'selected' : undefined}>{row.getAllCells().map((cell) => <TableCell key={cell.id} className={stickyColumnClass(cell.column.id)}><table.FlexRender cell={cell} /></TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={13} className="h-32 text-center text-muted-foreground">조건에 맞는 거래가 없습니다.</TableCell></TableRow>}</TableBody>
        </Table></div>
        <div className="flex items-center justify-between px-6 py-4 text-sm text-muted-foreground"><span>조회 {filtered.length}건 / 전체 {items.length}건 · 선택 {items.filter((item) => item.selected).length}건</span><div className="flex items-center gap-2"><span>{page + 1} / {pageCount}</span><Button size="icon" variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></Button><Button size="icon" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button></div></div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ item }: { item: Transaction }) {
  if (item.parseErrors.length) return <Badge variant="destructive">파싱 오류</Badge>;
  if (item.cancelled && !item.cancellationOf) return <Badge className="border-amber-300 bg-amber-100 text-amber-900" title="취소 거래의 원승인을 자동으로 찾지 못했습니다.">취소 확인</Badge>;
  if (item.cancelled) return <Badge variant="destructive" title="원승인 거래와 연결된 취소 거래입니다.">취소</Badge>;
  if (item.cancelledBy) return <Badge variant="destructive" title="연결된 취소 거래가 있는 원승인입니다.">취소됨</Badge>;
  if (item.duplicate) return <Badge className="border-amber-300 bg-amber-100 text-amber-900">중복 의심</Badge>;
  if (item.status === '상태 미상') return <Badge className="border-amber-300 bg-amber-100 text-amber-900">확인 필요</Badge>;
  return <Badge variant="secondary" title={`원본 상태: ${item.status || '-'}`}>결제</Badge>;
}
function TripPeriodInput({ merchant, disabled, value, onChange }: { merchant: string; disabled: boolean; value: string; onChange: (value: string) => void }) {
  const initialRange = dateRangeFromTripPeriod(value);
  const [startDate, setStartDate] = useState(initialRange?.startDate || '');
  const [endDate, setEndDate] = useState(initialRange?.endDate || '');
  const emittedValue = useRef<string | null>(null);

  useEffect(() => {
    if (disabled) {
      emittedValue.current = null;
      setStartDate('');
      setEndDate('');
      return;
    }
    if (emittedValue.current === value) {
      emittedValue.current = null;
      return;
    }
    emittedValue.current = null;
    const range = dateRangeFromTripPeriod(value);
    setStartDate(range?.startDate || '');
    setEndDate(range?.endDate || '');
  }, [disabled, value]);

  function update(nextStartDate: string, nextEndDate: string) {
    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    const tripPeriod = tripPeriodFromDateRange(nextStartDate, nextEndDate);
    if (tripPeriod !== null) {
      emittedValue.current = tripPeriod;
      onChange(tripPeriod);
    } else if (!nextStartDate || !nextEndDate) {
      emittedValue.current = '';
      onChange('');
    }
  }

  return <div className="flex min-w-72 items-center gap-1">
    <input aria-label={`${merchant} 출장 시작일`} className="table-input min-w-32" type="date" disabled={disabled} value={startDate} max={endDate || undefined} onChange={(event) => update(event.target.value, endDate)} />
    <span className="text-muted-foreground">~</span>
    <input aria-label={`${merchant} 출장 종료일`} className="table-input min-w-32" type="date" disabled={disabled} value={endDate} min={startDate || undefined} onChange={(event) => update(startDate, event.target.value)} />
  </div>;
}
function CellInput({ value, onChange, className = '', compact = false }: { value: string; onChange: (value: string) => void; className?: string; compact?: boolean }) { return <input className={`table-input ${className}`} style={compact ? { minWidth: '6rem', width: '6rem' } : undefined} value={value} onChange={(event) => onChange(event.target.value)} />; }
function NativeSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) { return <select className="table-input" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>; }
