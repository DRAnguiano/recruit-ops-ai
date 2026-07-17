/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  TrendingUp,
  Megaphone,
  AlertTriangle,
  Pause,
  Play,
  UserCheck,
  Percent,
  Clock,
  BadgeAlert,
  Ban
} from 'lucide-react';
import { MarketingCampaign, ChatLead, JobVacancy } from '../types';

interface CampaignsViewProps {
  campaigns: MarketingCampaign[];
  leads: ChatLead[];
  vacancies: JobVacancy[];
  onToggleStatus: (id: string) => Promise<void>;
  onRequestPause: (id: string) => Promise<void>;
}

export default function CampaignsView({
  campaigns,
  leads,
  vacancies,
  onToggleStatus,
  onRequestPause
}: CampaignsViewProps) {

  // Formatear moneda: la reporta cada campaña (default USD, decisión §3.14)
  const mainCurrency = campaigns[0]?.currency ?? 'USD';
  const formatMoney = (num: number, currency: string = mainCurrency) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(num);
  };

  // Encontrar vacante por ID
  const getVacancy = (id: string): JobVacancy | undefined => {
    return vacancies.find(v => v.id === id || v.type === id);
  };

  // Calcular métricas agregadas
  const totalSpend = campaigns.reduce((acc, c) => acc + c.spend, 0);
  const totalLeadsReported = campaigns.reduce((acc, c) => acc + c.leadsReported, 0);
  
  // Leads detectados en WhatsApp de los agentes destinos de las campañas
  const totalLeadsParsed = campaigns.reduce((acc, camp) => {
    // Contar leads asociados a este agente y vacante
    const count = leads.filter(l => 
      l.agent.toLowerCase() === camp.targetAgent.toLowerCase() &&
      l.detectedVacante.toLowerCase() === (getVacancy(camp.vacanteId)?.type || '').toLowerCase()
    ).length;
    return acc + count;
  }, 0);

  const avgCPLReported = totalLeadsReported > 0 ? totalSpend / totalLeadsReported : 0;
  const avgCPLParsed = totalLeadsParsed > 0 ? totalSpend / totalLeadsParsed : 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* KPIs de Campaña */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="metric-card p-5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Inversión Total</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatMoney(totalSpend)}</div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">Pauta acumulada en campañas</p>
        </div>

        <div className="metric-card p-5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Leads FB (Reportados)</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{totalLeadsReported}</div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">Según Ads Manager</p>
        </div>

        <div className="metric-card p-5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Leads WA (Verificados)</span>
          <div className="text-xl font-bold text-orange-600 mt-1">{totalLeadsParsed}</div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">Contactos reales en bandeja</p>
        </div>

        <div className="metric-card p-5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Costo por Lead (Parsed)</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatMoney(avgCPLParsed)}</div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">CPL Real sobre chats</p>
        </div>
      </div>

      {/* Tabla Principal de Campañas */}
      <div className="metric-card overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Megaphone className="text-orange-500" size={16} />
              Rendimiento Operativo de Campañas de Marketing
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Cruce entre inversión publicitaria, clicks, leads reportados por Meta y leads reales en WhatsApp.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                <th className="p-3">Campaña</th>
                <th className="p-3">Estatus</th>
                <th className="p-3">Gasto</th>
                <th className="p-3">Clicks</th>
                <th className="p-3">Leads FB</th>
                <th className="p-3">Leads WA</th>
                <th className="p-3">Click → Lead</th>
                <th className="p-3">CPL (Real)</th>
                <th className="p-3">Contratos (Agente)</th>
                <th className="p-3">Costo / Contrato</th>
                <th className="p-3">Discrepancia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((camp) => {
                const vac = getVacancy(camp.vacanteId);
                const vacType = vac ? vac.type : 'Sencillo';

                // Leads detectados en WhatsApp para esta campaña específica
                // (Mapeado por agente de destino y tipo de vacante detectada)
                const leadsParsed = leads.filter(l => 
                  l.agent.toLowerCase() === camp.targetAgent.toLowerCase() &&
                  l.detectedVacante.toLowerCase() === vacType.toLowerCase()
                );
                const parsedCount = leadsParsed.length;

                // Contratos logrados por el agente destino en esta vacante
                const hiresCount = leadsParsed.filter(l => l.statusName === 'hired').length;

                // Clics opcionales
                const clicks = camp.clicks || 0;
                const clickToLead = clicks > 0 ? (parsedCount / clicks) * 100 : 0;

                const cplReal = parsedCount > 0 ? camp.spend / parsedCount : camp.spend;
                const cph = hiresCount > 0 ? camp.spend / hiresCount : camp.spend;

                // Discrepancia entre leads reportados por marketing y detectados en WA
                // "Resaltar discrepancias >20% entre leads reportados por Marketing y leads detectados en WhatsApp"
                const discrepancy = camp.leadsReported > 0 
                  ? Math.abs(camp.leadsReported - parsedCount) / camp.leadsReported 
                  : 0;
                const isDiscrepant = discrepancy > 0.20;

                return (
                  <tr key={camp.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-semibold text-slate-800">
                      <div>{camp.campaignName}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{vac ? `${vac.circuit} (${camp.type})` : 'Sin vacante'}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        camp.status === 'Activa' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {camp.status}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-medium">{formatMoney(camp.spend, camp.currency ?? mainCurrency)}</td>
                    <td className="p-3 font-mono text-slate-500">{clicks || '-'}</td>
                    <td className="p-3 font-mono text-slate-600">{camp.leadsReported}</td>
                    <td className="p-3 font-mono font-bold text-slate-900">{parsedCount}</td>
                    <td className="p-3 font-mono text-slate-500">
                      {clicks > 0 ? `${clickToLead.toFixed(1)}%` : 'N/A'}
                    </td>
                    <td className="p-3 font-mono font-semibold text-slate-900">{formatMoney(cplReal)}</td>
                    <td className="p-3 font-mono text-slate-700 font-medium">{hiresCount}</td>
                    <td className="p-3 font-mono text-slate-900 font-semibold bg-slate-50/50">
                      {hiresCount > 0 ? formatMoney(cph) : <span className="text-[10px] text-slate-400">Sin contrataciones</span>}
                    </td>
                    <td className="p-3">
                      {isDiscrepant ? (
                        <div className="flex items-center gap-1 text-red-600 font-bold font-mono text-[10px] bg-red-50 px-2 py-0.5 rounded border border-red-100 animate-pulse">
                          <AlertTriangle size={10} />
                          +{(discrepancy * 100).toFixed(0)}% desc
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">{(discrepancy * 100).toFixed(0)}%</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Control Diario y Alerta de Apagado */}
      <div className="metric-card overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <BadgeAlert className="text-orange-500" size={16} />
            Panel de Control Diario y Gestión de Pautas
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Monitorea el cupo restante de cada vacante. Si ya se cubrió el cupo, apaga la campaña de inmediato para evitar desperdicio de presupuesto publicitario.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                <th className="p-3">Campaña / Vacante</th>
                <th className="p-3">Reclutadora</th>
                <th className="p-3">Cupo Inicial</th>
                <th className="p-3">Contratados</th>
                <th className="p-3">En Proceso Avanzado</th>
                <th className="p-3">Cupo Restante</th>
                <th className="p-3">Acción Operativa</th>
                <th className="p-3">Pausa Solicitada a Mkt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((camp) => {
                const vac = getVacancy(camp.vacanteId);
                if (!vac) return null;

                // Contar contratados y prospectos en fase de papelería ("En proceso" y "Documentos")
                const leadsRelated = leads.filter(l => 
                  l.agent.toLowerCase() === camp.targetAgent.toLowerCase() &&
                  l.detectedVacante.toLowerCase() === vac.type.toLowerCase()
                );

                const contratados = leadsRelated.filter(l => l.statusName === 'hired').length;
                const enProceso = leadsRelated.filter(l => l.statusName === 'in_progress' || l.statusName === 'documents').length;

                // Cupo restante
                const cupoRestante = vac.quota - contratados - enProceso;
                const isOverLimit = cupoRestante <= 0;

                return (
                  <tr key={camp.id} className={`hover:bg-slate-50/50 ${isOverLimit ? 'bg-red-50/40' : ''}`}>
                    <td className="p-3 font-semibold text-slate-800">
                      <div>{camp.campaignName}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-mono">{vac.circuit} | {vac.type}</div>
                    </td>
                    <td className="p-3 font-medium text-slate-600">{camp.targetAgent}</td>
                    <td className="p-3 font-mono font-bold text-slate-700">{vac.quota}</td>
                    <td className="p-3 font-mono text-green-700 font-semibold">{contratados}</td>
                    <td className="p-3 font-mono text-slate-600">{enProceso}</td>
                    <td className="p-3 font-mono">
                      {isOverLimit ? (
                        <span className="text-red-600 font-bold bg-red-100/80 px-2 py-0.5 rounded border border-red-200">
                          {cupoRestante} (Cubierta)
                        </span>
                      ) : (
                        <span className="text-slate-900 font-bold">{cupoRestante}</span>
                      )}
                    </td>
                    <td className="p-3">
                      {isOverLimit ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-red-700 font-bold flex items-center gap-1 text-[10px] uppercase tracking-tight">
                            <Ban size={12} className="shrink-0" />
                            APAGAR — vacante cubierta
                          </span>
                          {!camp.pauseRequested ? (
                            <button
                              onClick={() => onRequestPause(camp.id)}
                              className="bg-red-600 hover:bg-red-700 text-white font-semibold text-[10px] px-2.5 py-1 rounded transition w-fit"
                            >
                              Solicitar Pausa a Mkt
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">Pausa ya solicitada</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded border border-green-100">Camp. Saludable</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-[10px] text-slate-500">
                      {camp.pauseRequested ? (
                        <div className="bg-slate-100 p-1 rounded border border-slate-200/50">
                          {new Date(camp.pauseRequested).toLocaleString('es-MX', { hour12: true })}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No requerida</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
