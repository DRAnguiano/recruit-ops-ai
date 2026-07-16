/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  GitCompare,
  Target,
  Megaphone,
  CalendarDays,
  Database,
  Search,
  Filter,
  Calendar,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  UserPlus,
  MessageSquare,
  CheckCircle2,
  HelpCircle,
  TrendingDown,
  Activity,
  FileSpreadsheet,
  FileDown,
  Percent
} from 'lucide-react';

// Subcomponentes modularizados
import Sidebar from './components/Sidebar';
import KPICard from './components/KPICard';
import CampaignsView from './components/CampaignsView';
import CoverageView from './components/CoverageView';
import ImportModule from './components/ImportModule';

// Tipos y DB
import { ChatLead, Operator, MarketingCampaign, FleetData, MonthlyGoal, JobVacancy, WorkScheduleSettings, AppDatabaseBackup } from './types';
import { getAllFromStore, saveToStoreBulk, clearStore, saveSettings, getSettings, saveSingleToStore, openDB } from './db';
import { normalizePhone } from './utils/whatsappParser';

// Datos predeterminados para seeding de prueba
import {
  DEFAULT_VACANCIES,
  DEFAULT_FLEET,
  DEFAULT_GOALS,
  DEFAULT_SETTINGS,
  DEFAULT_OPERATORS,
  DEFAULT_CAMPAIGNS,
  DEFAULT_LEADS
} from './utils/defaultData';

// Librería de gráficos
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';

