import type { CategorySource, Transaction } from './types.js';

interface ClassificationRule {
  pattern: RegExp;
  category: string;
}

export const DEFAULT_RULES: ClassificationRule[] = [
  { pattern: /(철도|코레일|KTX|SRT|승차권)/i, category: '교통비' },
  { pattern: /(택시|티머니|카카오\s*T|우버)/i, category: '교통비' },
  { pattern: /(주차|주유|SK에너지|GS칼텍스|현대오일뱅크|S-OIL)/i, category: '차량유지비' },
  { pattern: /(GS25|지에스25|CU|씨유|세븐일레븐|이마트24)/i, category: '식대/소모품비' },
  { pattern: /(식당|커피|카페|스타벅스|맥도날드|버거킹|KFC|멘야)/i, category: '식대' },
  { pattern: /(다이소|문구|오피스디포)/i, category: '소모품비' },
];

export function normalizeMerchant(value = ''): string {
  return String(value).trim().replace(/\s+/g, ' ').toLocaleUpperCase('ko-KR');
}

export function recommendCategory(
  merchant: string,
  remembered: Record<string, string> = {},
): { category: string; source: CategorySource } {
  const key = normalizeMerchant(merchant);
  if (remembered[key]) {
    return { category: remembered[key], source: 'remembered' };
  }

  const rule = DEFAULT_RULES.find(({ pattern }) => pattern.test(merchant));
  return rule
    ? { category: rule.category, source: 'rule' }
    : { category: '기타', source: 'default' };
}

export function transactionFingerprint(transaction: Partial<Transaction>): string {
  return [
    transaction.cardCompany,
    transaction.cardNumber,
    transaction.approvalNumber,
    transaction.transactionAt?.slice(0, 10),
    transaction.amount,
  ].map((value) => String(value ?? '').trim()).join('|');
}
