/**
 * Motor de horario hábil. Regla del proyecto: los instantes se almacenan en
 * UTC y se evalúan SIEMPRE en la TZ IANA del schedule (vía Intl), nunca en la
 * del servidor. Puerto del algoritmo probado en la SPA
 * (src/utils/whatsappParser.ts) corrigiendo su vicio de usar la TZ local.
 */

export interface WorkScheduleLike {
  /** Días laborables 0-6 (0=domingo). */
  workDays: number[];
  /** "HH:MM" en la TZ del schedule. */
  startTime: string;
  endTime: string;
  /** TZ IANA, ej. America/Mexico_City. */
  timezone: string;
}

export interface LocalParts {
  /** 0=domingo … 6=sábado, en la TZ dada. */
  weekday: number;
  hour: number;
  minute: number;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

/** Descompone un instante UTC en día/hora/minuto locales de la TZ dada (DST correcto). */
export function getLocalParts(instant: Date, timezone: string): LocalParts {
  const parts = formatterFor(timezone).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    // Intl puede devolver "24" para medianoche con hour12:false; se normaliza a 0.
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
  };
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** ¿El instante cae dentro de los días y ventana horaria del schedule? */
export function isInWorkHours(instant: Date, schedule: WorkScheduleLike): boolean {
  const local = getLocalParts(instant, schedule.timezone);
  if (!schedule.workDays.includes(local.weekday)) return false;
  const minutesOfDay = local.hour * 60 + local.minute;
  return minutesOfDay >= parseHHMM(schedule.startTime) && minutesOfDay < parseHHMM(schedule.endTime);
}

/** Tope de evaluación: más allá de esto la métrica de minutos hábiles deja de ser útil. */
const MAX_SPAN_DAYS = 90;

/**
 * Minutos transcurridos entre dos instantes contando SOLO minutos dentro de la
 * jornada del schedule, evaluados en su TZ. Recorre minuto a minuto (los spans
 * reales son de minutos u horas; el tope evita degeneración).
 */
export function calculateWorkMinutes(start: Date, end: Date, schedule: WorkScheduleLike): number {
  if (end.getTime() <= start.getTime()) return 0;

  const cappedEnd = Math.min(end.getTime(), start.getTime() + MAX_SPAN_DAYS * 24 * 60 * 60_000);
  let minutes = 0;
  for (let t = start.getTime(); t < cappedEnd; t += 60_000) {
    if (isInWorkHours(new Date(t), schedule)) minutes += 1;
  }
  return minutes;
}
