/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  n?: number | string;
  icon?: React.ReactNode;
  colorClass?: string; // e.g. text-blue-600, text-green-500
}

export default function KPICard({ title, value, subtitle, n, icon, colorClass = 'text-slate-900' }: KPICardProps) {
  return (
    <div className="metric-card p-5 hover:shadow-md transition-all duration-200 flex flex-col justify-between relative overflow-hidden group">
      {/* Light subtle visual background accent */}

      <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-full -mr-6 -mt-6 transition-colors duration-200 group-hover:bg-slate-100/80 -z-0" />

      <div className="relative z-10 flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
          <div className={`text-2xl font-bold tracking-tight mt-1 ${colorClass}`}>
            {value}
          </div>
        </div>
        {icon && (
          <div className="bg-slate-50 p-2.5 rounded-lg text-slate-600 border border-slate-100">
            {icon}
          </div>
        )}
      </div>

      <div className="relative z-10 mt-4 flex items-center justify-between text-[11px] text-slate-500 font-medium">
        <span>{subtitle}</span>
        {n !== undefined && (
          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-semibold">
            n = {n}
          </span>
        )}
      </div>
    </div>
  );
}
