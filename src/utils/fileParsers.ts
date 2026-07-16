/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { ChatLead, Operator, MarketingCampaign, WorkScheduleSettings } from '../types';
import { parseWhatsAppChat, normalizePhone } from './whatsappParser';

export interface FileParseError {
  fileName: string;
  line?: number;
  message: string;
}

/**
 * Parsea recursivamente un archivo ZIP para buscar archivos .txt de chat de WhatsApp,
 * incluso si están dentro de ZIPs anidados.
 */
export async function extractWhatsAppChats(
  file: File,
  agentName: string,
  settings: WorkScheduleSettings
): Promise<{ leads: ChatLead[]; errors: FileParseError[] }> {
  const leads: ChatLead[] = [];
  const errors: FileParseError[] = [];

  // Si se subió un TXT suelto directamente
  if (file.name.endsWith('.txt')) {
    try {
      const text = await file.text();
      const lead = parseWhatsAppChat(text, agentName, settings);
      if (lead) {
        leads.push(lead);
      } else {
        errors.push({
          fileName: file.name,
          message: 'No se encontraron mensajes válidos o el formato de fecha no coincide.',
        });
      }
    } catch (err: any) {
      errors.push({
        fileName: file.name,
        message: `Error al leer archivo TXT: ${err?.message || err}`,
      });
    }
    return { leads, errors };
  }

  // Si es un ZIP
  if (file.name.endsWith('.zip')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const mainZip = await JSZip.loadAsync(arrayBuffer);
      await processZipEntries(mainZip, file.name, agentName, settings, leads, errors);
    } catch (err: any) {
      errors.push({
        fileName: file.name,
        message: `Error al descomprimir el archivo principal ZIP: ${err?.message || err}`,
      });
    }
  } else {
    errors.push({
      fileName: file.name,
      message: 'Formato no soportado. Debe ser un archivo .txt o un archivo .zip.',
    });
  }

  return { leads, errors };
}

/**
 * Función interna para procesar entradas de ZIP recursivamente (soporta ZIPs anidados).
 */
async function processZipEntries(
  zip: JSZip,
  zipName: string,
  agentName: string,
  settings: WorkScheduleSettings,
  leads: ChatLead[],
  errors: FileParseError[]
): Promise<void> {
  const entries = Object.keys(zip.files);

  for (const path of entries) {
    const entry = zip.files[path];
    if (entry.dir) continue; // Omitir directorios

    const lowerPath = path.toLowerCase();

    // Si encontramos un archivo ZIP anidado
    if (lowerPath.endsWith('.zip')) {
      try {
        const nestedBuffer = await entry.async('arraybuffer');
        const nestedZip = await JSZip.loadAsync(nestedBuffer);
        await processZipEntries(nestedZip, `${zipName} -> ${path}`, agentName, settings, leads, errors);
      } catch (err: any) {
        errors.push({
          fileName: `${zipName}/${path}`,
          message: `Error al abrir ZIP anidado: ${err?.message || err}`,
        });
      }
    }
    // Si encontramos un archivo de texto plano
    else if (lowerPath.endsWith('.txt')) {
      try {
        const chatText = await entry.async('string');
        // Para evitar falsos positivos con archivos de sistema de Mac u otros metadatos
        if (path.includes('__MACOSX') || path.includes('.DS_Store')) continue;

        const lead = parseWhatsAppChat(chatText, agentName, settings);
        if (lead) {
          leads.push(lead);
        } else {
          // No reportar error por archivos vacíos o extremadamente cortos que no parezcan chats
          if (chatText.trim().length > 10) {
            errors.push({
              fileName: `${zipName}/${path}`,
              message: 'No se encontraron patrones de chat de WhatsApp válidos en este archivo.',
            });
          }
        }
      } catch (err: any) {
        errors.push({
          fileName: `${zipName}/${path}`,
          message: `Error al procesar archivo de chat: ${err?.message || err}`,
        });
      }
    }
  }
}

/**
 * Parsea un archivo de Directorio de Operadores (XLSX o CSV).
 */
