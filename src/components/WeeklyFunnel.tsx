/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export interface FunnelStage {
  label: string;
  value: number;
  /** Nota corta bajo la etiqueta (p. ej. la fuente/definición de la señal). */
  hint?: string;
}

interface WeeklyFunnelProps {
  stages: FunnelStage[];
}

/**
 * Embudo por etapas del reclutamiento del periodo. Presentacional: recibe las etapas ya
 * calculadas (App.tsx es dueño del cálculo). Cada barra es proporcional al tope del embudo y
 * muestra conteo, % del total y la caída vs. la etapa anterior. No inventa etapas: solo dibuja
 * lo que se le pasa. Fiel al dato — si una señal aún no se computa, su etapa aparece en 0.
 */
export default function WeeklyFunnel({ stages }: WeeklyFunnelProps) {
  const total = stages[0]?.value ?? 0;

  if (total === 0) {
    return (
      <div className="metric-card p-10 text-center">
        <h3 className="font-bold text-sm text-slate-900">Sin leads en el periodo</h3>
        <p className="text-[12px] text-slate-500 mt-1.5 max-w-md mx-auto">
          Ajusta el rango de fechas para ver el embudo de reclutamiento de la semana.
        </p>
      </div>
    );
  }

  return (
    <div className="metric-card overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h3 className="font-bold text-sm text-slate-900">Avance del reclutamiento</h3>
        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
          Caída etapa a etapa, de lead ingresado a contratación. Cada barra es proporcional al total
          de leads del periodo.
        </p>
      </div>

      <div className="p-6 space-y-3">
        {stages.map((stage, i) => {
          const pctOfTotal = total > 0 ? (stage.value / total) * 100 : 0;
          const prev = i > 0 ? stages[i - 1].value : null;
          const dropPct = prev !== null && prev > 0 ? ((stage.value - prev) / prev) * 100 : null;

          return (
            <div key={stage.label} className="flex items-center gap-4">
              {/* Etiqueta */}
              <div className="w-40 shrink-0 text-right">
                <div className="text-xs font-semibold text-slate-700">{stage.label}</div>
                {stage.hint && (
                  <div className="text-[10px] text-slate-400 font-mono">{stage.hint}</div>
                )}
              </div>

              {/* Barra */}
              <div className="flex-1 h-9 bg-slate-100 rounded-md overflow-hidden relative">
                <div
                  className="h-full bg-blue-600 rounded-md transition-all duration-300 flex items-center"
                  style={{ width: `${Math.max(pctOfTotal, stage.value > 0 ? 2 : 0)}%` }}
                >
                  {pctOfTotal >= 12 && (
                    <span className="text-[11px] font-bold text-white px-2 tabular-nums">
                      {stage.value}
                    </span>
                  )}
                </div>
                {pctOfTotal < 12 && (
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-600 tabular-nums">
                    {stage.value}
                  </span>
                )}
              </div>

              {/* % del total + caída */}
              <div className="w-28 shrink-0 text-right">
                <div className="text-xs font-bold text-slate-800 tabular-nums">
                  {pctOfTotal.toFixed(1)}%
                </div>
                {dropPct !== null && (
                  <div
                    className={`text-[10px] font-mono tabular-nums ${
                      dropPct < 0 ? 'text-red-500' : 'text-slate-400'
                    }`}
                  >
                    {dropPct > 0 ? '+' : ''}
                    {dropPct.toFixed(0)}%
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
