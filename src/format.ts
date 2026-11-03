import type { Occurrence } from './types';

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', timeZone: 'UTC' });
const full = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const formatDayMonth = (iso: string) => dayMonth.format(parse(iso));
export const formatFull = (iso: string) => full.format(parse(iso));
export const formatEuros = (n: number) => euros.format(n);

/** Texte affiché dans une case du tableau (comme le format « jj mmmm » de l'Excel). */
export function occurrenceText(o: Occurrence): string {
  if (o.date && o.endDate) return `${formatDayMonth(o.date)} – ${formatDayMonth(o.endDate)}`;
  if (o.date) return formatDayMonth(o.date);
  return o.label || '—';
}

/** Clé de tri : date précise si dispo, sinon l'année. */
export function sortKey(o: Occurrence): string {
  return o.date || `${o.year}-00-00`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** « il y a 3 mois », « il y a 2 ans »… */
export function since(o: Occurrence): string {
  const now = new Date();
  if (!o.date) {
    const diff = now.getFullYear() - o.year;
    return diff <= 0 ? 'cette année' : diff === 1 ? 'l’an dernier' : `il y a ${diff} ans`;
  }
  const d = parse(o.date);
  const days = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - d.getTime()) / 86_400_000);
  if (days < 0) return days === -1 ? 'demain' : `dans ${-days} j`;
  if (days === 0) return 'aujourd’hui';
  if (days < 31) return `il y a ${days} j`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.floor(days / 365.25);
  const rest = Math.floor((days - years * 365.25) / 30.44);
  return `il y a ${years} an${years > 1 ? 's' : ''}${rest ? ` ${rest} m` : ''}`;
}
