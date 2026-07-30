/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Panel de captura de campos personalizados (add-custom-fields-ui) dentro del
 * visor de conversación. Carga los valores del lead y de la persona, renderiza
 * un input por tipo de definición y guarda cada campo por separado contra
 * `PUT .../custom-fields/:key` (el backend siempre fija source='human').
 *
 * Se monta con key={lead.id}, así solo recarga al cambiar de prospecto y no se
 * pisa con el refetch en vivo del hilo por WebSocket.
 */

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { FieldValue } from '../types';
import { ApiError } from '../api/client';
import { FieldEntity, listFieldValues, setFieldValue } from '../api/custom-fields';

interface CustomFieldsPanelProps {
  leadId?: string;
  personId?: string;
}

interface FieldRowState {
  entity: FieldEntity;
  field: FieldValue;
  draft: string; // representación de edición (para text/number/select/date)
  error: string | null;
  saving: boolean;
}

const toDraft = (field: FieldValue): string =>
  field.value === null || field.value === undefined ? '' : String(field.value);

export default function CustomFieldsPanel({ leadId, personId }: CustomFieldsPanelProps) {
  const [rows, setRows] = useState<FieldRowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [leadFields, personFields] = await Promise.all([
          leadId ? listFieldValues('leads', leadId) : Promise.resolve<FieldValue[]>([]),
          personId ? listFieldValues('people', personId) : Promise.resolve<FieldValue[]>([]),
        ]);
        if (cancelled) return;
        const build = (entity: FieldEntity, fields: FieldValue[]): FieldRowState[] =>
          fields.map((field) => ({ entity, field, draft: toDraft(field), error: null, saving: false }));
        setRows([...build('leads', leadFields), ...build('people', personFields)]);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'No se pudieron cargar los campos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId, personId]);

  const entityId = (entity: FieldEntity): string | undefined =>
    entity === 'leads' ? leadId : personId;

  const patchRow = (entity: FieldEntity, key: string, patch: Partial<FieldRowState>) => {
    setRows((prev) =>
      prev.map((r) => (r.entity === entity && r.field.key === key ? { ...r, ...patch } : r)),
    );
  };

  const save = async (row: FieldRowState, rawValue: string | number | boolean) => {
    const id = entityId(row.entity);
    if (!id) return;
    patchRow(row.entity, row.field.key, { saving: true, error: null });
    try {
      const updated = await setFieldValue(row.entity, id, row.field.key, rawValue);
      patchRow(row.entity, row.field.key, {
        field: updated,
        draft: toDraft(updated),
        saving: false,
        error: null,
      });
    } catch (err) {
      let message = err instanceof ApiError ? err.message : 'No se pudo guardar';
      // El 400 de select trae `allowed` en el cuerpo del error de dominio.
      const allowed = err instanceof ApiError ? err.details.allowed : undefined;
      if (Array.isArray(allowed)) message += ` (permitidos: ${allowed.join(', ')})`;
      patchRow(row.entity, row.field.key, { saving: false, error: message });
    }
  };

  const commitDraft = (row: FieldRowState) => {
    const trimmed = row.draft.trim();
    // No re-guardar si no cambió respecto al valor almacenado.
    if (trimmed === toDraft(row.field).trim()) return;
    if (row.field.type === 'number') {
      if (trimmed === '') return;
      void save(row, Number(trimmed));
    } else {
      void save(row, trimmed);
    }
  };

  if (!leadId && !personId) return null;

  return (
    <div className="border-t border-slate-200 bg-white p-4 shrink-0 max-h-64 overflow-y-auto">
      <h5 className="text-[10px] font-bold uppercase tracking-tight text-slate-400 mb-2">
        Campos personalizados
      </h5>

      {loading && <p className="text-[11px] text-slate-400">Cargando campos…</p>}
      {loadError && <p className="text-[11px] text-red-600 font-medium">{loadError}</p>}
      {!loading && !loadError && rows.length === 0 && (
        <p className="text-[11px] text-slate-400">
          Sin campos definidos. Créalos en Administración → Campos Personalizados.
        </p>
      )}

      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={`${row.entity}:${row.field.key}`}>
            <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 uppercase mb-1">
              {row.field.label}
              {row.field.required && <span className="text-red-500">*</span>}
              {row.field.source === 'ai' && (
                <span className="flex items-center gap-0.5 bg-violet-50 text-violet-600 border border-violet-200 px-1 py-0.5 rounded text-[8px] font-bold normal-case">
                  <Sparkles size={9} /> IA
                </span>
              )}
              <span className="text-slate-300 font-mono normal-case">
                {row.entity === 'leads' ? 'lead' : 'persona'}
              </span>
            </label>

            {row.field.type === 'boolean' ? (
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={row.field.value === true}
                  disabled={row.saving}
                  onChange={(e) => void save(row, e.target.checked)}
                />
                {row.field.value === true ? 'Sí' : 'No'}
              </label>
            ) : row.field.type === 'select' ? (
              <select
                value={typeof row.field.value === 'string' ? row.field.value : ''}
                disabled={row.saving}
                onChange={(e) => void save(row, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
              >
                <option value="">— sin valor —</option>
                {(row.field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={row.field.type === 'number' ? 'number' : row.field.type === 'date' ? 'date' : 'text'}
                value={row.draft}
                disabled={row.saving}
                onChange={(e) => patchRow(row.entity, row.field.key, { draft: e.target.value })}
                onBlur={() => commitDraft(row)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              />
            )}

            {row.error && <p className="text-[10px] text-red-600 font-medium mt-0.5">{row.error}</p>}
            {row.field.source === 'ai' && row.field.evidenceText && (
              <p className="text-[10px] text-slate-400 italic mt-0.5">“{row.field.evidenceText}”</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
