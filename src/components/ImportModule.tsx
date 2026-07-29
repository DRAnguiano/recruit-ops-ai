/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Upload,
  Database,
  FileSpreadsheet,
  Megaphone,
  UserCheck,
  TrendingUp,
  Sliders,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Plus,
  Trash2,
  FolderOpen,
  FileText,
  Download,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import {
  ChatLead,
  Operator,
  MarketingCampaign,
  FleetData,
  MonthlyGoal,
  JobVacancy,
  WorkScheduleSettings
} from '../types';
import {
  parseOperatorsDirectory,
  parseCampaignsCSV,
  FileParseError
} from '../utils/fileParsers';
import { api, ApiError } from '../api/client';
import {
  campaignToApiBulk,
  fleetToApi,
  goalToApi,
  operatorToApiBulk,
  vacancyToApi,
} from '../api/mappers';
import { parseMetaPautas } from '../api/meta-pautas';

interface ImportModuleProps {
  agents: string[];
  setAgents: (agents: string[]) => void;
  vacancies: JobVacancy[];
  setVacancies: (vacancies: JobVacancy[]) => void;
  campaigns: MarketingCampaign[];
  setCampaigns: (campaigns: MarketingCampaign[]) => void;
  operators: Operator[];
  setOperators: (operators: Operator[]) => void;
  fleet: FleetData[];
  setFleet: (fleet: FleetData[]) => void;
  goals: MonthlyGoal[];
  setGoals: (goals: MonthlyGoal[]) => void;
  settings: WorkScheduleSettings;
  onRefreshAll: () => Promise<void>;
}

