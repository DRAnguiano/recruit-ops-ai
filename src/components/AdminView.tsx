/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Vista de Administración (add-catalog-admin-ui): catálogos de dominio,
 * metas por periodo y settings operativos, siempre contra la API — el
 * backend valida y la UI refleja su respuesta (sin estado optimista).
 */

import React, { useEffect, useState } from 'react';
import {
  BookMarked,
  Check,
  Clock,
  Pencil,
  Plus,
  Save,
  Settings,
  SlidersHorizontal,
  Target,
  Trash2,
  X
} from 'lucide-react';
import { CatalogEntry, FieldDefinition, FieldType, WorkScheduleSettings } from '../types';
import { api, ApiError } from '../api/client';
import { ApiGoal } from '../api/mappers';
import {
  createFieldDefinition,
  deleteFieldDefinition,
  FieldEntity,
  listFieldDefinitions,
  updateFieldDefinition,
} from '../api/custom-fields';

// ── Tabla genérica de catálogo (companies/circuits/vacancy-types/lead-statuses) ──

interface CatalogTableProps {
  endpoint: string; // ej. '/api/circuits'
  title: string;
  entries: CatalogEntry[];
  onChanged: () => Promise<void>;
}

function CatalogTable({ endpoint, title, entries, onChanged }: CatalogTableProps) {
  const [newName, setNewName] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RESOURCE_REFERENCED') {
        setError(`${err.message} Sugerencia: desactívala en lugar de borrarla.`);
      } else {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newLabel.trim()) return;
    void run(async () => {
      await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), label: newLabel.trim() }),
      });
      setNewName('');
      setNewLabel('');
    });
  };

  const startEdit = (entry: CatalogEntry) => {
    setEditingId(entry.id);
    setEditLabel(entry.label);
    setEditSortOrder(entry.sortOrder);
    setError(null);
  };

  const handleSaveEdit = (entry: CatalogEntry) => {
    void run(async () => {
      await api(`${endpoint}/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: editLabel.trim(), sortOrder: editSortOrder }),
      });
      setEditingId(null);
    });
  };

  const handleToggleActive = (entry: CatalogEntry) => {
    void run(async () => {
      await api(`${endpoint}/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !entry.active }),
      });
    });
  };

  const handleDelete = (entry: CatalogEntry) => {
    if (!confirm(`¿Borrar "${entry.label}" (${entry.name})?`)) return;
    void run(async () => {
      await api(`${endpoint}/${entry.id}`, { method: 'DELETE' });
    });
  };

  return (
    <div className="metric-card overflow-hidden flex flex-col">
      <div className="p-4 border-b border-slate-100">
        <h3 className="font-bold text-sm text-slate-900">{title}</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">
          El identificador de dominio (name) es inmutable; edita el label, orden o desactiva.
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 text-red-700 text-[11px] rounded-lg font-medium">
          {error}
        </div>
      )}

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <th className="p-2.5">Name (dominio)</th>
              <th className="p-2.5">Label (UI)</th>
              <th className="p-2.5 w-16">Orden</th>
              <th className="p-2.5 w-20">Activo</th>
              <th className="p-2.5 w-24 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <tr key={entry.id} className={`hover:bg-slate-50/50 ${!entry.active ? 'opacity-50' : ''}`}>
                <td className="p-2.5 font-mono font-semibold text-slate-700">{entry.name}</td>
                <td className="p-2.5">
                  {editingId === entry.id ? (
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"
                    />
                  ) : (
                    <span className="font-medium text-slate-800">{entry.label}</span>
                  )}
                </td>
                <td className="p-2.5">
                  {editingId === entry.id ? (
                    <input
                      type="number"
                      value={editSortOrder}
                      onChange={(e) => setEditSortOrder(Number(e.target.value))}
                      className="w-14 border border-slate-300 rounded px-1.5 py-1 text-xs font-mono"
                    />
                  ) : (
                    <span className="font-mono text-slate-500">{entry.sortOrder}</span>
                  )}
                </td>
                <td className="p-2.5">
                  <button
                    onClick={() => handleToggleActive(entry)}
                    disabled={busy}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer ${
                      entry.active
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {entry.active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="p-2.5 text-center whitespace-nowrap">
                  {editingId === entry.id ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(entry)}
                        disabled={busy}
                        title="Guardar"
                        className="text-green-600 hover:bg-green-50 p-1.5 rounded transition cursor-pointer"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        title="Cancelar"
                        className="text-slate-400 hover:bg-slate-100 p-1.5 rounded transition cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(entry)}
                        title="Editar label/orden"
                        className="text-slate-500 hover:bg-slate-100 p-1.5 rounded transition cursor-pointer"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(entry)}
                        disabled={busy}
                        title="Borrar (falla si está referenciado)"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400 text-[11px]">
                  Sin entradas en este catálogo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Alta: name + label (name inmutable después) */}
      <form onSubmit={handleCreate} className="p-3 border-t border-slate-100 bg-slate-50/50 flex gap-2">
        <input
          type="text"
          placeholder="name (ej. tramo_torreon)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono"
        />
        <input
          type="text"
          placeholder="Label (ej. Tramo Torreón)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim() || !newLabel.trim()}
          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
        >
          <Plus size={13} />
          Agregar
        </button>
      </form>
    </div>
  );
}

