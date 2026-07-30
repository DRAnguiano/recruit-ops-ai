/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  Users,
  GitCompare,
  Target,
  Megaphone,
  CalendarDays,
  Database,
  Settings,
  Truck
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  leadsCount: number;
}

export default function Sidebar({ activeTab, setActiveTab, leadsCount }: SidebarProps) {
  const menuItems = [
    { id: 'funnel', name: 'Resumen del periodo', icon: LayoutDashboard },
    { id: 'leads', name: 'Bandeja de Leads (CRM)', icon: Users, badge: leadsCount },
    { id: 'attribution', name: 'Atribución y Contratos', icon: GitCompare },
    { id: 'capacity', name: 'Capacidad y Metas', icon: Target },
    { id: 'campaigns', name: 'Rendimiento Campañas', icon: Megaphone },
    { id: 'coverage', name: 'Cobertura y Horarios', icon: CalendarDays },
    { id: 'data', name: 'Cargar Datos', icon: Database },
    { id: 'admin', name: 'Administración', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-navy-850 text-slate-100 flex flex-col border-r border-navy-900/55">
      {/* Header Logístico */}
      <div className="p-6 border-b border-navy-900/55 flex items-center gap-3">
        <div className="bg-white p-2 rounded-lg text-blue-600 font-bold flex items-center justify-center shadow-sm">
          <Truck size={20} />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-tight text-white uppercase">Torre de Control</h1>
          <p className="text-[10px] text-slate-400 font-mono">Reclutamiento Transmontes</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 group text-left ${
                isActive
                  ? 'bg-white text-navy-900 font-semibold shadow-md'
                  : 'text-slate-400 hover:bg-navy-800 hover:text-slate-100'
              }`}
            >
              <Icon
                size={16}
                className={isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-200'}
              />
              <span className="flex-1">{item.name}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                    isActive ? 'bg-navy-900 text-white' : 'bg-navy-800 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / Info */}
      <div className="p-4 border-t border-navy-900/55 bg-navy-900/40 text-[10px] text-slate-500 font-mono flex flex-col gap-1">
        <div>ZONA: America/Mexico_City</div>
        <div>OPERACIÓN: Activa 24/7</div>
        <div className="text-white mt-1 font-semibold">Transmontes S.A. de C.V.</div>
      </div>
    </aside>

  );
}