export function parseOperatorsDirectory(
  file: File
): Promise<{ operators: Operator[]; errors: FileParseError[] }> {
  return new Promise((resolve) => {
    const operators: Operator[] = [];
    const errors: FileParseError[] = [];

    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          resolve({ operators, errors: [{ fileName: file.name, message: 'No se pudo leer el archivo.' }] });
          return;
        }

        let rawRows: any[] = [];

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(new Uint8Array(data as ArrayBuffer), { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          rawRows = XLSX.utils.sheet_to_json(worksheet);
        } else if (file.name.endsWith('.csv')) {
          const csvText = new TextDecoder('utf-8').decode(data as ArrayBuffer);
          const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
          if (parsed.errors && parsed.errors.length > 0) {
            parsed.errors.forEach((err) => {
              errors.push({
                fileName: file.name,
                line: err.row,
                message: `Error de CSV: ${err.message}`,
              });
            });
          }
          rawRows = parsed.data;
        } else {
          resolve({
            operators,
            errors: [{ fileName: file.name, message: 'Formato inválido. Debe ser .xlsx o .csv' }],
          });
          return;
        }

        // Mapear filas a tipo Operator
        rawRows.forEach((row: any, index) => {
          // Encontrar columnas ignorando mayúsculas y acentos
          const findVal = (keys: string[]) => {
            const rowKeys = Object.keys(row);
            const foundKey = rowKeys.find((rk) => {
              const cleanRk = rk.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
              return keys.some((k) => cleanRk === k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
            });
            return foundKey ? row[foundKey] : undefined;
          };

          const company = String(findVal(['empresa', 'cia']) || 'Transmontes').trim();
          const empNo = String(findVal(['# emp', 'no emp', 'num emp', 'empleado', 'emp_no', 'id']) || '').trim();
          const name = String(findVal(['nombre', 'operador', 'nombre completo']) || '').trim();
          const hireDateRaw = findVal(['fecha ingreso', 'fecha_ingreso', 'ingreso', 'fecha']);
          const statusRaw = String(findVal(['estatus', 'estado']) || 'Activo').trim();
          const companyCell = String(findVal(['celular empresa', 'cel_empresa', 'celular_empresa', 'tel empresa']) || '').trim();
          const personalCell = String(findVal(['celular personal', 'cel_personal', 'celular_personal', 'tel personal', 'celular']) || '').trim();
          const partnerCell = String(findVal(['telefono pareja', 'tel_pareja', 'pareja', 'contacto_pareja']) || '').trim();

          if (!name || !empNo) {
            // Ignorar filas vacías o sin identificador relevante, pero registrar si parece incompleta
            if (Object.keys(row).length > 2) {
              errors.push({
                fileName: file.name,
                line: index + 2,
                message: `Fila omitida por falta de Nombre o Número de Empleado válido.`,
              });
            }
            return;
          }

          // Procesar teléfonos normales
          const normalizedPhones: string[] = [];
          [companyCell, personalCell, partnerCell].forEach((cell) => {
            if (cell) {
              const norm = normalizePhone(cell);
              if (norm && norm.length === 10 && !normalizedPhones.includes(norm)) {
                normalizedPhones.push(norm);
              }
            }
          });

          // Formatear fecha de ingreso
          let hireDate = '2026-01-01';
          if (hireDateRaw) {
            if (typeof hireDateRaw === 'number') {
              // Es una fecha de Excel serializada
              const dateObj = new Date(Math.round((hireDateRaw - 25569) * 86400 * 1000));
              if (!isNaN(dateObj.getTime())) {
                hireDate = dateObj.toISOString().split('T')[0];
              }
            } else {
              const cleanDate = String(hireDateRaw).trim();
              const dateObj = new Date(cleanDate);
              if (!isNaN(dateObj.getTime())) {
                hireDate = dateObj.toISOString().split('T')[0];
              } else {
                // Intentar DD/MM/YYYY
                const parts = cleanDate.split(/[-/]/);
                if (parts.length === 3) {
                  let d = parseInt(parts[0]);
                  let m = parseInt(parts[1]);
                  let y = parseInt(parts[2]);
                  if (parts[2].length === 2) y += 2000;
                  // Si el año es primero YYYY-MM-DD
                  if (parts[0].length === 4) {
                    y = parseInt(parts[0]);
                    m = parseInt(parts[1]);
                    d = parseInt(parts[2]);
                  }
                  const testDate = new Date(y, m - 1, d);
                  if (!isNaN(testDate.getTime())) {
                    hireDate = testDate.toISOString().split('T')[0];
                  }
                }
              }
            }
          }

          const status: 'Activo' | 'Proceso Baja' =
            statusRaw.toLowerCase().includes('baja') || statusRaw.toLowerCase().includes('proceso baja')
              ? 'Proceso Baja'
              : 'Activo';

          operators.push({
            empNo,
            company: company || 'Transmontes',
            name,
            hireDate,
            status,
            companyCell,
            personalCell,
            partnerCell,
            normalizedPhones,
          });
        });

        resolve({ operators, errors });
      } catch (err: any) {
        resolve({
          operators,
          errors: [{ fileName: file.name, message: `Error general al parsear: ${err?.message || err}` }],
        });
      }
    };

    fileReader.onerror = () => {
      resolve({
        operators,
        errors: [{ fileName: file.name, message: 'Fallo al cargar el archivo en el navegador.' }],
      });
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
      fileReader.readAsArrayBuffer(file);
    } else {
      resolve({
        operators,
        errors: [{ fileName: file.name, message: 'La extensión del archivo debe ser .xlsx, .xls o .csv' }],
      });
    }
  });
}