// ── Tabla del diccionario de campos personalizados (lead / persona) ──────

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'boolean', label: 'Sí/No' },
  { value: 'select', label: 'Lista (select)' },
  { value: 'date', label: 'Fecha' },
];

/** "A, B, C" → ['A','B','C']; vacío → []. */
const parseOptions = (raw: string): string[] =>
  raw.split(',').map((s) => s.trim()).filter(Boolean);

interface FieldDefinitionsTableProps {
  entity: FieldEntity; // 'leads' | 'people'
  title: string;
}

function FieldDefinitionsTable({ entity, title }: FieldDefinitionsTableProps) {
  const [defs, setDefs] = useState<FieldDefinition[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<FieldType>('text');
  const [newOptions, setNewOptions] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editType, setEditType] = useState<FieldType>('text');
  const [editOptions, setEditOptions] = useState('');
  const [editRequired, setEditRequired] = useState(false);
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setDefs(await listFieldDefinitions(entity));
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RESOURCE_REFERENCED') {
        setError(`${err.message} Sugerencia: desactívalo en lugar de borrarlo.`);
      } else {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newLabel.trim()) return;
    void run(async () => {
      await createFieldDefinition(entity, {
        key: newKey.trim(),
        label: newLabel.trim(),
        type: newType,
        ...(newType === 'select' ? { options: parseOptions(newOptions) } : {}),
        required: newRequired,
      });
      setNewKey('');
      setNewLabel('');
      setNewType('text');
      setNewOptions('');
      setNewRequired(false);
    });
  };

  const startEdit = (def: FieldDefinition) => {
    setEditingId(def.id);
    setEditLabel(def.label);
    setEditType(def.type);
    setEditOptions((def.options ?? []).join(', '));
    setEditRequired(def.required);
    setEditSortOrder(def.sortOrder);
    setError(null);
  };

  const handleSaveEdit = (def: FieldDefinition) => {
    void run(async () => {
      await updateFieldDefinition(entity, def.id, {
        label: editLabel.trim(),
        type: editType,
        options: editType === 'select' ? parseOptions(editOptions) : null,
        required: editRequired,
        sortOrder: editSortOrder,
      });
      setEditingId(null);
    });
  };

  const handleToggleActive = (def: FieldDefinition) => {
    void run(async () => {
      await updateFieldDefinition(entity, def.id, { active: !def.active });
    });
  };

  const handleDelete = (def: FieldDefinition) => {
    if (!confirm(`¿Borrar el campo "${def.label}" (${def.key})?`)) return;
    void run(async () => {
      await deleteFieldDefinition(entity, def.id);
    });
  };

  return (
    <div className="metric-card overflow-hidden flex flex-col">
      <div className="p-4 border-b border-slate-100">
        <h3 className="font-bold text-sm text-slate-900">{title}</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">
          La clave (key) es inmutable; edita label, tipo, opciones, requerido, orden o desactiva.
          Las opciones solo aplican al tipo Lista.
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 text-red-700 text-[11px] rounded-lg font-medium">
          {error}
        </div>
      )}

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <th className="p-2.5">Key</th>
              <th className="p-2.5">Label</th>
              <th className="p-2.5 w-28">Tipo</th>
              <th className="p-2.5">Opciones</th>
              <th className="p-2.5 w-12">Req</th>
              <th className="p-2.5 w-14">Orden</th>
              <th className="p-2.5 w-20">Activo</th>
              <th className="p-2.5 w-24 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {defs.map((def) => (
              <tr key={def.id} className={`hover:bg-slate-50/50 ${!def.active ? 'opacity-50' : ''}`}>
                <td className="p-2.5 font-mono font-semibold text-slate-700">{def.key}</td>
                <td className="p-2.5">
                  {editingId === def.id ? (
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"
                    />
                  ) : (
                    <span className="font-medium text-slate-800">{def.label}</span>
                  )}
                </td>
                <td className="p-2.5">
                  {editingId === def.id ? (
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as FieldType)}
                      className="w-full border border-slate-300 rounded px-1 py-1 text-xs bg-white"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-600">
                      {FIELD_TYPES.find((t) => t.value === def.type)?.label ?? def.type}
                    </span>
                  )}
                </td>
                <td className="p-2.5">
                  {editingId === def.id ? (
                    editType === 'select' ? (
                      <input
                        type="text"
                        value={editOptions}
                        onChange={(e) => setEditOptions(e.target.value)}
                        placeholder="A, B, C"
                        className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )
                  ) : (
                    <span className="text-slate-500 text-[11px]">
                      {def.options && def.options.length > 0 ? def.options.join(', ') : '—'}
                    </span>
                  )}
                </td>
                <td className="p-2.5 text-center">
                  {editingId === def.id ? (
                    <input
                      type="checkbox"
                      checked={editRequired}
                      onChange={(e) => setEditRequired(e.target.checked)}
                    />
                  ) : (
                    <span className="text-slate-500">{def.required ? 'Sí' : '—'}</span>
                  )}
                </td>
                <td className="p-2.5">
                  {editingId === def.id ? (
                    <input
                      type="number"
                      value={editSortOrder}
                      onChange={(e) => setEditSortOrder(Number(e.target.value))}
                      className="w-12 border border-slate-300 rounded px-1.5 py-1 text-xs font-mono"
                    />
                  ) : (
                    <span className="font-mono text-slate-500">{def.sortOrder}</span>
                  )}
                </td>
                <td className="p-2.5">
                  <button
                    onClick={() => handleToggleActive(def)}
                    disabled={busy}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer ${
                      def.active
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {def.active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="p-2.5 text-center whitespace-nowrap">
                  {editingId === def.id ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(def)}
                        disabled={busy}
                        title="Guardar"
                        className="text-green-600 hover:bg-green-50 p-1.5 rounded transition cursor-pointer"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        title="Cancelar"
                        className="text-slate-400 hover:bg-slate-100 p-1.5 rounded transition cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(def)}
                        title="Editar"
                        className="text-slate-500 hover:bg-slate-100 p-1.5 rounded transition cursor-pointer"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(def)}
                        disabled={busy}
                        title="Borrar (falla si tiene valores guardados)"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {defs.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-slate-400 text-[11px]">
                  Sin campos personalizados definidos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Alta: key + label + tipo (+ opciones si select) + requerido */}
      <form onSubmit={handleCreate} className="p-3 border-t border-slate-100 bg-slate-50/50 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
        <input
          type="text"
          placeholder="key (ej. licencia)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono"
        />
        <input
          type="text"
          placeholder="Label (ej. Tipo de licencia)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as FieldType)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Opciones (A, B, C)"
          value={newOptions}
          onChange={(e) => setNewOptions(e.target.value)}
          disabled={newType !== 'select'}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs disabled:bg-slate-100 disabled:opacity-50"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium px-1">
          <input
            type="checkbox"
            checked={newRequired}
            onChange={(e) => setNewRequired(e.target.checked)}
          />
          Requerido
        </label>
        <button
          type="submit"
          disabled={busy || !newKey.trim() || !newLabel.trim()}
          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Plus size={13} />
          Agregar
        </button>
      </form>
    </div>
  );
}

