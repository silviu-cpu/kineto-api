/** Utilitare pentru lucrul cu ore în format "HH:mm" și sloturi. Sursă unică de adevăr. */

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidHHmm(value: string): boolean {
  return HHMM_RE.test(value);
}

/** "HH:mm" -> minute de la miezul nopții. Aruncă dacă formatul e invalid. */
export function parseHHmm(value: string): number {
  if (!isValidHHmm(value)) {
    throw new Error(`Format oră invalid: "${value}" (așteptat "HH:mm")`);
  }
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/** minute de la miezul nopții -> "HH:mm". */
export function toHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutes(time: string, minutes: number): string {
  return toHHmm(parseHHmm(time) + minutes);
}

/** Două intervale [aStart,aEnd) și [bStart,bEnd) se suprapun? (valori "HH:mm") */
export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const as = parseHHmm(aStart);
  const ae = parseHHmm(aEnd);
  const bs = parseHHmm(bStart);
  const be = parseHHmm(bEnd);
  return as < be && bs < ae;
}

/** Normalizează "YYYY-MM-DD" la un Date la 00:00 UTC (ziua programării). */
export function dateOnlyUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Validează formatul "YYYY-MM-DD". */
export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = dateOnlyUtc(dateStr);
  return !Number.isNaN(d.getTime());
}

/** Data locală curentă ca "YYYY-MM-DD" (ora serverului/clinicii). */
export function todayLocalDateStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Ora locală curentă ca "HH:mm". */
export function nowLocalHHmm(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;
}