export default function ImportModule({
  agents,
  setAgents,
  vacancies,
  setVacancies,
  campaigns,
  setCampaigns,
  operators,
  setOperators,
  fleet,
  setFleet,
  goals,
  setGoals,
  settings,
  onRefreshAll,
}: ImportModuleProps) {
  // Estado local para los formularios e inputs de archivo
  const [newAgentName, setNewAgentName] = useState<string>('');

  // Estados de carga de archivos
  const [loading, setLoading] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<FileParseError[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Previsualizaciones locales de archivos cargados
  const [operatorPreview, setOperatorPreview] = useState<Operator[]>([]);
  const [campaignPreview, setCampaignPreview] = useState<MarketingCampaign[]>([]);

  // Estados de formularios manuales
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignForm, setCampaignForm] = useState<Partial<MarketingCampaign>>({
    campaignName: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    spend: 0,
    leadsReported: 0,
    targetAgent: 'Adriana',
    type: 'Local',
    vacanteId: 'Sencillo',
    status: 'Activa',
    clicks: 0
  });

  const [showVacancyForm, setShowVacancyForm] = useState(false);
  const [vacancyForm, setVacancyForm] = useState<Partial<JobVacancy>>({
    type: 'Sencillo',
    circuit: '',
    modality: 'Local',
    company: 'Transmontes',
    quota: 5,
    status: 'Abierta'
  });

  const [showFleetForm, setShowFleetForm] = useState(false);
  const [fleetForm, setFleetForm] = useState<FleetData>({
    company: 'Transmontes',
    tractosTotales: 100,
    tractosEnServicio: 90,
    tractosSinOperador: 10,
    serviciosActivos: 80
  });

  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState<Partial<MonthlyGoal>>({
    company: 'Transmontes',
    vacanteType: 'Sencillo',
    monthlyTarget: 10
  });

  // Manejo de agentes personalizados
  const handleAddAgent = async () => {
    const trimmed = newAgentName.trim();
    if (!trimmed || agents.includes(trimmed)) return;
    try {
      await api('/api/agents', { method: 'POST', body: JSON.stringify({ name: trimmed }) });
      setAgents([...agents, trimmed]);
      setNewAgentName('');
      await onRefreshAll();
    } catch (err) {
      setParseErrors([{ fileName: 'agentes', message: err instanceof ApiError ? err.message : 'No se pudo crear el agente' }]);
    }
  };

  // Importar Directorio de Operadores (XLSX / CSV)
  const handleOperatorsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading('operators');
    setParseErrors([]);
    setSuccessMsg(null);
    setOperatorPreview([]);

    const result = await parseOperatorsDirectory(file);

    if (result.operators.length > 0) {
      setOperatorPreview(result.operators.slice(0, 10));
      try {
        const res = await api<{ created: number; updated: number }>('/api/operators/bulk', {
          method: 'POST',
          body: JSON.stringify({ items: result.operators.map(operatorToApiBulk) }),
        });
        setSuccessMsg(`Operadores importados: ${res.created} nuevos, ${res.updated} actualizados (idempotente por # Emp).`);
        await onRefreshAll();
      } catch (err) {
        setParseErrors([{ fileName: file.name, message: err instanceof ApiError ? err.message : 'Error al importar operadores' }]);
      }
    }

    if (result.errors.length > 0) {
      setParseErrors(result.errors);
    }
    setLoading(null);
  };

  // Importar Campañas de Marketing (CSV)
  const handleCampaignsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading('campaigns');
    setParseErrors([]);
    setSuccessMsg(null);
    setCampaignPreview([]);

    const result = await parseCampaignsCSV(file);

    if (result.campaigns.length > 0) {
      setCampaignPreview(result.campaigns.slice(0, 10));
      try {
        const res = await api<{ created: number; updated: number }>('/api/campaigns/bulk', {
          method: 'POST',
          body: JSON.stringify({
            items: result.campaigns.map((c) => ({
              ...campaignToApiBulk(c),
              isoWeek: c.isoWeek || getISOWeek(c.startDate),
            })),
          }),
        });
        setSuccessMsg(`Campañas importadas: ${res.created} nuevas, ${res.updated} actualizadas (upsert por nombre + semana ISO).`);
        await onRefreshAll();
      } catch (err) {
        setParseErrors([{ fileName: file.name, message: err instanceof ApiError ? err.message : 'Error al importar campañas' }]);
      }
    }

    if (result.errors.length > 0) {
      setParseErrors(result.errors);
    }
    setLoading(null);
  };

  // Importar pautas de Meta (xlsx multi-hoja por reclutadora)
  const handleMetaPautasUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLoading('meta-pautas');
    setParseErrors([]);
    setSuccessMsg(null);

    try {
      const { campaigns: pautas, errors } = await parseMetaPautas(file);
      if (pautas.length > 0) {
        const res = await api<{ created: number; updated: number }>('/api/import/meta-pautas', {
          method: 'POST',
          body: JSON.stringify({ campaigns: pautas }),
        });
        setSuccessMsg(
          `Pautas de Meta: ${res.created} campañas nuevas, ${res.updated} actualizadas ` +
            `(${pautas.length} filas en ${new Set(pautas.map((p) => p.agent)).size} reclutadoras).`,
        );
        await onRefreshAll();
      } else {
        setParseErrors([{ fileName: file.name, message: 'No se encontraron campañas en el archivo.' }]);
      }
      if (errors.length > 0) setParseErrors((prev) => [...prev, ...errors]);
    } catch (err) {
      setParseErrors([
        { fileName: file.name, message: err instanceof ApiError ? err.message : 'No se pudieron importar las pautas' },
      ]);
    } finally {
      setLoading(null);
    }
  };

  // Manejo de Guardado Manual de Campaña
  const handleSaveCampaignManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignForm.campaignName) return;

    const startDate = campaignForm.startDate || new Date().toISOString().split('T')[0];
    try {
      await api('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: campaignForm.campaignName,
          startDate,
          endDate: campaignForm.endDate || startDate,
          isoWeek: getISOWeek(startDate),
          spend: Number(campaignForm.spend || 0),
          leadsReported: Number(campaignForm.leadsReported || 0),
          clicks: Number(campaignForm.clicks || 0),
          modality: campaignForm.type === 'Foráneo' ? 'foreign' : 'local',
          status: campaignForm.status === 'Pausada' ? 'paused' : 'active',
        }),
      });
      setSuccessMsg(`Campaña manual "${campaignForm.campaignName}" guardada.`);
      setShowCampaignForm(false);
      await onRefreshAll();
    } catch (err) {
      setParseErrors([{ fileName: 'campaña manual', message: err instanceof ApiError ? err.message : 'No se pudo guardar la campaña' }]);
    }
  };

  // Guardado de Vacante Manual
  const handleSaveVacancyManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vacancyForm.circuit) return;

    try {
      await api('/api/vacancies', {
        method: 'POST',
        body: JSON.stringify(
          vacancyToApi({
            type: (vacancyForm.type as JobVacancy['type']) || 'Sencillo',
            circuit: vacancyForm.circuit,
            modality: (vacancyForm.modality as 'Local' | 'Foráneo') || 'Local',
            company: (vacancyForm.company as JobVacancy['company']) || 'Transmontes',
            quota: Number(vacancyForm.quota || 1),
            status: (vacancyForm.status as JobVacancy['status']) || 'Abierta',
          }),
        ),
      });
      setSuccessMsg(`Vacante para circuito "${vacancyForm.circuit}" añadida.`);
      setShowVacancyForm(false);
      await onRefreshAll();
    } catch (err) {
      setParseErrors([{ fileName: 'vacante manual', message: err instanceof ApiError ? err.message : 'No se pudo guardar la vacante' }]);
    }
  };

  // Guardado de Flota Manual (upsert por empresa)
  const handleSaveFleetManual = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const existing = fleet.find((f) => f.company === fleetForm.company);
      const body = JSON.stringify(fleetToApi(fleetForm));
      if (existing?.id) {
        await api(`/api/fleet/${existing.id}`, { method: 'PATCH', body });
      } else {
        await api('/api/fleet', { method: 'POST', body });
      }
      setSuccessMsg(`Capacidad de flota para "${fleetForm.company}" actualizada.`);
      setShowFleetForm(false);
      await onRefreshAll();
    } catch (err) {
      setParseErrors([{ fileName: 'flota', message: err instanceof ApiError ? err.message : 'No se pudo guardar la flota' }]);
    }
  };

  // Guardado de Meta Manual (upsert por empresa + tipo)
  const handleSaveGoalManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const goalData = {
      company: goalForm.company || 'Transmontes',
      vacanteType: goalForm.vacanteType || 'Sencillo',
      monthlyTarget: Number(goalForm.monthlyTarget || 0),
    };
    try {
      const existing = goals.find(
        (g) => g.company === goalData.company && g.vacanteType === goalData.vacanteType,
      );
      const body = JSON.stringify(goalToApi(goalData));
      if (existing) {
        await api(`/api/goals/${existing.id}`, { method: 'PATCH', body });
      } else {
        await api('/api/goals', { method: 'POST', body });
      }
      setSuccessMsg(`Meta mensual de contratación para ${goalData.company} - ${goalData.vacanteType} guardada.`);
      setShowGoalForm(false);
      await onRefreshAll();
    } catch (err) {
      setParseErrors([{ fileName: 'metas', message: err instanceof ApiError ? err.message : 'No se pudo guardar la meta' }]);
    }
  };

  // Helper para semana ISO
  const getISOWeek = (dateStr: string): string => {
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) return '2026-W01';
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Encabezado y Opciones de Carga */}
      <div className="metric-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="text-orange-500" size={24} />
            Módulo de Administración y Datos
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Actualiza el padrón de operadores de nómina, importa campañas (CSV de respaldo) o configura catálogos y metas. Los chats ya llegan solos por los canales conectados.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] text-slate-500 font-medium max-w-xs">
          Las cargas son <strong>acumulativas e idempotentes</strong>: reimportar el mismo
          archivo no duplica registros (upsert por llave natural en el backend).
        </div>
      </div>

      {/* Alertas de Éxito / Error */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-xl flex items-start gap-3">
          <CheckCircle className="text-green-600 shrink-0 mt-0.5" size={18} />
          <div>
            <span className="font-bold text-xs">Carga Exitosa:</span>
            <p className="text-xs mt-0.5">{successMsg}</p>
          </div>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl space-y-2">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
            <div>
              <span className="font-bold text-xs">Discrepancias o errores en archivo de entrada:</span>
              <p className="text-xs mt-0.5 text-red-700">Algunas filas u hojas no pudieron ser mapeadas automáticamente.</p>
            </div>
          </div>
          <div className="max-h-36 overflow-y-auto pl-7 space-y-1 divide-y divide-red-100">
            {parseErrors.map((err, idx) => (
              <div key={idx} className="text-[11px] pt-1 flex justify-between">
                <span>📂 <strong className="font-semibold">{err.fileName}</strong> {err.line ? `(Línea ${err.line})` : ''}: {err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid de Uploads */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Card 1: Canales conectados (los chats ya no se importan) */}
        <div className="metric-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="bg-green-50 text-green-600 p-2.5 rounded-xl border border-green-100">
                <FileText size={20} />
              </span>
              <span className="text-[10px] bg-green-100 font-mono text-green-700 font-bold px-2 py-0.5 rounded">EN VIVO</span>
            </div>
            <h3 className="font-bold text-slate-900 mt-4 text-sm">1. Chats por Webhook</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Los chats de WhatsApp y Telegram ya llegan automáticamente por los canales
              conectados al backend: no hay nada que subir. Cada mensaje crea o actualiza su
              lead al instante.
            </p>

            {/* Alta de reclutadoras (catálogo de agentes) */}
            <div className="mt-4 space-y-2">
              <label className="text-[10px] font-bold text-slate-600 uppercase">Reclutadoras registradas:</label>
              <div className="flex flex-wrap gap-1.5">
                {agents.map((ag) => (
                  <span key={ag} className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-1 rounded-lg">
                    {ag}
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5 mt-2">
                <input
                  type="text"
                  placeholder="Agregar Reclutadora (+)"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg text-[11px] px-2 py-1 focus:ring-1 focus:ring-orange-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleAddAgent()}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Directorio de Operadores */}
        <div className="metric-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="bg-blue-50 text-blue-600 p-2.5 rounded-xl border border-blue-100">
                <FileSpreadsheet size={20} />
              </span>
              <span className="text-[10px] bg-slate-100 font-mono text-slate-500 font-bold px-2 py-0.5 rounded">XLSX o CSV</span>
            </div>
            <h3 className="font-bold text-slate-900 mt-4 text-sm">2. Directorio de Operadores</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Sube el excel de operadores ingresados de RH para la atribución de llamadas automática.
            </p>
            <div className="mt-4 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[10px] text-slate-600 font-mono space-y-1">
              <div className="font-bold text-slate-700 uppercase">Columnas esperadas:</div>
              <div>Empresa | # Emp | Nombre | Fecha Ingreso | Estatus | Celular Empresa | Celular Personal</div>
            </div>
          </div>

          <div className="mt-6">
            <label className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/20 transition-all rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer">
              <Upload className="text-slate-400 mb-2" size={24} />
              <span className="text-xs font-semibold text-slate-700">Subir Directorio</span>
              <span className="text-[10px] text-slate-400 mt-1">Suelte .xlsx o .csv</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleOperatorsUpload}
                disabled={loading !== null}
                className="hidden"
              />
            </label>
            {loading === 'operators' && <span className="text-[10px] font-mono text-blue-500 animate-pulse mt-1 block">Parseando plantilla de operadores...</span>}
          </div>
        </div>

        {/* Card 3: Campañas de Marketing */}
        <div className="metric-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="bg-purple-50 text-purple-600 p-2.5 rounded-xl border border-purple-100">
                <Megaphone size={20} />
              </span>
              <span className="text-[10px] bg-slate-100 font-mono text-slate-500 font-bold px-2 py-0.5 rounded">Formulario / CSV</span>
            </div>
            <h3 className="font-bold text-slate-900 mt-4 text-sm">3. Campañas de Marketing</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Registra los presupuestos invertidos en anuncios por semana para calcular el Costo por Lead.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowCampaignForm(true)}
                className="flex-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/50 rounded-xl px-3 py-2 text-xs font-semibold transition"
              >
                + Capturar Manual
              </button>
            </div>
          </div>

          <div className="mt-6">
            <label className="border-2 border-dashed border-slate-200 hover:border-purple-400 bg-slate-50 hover:bg-purple-50/20 transition-all rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer">
              <Upload className="text-slate-400 mb-2" size={24} />
              <span className="text-xs font-semibold text-slate-700">Subir Campañas</span>
              <span className="text-[10px] text-slate-400 mt-1">Suelte CSV de campañas</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleCampaignsUpload}
                disabled={loading !== null}
                className="hidden"
              />
            </label>
            {loading === 'campaigns' && <span className="text-[10px] font-mono text-purple-500 animate-pulse mt-1 block">Importando presupuestos...</span>}
          </div>
        </div>

        {/* Card 5: Pautas de Meta (xlsx exportado de Ads Manager, una hoja por reclutadora) */}
        <div className="metric-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="bg-sky-50 text-sky-600 p-2.5 rounded-xl border border-sky-100">
                <BarChart3 size={20} />
              </span>
              <span className="text-[10px] bg-slate-100 font-mono text-slate-500 font-bold px-2 py-0.5 rounded">XLSX de Meta</span>
            </div>
            <h3 className="font-bold text-slate-900 mt-4 text-sm">5. Pautas de Meta Ads</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Export de Ads Manager (una hoja por reclutadora). Carga gasto, leads reportados y
              rango de fechas por campaña, ligados a su agente para cruzar con los leads reales.
            </p>
            <div className="mt-4 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[10px] text-slate-600 font-mono space-y-1">
              <div className="font-bold text-slate-700 uppercase">Columnas usadas:</div>
              <div>Nombre · Inicio/Fin informe · Importe gastado (USD) · Contactos de mensajes</div>
            </div>
          </div>

          <div className="mt-6">
            <label className="border-2 border-dashed border-slate-200 hover:border-sky-400 bg-slate-50 hover:bg-sky-50/20 transition-all rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer">
              <Upload className="text-slate-400 mb-2" size={24} />
              <span className="text-xs font-semibold text-slate-700">Subir pautas</span>
              <span className="text-[10px] text-slate-400 mt-1">Suelte el .xlsx de Meta</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => void handleMetaPautasUpload(e)}
                disabled={loading !== null}
                className="hidden"
              />
            </label>
            {loading === 'meta-pautas' && (
              <span className="text-[10px] font-mono text-sky-600 animate-pulse mt-1 block">
                Importando pautas de Meta…
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Secciones de Configuración Adicional y Formularios Manuales */}
      <div className="metric-card p-6 space-y-6">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Sliders className="text-orange-500" size={18} />
          Parámetros Manuales y Catálogos Operativos
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={() => setShowVacancyForm(true)}
            className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100/50 text-left transition flex items-center justify-between"
          >
            <div>
              <div className="font-bold text-xs text-slate-800">Catálogo de Vacantes (Cupos)</div>
              <div className="text-[10px] text-slate-500 mt-1">{vacancies.length} vacantes activas de operadores</div>
            </div>
            <Plus className="text-slate-400" size={18} />
          </button>

          <button
            onClick={() => setShowFleetForm(true)}
            className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100/50 text-left transition flex items-center justify-between"
          >
            <div>
              <div className="font-bold text-xs text-slate-800">Flota y Capacidad</div>
              <div className="text-[10px] text-slate-500 mt-1">Tractos activos, servicios e inventario</div>
            </div>
            <Plus className="text-slate-400" size={18} />
          </button>

          <button
            onClick={() => setShowGoalForm(true)}
            className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100/50 text-left transition flex items-center justify-between"
          >
            <div>
              <div className="font-bold text-xs text-slate-800">Metas de Contratación</div>
              <div className="text-[10px] text-slate-500 mt-1">Metas mensuales por empresa o tipo</div>
            </div>
            <Plus className="text-slate-400" size={18} />
          </button>
        </div>

      </div>

      {/* Formulario Manual de Campañas (Modal/Inline Drawer) */}
      {showCampaignForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900">Registrar Campaña de Marketing</h3>
              <button onClick={() => setShowCampaignForm(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveCampaignManual} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase">Nombre de la Campaña:</label>
                <input
                  type="text"
                  required
                  value={campaignForm.campaignName}
                  onChange={(e) => setCampaignForm({ ...campaignForm, campaignName: e.target.value })}
                  placeholder="FB_Operador_Sencillo_Mty"
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Fecha Inicio:</label>
                  <input
                    type="date"
                    required
                    value={campaignForm.startDate}
                    onChange={(e) => setCampaignForm({ ...campaignForm, startDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Fecha Fin:</label>
                  <input
                    type="date"
                    required
                    value={campaignForm.endDate}
                    onChange={(e) => setCampaignForm({ ...campaignForm, endDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Presupuesto (MXN):</label>
                  <input
                    type="number"
                    required
                    value={campaignForm.spend}
                    onChange={(e) => setCampaignForm({ ...campaignForm, spend: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Leads Reportados (Marketing):</label>
                  <input
                    type="number"
                    required
                    value={campaignForm.leadsReported}
                    onChange={(e) => setCampaignForm({ ...campaignForm, leadsReported: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Clicks (Opcional):</label>
                  <input
                    type="number"
                    value={campaignForm.clicks}
                    onChange={(e) => setCampaignForm({ ...campaignForm, clicks: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Modalidad:</label>
                  <select
                    value={campaignForm.type}
                    onChange={(e) => setCampaignForm({ ...campaignForm, type: e.target.value as any })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50"
                  >
                    <option value="Local">Local</option>
                    <option value="Foráneo">Foráneo</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Agente Destino:</label>
                  <select
                    value={campaignForm.targetAgent}
                    onChange={(e) => setCampaignForm({ ...campaignForm, targetAgent: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50"
                  >
                    {agents.map(ag => (
                      <option key={ag} value={ag}>{ag}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Asociar Vacante:</label>
                  <select
                    value={campaignForm.vacanteId}
                    onChange={(e) => setCampaignForm({ ...campaignForm, vacanteId: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50"
                  >
                    {vacancies.map(v => (
                      <option key={v.id} value={v.id}>{v.circuit} ({v.type})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCampaignForm(false)}
                  className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2.5 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2.5 text-xs font-semibold"
                >
                  Guardar Campaña
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Formulario Manual de Vacantes */}
      {showVacancyForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900">Agregar Vacante al Catálogo</h3>
              <button onClick={() => setShowVacancyForm(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveVacancyManual} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase">Tipo de Operador:</label>
                <select
                  value={vacancyForm.type}
                  onChange={(e) => setVacancyForm({ ...vacancyForm, type: e.target.value as any })}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50"
                >
                  <option value="Sencillo">Sencillo</option>
                  <option value="Full">Full</option>
                  <option value="5ta Rueda">5ta Rueda / Tráiler Sencillo</option>
                  <option value="Escuelita">Escuelita (Academia)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase">Circuito / Ruta:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tramo Torreón-Laredo, Clarios"
                  value={vacancyForm.circuit}
                  onChange={(e) => setVacancyForm({ ...vacancyForm, circuit: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Modalidad:</label>
                  <select
                    value={vacancyForm.modality}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, modality: e.target.value as any })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50"
                  >
                    <option value="Local">Local</option>
                    <option value="Foráneo">Foráneo</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Empresa de la Flota:</label>
                  <select
                    value={vacancyForm.company}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, company: e.target.value as any })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50"
                  >
                    <option value="Transmontes">Transmontes</option>
                    <option value="TM Transportation">TM Transportation</option>
                    <option value="TM Transfer">TM Transfer</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Cupo (Plazas Requeridas):</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={vacancyForm.quota}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, quota: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Estatus Inicial:</label>
                  <select
                    value={vacancyForm.status}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, status: e.target.value as any })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50"
                  >
                    <option value="Abierta">Abierta</option>
                    <option value="Pausada">Pausada</option>
                    <option value="Cerrada">Cerrada</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowVacancyForm(false)}
                  className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2.5 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2.5 text-xs font-semibold"
                >
                  Crear Vacante
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Formulario de Flota */}
      {showFleetForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900">Editar Capacidad de Flota</h3>
              <button onClick={() => setShowFleetForm(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveFleetManual} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase">Seleccione Empresa:</label>
                <select
                  value={fleetForm.company}
                  onChange={(e) => setFleetForm({ ...fleetForm, company: e.target.value as any })}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50"
                >
                  <option value="Transmontes">Transmontes</option>
                  <option value="TM Transportation">TM Transportation</option>
                  <option value="TM Transfer">TM Transfer</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Tractos Totales:</label>
                  <input
                    type="number"
                    required
                    value={fleetForm.tractosTotales}
                    onChange={(e) => setFleetForm({ ...fleetForm, tractosTotales: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Tractos en Servicio:</label>
                  <input
                    type="number"
                    required
                    value={fleetForm.tractosEnServicio}
                    onChange={(e) => setFleetForm({ ...fleetForm, tractosEnServicio: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Tractos sin Operador (Déficit):</label>
                  <input
                    type="number"
                    required
                    value={fleetForm.tractosSinOperador}
                    onChange={(e) => setFleetForm({ ...fleetForm, tractosSinOperador: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Servicios Activos:</label>
                  <input
                    type="number"
                    required
                    value={fleetForm.serviciosActivos}
                    onChange={(e) => setFleetForm({ ...fleetForm, serviciosActivos: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowFleetForm(false)}
                  className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2.5 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2.5 text-xs font-semibold"
                >
                  Actualizar Capacidad
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Formulario de Metas */}
      {showGoalForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900">Configurar Meta Mensual</h3>
              <button onClick={() => setShowGoalForm(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveGoalManual} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase">Empresa:</label>
                <select
                  value={goalForm.company}
                  onChange={(e) => setGoalForm({ ...goalForm, company: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50"
                >
                  <option value="Transmontes">Transmontes</option>
                  <option value="TM Transportation">TM Transportation</option>
                  <option value="TM Transfer">TM Transfer</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase">Tipo de Vacante:</label>
                <select
                  value={goalForm.vacanteType}
                  onChange={(e) => setGoalForm({ ...goalForm, vacanteType: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50"
                >
                  <option value="Sencillo">Sencillo</option>
                  <option value="Full">Full</option>
                  <option value="5ta Rueda">5ta Rueda / Tráiler Sencillo</option>
                  <option value="Escuelita">Escuelita (Academia)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase">Meta de Operadores Contratados:</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={goalForm.monthlyTarget}
                  onChange={(e) => setGoalForm({ ...goalForm, monthlyTarget: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowGoalForm(false)}
                  className="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2.5 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg py-2.5 text-xs font-semibold"
                >
                  Guardar Meta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visualización de Previsualización de los datos */}
      {(operatorPreview.length > 0 || campaignPreview.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <FolderOpen className="text-orange-500" size={18} />
            Vista Previa de Datos Cargados (Últimos archivos - Primeras 10 filas)
          </h3>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            {operatorPreview.length > 0 && (
              <div className="p-4 space-y-2 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-700">Operadores de Nómina</div>
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                      <th className="p-2"># Emp</th>
                      <th className="p-2">Nombre Completo</th>
                      <th className="p-2">Empresa</th>
                      <th className="p-2">Fecha Ingreso</th>
                      <th className="p-2">Celular Personal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operatorPreview.map((op, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2 font-mono font-bold">{op.empNo}</td>
                        <td className="p-2">{op.name}</td>
                        <td className="p-2">{op.company}</td>
                        <td className="p-2">{op.hireDate}</td>
                        <td className="p-2 font-mono">{op.personalCell || op.companyCell}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
