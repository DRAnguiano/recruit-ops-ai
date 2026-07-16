import { describe, expect, it } from 'vitest';
import {
  classify,
  ClassificationRuleLike,
  normalizeText,
} from '../src/leads/classification-engine';

// Reglas espejo del seed de la migración 0003 (el motor no contiene keywords).
const rules: ClassificationRuleLike[] = [
  {
    id: 'cta',
    category: 'ad_cta',
    target: null,
    keywords: ['quiero mas informacion', 'hola, vi esto en facebook'],
    priority: 10,
  },
  {
    id: 'hr',
    category: 'internal_hr',
    target: null,
    keywords: ['nomina', 'infonavit', 'mi pago'],
    priority: 10,
  },
  { id: 'esc', category: 'vacancy_type', target: 'escuelita', keywords: ['escuelita', 'aprender'], priority: 10 },
  { id: 'full', category: 'vacancy_type', target: 'full', keywords: ['full', 'doble remolque'], priority: 20 },
  { id: 'sen', category: 'vacancy_type', target: 'sencillo', keywords: ['sencillo'], priority: 30 },
  {
    id: '5ta',
    category: 'vacancy_type',
    target: 'quinta_rueda',
    keywords: ['5ta rueda', 'quinta rueda', 'trailer'],
    priority: 40,
  },
];

describe('motor de clasificación (deterministic-classification)', () => {
  it('normaliza acentos y mayúsculas', () => {
    expect(normalizeText('TRÁILER Foráneo NÓMINA')).toBe('trailer foraneo nomina');
  });

  it('detecta RH interno con prioridad sobre vacante', () => {
    const result = classify('Oye, no me llegó mi NÓMINA del tráiler', rules);
    expect(result.classification).toBe('internal_hr');
    expect(result.detectedVacancyType).toBeNull();
  });

  it('detecta tipo de vacante ignorando acentos', () => {
    const result = classify('Me interesa manejar TRÁILER', rules);
    expect(result).toMatchObject({
      classification: 'vacancy',
      detectedVacancyType: 'quinta_rueda',
      matchedRuleId: '5ta',
    });
  });

  it('la prioridad decide cuando hay múltiples matches', () => {
    // "escuelita" (prio 10) gana sobre "trailer" (prio 40), como en la SPA.
    const result = classify('quiero aprender en la escuelita de trailer', rules);
    expect(result.detectedVacancyType).toBe('escuelita');
  });

  it('CTA de anuncio sin tipo → vacancy con isAdCta', () => {
    const result = classify('Hola, vi esto en Facebook', rules);
    expect(result).toMatchObject({
      classification: 'vacancy',
      detectedVacancyType: null,
      isAdCta: true,
    });
  });

  it('sin match → other', () => {
    const result = classify('ok gracias', rules);
    expect(result).toMatchObject({
      classification: 'other',
      detectedVacancyType: null,
      isAdCta: false,
      matchedRuleId: null,
    });
  });
});
