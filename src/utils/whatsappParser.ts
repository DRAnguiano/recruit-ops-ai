/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, ChatLead, WorkScheduleSettings } from '../types';

/**
 * Normaliza un número telefónico para quedarse con los últimos 10 dígitos.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Determina si un mensaje es un CTA automático de un anuncio de Facebook o WhatsApp.
 */
export function isAutomatedCTA(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t.includes('quiero más información') ||
    t.includes('quiero mas informacion') ||
    t.includes('más información sobre la vacante') ||
    t.includes('mas informacion sobre la vacante') ||
    t.includes('unirse (respuesta recibida)') ||
    t.includes('hola, vi esto en facebook') ||
    t.includes('vi un anuncio de facebook') ||
    t.includes('hola! me interesa') ||
    t.includes('hola, me interesa')
  );
}

/**
 * Determina si el texto contiene palabras clave asociadas a Recursos Humanos internos.
 */
export function checkRHKeywords(text: string): boolean {
  const t = text.toLowerCase();
  const keywords = ['nómina', 'nomina', 'vacaciones', 'infonavit', 'finiquito', 'aguinaldo', 'imss', 'imms', 'recibo', 'mi pago', 'tarjeta', 'pago de'];
  return keywords.some((kw) => t.includes(kw));
}

/**
 * Intenta detectar el tipo de vacante del catálogo basándose en palabras clave.
 */
export function detectVacanteType(text: string): 'Sencillo' | 'Full' | '5ta Rueda' | 'Escuelita' | 'Otro' {
  const t = text.toLowerCase();
  if (t.includes('escuelita') || t.includes('capacitación') || t.includes('capacitacion') || t.includes('aprender')) {
    return 'Escuelita';
  }
  if (t.includes('full') || t.includes('doble articulado') || t.includes('doble remolque') || t.includes('dolly')) {
    return 'Full';
  }
  if (t.includes('sencillo') || t.includes('camión rígido') || t.includes('camion rigido')) {
    return 'Sencillo';
  }
  if (t.includes('5ta rueda') || t.includes('quinta rueda') || t.includes('tráiler') || t.includes('trailer') || t.includes('ruta foranea') || t.includes('foráneo') || t.includes('foraneo')) {
    return '5ta Rueda';
  }
  return 'Otro';
}

/**
 * Calcula los minutos transcurridos entre dos fechas únicamente durante la jornada laboral.
 */
export function calculateWorkMinutes(start: Date, end: Date, settings: WorkScheduleSettings): number {
  if (end.getTime() <= start.getTime()) return 0;

  let totalMinutes = 0;
  const startMs = start.getTime();
  const endMs = end.getTime();

  // Parsear horarios a minutos de inicio y fin desde las 00:00
  const [startHour, startMin] = settings.startTime.split(':').map(Number);
  const [endHour, endMin] = settings.endTime.split(':').map(Number);
  const workStartMinutesOfDay = startHour * 60 + startMin;
  const workEndMinutesOfDay = endHour * 60 + endMin;

  // Iteramos día por día desde el día de inicio hasta el día de fin
  // Para hacerlo de forma eficiente, creamos fechas en pasos de 1 día
  const currentDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDateBound = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (currentDate.getTime() <= endDateBound.getTime()) {
    const dayOfWeek = currentDate.getDay(); // 0 = Domingo, 1 = Lunes...
    // Comprobar si es día laborable (JS getDay es 0-6, settings.workDays usa la misma convención)
    if (settings.workDays.includes(dayOfWeek)) {
      // Definir el inicio y fin de la jornada para este día específico
      const dayWorkStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), startHour, startMin, 0, 0);
      const dayWorkEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), endHour, endMin, 0, 0);

      // Encontrar la intersección entre el intervalo de chat [start, end] y la jornada [dayWorkStart, dayWorkEnd]
      const maxStart = Math.max(startMs, dayWorkStart.getTime());
      const minEnd = Math.min(endMs, dayWorkEnd.getTime());

      if (maxStart < minEnd) {
        totalMinutes += (minEnd - maxStart) / 60000;
      }
    }

    // Avanzar un día
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return Math.round(totalMinutes);
}

