import type { Occurrence } from './types';

const tz = { timeZone: 'UTC' } as const;
const fDayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', ...tz });
const fFull = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...tz });
const fShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', ...tz });
const fMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', ...tz });
const fMonthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', ...tz });
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

export const parseIso = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const toIso = (d: Date) => d.toISOString().slice(0, 10);
export const isoOf = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const formatDayMonth = (iso: string) => fDayMonth.format(parseIso(iso));
export const formatFull = (iso: string) => fFull.format(parseIso(iso));
export const formatShort = (iso: string) => fShort.format(parseIso(iso));
export const monthName = (m: number) => fMonth.format(Date.UTC(2000, m - 1, 1));
export const monthYear = (y: number, m: number) => fMonthYear.format(Date.UTC(y, m - 1, 1));
export const formatEuros = (n: number) => euros.format(n);
export const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1);

export function todayIso(): string {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export const daysBetween = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);

const MONTHS: [RegExp, number][] = [
  [/janv|\bjan\b/, 1], [/f[eé]v/, 2], [/mars|\bmar\b/, 3], [/avr/, 4], [/\bmai\b/, 5], [/juin/, 6],
  [/juil/, 7], [/ao[uû]t/, 8], [/sept/, 9], [/oct/, 10], [/nov/, 11], [/d[eé]c/, 12],
];

/** Mois deviné depuis un libellé libre (« mi-octobre » -> 10). */
export function approxMonth(label?: string): number | undefined {
  if (!label) return undefined;
  const l = label.toLocaleLowerCase('fr-FR');
  let best: { idx: number; m: number } | undefined;
  for (const [re, m] of MONTHS) {
    const idx = l.search(re);
    if (idx >= 0 && (!best || idx < best.idx)) best = { idx, m };
  }
  return best?.m;
}

/** Texte court de la date d'un événement. */
export function whenText(o: Occurrence, withYear = false): string {
  const fmt = withYear ? formatShort : formatDayMonth;
  if (o.date && o.endDate && o.endDate !== o.date) return `${formatDayMonth(o.date)} → ${fmt(o.endDate)}`;
  if (o.date) return fmt(o.date);
  return withYear ? `${o.label ?? ''} ${o.year}`.trim() : o.label || String(o.year);
}

/** « il y a 3 mois », « il y a 2 ans »… */
export function since(o: Occurrence): string {
  const today = todayIso();
  if (!o.date) {
    const diff = Number(today.slice(0, 4)) - o.year;
    return diff <= 0 ? 'cette année' : diff === 1 ? 'l’an dernier' : `il y a ${diff} ans`;
  }
  const days = daysBetween(o.date, today);
  if (days < 0) return days === -1 ? 'demain' : `dans ${-days} jours`;
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  if (days < 31) return `il y a ${days} jours`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.floor(days / 365.25);
  const rest = Math.floor((days - years * 365.25) / 30.44);
  return `il y a ${years} an${years > 1 ? 's' : ''}${rest ? ` et ${rest} mois` : ''}`;
}

export function fileSize(n: number) {
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} Mo`;
}
