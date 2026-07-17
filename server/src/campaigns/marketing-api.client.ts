import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/domain-error';
import { loadEnv } from '../config/env';

export interface RemoteCampaign {
  id: string;
  name: string;
  /** ACTIVE | PAUSED | ARCHIVED | ... (estados de Meta). */
  status?: string;
  start_time?: string;
  stop_time?: string;
}

export interface RemoteCampaignInsights {
  campaign_id: string;
  spend?: string;
  clicks?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
}

interface PagedResponse<T> {
  data?: T[];
  paging?: { next?: string };
}

/** action_types de Meta que cuentan como lead reportado por la campaña. */
const LEAD_ACTION_TYPES = new Set(['lead', 'onsite_conversion.lead_grouped', 'leadgen.other']);

/**
 * Cliente mínimo read-only de la Meta Marketing API (design decisión 1):
 * cuenta (moneda), campañas e insights nivel campaña. Sin SDK: fetch + tipos
 * estrechos + base configurable para testear contra un HTTP server local.
 */
@Injectable()
export class MarketingApiClient {
  isConfigured(): boolean {
    const env = loadEnv();
    return Boolean(env.META_ADS_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID);
  }

  async getAccountCurrency(): Promise<string> {
    const account = await this.get<{ currency?: string }>(`/${this.accountId()}?fields=currency`);
    return account.currency ?? 'USD';
  }

  async listCampaigns(): Promise<RemoteCampaign[]> {
    return this.getAllPages<RemoteCampaign>(
      `/${this.accountId()}/campaigns?fields=id,name,status,start_time,stop_time&limit=100`,
    );
  }

  async listCampaignInsights(): Promise<RemoteCampaignInsights[]> {
    return this.getAllPages<RemoteCampaignInsights>(
      `/${this.accountId()}/insights?level=campaign&fields=campaign_id,spend,clicks,actions&date_preset=maximum&limit=100`,
    );
  }

  /** Suma de acciones tipo lead de un insight (0 si no reporta). */
  static leadsFromInsights(insights: RemoteCampaignInsights | undefined): number {
    if (!insights?.actions) return 0;
    return insights.actions
      .filter((a) => a.action_type && LEAD_ACTION_TYPES.has(a.action_type))
      .reduce((sum, a) => sum + Number(a.value ?? 0), 0);
  }

  private accountId(): string {
    return loadEnv().META_AD_ACCOUNT_ID as string;
  }

  private async get<T>(pathOrUrl: string): Promise<T> {
    const env = loadEnv();
    const url = pathOrUrl.startsWith('http')
      ? pathOrUrl
      : `${env.MARKETING_API_BASE_URL}${pathOrUrl}`;
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${separator}access_token=${env.META_ADS_ACCESS_TOKEN}`);
    if (!response.ok) {
      throw new DomainError(
        'MARKETING_API_ERROR',
        `Marketing API respondió HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    return (await response.json()) as T;
  }

  private async getAllPages<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = path;
    while (next) {
      const page: PagedResponse<T> = await this.get<PagedResponse<T>>(next);
      items.push(...(page.data ?? []));
      next = page.paging?.next;
    }
    return items;
  }
}
