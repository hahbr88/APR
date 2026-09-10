import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { tripPeriodFromDateRange } from '@/lib/dates';
import type { BusinessType, Region } from '../../../shared/schemas';

export interface BulkValues { customer: string; businessType: BusinessType; region: Region; tripPeriod: string }
interface BulkFormValues { customer: string; businessType: BusinessType; region: Region; tripStart: string; tripEnd: string }

export function BulkEditor({ onApply, layout = 'card', selectedCount }: { onApply: (values: BulkValues) => void; layout?: 'card' | 'panel'; selectedCount?: number }) {
  const [values, setValues] = useState<BulkFormValues>({ customer: '', businessType: '프로젝트', region: '서울', tripStart: '', tripEnd: '' });
  const tripPeriod = values.region === '지방' ? tripPeriodFromDateRange(values.tripStart, values.tripEnd) : '';
  const dateError = values.region === '지방' && tripPeriod === null
    ? (!values.tripStart || !values.tripEnd ? '출장 시작일과 종료일을 모두 선택해 주세요.' : '출장 시작일은 종료일보다 늦을 수 없습니다.')
    : '';

  function changeRegion(region: Region) {
    setValues((current) => ({ ...current, region, tripStart: region === '서울' ? '' : current.tripStart, tripEnd: region === '서울' ? '' : current.tripEnd }));
  }

  function apply() {
    if (tripPeriod === null) return;
    onApply({ customer: values.customer, businessType: values.businessType, region: values.region, tripPeriod });
  }

  return (
    <Card className={layout === 'panel' ? 'border-0 shadow-none' : ''}>
      {layout === 'card' && <CardHeader><CardTitle>선택 거래 일괄 편집{selectedCount ? ` · ${selectedCount}건` : ''}</CardTitle><CardDescription>체크한 거래에 공통 정보를 한 번에 적용합니다.</CardDescription></CardHeader>}
      <CardContent className={layout === 'panel' ? 'grid gap-4 pt-6' : 'grid gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_0.8fr_1fr_1fr_auto] xl:items-end'}>
        <Field label="고객사명"><Input value={values.customer} placeholder="선택 거래에 적용" onChange={(e) => setValues({ ...values, customer: e.target.value })} /></Field>
        <Field label="업무구분"><NativeSelect value={values.businessType} onChange={(value) => setValues({ ...values, businessType: value as BusinessType })} options={['프로젝트', '유지보수', '링스테크내부', '기타']} /></Field>
        <Field label="지역구분"><NativeSelect value={values.region} onChange={(value) => changeRegion(value as Region)} options={['서울', '지방']} /></Field>
        <Field label="출장 시작일"><Input type="date" disabled={values.region === '서울'} value={values.tripStart} max={values.tripEnd || undefined} onChange={(e) => setValues({ ...values, tripStart: e.target.value })} /></Field>
        <Field label="출장 종료일"><Input type="date" disabled={values.region === '서울'} value={values.tripEnd} min={values.tripStart || undefined} onChange={(e) => setValues({ ...values, tripEnd: e.target.value })} /></Field>
        <Button variant="secondary" disabled={Boolean(dateError)} onClick={apply}><ListChecks />일괄 적용</Button>
        {dateError && <p className="col-span-full text-sm text-destructive" role="alert">{dateError}</p>}
        {values.region === '지방' && tripPeriod && <p className="col-span-full text-xs text-muted-foreground">적용될 출장 기간: {tripPeriod}</p>}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }
function NativeSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return <select className="h-9 rounded-md border bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>;
}
