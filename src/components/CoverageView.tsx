/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  CalendarDays,
  Clock,
  AlertTriangle,
  Check,
  Save,
  Moon,
  Sun,
  ShieldCheck,
  Percent
} from 'lucide-react';
import { WorkScheduleSettings, ChatLead } from '../types';

interface CoverageViewProps {
  settings: WorkScheduleSettings;
  onSaveSettings: (settings: WorkScheduleSettings) => Promise<void>;
  leads: ChatLead[];
}

export default function CoverageView({ settings, onSaveSettings, leads }: CoverageViewProps) {
  // Estado local para edición de jornada
  const [workDays, setWorkDays] = useState<number[]>(settings.workDays);
  const [startTime, setStartTime] = useState<string>(settings.startTime);
  const [endTime, setEndTime] = useState<string>(settings.endTime);
  const [timezone, setTimezone] = useState<string>(settings.timezone);
  const [isSaved, setIsSaved] = useState(false);

  // Días de la semana
  const DAYS_OF_WEEK = [
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sábado' },
    { value: 0, label: 'Domingo' }
  ];

  const handleDayToggle = (day: number) => {
    if (workDays.includes(day)) {
      setWorkDays(workDays.filter(d => d !== day));
    } else {
      setWorkDays([...workDays, day]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings({
      workDays,
      startTime,
      endTime,
      timezone
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  // Calcular métricas de Cobertura
  const totalLeads = leads.length;
  const leadsOutside = leads.filter(l => !l.inWorkHours).length;
  const pctOutside = totalLeads > 0 ? (leadsOutside / totalLeads) * 100 : 0;

  // Fuera de jornada que nunca recibieron respuesta
  const outOfHoursLeads = leads.filter(l => !l.inWorkHours);
  const outOfHoursNoResponse = outOfHoursLeads.filter(l => !l.responded).length;
  const pctNoResponseOut = outOfHoursLeads.length > 0 ? (outOfHoursNoResponse / outOfHoursLeads.length) * 100 : 0;

  // Generar datos para la cuadrícula del Heatmap
  // Una matriz de [día, hora]
  const heatmapData: { [key: string]: number } = {};
  leads.forEach(lead => {
    const key = `${lead.arrivalDay}_${lead.arrivalHour}`;
    heatmapData[key] = (heatmapData[key] || 0) + 1;
  });

  // Encontrar el valor máximo para graduar colores
  const maxLeadsInCell = Math.max(...Object.values(heatmapData), 1);

  // Helper para comprobar si una celda (día, hora) está dentro de la jornada laboral
  const isCellInWorkHours = (day: number, hour: number) => {
    if (!workDays.includes(day)) return false;
    const [startHour] = startTime.split(':').map(Number);
    const [endHour] = endTime.split(':').map(Number);
    return hour >= startHour && hour <= endHour;
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Configuración de Jornada */}
      <div className="metric-card p-6">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
          <Clock className="text-orange-500" size={18} />
          Configuración Global de Jornada de Reclutamiento (Fija y Hábil)
        </h3>

        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
          {/* Selector de días laborables */}
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Días Laborales:</label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_OF_WEEK.map(day => {
                const active = workDays.includes(day.value);
                return (
                  <button
                    type="button"
                    key={day.value}
                    onClick={() => handleDayToggle(day.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      active
                        ? 'bg-orange-500 text-slate-950 border-orange-600'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horario inicio y fin */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Horario Inicio:</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-slate-50 font-medium"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Horario Fin:</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-slate-50 font-medium"
              />
            </div>
          </div>

          {/* Guardado */}
          <div>
            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition"
            >
              {isSaved ? <Check size={16} className="text-green-400" /> : <Save size={16} />}
              {isSaved ? 'Guardado con éxito' : 'Guardar Jornada'}
            </button>
          </div>
        </form>
      </div>

      {/* KPI Cards de Cobertura */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="metric-card p-5 flex items-start gap-4">
          <span className="bg-orange-50 p-3 rounded-xl border border-orange-100 text-orange-600 shrink-0">
            <Sun size={20} />
          </span>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Leads Fuera de Jornada</span>
            <div className="text-xl font-bold text-slate-900 mt-1">{leadsOutside} leads</div>
            <p className="text-[10px] text-slate-500 mt-1">{pctOutside.toFixed(1)}% de las llamadas totales entran de noche o fin de semana.</p>
          </div>
        </div>

        <div className="metric-card p-5 flex items-start gap-4">
          <span className="bg-red-50 p-3 rounded-xl border border-red-100 text-red-600 shrink-0">
            <Moon size={20} />
          </span>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tasa de Desatención (Off-Hours)</span>
            <div className="text-xl font-bold text-red-600 mt-1">{pctNoResponseOut.toFixed(1)}%</div>
            <p className="text-[10px] text-slate-500 mt-1">{outOfHoursNoResponse} de {outOfHoursLeads.length} leads fuera de horario quedan desatendidos.</p>
          </div>
        </div>

        <div className="metric-card p-5 flex items-start gap-4">
          <span className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-blue-600 shrink-0">
            <ShieldCheck size={20} />
          </span>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Zona Horaria Oficial</span>
            <div className="text-xl font-bold text-slate-900 mt-1">America/Mexico_City</div>
            <p className="text-[10px] text-slate-500 mt-1">Sincronización oficial del reloj logístico de Transmontes.</p>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="metric-card p-6 overflow-hidden">
        <div>
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <CalendarDays className="text-orange-500" size={16} />
            Mapa de Calor de Arribo de Leads (Día × Hora de Entrada)
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Las celdas con bordes punteados de color <strong className="font-semibold text-orange-500">Naranja</strong> representan el horario de jornada oficial. Las zonas oscuras son horarios donde se quema pauta publicitaria en horas inactivas.
          </p>
        </div>

        {/* Heatmap Grid */}
        <div className="mt-6 overflow-x-auto">
          <div className="min-w-[800px] space-y-1">
            {/* Cabecera de Horas (0 - 23) */}
            <div className="flex items-center text-[10px] font-mono font-bold text-slate-400 border-b border-slate-100 pb-2 mb-1">
              <div className="w-20 shrink-0 text-left">Día</div>
              <div className="flex-1 grid gap-0.5 text-center" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="truncate px-0.5">
                    {String(h).padStart(2, '0')}
                  </div>
                ))}
              </div>
            </div>

            {/* Filas por cada día */}
            {DAYS_OF_WEEK.map(day => {
              // Mapear el getDay de JS (0=Dom, 1=Lun...)
              const dayValue = day.value;

              return (
                <div key={dayValue} className="flex items-center">
                  {/* Nombre del día */}
                  <div className={`w-20 shrink-0 text-xs font-semibold ${workDays.includes(dayValue) ? 'text-slate-800' : 'text-slate-400'}`}>
                    {day.label}
                  </div>

                  {/* Horas (0 - 23) */}
                  <div className="flex-1 grid gap-0.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                    {Array.from({ length: 24 }).map((_, hour) => {
                      const count = heatmapData[`${dayValue}_${hour}`] || 0;
                      const isInWork = isCellInWorkHours(dayValue, hour);

                      // Heurística de color para la celda según volumen de leads
                      // Se gradúa según el maxLeadsInCell
                      const ratio = count / maxLeadsInCell;
                      let bgClass = 'bg-slate-50 text-slate-300';
                      if (count > 0) {
                        if (ratio < 0.3) bgClass = 'bg-orange-100 text-orange-800';
                        else if (ratio < 0.6) bgClass = 'bg-orange-200 text-orange-950';
                        else if (ratio < 0.9) bgClass = 'bg-orange-400 text-slate-950';
                        else bgClass = 'bg-orange-500 text-slate-950 font-bold';
                      }

                      return (
                        <div
                          key={hour}
                          title={`${day.label} a las ${hour}:00 - ${count} lead(s) ${isInWork ? '(Durante Jornada)' : '(Fuera de Jornada)'}`}
                          className={`h-9 text-[10px] font-mono flex flex-col items-center justify-center rounded transition-all cursor-help relative ${bgClass} ${
                            isInWork ? 'border-2 border-orange-500/40' : 'border border-slate-200/50'
                          }`}
                        >
                          {count > 0 && <span>{count}</span>}
                          {isInWork && count === 0 && (
                            <span className="w-1 h-1 rounded-full bg-orange-300 absolute" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Acotaciones */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-slate-50 border border-slate-200 rounded" />
            <span>Inactivo (0 leads)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-orange-100 rounded" />
            <span>Volumen Bajo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-orange-200 rounded" />
            <span>Volumen Medio</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-orange-400 rounded" />
            <span>Volumen Alto</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 bg-orange-500 rounded" />
            <span>Pico de Tráfico</span>
          </div>
          <div className="flex items-center gap-1.5 ml-4">
            <span className="w-4 h-4 border-2 border-orange-500 rounded" />
            <span>Shift / Jornada Laboral</span>
          </div>
        </div>
      </div>
    </div>
  );
}