/**
 * Determina si una fecha está dentro del horario laboral configurable.
 */
export function isWithinWorkHours(date: Date, settings: WorkScheduleSettings): boolean {
  const day = date.getDay();
  if (!settings.workDays.includes(day)) return false;

  const [startHour, startMin] = settings.startTime.split(':').map(Number);
  const [endHour, endMin] = settings.endTime.split(':').map(Number);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  return currentMinutes >= (startHour * 60 + startMin) && currentMinutes <= (endHour * 60 + endMin);
}

/**
 * Parsea el texto crudo de una conversación de WhatsApp.
 * Soporta formatos de exportación en español de Android e iOS de manera robusta.
 */
export function parseWhatsAppChat(text: string, agentName: string, settings: WorkScheduleSettings): ChatLead | null {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return null;

  // Regex robusto para WhatsApp en español (Android/iOS)
  // Ejemplos:
  // Android: "15/07/26 12:30 p. m. - +52 871 123 4567: Mensaje" (usando \u202f o espacio normal antes de p.m.)
  // Android 2: "15/07/2026, 12:30 - Nombre: Mensaje"
  // iOS: "[15/07/26 12:30:15] Nombre: Mensaje"
  const regexAndroid = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?[\s\u202f]*(?:a\.\s*m\.|p\.\s*m\.|AM|PM|a\.\u202fm\.|p\.\u202fm\.)?\s*-\s*([^:]+):\s*(.*)$/i;
  const regexIOS = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\]?\s+([^:]+):\s*(.*)$/i;

  const parsedMessages: Message[] = [];
  let currentMsg: Message | null = null;

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    let match = cleanLine.match(regexAndroid);
    if (!match) {
      match = cleanLine.match(regexIOS);
    }

    if (match) {
      // Guardar el mensaje anterior si existía
      if (currentMsg) {
        parsedMessages.push(currentMsg);
      }

      const dateStr = match[1];
      const timeStr = match[2];
      const rawSender = match[3].trim();
      const textContent = match[4].trim();

      // Descartar mensajes del sistema de WhatsApp
      const lowerText = textContent.toLowerCase();
      if (
        lowerText.includes('cifrados de extremo a extremo') ||
        lowerText.includes('este chat se inició a partir de un anuncio') ||
        lowerText.includes('los mensajes y las llamadas están cifrados') ||
        lowerText.includes('cambió tu código de seguridad') ||
        lowerText.includes('creó este grupo') ||
        lowerText.includes('se unió usando el enlace')
      ) {
        currentMsg = null;
        continue;
      }

      // Parsear fecha y hora de manera segura
      // Reemplazar diagonales por guiones o usar formato estándar para parsear
      const dateParts = dateStr.split('/');
      let year = parseInt(dateParts[2]);
      if (year < 100) year += 2000; // Normalizar año de 2 dígitos
      const month = parseInt(dateParts[1]) - 1; // Mes es 0-indexado
      const day = parseInt(dateParts[0]);

      // Detectar AM/PM de la línea original si existe
      let hours = parseInt(timeStr.split(':')[0]);
      const minutes = parseInt(timeStr.split(':')[1]);
      const lowerLine = cleanLine.toLowerCase();

      if ((lowerLine.includes('p. m.') || lowerLine.includes('pm') || lowerLine.includes('p. m.')) && hours < 12) {
        hours += 12;
      } else if ((lowerLine.includes('a. m.') || lowerLine.includes('am') || lowerLine.includes('a. m.')) && hours === 12) {
        hours = 0;
      }

      const messageDate = new Date(year, month, day, hours, minutes, 0);

      // Determinar si el remitente es candidato (inicia con + o contiene solo números/espacios/guiones)
      const isPhoneLike = rawSender.startsWith('+') || /^[0-9\s\-()+]+$/.test(rawSender);
      const isAgent = !isPhoneLike;

      currentMsg = {
        timestamp: messageDate.toISOString(),
        sender: rawSender,
        text: textContent,
        isAgent: isAgent,
      };
    } else {
      // Línea multilínea: se concatena al texto del mensaje actual
      if (currentMsg) {
        currentMsg.text += '\n' + cleanLine;
      }
    }
  }

  // No olvidar el último mensaje procesado
  if (currentMsg) {
    parsedMessages.push(currentMsg);
  }

  if (parsedMessages.length === 0) return null;

  // Ordenar mensajes por fecha para asegurar cálculos correctos
  parsedMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Encontrar el primer mensaje del candidato (el lead original)
  const firstCandidateMsgIndex = parsedMessages.findIndex((m) => !m.isAgent);
  if (firstCandidateMsgIndex === -1) return null; // No hay mensajes del candidato

  const firstCandidateMsg = parsedMessages[firstCandidateMsgIndex];
  const candidatePhoneRaw = firstCandidateMsg.sender;
  const phone = normalizePhone(candidatePhoneRaw);

  if (!phone) return null;

  const firstMessageDate = firstCandidateMsg.timestamp;
  const arrivalDateObj = new Date(firstMessageDate);

  // Analizar origen y características del primer mensaje
  const fullTextMerged = parsedMessages.map((m) => m.text).join(' ');
  const origin: 'Facebook' | 'Orgánico' =
    fullTextMerged.toLowerCase().includes('anuncio de facebook') ||
    fullTextMerged.toLowerCase().includes('anuncio en facebook o instagram') ||
    fullTextMerged.toLowerCase().includes('anuncio de instagram') ||
    isAutomatedCTA(firstCandidateMsg.text)
      ? 'Facebook'
      : 'Orgánico';

  // Buscar la primera respuesta del agente que sea POSTERIOR al primer mensaje del candidato
  const firstAgentMsg = parsedMessages.find(
    (m, idx) => m.isAgent && idx > firstCandidateMsgIndex
  );

  const responded = !!firstAgentMsg;
  let firstResponseMinutesNatural: number | null = null;
  let firstResponseMinutesWork: number | null = null;

  if (firstAgentMsg) {
    const agentResponseDateObj = new Date(firstAgentMsg.timestamp);
    const diffMs = agentResponseDateObj.getTime() - arrivalDateObj.getTime();
    firstResponseMinutesNatural = Math.max(0, Math.round(diffMs / 60000));
    firstResponseMinutesWork = calculateWorkMinutes(arrivalDateObj, agentResponseDateObj, settings);
  }

  // Clasificar categoría
  let classification: 'Vacante' | 'RH Interno' | 'Otro' = 'Vacante';
  if (checkRHKeywords(fullTextMerged)) {
    classification = 'RH Interno';
  } else if (parsedMessages.length <= 2 && isAutomatedCTA(firstCandidateMsg.text) && !responded) {
    // Si sólo entró el CTA automático y nunca se respondió ni interactuó, o es muy escueto, puede ser Otro o Vacante.
    classification = 'Vacante';
  }

  // Detectar tipo de vacante
  const detectedVacante = detectVacanteType(firstCandidateMsg.text);

  // Determinar si es conversación real
  // "conversación real: ¿respondió agente y hubo conversación más allá de los CTA automáticos?"
  // Heurística:
  // 1. El agente respondió.
  // 2. Hay algún mensaje del candidato posterior al primer mensaje que no sea un CTA automático,
  //    o el candidato envió más de un mensaje en total que muestre engagement real.
  const candidateMessages = parsedMessages.filter((m) => !m.isAgent);
  const nonCtaCandidateMessages = candidateMessages.filter((m) => !isAutomatedCTA(m.text));

  const isConversationReal =
    responded &&
    (nonCtaCandidateMessages.length > 0 || candidateMessages.length > 1);

  const inWorkHours = isWithinWorkHours(arrivalDateObj, settings);
  const arrivalHour = arrivalDateObj.getHours();
  const arrivalDay = arrivalDateObj.getDay();

  return {
    phone,
    agent: agentName,
    firstMessageDate,
    origin,
    responded,
    firstResponseMinutesNatural,
    firstResponseMinutesWork,
    isConversationReal,
    classification,
    detectedVacante,
    status: 'Nuevo',
    notes: '',
    lastContactDate: parsedMessages[parsedMessages.length - 1].timestamp,
    inWorkHours,
    arrivalHour,
    arrivalDay,
    messages: parsedMessages,
    matchedOperatorId: null,
  };
}