export default function App() {
  // Estado centralizado de la app
  const [activeTab, setActiveTab] = useState<string>('funnel');
  const [leads, setLeads] = useState<ChatLead[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [fleet, setFleet] = useState<FleetData[]>([]);
  const [goals, setGoals] = useState<MonthlyGoal[]>([]);
  const [vacancies, setVacancies] = useState<JobVacancy[]>([]);
  const [settings, setSettings] = useState<WorkScheduleSettings>(DEFAULT_SETTINGS);
  const [agents, setAgents] = useState<string[]>(['Adriana', 'Damaris', 'Gladys', 'Hernán']);

  // Rangos de fecha predeterminados (Mes de Julio 2026 para coincidir con la pauta precargada)
  const [startDate, setStartDate] = useState<string>('2026-07-01');
  const [endDate, setEndDate] = useState<string>('2026-07-15');

  // Estados de filtrado local para Leads CRM
  const [leadSearch, setLeadSearch] = useState('');
  const [leadAgentFilter, setLeadAgentFilter] = useState('All');
  const [leadStatusFilter, setLeadStatusFilter] = useState('All');
  const [leadClassFilter, setLeadClassFilter] = useState('All');

  // Estado para visor de chat interactivo de WhatsApp
  const [activeChatLead, setActiveChatLead] = useState<ChatLead | null>(null);

  // Estados para vinculación manual de atribución
  const [manualMatchLeadPhone, setManualMatchLeadPhone] = useState<string>('');
  const [manualMatchOperatorId, setManualMatchOperatorId] = useState<string>('');
  const [attributionStatusMsg, setAttributionStatusMsg] = useState<string | null>(null);

  // Cargar datos en el inicio
  useEffect(() => {
    async function initAndLoad() {
      // Intentar abrir IndexedDB y verificar si hay datos
      const db = await openDB();
      
      const currentLeads = await getAllFromStore<ChatLead>('leads');
      const currentOperators = await getAllFromStore<Operator>('operators');

      if (currentLeads.length === 0 && currentOperators.length === 0) {
        // Sembrar base de datos si está completamente vacía
        console.log('Sembrando IndexedDB con datos por defecto de Transmontes...');
        await saveToStoreBulk('leads', DEFAULT_LEADS);
        await saveToStoreBulk('operators', DEFAULT_OPERATORS);
        await saveToStoreBulk('campaigns', DEFAULT_CAMPAIGNS);
        await saveToStoreBulk('fleet', DEFAULT_FLEET);
        await saveToStoreBulk('goals', DEFAULT_GOALS);
        await saveToStoreBulk('vacancies', DEFAULT_VACANCIES);
        await saveSettings(DEFAULT_SETTINGS);
      }

      await loadAllFromDB();
    }
    initAndLoad();
  }, []);

  const loadAllFromDB = async () => {
    try {
      const dbLeads = await getAllFromStore<ChatLead>('leads');
      const dbOperators = await getAllFromStore<Operator>('operators');
      const dbCampaigns = await getAllFromStore<MarketingCampaign>('campaigns');
      const dbFleet = await getAllFromStore<FleetData>('fleet');
      const dbGoals = await getAllFromStore<MonthlyGoal>('goals');
      const dbVacancies = await getAllFromStore<JobVacancy>('vacancies');
      const dbSettings = await getSettings();

      setLeads(dbLeads);
      setOperators(dbOperators);
      setCampaigns(dbCampaigns);
      setFleet(dbFleet);
      setGoals(dbGoals);
      setVacancies(dbVacancies);
      setSettings(dbSettings);

      // Cargar nombres de agentes únicos detectados
      const uniqueAgents = Array.from(new Set([
        ...dbLeads.map(l => l.agent),
        'Adriana', 'Damaris', 'Gladys', 'Hernán'
      ]));
      setAgents(uniqueAgents);
    } catch (err) {
      console.error('Error al leer de la IndexedDB:', err);
    }
  };

  // Manejo de actualización tras uploads o formulario manual
  const handleRefreshAll = async () => {
    await loadAllFromDB();
  };

  // Guardar configuración global de shift
  const handleSaveSettings = async (newSettings: WorkScheduleSettings) => {
    await saveSettings(newSettings);
    setSettings(newSettings);
    // Recalcular leads existentes en base al nuevo shift
    const updatedLeads = leads.map(lead => {
      const arrDate = new Date(lead.firstMessageDate);
      
      // Encontrar primer mensaje de agente
      const firstAgentMsg = lead.messages.find(m => m.isAgent);
      let workMinutes: number | null = null;
      if (firstAgentMsg) {
        const { calculateWorkMinutes } = require('./utils/whatsappParser');
        workMinutes = calculateWorkMinutes(arrDate, new Date(firstAgentMsg.timestamp), newSettings);
      }

      const { isWithinWorkHours } = require('./utils/whatsappParser');
      const inWorkHours = isWithinWorkHours(arrDate, newSettings);

      return {
        ...lead,
        inWorkHours,
        firstResponseMinutesWork: workMinutes
      };
    });

    await saveToStoreBulk('leads', updatedLeads);
    setLeads(updatedLeads);
  };

  // Cambio de estatus manual en Leads (CRM)
  const handleLeadStatusChange = async (phone: string, newStatus: any) => {
    const updated = leads.map(l => l.phone === phone ? { ...l, status: newStatus } : l);
    setLeads(updated);
    const target = updated.find(l => l.phone === phone);
    if (target) {
      await saveSingleToStore('leads', target);
    }
  };

  // Cambio de notas en Leads (CRM)
  const handleLeadNotesChange = async (phone: string, notes: string) => {
    const updated = leads.map(l => l.phone === phone ? { ...l, notes } : l);
    setLeads(updated);
    const target = updated.find(l => l.phone === phone);
    if (target) {
      await saveSingleToStore('leads', target);
    }
  };

  // Solicitar pausa de campaña a Marketing
  const handleRequestPause = async (campaignId: string) => {
    const timeISO = new Date().toISOString();
    const updated = campaigns.map(c => c.id === campaignId ? { ...c, pauseRequested: timeISO, status: 'Pausada' as const } : c);
    setCampaigns(updated);
    const target = updated.find(c => c.id === campaignId);
    if (target) {
      await saveSingleToStore('campaigns', target);
    }
  };

  // Cambiar estatus de campaña manual
  const handleToggleCampaignStatus = async (campaignId: string) => {
    const updated = campaigns.map(c => c.id === campaignId ? { ...c, status: c.status === 'Activa' ? 'Pausada' as const : 'Activa' as const } : c);
    setCampaigns(updated);
    const target = updated.find(c => c.id === campaignId);
    if (target) {
      await saveSingleToStore('campaigns', target);
    }
  };

  // Atribución Manual de Lead a Operador
  const handleManualMatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualMatchLeadPhone || !manualMatchOperatorId) {
      setAttributionStatusMsg('Por favor seleccione ambos campos para realizar la vinculación.');
      return;
    }

    const updatedLeads = leads.map(l => l.phone === manualMatchLeadPhone ? { ...l, matchedOperatorId: manualMatchOperatorId, status: 'Contratado' as const } : l);
    setLeads(updatedLeads);

    const targetLead = updatedLeads.find(l => l.phone === manualMatchLeadPhone);
    if (targetLead) {
      await saveSingleToStore('leads', targetLead);
      setAttributionStatusMsg('¡Atribución manual vinculada con éxito!');
      setManualMatchLeadPhone('');
      setManualMatchOperatorId('');
      setTimeout(() => setAttributionStatusMsg(null), 3000);
    }
  };

  // Borrar vinculación de atribución
  const handleRemoveMatch = async (phone: string) => {
    const updatedLeads = leads.map(l => l.phone === phone ? { ...l, matchedOperatorId: null } : l);
    setLeads(updatedLeads);
    const targetLead = updatedLeads.find(l => l.phone === phone);
    if (targetLead) {
      await saveSingleToStore('leads', targetLead);
    }
  };

  // Restaurar respaldo completo desde archivo JSON externo
  const handleBackupRestore = async (backup: AppDatabaseBackup) => {
    // Vaciar e inyectar
    await clearStore('leads');
    await clearStore('operators');
    await clearStore('campaigns');
    await clearStore('fleet');
    await clearStore('goals');
    await clearStore('vacancies');

    if (backup.leads) await saveToStoreBulk('leads', backup.leads);
    if (backup.operators) await saveToStoreBulk('operators', backup.operators);
    if (backup.campaigns) await saveToStoreBulk('campaigns', backup.campaigns);
    if (backup.fleet) await saveToStoreBulk('fleet', backup.fleet);
    if (backup.goals) await saveToStoreBulk('goals', backup.goals);
    if (backup.vacancies) await saveToStoreBulk('vacancies', backup.vacancies);
    if (backup.settings) await saveSettings(backup.settings);

    await loadAllFromDB();
  };

  // Descargar todo el IndexedDB en un JSON
  const handleExportAll = () => {
    const backup: AppDatabaseBackup = {
      leads,
      operators,
      campaigns,
      fleet,
      goals,
      vacancies,
      settings
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `TorreControl_Respaldo_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Exportar cualquier matriz de datos en un CSV
  const exportToCSV = (headers: string[], rows: string[][], fileName: string) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // ================= FILTRADO DE FECHAS EN FUNNEL DE LA SEMANA =================
  const filterLeadsByDate = (targetLeads: ChatLead[]) => {
    return targetLeads.filter(l => {
      const dateOnly = l.firstMessageDate.split('T')[0];
      return dateOnly >= startDate && dateOnly <= endDate;
    });
  };

  const filteredLeadsForPeriod = filterLeadsByDate(leads);

  // ================= PROCESAMIENTO MÓDULO: FUNNEL DE LA SEMANA =================
  const totalLeadsFB = filteredLeadsForPeriod.filter(l => l.origin === 'Facebook').length;
  const respondedLeads = filteredLeadsForPeriod.filter(l => l.responded);
  const pctResponded = filteredLeadsForPeriod.length > 0 
    ? (respondedLeads.length / filteredLeadsForPeriod.length) * 100 
    : 0;

  // Mediana de tiempo de primera respuesta (HÁBIL)
  const computeMedianResponseTime = (targetLeads: ChatLead[]) => {
    const times = targetLeads
      .filter(l => l.responded && l.firstResponseMinutesWork !== null)
      .map(l => l.firstResponseMinutesWork as number);
    
    if (times.length === 0) return 0;
    times.sort((a, b) => a - b);
    const mid = Math.floor(times.length / 2);
    return times.length % 2 !== 0 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  };

  const medianResponseTimeWork = computeMedianResponseTime(filteredLeadsForPeriod);
  const realConversations = filteredLeadsForPeriod.filter(l => l.isConversationReal).length;
  const hiringCount = filteredLeadsForPeriod.filter(l => l.status === 'Contratado').length;
  const estimatedConversion = filteredLeadsForPeriod.length > 0 
    ? (hiringCount / filteredLeadsForPeriod.length) * 100 
    : 0;

  // Tabla comparativa por agentes
  const agentComparisonData = agents.map(agentName => {
    const agentLeads = filteredLeadsForPeriod.filter(l => l.agent.toLowerCase() === agentName.toLowerCase());
    const agentResponded = agentLeads.filter(l => l.responded);
    const responsePct = agentLeads.length > 0 ? (agentResponded.length / agentLeads.length) * 100 : 0;
    const medianTime = computeMedianResponseTime(agentLeads);
    const realConv = agentLeads.filter(l => l.isConversationReal).length;
    const hires = agentLeads.filter(l => l.status === 'Contratado').length;
    const conversion = agentLeads.length > 0 ? (hires / agentLeads.length) * 100 : 0;

    return {
      agent: agentName,
      assigned: agentLeads.length,
      responded: agentResponded.length,
      responsePct,
      medianResponseTime: medianTime,
      realConversations: realConv,
      hires,
      conversionPct: conversion
    };
  });

  // Gráfica de barras de leads apiladas por día
  const getStackedBarChartData = () => {
    // Generar mapeo de días en el periodo
    const dataMap: { [key: string]: { [agent: string]: number } } = {};
    const dStart = new Date(startDate);
    const dEnd = new Date(endDate);
    
    for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
      const isoString = d.toISOString().split('T')[0];
      dataMap[isoString] = {};
      agents.forEach(a => {
        dataMap[isoString][a] = 0;
      });
    }

    filteredLeadsForPeriod.forEach(lead => {
      const dayStr = lead.firstMessageDate.split('T')[0];
      if (dataMap[dayStr]) {
        dataMap[dayStr][lead.agent] = (dataMap[dayStr][lead.agent] || 0) + 1;
      }
    });

    return Object.keys(dataMap).map(dateStr => {
      // Simplificar fecha a formato DD/MM
      const parts = dateStr.split('-');
      const formattedDate = `${parts[2]}/${parts[1]}`;
      return {
        date: formattedDate,
        ...dataMap[dateStr]
      };
    });
  };

  const barChartData = getStackedBarChartData();

  // Colores para apilar agentes
  const agentColors = ['#0f172a', '#f97316', '#3b82f6', '#10b981', '#a855f7', '#ec4899'];

  // ================= PROCESAMIENTO MÓDULO: LEADS CRM =================
  const filteredCRMLeads = leads.filter(l => {
    const searchMatch =
      l.phone.includes(leadSearch) ||
      l.agent.toLowerCase().includes(leadSearch.toLowerCase()) ||
      l.notes.toLowerCase().includes(leadSearch.toLowerCase()) ||
      (l.detectedVacante || '').toLowerCase().includes(leadSearch.toLowerCase());

    const agentMatch = leadAgentFilter === 'All' || l.agent.toLowerCase() === leadAgentFilter.toLowerCase();
    const statusMatch = leadStatusFilter === 'All' || l.status.toLowerCase() === leadStatusFilter.toLowerCase();
    const classMatch = leadClassFilter === 'All' || l.classification.toLowerCase() === leadClassFilter.toLowerCase();

    return searchMatch && agentMatch && statusMatch && classMatch;
  });

  // Pipeline activo: En proceso o Documentos, ordenados por días inactivos de manera descendente
  const activePipelineLeads = leads
    .filter(l => l.status === 'En proceso' || l.status === 'Documentos')
    .map(l => {
      const diffMs = new Date().getTime() - new Date(l.lastContactDate).getTime();
      const daysInactive = Math.round(diffMs / 86400000);
      return { ...l, daysInactive };
    })
    .sort((a, b) => b.daysInactive - a.daysInactive);

  // ================= PROCESAMIENTO MÓDULO: ATRIBUCIÓN =================
  // Cruze automático por los tres campos de teléfono del directorio
  const automaticAttributionList = () => {
    const list: Array<{
      lead: ChatLead;
      op: Operator;
      sourceField: string;
      cycleDays: number;
    }> = [];

    leads.forEach(lead => {
      // Buscar match
      const matchedOp = operators.find(op => 
        op.normalizedPhones.includes(lead.phone) || 
        lead.matchedOperatorId === op.empNo
      );

      if (matchedOp) {
        let sourceField = 'Celular Coincidente';
        if (matchedOp.companyCell && normalizePhone(matchedOp.companyCell) === lead.phone) sourceField = 'Celular Empresa';
        else if (matchedOp.personalCell && normalizePhone(matchedOp.personalCell) === lead.phone) sourceField = 'Celular Personal';
        else if (matchedOp.partnerCell && normalizePhone(matchedOp.partnerCell) === lead.phone) sourceField = 'Celular Pareja';
        else if (lead.matchedOperatorId === matchedOp.empNo) sourceField = 'Enlace Manual';

        const chatDate = new Date(lead.firstMessageDate);
        const hireDate = new Date(matchedOp.hireDate);
        const cycleDays = Math.max(0, Math.round((hireDate.getTime() - chatDate.getTime()) / 86400000));

        list.push({
          lead,
          op: matchedOp,
          sourceField,
          cycleDays
        });
      }
    });

    return list;
  };

  const matchedHires = automaticAttributionList();
  
  // Ciclo promedio lead -> ingreso en días
  const avgCycleDays = matchedHires.length > 0
    ? matchedHires.reduce((acc, curr) => acc + curr.cycleDays, 0) / matchedHires.length
    : 0;

  // Línea de tiempo de contrataciones acumuladas por semana
  const getWeeklyHiresChartData = () => {
    // Agrupar contrataciones por semana ISO de ingreso
    const weekMap: { [key: string]: number } = {};
    
    // Inicializar semanas del último mes
    const currentYear = 2026;
    for (let w = 25; w <= 30; w++) {
      weekMap[`${currentYear}-W${w}`] = 0;
    }

    operators.forEach(op => {
      if (op.status === 'Activo') {
        const dateObj = new Date(op.hireDate);
        if (!isNaN(dateObj.getTime())) {
          // Obtener semana ISO
          const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
          const dayNum = d.getUTCDay() || 7;
          d.setUTCDate(d.getUTCDate() + 4 - dayNum);
          const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
          const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
          const weekKey = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
          
          if (weekMap[weekKey] !== undefined) {
            weekMap[weekKey] += 1;
          } else {
            weekMap[weekKey] = 1;
          }
        }
      }
    });

    return Object.keys(weekMap).sort().map(week => ({
      week: week.split('-')[1], // sólo mostrar WXX
      Ingresos: weekMap[week]
    }));
  };

  const weeklyHiresData = getWeeklyHiresChartData();

  // Prospectos calificados listos para vinculación manual
  const unlinkedLeads = leads.filter(l => 
    !matchedHires.some(mh => mh.lead.phone === l.phone) && 
    (l.status === 'Contratado' || l.status === 'Documentos')
  );

  const unlinkedOperators = operators.filter(op => 
    !matchedHires.some(mh => mh.op.empNo === op.empNo)
  );

  // ================= PROCESAMIENTO MÓDULO: CAPACIDAD Y METAS =================
  const getCapacityChartData = () => {
    return fleet.map(f => {
      // Contar operadores contratados en el directorio para esta empresa
      const activeOpsInCompany = operators.filter(op => 
        op.company.toLowerCase() === f.company.toLowerCase() && 
        op.status === 'Activo'
      ).length;

      const deficit = Math.max(0, f.tractosEnServicio - activeOpsInCompany);

      return {
        company: f.company,
        'Tractos en Servicio': f.tractosEnServicio,
        'Operadores Activos': activeOpsInCompany,
        'Servicios Activos': f.serviciosActivos,
        Déficit: deficit
      };
    });
  };

  const capacityChartData = getCapacityChartData();

  // Calcular avance contra metas mensuales de contratación
  const getGoalsProgress = () => {
    return goals.map(g => {
      // Contar ingresos del mes actual (Julio 2026) para esa empresa y tipo de vacante
      const actualHires = operators.filter(op => 
        op.company.toLowerCase() === g.company.toLowerCase() &&
        op.hireDate.startsWith('2026-07') &&
        op.status === 'Activo'
      ).length;

      const progressPct = g.monthlyTarget > 0 ? (actualHires / g.monthlyTarget) * 100 : 0;

      return {
        ...g,
        actualHires,
        progressPct: Math.min(100, progressPct)
      };
    });
  };

  const goalsProgressData = getGoalsProgress();

  return (
    <div className="flex h-screen bg-bg-gray text-navy-950 overflow-hidden font-sans">
      
      {/* Sidebar de navegación */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        leadsCount={leads.filter(l => l.status === 'Nuevo').length}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* Header Global */}
        <header className="h-16 bg-white border-b border-slate-200/80 flex items-center justify-between px-8 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold uppercase bg-orange-100 text-orange-600 px-2 py-0.5 rounded">
              MODO OPERATIVO
            </span>
            <div className="text-xs text-slate-400 font-mono">
              Julio 2026 — Sincronizado
            </div>
          </div>

          {/* Rango de Fechas Global (Para métricas temporales) */}
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200/50">
            <div className="flex items-center gap-1.5 text-slate-500 pl-1">
              <Calendar size={14} />
              <span className="text-[10px] font-bold uppercase">Rango</span>
            </div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white text-xs border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium focus:outline-none"
            />
            <span className="text-slate-400 text-xs">a</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white text-xs border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium focus:outline-none"
            />
          </div>
        </header>

        {/* Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto p-8 bg-bg-gray/50">
          
          {/* ================= TAB 1: FUNNEL DE LA SEMANA ================= */}
          {activeTab === 'funnel' && (
            <div className="space-y-8 animate-in fade-in duration-150">
              
              {/* KPIs Principales */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
                <KPICard
                  title="Leads Facebook"
                  value={totalLeadsFB}
                  subtitle="Ingresados por campaña"
                  n={filteredLeadsForPeriod.length}
                  icon={<Megaphone size={16} className="text-orange-500" />}
                />
                <KPICard
                  title="Tasa de Respuesta"
                  value={`${pctResponded.toFixed(1)}%`}
                  subtitle="Contestados por reclutadora"
                  n={respondedLeads.length}
                  icon={<Percent size={16} className="text-blue-500" />}
                  colorClass={pctResponded >= 85 ? 'text-green-600' : pctResponded >= 60 ? 'text-yellow-600' : 'text-red-600'}
                />
                <KPICard
                  title="Mediana Respuesta (Hábil)"
                  value={medianResponseTimeWork >= 60 ? `${(medianResponseTimeWork / 60).toFixed(1)} h` : `${medianResponseTimeWork} min`}
                  subtitle="Tiempo de reacción hábil"
                  n={respondedLeads.length}
                  icon={<Clock size={16} className="text-slate-500" />}
                  colorClass={medianResponseTimeWork < 30 ? 'text-green-600' : medianResponseTimeWork < 120 ? 'text-yellow-600' : 'text-red-600'}
                />
                <KPICard
                  title="Conversaciones Reales"
                  value={realConversations}
                  subtitle="Interacción bidireccional"
                  n={filteredLeadsForPeriod.length}
                  icon={<MessageSquare size={16} className="text-purple-500" />}
                />
                <KPICard
                  title="Ingresos (Contratos)"
                  value={hiringCount}
                  subtitle="Operadores en nómina"
                  n={filteredLeadsForPeriod.length}
                  icon={<CheckCircle2 size={16} className="text-green-500" />}
                />
                <KPICard
                  title="Conversión Lead → Alta"
                  value={`${estimatedConversion.toFixed(1)}%`}
                  subtitle="Efectividad del funnel"
                  n={filteredLeadsForPeriod.length}
                  icon={<TrendingUp size={16} className="text-orange-500" />}
                />
              </div>

              {/* Grid Central: Tabla de Reclutamiento & Stacked Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Tabla de Desempeño por Reclutadora */}
                <div className="lg:col-span-2 metric-card overflow-hidden flex flex-col justify-between">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">Control Operativo por Reclutadora</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Indicadores de atención con semáforo para el periodo actual.</p>
                    </div>
                    <button
                      onClick={() => {
                        const headers = ['Agente', 'Asignados', 'Contestados', '% Respuesta', 'Mediana Tiempo (Min)', 'Contratos', '% Conversion'];
                        const rows = agentComparisonData.map(a => [
                          a.agent, a.assigned.toString(), a.responded.toString(), a.responsePct.toFixed(1), a.medianResponseTime.toString(), a.hires.toString(), a.conversionPct.toFixed(1)
                        ]);
                        exportToCSV(headers, rows, 'Desempeño_Agentes');
                      }}
                      className="text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <FileSpreadsheet size={14} />
                      Exportar CSV
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                          <th className="p-3">Agente</th>
                          <th className="p-3">Leads Asignados</th>
                          <th className="p-3">Tasa Respuesta</th>
                          <th className="p-3">Mediana Reacción</th>
                          <th className="p-3">Conv. Reales</th>
                          <th className="p-3">Contratados</th>
                          <th className="p-3">% Conversión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {agentComparisonData.map((row) => (
                          <tr key={row.agent} className="hover:bg-slate-50/50">
                            <td className="p-3 font-semibold text-slate-800">{row.agent}</td>
                            <td className="p-3 font-mono text-slate-600">{row.assigned} leads</td>
                            
                            {/* Semáforo % Respuesta */}
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                                row.responsePct >= 85 
                                  ? 'bg-green-50 text-green-700 border border-green-100' 
                                  : row.responsePct >= 60 
                                    ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' 
                                    : 'bg-red-50 text-red-700 border border-red-100'
                              }`}>
                                {row.responsePct.toFixed(1)}%
                              </span>
                            </td>

                            {/* Semáforo Tiempo Respuesta */}
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                                row.medianResponseTime < 30 
                                  ? 'bg-green-50 text-green-700 border border-green-100' 
                                  : row.medianResponseTime < 120 
                                    ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' 
                                    : 'bg-red-50 text-red-700 border border-red-100'
                              }`}>
                                {row.medianResponseTime} min
                              </span>
                            </td>

                            <td className="p-3 text-slate-600">{row.realConversations}</td>
                            <td className="p-3 text-green-700 font-bold font-mono">{row.hires}</td>
                            <td className="p-3 text-slate-900 font-semibold">{row.conversionPct.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Gráfica de leads diarios apilados */}
                <div className="metric-card p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Arribo Diario por Agente</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Volumen y balanceo de carga publicitaria por día.</p>
                  </div>
                  <div className="h-56 mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                        <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                        {agents.map((ag, idx) => (
                          <Bar
                            key={ag}
                            dataKey={ag}
                            stackId="a"
                            fill={agentColors[idx % agentColors.length]}
                            radius={idx === agents.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: BANDERA LEADS CRM ================= */}
          {activeTab === 'leads' && (
            <div className="space-y-8 animate-in fade-in duration-150">
              
              {/* Pipeline Activo Banner */}
              {activePipelineLeads.length > 0 && (
                <div className="bg-white rounded-2xl border border-orange-200/80 shadow-sm p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-xs text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Activity size={14} className="animate-pulse" />
                        Bandeja de Pipeline Activo (Seguimiento Urgente)
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">Prospectos en fase intermedia de reclutamiento (En Proceso / Papelería) ordenados por inactividad desde el último contacto.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 overflow-x-auto mt-4 pb-2 scrollbar-thin">
                    {activePipelineLeads.slice(0, 6).map((lead) => (
                      <div
                        key={lead.phone}
                        onClick={() => setActiveChatLead(lead)}
                        className="bg-slate-50 hover:bg-orange-50/25 transition cursor-pointer border border-slate-200/60 rounded-xl p-3 shrink-0 w-52 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-900 font-mono">{lead.phone}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              lead.daysInactive >= 3 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {lead.daysInactive} días inactivo
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1 font-semibold flex justify-between">
                            <span>Agente: {lead.agent}</span>
                            <span className="text-orange-600">{lead.detectedVacante}</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-2 border-t border-slate-200/50 pt-1.5">
                          {lead.notes || 'Sin anotaciones de seguimiento.'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filtros de la Tabla */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="text-slate-400 absolute left-3 top-2.5" size={16} />
                    <input
                      type="text"
                      placeholder="Buscar por teléfono, agente, notas, vacante..."
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:ring-1 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>

                  <select
                    value={leadAgentFilter}
                    onChange={(e) => setLeadAgentFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl text-xs p-2.5 bg-slate-50 focus:outline-none font-semibold text-slate-600"
                  >
                    <option value="All">Agente: Todos</option>
                    {agents.map(ag => (
                      <option key={ag} value={ag}>{ag}</option>
                    ))}
                  </select>

                  <select
                    value={leadStatusFilter}
                    onChange={(e) => setLeadStatusFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl text-xs p-2.5 bg-slate-50 focus:outline-none font-semibold text-slate-600"
                  >
                    <option value="All">Estatus: Todos</option>
                    <option value="Nuevo">Nuevo</option>
                    <option value="En proceso">En proceso</option>
                    <option value="Documentos">Documentos</option>
                    <option value="Contratado">Contratado</option>
                    <option value="Descartado">Descartado</option>
                    <option value="Sin respuesta">Sin respuesta</option>
                  </select>

                  <select
                    value={leadClassFilter}
                    onChange={(e) => setLeadClassFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl text-xs p-2.5 bg-slate-50 focus:outline-none font-semibold text-slate-600"
                  >
                    <option value="All">Clasificación: Todas</option>
                    <option value="Vacante">Vacante</option>
                    <option value="RH Interno">RH Interno</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                <button
                  onClick={() => {
                    const headers = ['Teléfono', 'Agente', 'Fecha', 'Origen', 'Respondió', 'Clasificación', 'Vacante Detectada', 'Estatus', 'Notas'];
                    const rows = filteredCRMLeads.map(l => [
                      l.phone, l.agent, l.firstMessageDate, l.origin, l.responded ? 'Sí' : 'No', l.classification, l.detectedVacante, l.status, l.notes
                    ]);
                    exportToCSV(headers, rows, 'Leads_Bandeja_CRM');
                  }}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition shrink-0"
                >
                  <FileSpreadsheet size={14} />
                  Exportar CSV
                </button>
              </div>

              {/* Tabla de Leads CRM */}
              <div className="metric-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                        <th className="p-3 text-center w-12">Convers.</th>
                        <th className="p-3">Teléfono</th>
                        <th className="p-3">Agente</th>
                        <th className="p-3">Fecha de Entrada</th>
                        <th className="p-3">Origen</th>
                        <th className="p-3">Tiempo Reacción (Hábil / Nat)</th>
                        <th className="p-3">Clasificación</th>
                        <th className="p-3">Vacante Sugerida</th>
                        <th className="p-3">Estatus Operativo</th>
                        <th className="p-3">Notas de Seguimiento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCRMLeads.map((lead) => (
                        <tr key={lead.phone} className="hover:bg-slate-50/40">
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setActiveChatLead(lead)}
                              title="Ver conversación completa de WhatsApp"
                              className="text-orange-500 hover:text-orange-600 bg-orange-50 p-2 rounded-lg border border-orange-100 transition inline-block cursor-pointer"
                            >
                              <MessageSquare size={14} />
                            </button>
                          </td>
                          <td className="p-3 font-semibold text-slate-900 font-mono">{lead.phone}</td>
                          <td className="p-3 font-medium text-slate-700">{lead.agent}</td>
                          <td className="p-3 text-slate-500">
                            {new Date(lead.firstMessageDate).toLocaleString('es-MX', { hour12: true })}
                            <div className="text-[10px] text-slate-400 font-medium">
                              {lead.inWorkHours ? '☀️ En jornada' : '🌙 Fuera de jornada'}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              lead.origin === 'Facebook' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {lead.origin}
                            </span>
                          </td>
                          <td className="p-3 font-mono">
                            {lead.responded ? (
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800">Háb: {lead.firstResponseMinutesWork} min</span>
                                <span className="text-[10px] text-slate-400">Nat: {lead.firstResponseMinutesNatural} min</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-red-500 bg-red-50 font-bold px-1.5 py-0.5 rounded">Sin contestar</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`font-semibold ${
                              lead.classification === 'RH Interno' ? 'text-red-600 font-bold' : 'text-slate-700'
                            }`}>
                              {lead.classification}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-orange-600">{lead.detectedVacante}</td>
                          <td className="p-3">
                            <select
                              value={lead.status}
                              onChange={(e) => handleLeadStatusChange(lead.phone, e.target.value as any)}
                              className="border border-slate-200 rounded-lg p-1.5 text-xs font-semibold bg-slate-50 text-slate-800 focus:outline-none"
                            >
                              <option value="Nuevo">Nuevo</option>
                              <option value="En proceso">En proceso</option>
                              <option value="Documentos">Documentos</option>
                              <option value="Contratado">Contratado</option>
                              <option value="Descartado">Descartado</option>
                              <option value="Sin respuesta">Sin respuesta</option>
                            </select>
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              defaultValue={lead.notes}
                              onBlur={(e) => handleLeadNotesChange(lead.phone, e.target.value)}
                              placeholder="Agregar nota de seguimiento..."
                              className="w-full border border-transparent hover:border-slate-200 focus:border-slate-300 rounded px-2 py-1 text-xs transition"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 3: ATRIBUCIÓN Y CONTRATACIONES ================= */}
          {activeTab === 'attribution' && (
            <div className="space-y-8 animate-in fade-in duration-150">
              
              {/* Alerta Metodológica */}
              <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl flex items-start gap-3">
                <AlertTriangle className="text-blue-600 shrink-0 mt-0.5" size={18} />
                <div>
                  <span className="font-bold text-xs">Aviso de Precisión de Atribución Telefónica:</span>
                  <p className="text-xs mt-0.5 text-blue-700">
                    La atribución por teléfono es un piso; los candidatos pueden registrar un número secundario o de pareja al ingresar formalmente en nómina. Puedes asociar prospectos manualmente si detectas que la atribución automática no lo cubrió.
                  </p>
                </div>
              </div>

              {/* KPIs de Atribución */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contratos Atribuidos</span>
                  <div className="text-xl font-bold text-green-700 mt-1">{matchedHires.length} de {operators.length} ingresos</div>
                  <p className="text-[10px] text-slate-500 mt-2 font-mono">Conexión comprobada Lead ➜ Alta de Nómina</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ciclo Promedio Lead → Alta</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">{avgCycleDays.toFixed(1)} días</div>
                  <p className="text-[10px] text-slate-500 mt-2 font-mono">Días transcurridos desde primer chat a ingreso</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tasa de Efectividad Automática</span>
                  <div className="text-xl font-bold text-blue-600 mt-1">
                    {operators.length > 0 ? ((matchedHires.length / operators.length) * 100).toFixed(0) : 0}%
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 font-mono">Porcentaje de ingresos mapeados</p>
                </div>
              </div>

              {/* Manual Matching Panel & Hiring Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Formulario Atribución Manual */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <UserPlus className="text-orange-500" size={16} />
                      Asociación Manual de Candidatos
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Asocia un lead de WhatsApp a un operador contratado si no coinciden sus teléfonos.</p>
                  </div>

                  {attributionStatusMsg && (
                    <div className="mt-4 p-2 bg-green-50 border border-green-200 text-green-800 text-[11px] rounded-lg font-semibold text-center">
                      {attributionStatusMsg}
                    </div>
                  )}

                  <form onSubmit={handleManualMatchSubmit} className="mt-4 space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase">Seleccione Lead de WhatsApp:</label>
                      <select
                        value={manualMatchLeadPhone}
                        onChange={(e) => setManualMatchLeadPhone(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50 font-medium"
                      >
                        <option value="">-- Seleccionar Prospecto --</option>
                        {unlinkedLeads.map(l => (
                          <option key={l.phone} value={l.phone}>
                            {l.phone} - {l.agent} ({l.detectedVacante})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-600 uppercase">Vincular con Operador Contratado:</label>
                      <select
                        value={manualMatchOperatorId}
                        onChange={(e) => setManualMatchOperatorId(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs mt-1 bg-slate-50 font-medium"
                      >
                        <option value="">-- Seleccionar Operador --</option>
                        {unlinkedOperators.map(op => (
                          <option key={op.empNo} value={op.empNo}>
                            [{op.empNo}] {op.name} ({op.company})
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2.5 rounded-lg transition"
                    >
                      Realizar Atribución
                    </button>
                  </form>
                </div>

                {/* Gráfica de ingresos por semana */}
                <div className="lg:col-span-2 metric-card p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Ingresos Semanales a Nómina (Cronograma)</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Altas registradas formalmente en el directorio de RH.</p>
                  </div>
                  <div className="h-44 mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weeklyHiresData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="week" stroke="#94a3b8" fontSize={10} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                        <Line type="monotone" dataKey="Ingresos" stroke="#f97316" strokeWidth={3} activeDot={{ r: 8 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Lista de Atribuciones Confirmadas */}
              <div className="metric-card overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Lista de Atribuciones Confirmadas</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Operadores mapeados con éxito en base a la correspondencia de registros.</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                        <th className="p-3">Operador en Nómina</th>
                        <th className="p-3"># Emp</th>
                        <th className="p-3">Empresa</th>
                        <th className="p-3">Reclutadora</th>
                        <th className="p-3">Celular Coincidente</th>
                        <th className="p-3">Fecha Primer Contacto</th>
                        <th className="p-3">Fecha de Ingreso</th>
                        <th className="p-3">Días Ciclo</th>
                        <th className="p-3">Método Atribución</th>
                        <th className="p-3 text-center">Desvincular</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matchedHires.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-900">{item.op.name}</td>
                          <td className="p-3 font-mono font-bold">{item.op.empNo}</td>
                          <td className="p-3 text-slate-600">{item.op.company}</td>
                          <td className="p-3 text-slate-700 font-medium">{item.lead.agent}</td>
                          <td className="p-3 font-mono text-slate-500">{item.lead.phone}</td>
                          <td className="p-3 text-slate-500">{new Date(item.lead.firstMessageDate).toLocaleDateString()}</td>
                          <td className="p-3 text-slate-500">{item.op.hireDate}</td>
                          <td className="p-3 font-mono font-bold text-slate-800">{item.cycleDays} días</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100">
                              {item.sourceField}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleRemoveMatch(item.lead.phone)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition cursor-pointer"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 4: CAPACIDAD Y METAS ================= */}
          {activeTab === 'capacity' && (
            <div className="space-y-8 animate-in fade-in duration-150">
              
              {/* KPIs de Flota */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {fleet.map(f => {
                  const companyOps = operators.filter(op => op.company.toLowerCase() === f.company.toLowerCase() && op.status === 'Activo').length;
                  const deficit = Math.max(0, f.tractosEnServicio - companyOps);

                  return (
                    <div key={f.company} className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{f.company}</span>
                        <div className="text-xl font-bold text-slate-900 mt-1">{deficit} tractos</div>
                        <p className="text-[10px] text-slate-500 mt-1 font-mono">Déficit (Tractos servicio vs Operadores)</p>
                      </div>
                      <div className="mt-3 text-[10px] text-slate-400 flex justify-between border-t border-slate-100 pt-2 font-mono">
                        <span>Tractos: {f.tractosEnServicio}</span>
                        <span>Operadores: {companyOps}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Total global deficit */}
                <div className="bg-slate-900 p-5 rounded-xl text-white shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider block">Déficit Total de Operadores</span>
                    <div className="text-2xl font-bold mt-1">
                      {fleet.reduce((acc, f) => {
                        const companyOps = operators.filter(op => op.company.toLowerCase() === f.company.toLowerCase() && op.status === 'Activo').length;
                        return acc + Math.max(0, f.tractosEnServicio - companyOps);
                      }, 0)} Conductores
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Suma consolidada de todas las filiales</p>
                  </div>
                </div>
              </div>

              {/* Charts & Goals */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Gráfica de barras de capacidad */}
                <div className="lg:col-span-2 metric-card p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Capacidad Operativa y Disponibilidad de Flota</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Tractos en servicio listos vs conductores activos contratados.</p>
                  </div>
                  <div className="h-64 mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={capacityChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="company" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                        <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="Tractos en Servicio" fill="#0f172a" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Operadores Activos" fill="#f97316" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Servicios Activos" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Déficit" fill="#ef4444" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Avance contra metas mensuales */}
                <div className="metric-card p-6">
                  <h3 className="font-bold text-sm text-slate-900">Avance de Reclutamiento contra Metas Mensuales</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Avance contra la meta del mes de Julio 2026.</p>

                  <div className="mt-6 space-y-5">
                    {goalsProgressData.map((g) => (
                      <div key={g.id} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span>{g.company} - {g.vacanteType}</span>
                          <span className="font-mono">{g.actualHires} / {g.monthlyTarget} ({g.progressPct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-orange-500 transition-all rounded-full"
                            style={{ width: `${g.progressPct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 5: CAMPAÑAS (MODULAR) ================= */}
          {activeTab === 'campaigns' && (
            <CampaignsView
              campaigns={campaigns}
              leads={leads}
              vacancies={vacancies}
              onToggleStatus={handleToggleCampaignStatus}
              onRequestPause={handleRequestPause}
            />
          )}

          {/* ================= TAB 6: COBERTURA (MODULAR) ================= */}
          {activeTab === 'coverage' && (
            <CoverageView
              settings={settings}
              onSaveSettings={handleSaveSettings}
              leads={leads}
            />
          )}

          {/* ================= TAB 7: CARGAR DATOS (MODULAR) ================= */}
          {activeTab === 'data' && (
            <ImportModule
              agents={agents}
              setAgents={setAgents}
              vacancies={vacancies}
              setVacancies={setVacancies}
              campaigns={campaigns}
              setCampaigns={setCampaigns}
              operators={operators}
              setOperators={setOperators}
              fleet={fleet}
              setFleet={setFleet}
              goals={goals}
              setGoals={setGoals}
              settings={settings}
              onRefreshAll={handleRefreshAll}
              onBackupRestore={handleBackupRestore}
              onExportAll={handleExportAll}
            />
          )}
        </div>
      </main>

      {/* ================= MODAL VISOR CONVERSACIÓN WHATSAPP ================= */}
      {activeChatLead && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-end animate-in fade-in duration-150">
          <div className="bg-white h-full w-[480px] border-l border-slate-200 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
            
            {/* Header del chat */}
            <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500 text-slate-950 font-bold p-2.5 rounded-full flex items-center justify-center font-mono text-sm w-10 h-10">
                  {activeChatLead.agent[0]}
                </div>
                <div>
                  <h4 className="font-bold text-sm font-mono tracking-tight">{activeChatLead.phone}</h4>
                  <p className="text-[10px] text-slate-300 font-medium">Reclutadora asignada: {activeChatLead.agent}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveChatLead(null)}
                className="text-slate-400 hover:text-white font-bold text-xs p-1 cursor-pointer"
              >
                Cerrar ✕
              </button>
            </div>

            {/* Panel de Metadatos del Prospecto */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 text-[11px] grid grid-cols-2 gap-3 shrink-0">
              <div>
                <span className="text-slate-400 font-bold block uppercase tracking-tight text-[9px]">Origen Lead</span>
                <span className="text-slate-800 font-semibold">{activeChatLead.origin}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block uppercase tracking-tight text-[9px]">Vacante Detectada</span>
                <span className="text-orange-600 font-bold">{activeChatLead.detectedVacante}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block uppercase tracking-tight text-[9px]">Clasificación</span>
                <span className="text-slate-800 font-semibold">{activeChatLead.classification}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold block uppercase tracking-tight text-[9px]">Estatus de Reclutamiento</span>
                <span className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-bold text-[10px]">{activeChatLead.status}</span>
              </div>
            </div>

            {/* Historial de Mensajes de WhatsApp */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 space-y-4">
              {activeChatLead.messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.isAgent ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                    msg.isAgent
                      ? 'bg-slate-900 text-white rounded-tr-none'
                      : 'bg-white text-slate-800 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono mt-1 px-1">
                    {msg.isAgent ? activeChatLead.agent : 'Candidato'} — {new Date(msg.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer / Nota rápida */}
            <div className="p-4 border-t border-slate-100 shrink-0 bg-white">
              <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Notas rápidas de seguimiento:</label>
              <textarea
                rows={2}
                placeholder="Añade observaciones para que persistan en el mini-CRM..."
                defaultValue={activeChatLead.notes}
                onBlur={(e) => handleLeadNotesChange(activeChatLead.phone, e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-orange-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
