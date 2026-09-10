import { FileClock } from 'lucide-react';
import type { UseFormRegister } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface DocumentFormValues { applicant: string; receiptDate: string; periodStart: string; periodEnd: string }
interface Props {
  register: UseFormRegister<DocumentFormValues>;
  onReceiptDateChange: (receiptDate: string) => void;
}

export function DocumentPanel({ register, onReceiptDateChange }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle>문서 정보</CardTitle><CardDescription>접수 정보와 신청 기간을 작성합니다.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="접수자"><Input placeholder="홍길동" {...register('applicant')} /></Field>
        <Field label="접수일"><Input type="date" {...register('receiptDate', { onChange: (event) => onReceiptDateChange(event.target.value) })} /></Field>
        <Field label="신청기간 시작"><Input type="date" {...register('periodStart')} /></Field>
        <Field label="신청기간 종료"><Input type="date" {...register('periodEnd')} /></Field>
        <div className="col-span-full flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"><FileClock className="size-4" />입력한 문서 정보는 미리보기와 지출결의서 상단에 반영됩니다.</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label>{label}</Label>{children}</div>;
}
