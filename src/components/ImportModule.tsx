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
  RefreshCw
} from 'lucide-react';
import {
  ChatLead,
  Operator,
  MarketingCampaign,
  FleetData,
  MonthlyGoal,
  JobVacancy,
  WorkScheduleSettings,
  AppDatabaseBackup
} from '../types';
import {
  extractWhatsAppChats,
  parseOperatorsDirectory,
  parseCampaignsCSV,
  FileParseError
} from '../utils/fileParsers';
import { normalizePhone } from '../utils/whatsappParser';

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
  onBackupRestore: (backup: AppDatabaseBackup) => Promise<void>;
  onExportAll: () => void;
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
  onBackupRestore,
  onExportAll
}: ImportModuleProps) {
  // Estado local para los formularios e inputs de archivo
  const [selectedAgent, setSelectedAgent] = useState<string>('Adriana');
  const [newAgentName, setNewAgentName] = useState<string>('');
  const [accumulateMode, setAccumulateMode] = useState<boolean>(true);

  // Estados de carga de archivos
  const [loading, setLoading] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<FileParseError[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Previsualizaciones locales de archivos cargados
  const [whatsappPreview, setWhatsappPreview] = useState<ChatLead[]>([]);
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
  const handleAddAgent = () => {
    const trimmed = newAgentName.trim();
    if (trimmed && !agents.includes(trimmed)) {
      setAgents([...agents, trimmed]);
      setSelectedAgent(trimmed);
      setNewAgentName('');
    }
  };

  const handleBackupUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text) as AppDatabaseBackup;
      await onBackupRestore(backup);
      setSuccessMsg('¡Respaldo importado y restaurado en IndexedDB correctamente!');
      setParseErrors([]);
    } catch (err: any) {
      setParseErrors([{ fileName: file.name, message: `El archivo JSON de respaldo no es válido: ${err.message}` }]);
    }
  };

  // Importar Chats de WhatsApp (ZIP / TXT)
  const handleWhatsAppUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading('whatsapp');
    setParseErrors([]);
    setSuccessMsg(null);
    setWhatsappPreview([]);

    let aggregatedLeads: ChatLead[] = [];
    let aggregatedErrors: FileParseError[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result = await extractWhatsAppChats(file, selectedAgent, settings);
      aggregatedLeads = [...aggregatedLeads, ...result.leads];
      aggregatedErrors = [...aggregatedErrors, ...result.errors];
    }

    if (aggregatedLeads.length > 0) {
      // Deduplicación e Integración
      const mergedLeads = [...whatsappPreview];
      
      setWhatsappPreview(aggregatedLeads.slice(0, 10));

      if (accumulateMode) {
        // Acumular: dedupe por phone + agent. Si existe, combinamos mensajes y recalculamos.
        // O más fácil: si ya existe por teléfono, mantenemos estatus previo y combinamos mensajes
        const existingLeadsMap = new Map<string, ChatLead>();
        // Primero cargamos de la base de datos de leads existentes
        const currentLeads = await import('../db').then(m => m.getAllFromStore<ChatLead>('leads'));
        currentLeads.forEach(lead => existingLeadsMap.set(lead.phone, lead));

        aggregatedLeads.forEach((newLead) => {
          const key = newLead.phone;
          if (existingLeadsMap.has(key)) {
            // Unir mensajes, ordenar por fecha, mantener el estatus manual previo si existía
            const oldLead = existingLeadsMap.get(key)!;
            const allMessagesMap = new Map<string, any>();
            oldLead.messages.forEach(m => allMessagesMap.set(`${m.timestamp}_${m.sender}`, m));
            newLead.messages.forEach(m => allMessagesMap.set(`${m.timestamp}_${m.sender}`, m));
            const mergedMsgs = Array.from(allMessagesMap.values()).sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );

            // Re-calcular con el set unificado
            const firstCandMsg = mergedMsgs.find(m => !m.isAgent);
            const firstAgentMsg = firstCandMsg ? mergedMsgs.find((m, i) => m.isAgent && i > mergedMsgs.indexOf(firstCandMsg)) : null;
            const responded = !!firstAgentMsg;
            let naturalMinutes: number | null = null;
            let workMinutes: number | null = null;

            if (firstCandMsg && firstAgentMsg) {
              const candDate = new Date(firstCandMsg.timestamp);
              const agentDate = new Date(firstAgentMsg.timestamp);
              naturalMinutes = Math.max(0, Math.round((agentDate.getTime() - candDate.getTime()) / 60000));
              const { calculateWorkMinutes } = require('../utils/whatsappParser');
              workMinutes = calculateWorkMinutes(candDate, agentDate, settings);
            }

            existingLeadsMap.set(key, {
              ...oldLead,
              messages: mergedMsgs,
              lastContactDate: mergedMsgs[mergedMsgs.length - 1].timestamp,
              responded,
              firstResponseMinutesNatural: naturalMinutes,
              firstResponseMinutesWork: workMinutes,
              // Conservamos estatus previo
              status: oldLead.status,
              notes: oldLead.notes || newLead.notes,
              matchedOperatorId: oldLead.matchedOperatorId || newLead.matchedOperatorId,
            });
          } else {
            existingLeadsMap.set(key, newLead);
          }
        });

        // Guardar de vuelta
        const finalLeads = Array.from(existingLeadsMap.values());
        await import('../db').then(m => m.saveToStoreBulk('leads', finalLeads));
      } else {
        // Reemplazar todo con lo cargado en IndexedDB
        await import('../db').then(m => m.clearStore('leads'));
        await import('../db').then(m => m.saveToStoreBulk('leads', aggregatedLeads));
      }

      setSuccessMsg(`Se procesaron ${aggregatedLeads.length} leads de WhatsApp correctamente.`);
      await onRefreshAll();
    }

    if (aggregatedErrors.length > 0) {
      setParseErrors(aggregatedErrors);
    }

    setLoading(null);
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

      if (accumulateMode) {
        const currentOperators = await import('../db').then(m => m.getAllFromStore<Operator>('operators'));
        const opMap = new Map<string, Operator>();
        currentOperators.forEach(op => opMap.set(op.empNo, op));
        result.operators.forEach(op => opMap.set(op.empNo, op));
        await import('../db').then(m => m.saveToStoreBulk('operators', Array.from(opMap.values())));
      } else {
        await import('../db').then(m => m.clearStore('operators'));
        await import('../db').then(m => m.saveToStoreBulk('operators', result.operators));
      }

      setSuccessMsg(`Se cargaron ${result.operators.length} operadores al directorio correctamente.`);
      await onRefreshAll();
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

      if (accumulateMode) {
        const currentCampaigns = await import('../db').then(m => m.getAllFromStore<MarketingCampaign>('campaigns'));
        const campMap = new Map<string, MarketingCampaign>();
        currentCampaigns.forEach(c => campMap.set(c.id, c));
        result.campaigns.forEach(c => campMap.set(c.id, c));
        await import('../db').then(m => m.saveToStoreBulk('campaigns', Array.from(campMap.values())));
      } else {
        await import('../db').then(m => m.clearStore('campaigns'));
        await import('../db').then(m => m.saveToStoreBulk('campaigns', result.campaigns));
      }

      setSuccessMsg(`Se importaron ${result.campaigns.length} campañas de marketing correctamente.`);
      await onRefreshAll();
    }

    if (result.errors.length > 0) {
      setParseErrors(result.errors);
    }
    setLoading(null);
  };

  // Manejo de Guardado Manual de Campaña
  const handleSaveCampaignManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignForm.campaignName) return;

    const startDate = campaignForm.startDate || new Date().toISOString().split('T')[0];
    const newCamp: MarketingCampaign = {
      id: `${campaignForm.campaignName}_${startDate}`.replace(/\s+/g, '_'),
      campaignName: campaignForm.campaignName,
      startDate,
      endDate: campaignForm.endDate || startDate,
      isoWeek: getISOWeek(startDate),
      spend: Number(campaignForm.spend || 0),
      leadsReported: Number(campaignForm.leadsReported || 0),
      targetAgent: campaignForm.targetAgent || 'Adriana',
      type: (campaignForm.type as 'Local' | 'Foráneo') || 'Local',
      vacanteId: campaignForm.vacanteId || 'Sencillo',
      status: (campaignForm.status as 'Activa' | 'Pausada') || 'Activa',
      clicks: Number(campaignForm.clicks || 0),
    };

    await import('../db').then(m => m.saveSingleToStore('campaigns', newCamp));
    setCampaigns([...campaigns.filter(c => c.id !== newCamp.id), newCamp]);
    setSuccessMsg(`Campaña manual "${newCamp.campaignName}" guardada.`);
    setShowCampaignForm(false);
    await onRefreshAll();
  };

  // Guardado de Vacante Manual
  const handleSaveVacancyManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vacancyForm.circuit) return;

    const newVac: JobVacancy = {
      id: `vac_${vacancyForm.type?.toLowerCase()}_${Date.now()}`,
      type: (vacancyForm.type as any) || 'Sencillo',
      circuit: vacancyForm.circuit,
      modality: (vacancyForm.modality as 'Local' | 'Foráneo') || 'Local',
      company: (vacancyForm.company as any) || 'Transmontes',
      quota: Number(vacancyForm.quota || 1),
      status: (vacancyForm.status as any) || 'Abierta',
    };

    await import('../db').then(m => m.saveSingleToStore('vacancies', newVac));
    setVacancies([...vacancies, newVac]);
    setSuccessMsg(`Vacante para circuito "${newVac.circuit}" añadida.`);
    setShowVacancyForm(false);
    await onRefreshAll();
  };

  // Guardado de Flota Manual
  const handleSaveFleetManual = async (e: React.FormEvent) => {
    e.preventDefault();
    await import('../db').then(m => m.saveSingleToStore('fleet', fleetForm));
    setFleet([...fleet.filter(f => f.company !== fleetForm.company), fleetForm]);
    setSuccessMsg(`Capacidad de flota para "${fleetForm.company}" actualizada.`);
    setShowFleetForm(false);
    await onRefreshAll();
  };

  // Guardado de Meta Manual
  const handleSaveGoalManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = `${goalForm.company}_${goalForm.vacanteType}`.toLowerCase().replace(/\s+/g, '_');
    const newGoal: MonthlyGoal = {
      id,
      company: goalForm.company || 'Transmontes',
      vacanteType: goalForm.vacanteType || 'Sencillo',
      monthlyTarget: Number(goalForm.monthlyTarget || 0),
    };

    await import('../db').then(m => m.saveSingleToStore('goals', newGoal));
    setGoals([...goals.filter(g => g.id !== newGoal.id), newGoal]);
    setSuccessMsg(`Meta mensual de contratación para ${newGoal.company} - ${newGoal.vacanteType} guardada.`);
    setShowGoalForm(false);
    await onRefreshAll();
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
            Sube los reportes diarios de WhatsApp de tus reclutadoras, actualiza el padrón de operadores de nómina, o configura metas operativas.
          </p>
        </div>

        {/* Toggle Modo Acumular o Reemplazar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="bg-slate-100 p-1 rounded-xl flex">
            <button
              onClick={() => setAccumulateMode(true)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                accumulateMode
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Acumular cargas (Dedupe)
            </button>
            <button
              onClick={() => setAccumulateMode(false)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                !accumulateMode
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sobrescribir datos
            </button>
          </div>

          <button
            onClick={onExportAll}
            className="border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <Download size={14} />
            Exportar Respaldo
          </button>
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
        
        {/* Card 1: Chats de WhatsApp */}
        <div className="metric-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="bg-orange-50 text-orange-600 p-2.5 rounded-xl border border-orange-100">
                <FileText size={20} />
              </span>
              <span className="text-[10px] bg-slate-100 font-mono text-slate-500 font-bold px-2 py-0.5 rounded">ZIP o TXT</span>
            </div>
            <h3 className="font-bold text-slate-900 mt-4 text-sm">1. Chats de WhatsApp</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Sube el .zip del agente (soporta zip dentro de zip) o archivos .txt. Deduplica por teléfono.
            </p>

            {/* Agente Propietario del lote */}
            <div className="mt-4 space-y-2">
              <label className="text-[10px] font-bold text-slate-600 uppercase">Asignar agente dueño de la carga:</label>
              <div className="flex gap-2">
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg text-xs p-2 bg-slate-50 font-medium focus:ring-1 focus:ring-orange-500 focus:outline-none"
                >
                  {agents.map((ag) => (
                    <option key={ag} value={ag}>
                      {ag}
                    </option>
                  ))}
                </select>
              </div>

              {/* Agregar agente */}
              <div className="flex gap-1.5 mt-2">
                <input
                  type="text"
                  placeholder="Agregar Agente (+)"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg text-[11px] px-2 py-1 focus:ring-1 focus:ring-orange-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddAgent}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <label className="border-2 border-dashed border-slate-200 hover:border-orange-400 bg-slate-50 hover:bg-orange-50/20 transition-all rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer">
              <Upload className="text-slate-400 group-hover:text-orange-500 mb-2" size={24} />
              <span className="text-xs font-semibold text-slate-700">Subir Chats</span>
              <span className="text-[10px] text-slate-400 mt-1">Suelte archivos aquí o haga click</span>
              <input
                type="file"
                multiple
                accept=".txt,.zip"
                onChange={handleWhatsAppUpload}
                disabled={loading !== null}
                className="hidden"
              />
            </label>
            {loading === 'whatsapp' && <span className="text-[10px] font-mono text-orange-500 animate-pulse mt-1 block">Procesando conversaciones...</span>}
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

        {/* Carga de Respaldo Completo */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-bold text-slate-800">Recuperación e importación de respaldo completo</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Si cambias de navegador, importa el archivo JSON descargado previamente para restaurar toda la base de datos.</p>
          </div>
          <label className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-2 transition">
            <Upload size={14} />
            Importar JSON (.json)
            <input type="file" accept=".json" onChange={handleBackupUpload} className="hidden" />
          </label>
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
      {(whatsappPreview.length > 0 || operatorPreview.length > 0 || campaignPreview.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <FolderOpen className="text-orange-500" size={18} />
            Vista Previa de Datos Cargados (Últimos archivos - Primeras 10 filas)
          </h3>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            {whatsappPreview.length > 0 && (
              <div className="p-4 space-y-2">
                <div className="text-xs font-bold text-slate-700">Chats de WhatsApp ({selectedAgent})</div>
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                      <th className="p-2">Teléfono</th>
                      <th className="p-2">Fecha Entrada</th>
                      <th className="p-2">Origen</th>
                      <th className="p-2">¿Respondió?</th>
                      <th className="p-2">Clasificación</th>
                      <th className="p-2">Vacante Det.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whatsappPreview.map((lead, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2 font-mono">{lead.phone}</td>
                        <td className="p-2">{new Date(lead.firstMessageDate).toLocaleString()}</td>
                        <td className="p-2 font-semibold text-blue-600">{lead.origin}</td>
                        <td className="p-2">{lead.responded ? 'Sí' : 'No'}</td>
                        <td className="p-2">{lead.classification}</td>
                        <td className="p-2 text-orange-600 font-semibold">{lead.detectedVacante}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

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
