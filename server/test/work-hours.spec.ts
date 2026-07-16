import { describe, expect, it } from 'vitest';
import {
  calculateWorkMinutes,
  getLocalParts,
  isInWorkHours,
  WorkScheduleLike,
} from '../src/schedules/work-hours';

// L-V 07:45–17:10, la configuración real de Transmontes.
const schedule: WorkScheduleLike = {
  workDays: [1, 2, 3, 4, 5],
  startTime: '07:45',
  endTime: '17:10',
  timezone: 'America/Mexico_City',
};

describe('motor de horario hábil (work-hours-engine)', () => {
  it('evalúa en la TZ del schedule, no la del servidor', () => {
    // 2026-07-15 15:00 UTC = 09:00 en CDMX (UTC-6, sin DST desde 2022) → miércoles hábil.
    const instant = new Date('2026-07-15T15:00:00Z');
    expect(getLocalParts(instant, 'America/Mexico_City')).toEqual({
      weekday: 3,
      hour: 9,
      minute: 0,
    });
    expect(isInWorkHours(instant, schedule)).toBe(true);
    // El mismo instante evaluado con un schedule en Tokio (UTC+9) → jueves 00:00, no hábil.
    expect(isInWorkHours(instant, { ...schedule, timezone: 'Asia/Tokyo' })).toBe(false);
  });

  it('respeta DST en zonas que lo tienen', () => {
    const ny = { ...schedule, timezone: 'America/New_York' };
    // Enero (EST, UTC-5): 13:00 UTC = 08:00 NY → hábil.
    expect(isInWorkHours(new Date('2026-01-15T13:00:00Z'), ny)).toBe(true);
    // Julio (EDT, UTC-4): 13:00 UTC = 09:00 NY → hábil; 11:00 UTC = 07:00 → no.
    expect(isInWorkHours(new Date('2026-07-16T11:00:00Z'), ny)).toBe(false);
  });

  it('fuera de días laborables no es hábil aunque la hora encaje', () => {
    // 2026-07-18 = sábado; 16:00 UTC = 10:00 CDMX.
    expect(isInWorkHours(new Date('2026-07-18T16:00:00Z'), schedule)).toBe(false);
  });

  it('minutos hábiles cruzando fin de semana: viernes 16:00 → lunes 08:45 CDMX', () => {
    // Viernes 2026-07-17 16:00 CDMX = 22:00 UTC; lunes 2026-07-20 08:45 CDMX = 14:45 UTC.
    const minutes = calculateWorkMinutes(
      new Date('2026-07-17T22:00:00Z'),
      new Date('2026-07-20T14:45:00Z'),
      schedule,
    );
    // Viernes 16:00→17:10 = 70 min; lunes 07:45→08:45 = 60 min.
    expect(minutes).toBe(130);
  });

  it('end anterior o igual a start → 0', () => {
    const t = new Date('2026-07-15T15:00:00Z');
    expect(calculateWorkMinutes(t, t, schedule)).toBe(0);
    expect(calculateWorkMinutes(t, new Date(t.getTime() - 1000), schedule)).toBe(0);
  });

  it('mensaje fuera de horario no suma minutos', () => {
    // Miércoles 03:00→04:00 CDMX (09:00→10:00 UTC): madrugada, 0 minutos hábiles.
    expect(
      calculateWorkMinutes(
        new Date('2026-07-15T09:00:00Z'),
        new Date('2026-07-15T10:00:00Z'),
        schedule,
      ),
    ).toBe(0);
  });
});