// ── Editor de metas por periodo ──────────────────────────────────────────

interface GoalsEditorProps {
  goals: ApiGoal[];
  companies: CatalogEntry[];
  circuits: CatalogEntry[];
  vacancyTypes: CatalogEntry[];
  onChanged: () => Promise<void>;
}

const EMPTY_GOAL = { periodKind: 'monthly', company: '', vacancyType: '', circuit: '', target: 1 };

function GoalsEditor({ goals, companies, circuits, vacancyTypes, onChanged }: GoalsEditorProps) {
  const [form, setForm] = useState(EMPTY_GOAL);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeNames = (entries: CatalogEntry[]) => entries.filter((e) => e.active);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company || !form.vacancyType || form.target < 1) return;
    setBusy(true);
    setError(null);
    const body = JSON.stringify({
      periodKind: form.periodKind,
      company: form.company,
      vacancyType: form.vacancyType,
      circuit: form.circuit || null,
      target: form.target,
    });
    void (async () => {
      try {
        if (editingId) {
          await api(`/api/goals/${editingId}`, { method: 'PATCH', body });
        } else {
          await api('/api/goals', { method: 'POST', body });
        }
        await onChanged();
        setForm(EMPTY_GOAL);
        setEditingId(null);
      } catch (err) {
        // 409 por combinación duplicada: se muestra en línea sin perder el formulario
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      } finally {
        setBusy(false);
      }
    })();
  };

  const startEdit = (goal: ApiGoal) => {
    setEditingId(goal.id);
    setForm({
      periodKind: goal.periodKind,
      company: goal.company,
      vacancyType: goal.vacancyType,
      circuit: goal.circuit ?? '',
      target: goal.target,
    });
    setError(null);
  };

  const handleDelete = (goal: ApiGoal) => {
    if (!confirm(`¿Borrar la meta de ${goal.company} / ${goal.vacancyType}?`)) return;
    setBusy(true);
    void (async () => {
      try {
        await api(`/api/goals/${goal.id}`, { method: 'DELETE' });
        await onChanged();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      } finally {
        setBusy(false);
      }
    })();
  };

  const grouped: Array<{ kind: string; label: string; rows: ApiGoal[] }> = [
    { kind: 'weekly', label: 'Metas Semanales', rows: goals.filter((g) => g.periodKind === 'weekly') },
    { kind: 'monthly', label: 'Metas Mensuales', rows: goals.filter((g) => g.periodKind === 'monthly') },
  ];

  return (
    <div className="metric-card overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Target className="text-orange-500" size={16} />
          Metas por Periodo (Semanal / Mensual)
        </h3>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Meta de contrataciones por empresa + tipo de operador + circuito opcional; única por combinación.
        </p>
      </div>

      {/* Formulario alta/edición */}
      <form onSubmit={handleSubmit} className="p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end bg-slate-50/50 border-b border-slate-100">
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Periodo</label>
          <select
            value={form.periodKind}
            onChange={(e) => setForm({ ...form, periodKind: e.target.value })}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white font-medium"
          >
            <option value="monthly">Mensual</option>
            <option value="weekly">Semanal</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Empresa</label>
          <select
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white font-medium"
          >
            <option value="">-- Empresa --</option>
            {activeNames(companies).map((c) => (
              <option key={c.name} value={c.name}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Tipo de Operador</label>
          <select
            value={form.vacancyType}
            onChange={(e) => setForm({ ...form, vacancyType: e.target.value })}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white font-medium"
          >
            <option value="">-- Tipo --</option>
            {activeNames(vacancyTypes).map((v) => (
              <option key={v.name} value={v.name}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Circuito (opcional)</label>
          <select
            value={form.circuit}
            onChange={(e) => setForm({ ...form, circuit: e.target.value })}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white font-medium"
          >
            <option value="">Todos</option>
            {activeNames(circuits).map((c) => (
              <option key={c.name} value={c.name}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Meta</label>
          <input
            type="number"
            min={1}
            value={form.target}
            onChange={(e) => setForm({ ...form, target: Number(e.target.value) })}
            className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white font-mono"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !form.company || !form.vacancyType}
            className="flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-lg transition cursor-pointer"
          >
            {editingId ? 'Guardar' : 'Agregar'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_GOAL);
              }}
              className="text-slate-500 hover:bg-slate-100 text-xs font-semibold px-2 rounded-lg transition cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 text-red-700 text-[11px] rounded-lg font-medium">
          {error}
        </div>
      )}

      {/* Tabla agrupada por periodo */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {grouped.map((group) => (
          <div key={group.kind}>
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{group.label}</h4>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                  <th className="p-2">Empresa</th>
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Circuito</th>
                  <th className="p-2 w-14">Meta</th>
                  <th className="p-2 w-16 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {group.rows.map((goal) => (
                  <tr key={goal.id} className="hover:bg-slate-50/50">
                    <td className="p-2 font-medium text-slate-800">{goal.company}</td>
                    <td className="p-2 text-slate-600">{goal.vacancyType}</td>
                    <td className="p-2 text-slate-500">{goal.circuit ?? '—'}</td>
                    <td className="p-2 font-mono font-bold text-slate-800">{goal.target}</td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <button
                        onClick={() => startEdit(goal)}
                        title="Editar"
                        className="text-slate-500 hover:bg-slate-100 p-1 rounded transition cursor-pointer"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(goal)}
                        disabled={busy}
                        title="Borrar"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {group.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-slate-400 text-[11px]">
                      Sin metas {group.kind === 'weekly' ? 'semanales' : 'mensuales'}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings operativos (GET /api/settings + PUT /api/settings/:key) ─────

const SETTING_LABELS: Record<string, string> = {
  conversation_inactivity_days: 'Días de inactividad para cerrar conversación',
  campaign_sync_interval_minutes: 'Intervalo de sincronización de campañas (min)',
};

function SettingsEditor() {
  const [values, setValues] = useState<Record<string, number>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api<Record<string, number>>('/api/settings');
        setValues(data);
        setLoaded(true);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los settings');
      }
    })();
  }, []);

  const handleSave = (key: string) => {
    setError(null);
    void (async () => {
      try {
        await api(`/api/settings/${key}`, {
          method: 'PUT',
          body: JSON.stringify({ value: values[key] }),
        });
        setSavedKey(key);
        setTimeout(() => setSavedKey(null), 2500);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No se pudo guardar el setting');
      }
    })();
  };

  return (
    <div className="metric-card p-4">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 mb-1">
        <Settings className="text-orange-500" size={16} />
        Settings Operativos
      </h3>
      <p className="text-[10px] text-slate-400 mb-4">
        Valores validados por el backend; aplican sin redeploy.
      </p>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 text-[11px] rounded-lg font-medium">
          {error}
        </div>
      )}

      {!loaded && !error && (
        <p className="text-[11px] text-slate-400">Cargando settings…</p>
      )}

      <div className="space-y-3">
        {Object.entries(values).map(([key, value]) => (
          <div key={key} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">
                {SETTING_LABELS[key] ?? key}
              </label>
              <input
                type="number"
                value={value}
                onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) })}
                className="w-full border border-slate-200 rounded-lg p-2 text-xs font-mono"
              />
            </div>
            <button
              onClick={() => handleSave(key)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            >
              {savedKey === key ? <Check size={13} className="text-green-400" /> : <Save size={13} />}
              {savedKey === key ? 'Guardado' : 'Guardar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Horario laboral (única puerta de edición; Cobertura solo lo visualiza) ──

interface ScheduleEditorProps {
  settings: WorkScheduleSettings;
  onSaveSettings: (settings: WorkScheduleSettings) => Promise<void>;
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

function ScheduleEditor({ settings, onSaveSettings }: ScheduleEditorProps) {
  const [workDays, setWorkDays] = useState<number[]>(settings.workDays);
  const [startTime, setStartTime] = useState(settings.startTime);
  const [endTime, setEndTime] = useState(settings.endTime);
  const [isSaved, setIsSaved] = useState(false);

  const handleDayToggle = (day: number) => {
    setWorkDays(workDays.includes(day) ? workDays.filter((d) => d !== day) : [...workDays, day]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings({ workDays, startTime, endTime, timezone: settings.timezone });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="metric-card p-4">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
        <Clock className="text-orange-500" size={16} />
        Jornada de Reclutamiento (Horario Hábil)
      </h3>
      <p className="text-[10px] text-slate-400 mb-4">
        Zona horaria: <span className="font-mono">{settings.timezone}</span> — el backend
        recalcula las métricas hábiles con este horario.
      </p>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <label className="text-[9px] font-bold text-slate-500 uppercase">Días Laborales:</label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS_OF_WEEK.map((day) => {
              const active = workDays.includes(day.value);
              return (
                <button
                  type="button"
                  key={day.value}
                  onClick={() => handleDayToggle(day.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Horario Inicio:</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-slate-50 font-medium"
            />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Horario Fin:</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-slate-50 font-medium"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer"
        >
          {isSaved ? <Check size={14} className="text-green-400" /> : <Save size={14} />}
          {isSaved ? 'Guardado con éxito' : 'Guardar Jornada'}
        </button>
      </form>
    </div>
  );
}

// ── Vista principal ──────────────────────────────────────────────────────

interface AdminViewProps {
  companies: CatalogEntry[];
  circuits: CatalogEntry[];
  vacancyTypes: CatalogEntry[];
  leadStatuses: CatalogEntry[];
  goals: ApiGoal[];
  settings: WorkScheduleSettings;
  onSaveSettings: (settings: WorkScheduleSettings) => Promise<void>;
  onRefreshAll: () => Promise<void>;
}

export default function AdminView({
  companies,
  circuits,
  vacancyTypes,
  leadStatuses,
  goals,
  settings,
  onSaveSettings,
  onRefreshAll,
}: AdminViewProps) {
  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-12">
      <div className="flex items-center gap-2">
        <BookMarked className="text-orange-500" size={18} />
        <div>
          <h2 className="font-bold text-base text-slate-900">Administración de Catálogos y Configuración</h2>
          <p className="text-[11px] text-slate-500">
            Todo lo de negocio es dato editable: catálogos de dominio, metas por periodo y settings.
            Las entradas nuevas tardan ≤60 s en ser válidas para escritura en el resto del sistema.
          </p>
        </div>
      </div>

      {/* Catálogos de dominio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CatalogTable
          endpoint="/api/companies"
          title="Empresas"
          entries={companies}
          onChanged={onRefreshAll}
        />
        <CatalogTable
          endpoint="/api/circuits"
          title="Circuitos"
          entries={circuits}
          onChanged={onRefreshAll}
        />
        <CatalogTable
          endpoint="/api/vacancy-types"
          title="Tipos de Vacante / Operador"
          entries={vacancyTypes}
          onChanged={onRefreshAll}
        />
        <CatalogTable
          endpoint="/api/lead-statuses"
          title="Estados de Lead"
          entries={leadStatuses}
          onChanged={onRefreshAll}
        />
      </div>

      {/* Metas por periodo */}
      <GoalsEditor
        goals={goals}
        companies={companies}
        circuits={circuits}
        vacancyTypes={vacancyTypes}
        onChanged={onRefreshAll}
      />

      {/* Campos personalizados (diccionario de lead y persona) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="text-orange-500" size={16} />
          <div>
            <h3 className="font-bold text-sm text-slate-900">Campos Personalizados</h3>
            <p className="text-[11px] text-slate-500">
              Diccionario de datos capturables del candidato (lead) y de la persona; los valores
              se llenan desde el visor de conversación. Base del score auditable.
            </p>
          </div>
        </div>
        <FieldDefinitionsTable entity="leads" title="Campos de Lead" />
        <FieldDefinitionsTable entity="people" title="Campos de Persona" />
      </div>

      {/* Settings + horario */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SettingsEditor />
        <ScheduleEditor settings={settings} onSaveSettings={onSaveSettings} />
      </div>
    </div>
  );
}
