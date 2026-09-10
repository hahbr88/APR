export interface ApplicationPeriod {
  periodStart: string;
  periodEnd: string;
}

export function applicationPeriodFromReceiptDate(receiptDate: string): ApplicationPeriod | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(receiptDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const receipt = new Date(Date.UTC(year, month - 1, day));
  if (receipt.getUTCFullYear() !== year || receipt.getUTCMonth() !== month - 1 || receipt.getUTCDate() !== day) return null;

  const previousMonthLastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const previousMonthSameDay = new Date(Date.UTC(year, month - 2, Math.min(day, previousMonthLastDay)));
  previousMonthSameDay.setUTCDate(previousMonthSameDay.getUTCDate() + 1);
  return {
    periodStart: previousMonthSameDay.toISOString().slice(0, 10),
    periodEnd: receiptDate,
  };
}

export function tripPeriodFromDateRange(startDate: string, endDate: string): string | null {
  if (!startDate && !endDate) return '';
  const isValidDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) return null;
  const shortDate = (value: string) => value.slice(2).replaceAll('-', '.');
  return `${shortDate(startDate)}-${shortDate(endDate)}`;
}

export function dateRangeFromTripPeriod(tripPeriod: string) {
  if (!tripPeriod) return { startDate: '', endDate: '' };
  const match = /^(\d{2})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/.exec(tripPeriod);
  if (!match) return null;
  const startDate = `20${match[1]}-${match[2]}-${match[3]}`;
  const endDate = `20${match[4]}-${match[5]}-${match[6]}`;
  return tripPeriodFromDateRange(startDate, endDate) === tripPeriod ? { startDate, endDate } : null;
}
