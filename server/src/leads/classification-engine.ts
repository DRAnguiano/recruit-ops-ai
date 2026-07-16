/**
 * Motor de clasificación determinista y PURO (sin I/O): función de
 * (texto, reglas) → resultado. Las reglas son datos (classification_rules);
 * este archivo no contiene ninguna keyword de negocio.
 */

export type LeadClassification = 'vacancy' | 'internal_hr' | 'other';

export interface ClassificationRuleLike {
  id: string;
  category: 'ad_cta' | 'internal_hr' | 'vacancy_type' | string;
  target: string | null;
  keywords: string[];
  priority: number;
}

export interface ClassificationResult {
  classification: LeadClassification;
  detectedVacancyType: string | null;
  /** El texto matchea un CTA automático de anuncio (señal de origen pagado). */
  isAdCta: boolean;
  matchedRuleId: string | null;
}

/** minúsculas + sin acentos (NFD) — "TRÁILER" matchea "trailer". */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matches(normalizedText: string, rule: ClassificationRuleLike): boolean {
  return rule.keywords.some((kw) => normalizedText.includes(normalizeText(kw)));
}

export function classify(
  text: string,
  rules: ClassificationRuleLike[],
): ClassificationResult {
  const normalized = normalizeText(text);
  const byPriority = [...rules].sort((a, b) => a.priority - b.priority);

  const hrRule = byPriority.find((r) => r.category === 'internal_hr' && matches(normalized, r));
  if (hrRule) {
    return {
      classification: 'internal_hr',
      detectedVacancyType: null,
      isAdCta: false,
      matchedRuleId: hrRule.id,
    };
  }

  const adCtaRule = byPriority.find((r) => r.category === 'ad_cta' && matches(normalized, r));
  const vacancyRule = byPriority.find(
    (r) => r.category === 'vacancy_type' && matches(normalized, r),
  );

  if (vacancyRule || adCtaRule) {
    return {
      classification: 'vacancy',
      detectedVacancyType: vacancyRule?.target ?? null,
      isAdCta: Boolean(adCtaRule),
      matchedRuleId: vacancyRule?.id ?? adCtaRule?.id ?? null,
    };
  }

  return { classification: 'other', detectedVacancyType: null, isAdCta: false, matchedRuleId: null };
}