/**
 * Parsea un archivo de Campañas de Marketing (CSV).
 */
export function parseCampaignsCSV(
  file: File
): Promise<{ campaigns: MarketingCampaign[]; errors: FileParseError[] }> {
  return new Promise((resolve) => {
    const campaigns: MarketingCampaign[] = [];
    const errors: FileParseError[] = [];

    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          resolve({ campaigns, errors: [{ fileName: file.name, message: 'No se pudo leer el archivo.' }] });
          return;
        }

        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        if (parsed.errors && parsed.errors.length > 0) {
          parsed.errors.forEach((err) => {
            errors.push({
              fileName: file.name,
              line: err.row,
              message: `Error de CSV: ${err.message}`,
            });
          });
        }

        parsed.data.forEach((row: any, index) => {
          const findVal = (keys: string[]) => {
            const rowKeys = Object.keys(row);
            const foundKey = rowKeys.find((rk) => {
              const cleanRk = rk.toLowerCase().trim();
              return keys.some((k) => cleanRk === k.toLowerCase());
            });
            return foundKey ? row[foundKey] : undefined;
          };

          const campaignName = String(findVal(['nombre_campana', 'nombre_campaña', 'campana', 'campaña', 'name', 'campaign_name']) || '').trim();
          const startDate = String(findVal(['fecha_inicio', 'fecha inicio', 'start_date', 'inicio']) || '').trim();
          const endDate = String(findVal(['fecha_fin', 'fecha fin', 'end_date', 'fin']) || '').trim();
          const spend = parseFloat(String(findVal(['gasto_mxn', 'gasto', 'presupuesto', 'spend', 'costo']) || '0'));
          const leadsReported = parseInt(String(findVal(['leads_reportados', 'leads', 'leads reportados', 'conversiones']) || '0'));
          const targetAgent = String(findVal(['agente_destino', 'agente', 'reclutadora', 'agent']) || 'Adriana').trim();
          const typeRaw = String(findVal(['tipo', 'modalidad']) || 'Local').trim();
          const vacanteRaw = String(findVal(['vacante', 'puesto', 'job']) || '').trim();
          const statusRaw = String(findVal(['estatus', 'estado', 'status']) || 'Activa').trim();
          const clicks = findVal(['clicks', 'clics']) ? parseInt(String(findVal(['clicks', 'clics']))) : undefined;

          if (!campaignName) {
            if (Object.keys(row).length > 2) {
              errors.push({
                fileName: file.name,
                line: index + 2,
                message: 'Fila omitida por falta del Nombre de la Campaña.',
              });
            }
            return;
          }

          // Generar una ID basada en el nombre y rango de fechas para evitar duplicados
          const id = `${campaignName}_${startDate}`.replace(/\s+/g, '_');

          // Calcular semana ISO aproximada de la fecha de inicio
          let isoWeek = '2026-W01';
          if (startDate) {
            const dateObj = new Date(startDate);
            if (!isNaN(dateObj.getTime())) {
              const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
              const dayNum = d.getUTCDay() || 7;
              d.setUTCDate(d.getUTCDate() + 4 - dayNum);
              const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
              const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
              isoWeek = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
            }
          }

          campaigns.push({
            id,
            campaignName,
            startDate: startDate || new Date().toISOString().split('T')[0],
            endDate: endDate || new Date().toISOString().split('T')[0],
            isoWeek,
            spend: isNaN(spend) ? 0 : spend,
            leadsReported: isNaN(leadsReported) ? 0 : leadsReported,
            targetAgent,
            type: typeRaw.toLowerCase().includes('foraneo') || typeRaw.toLowerCase().includes('foráneo') ? 'Foráneo' : 'Local',
            vacanteId: vacanteRaw || 'Sencillo',
            status: statusRaw.toLowerCase().includes('pausa') || statusRaw.toLowerCase().includes('pausada') ? 'Pausada' : 'Activa',
            clicks: clicks && !isNaN(clicks) ? clicks : undefined,
          });
        });

        resolve({ campaigns, errors });
      } catch (err: any) {
        resolve({
          campaigns,
          errors: [{ fileName: file.name, message: `Error general de parseo de Campañas: ${err?.message || err}` }],
        });
      }
    };

    fileReader.onerror = () => {
      resolve({ campaigns, errors: [{ fileName: file.name, message: 'Error de lectura de archivo en el navegador.' }] });
    };

    fileReader.readAsText(file);
  });
}
