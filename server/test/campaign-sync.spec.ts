import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/database/schema';
import { CampaignSyncService } from '../src/campaigns/campaign-sync.service';
import { resetEnvCache } from '../src/config/env';
import { bootTestApp, TestApp, waitFor } from './helpers';

const ACCOUNT_ID = 'act_TEST123';

interface FakeCampaign {
  id: string;
  name: string;
  status: string;
  start_time?: string;
}

/**
 * Marketing API falsa: cuenta con currency USD, campañas e insights nivel
 * campaña. El estado es mutable desde el test (campañas que "aparecen" luego).
 */
function startFakeMarketingApi(): Promise<{
  server: Server;
  baseUrl: string;
  campaigns: FakeCampaign[];
  insights: Map<string, { spend: string; clicks: string; leads: number }>;
}> {
  const campaigns: FakeCampaign[] = [
    { id: 'CAMP-1', name: 'Traileros Julio USD', status: 'ACTIVE', start_time: '2026-07-01T00:00:00-0600' },
    { id: 'CAMP-2', name: 'Escuelita Pausada', status: 'PAUSED' },
  ];
  const insights = new Map([
    ['CAMP-1', { spend: '1234.56', clicks: '789', leads: 42 }],
  ]);

  const server = createServer((req, res) => {
    const url = req.url ?? '';
    res.writeHead(200, { 'content-type': 'application/json' });
    if (url.includes('/campaigns')) {
      res.end(JSON.stringify({ data: campaigns }));
    } else if (url.includes('/insights')) {
      res.end(
        JSON.stringify({
          data: [...insights.entries()].map(([id, i]) => ({
            campaign_id: id,
            spend: i.spend,
            clicks: i.clicks,
            actions: [
              { action_type: 'lead', value: String(i.leads) },
              { action_type: 'link_click', value: '999' },
            ],
          })),
        }),
      );
    } else {
      res.end(JSON.stringify({ currency: 'USD' }));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, campaigns, insights });
    });
  });
}

describe('sync de campañas con Marketing API (campaign-sync, campaign-attribution)', () => {
  let t: TestApp;
  let fake: Awaited<ReturnType<typeof startFakeMarketingApi>>;

  beforeAll(async () => {
    fake = await startFakeMarketingApi();
    t = await bootTestApp({
      META_ADS_ACCESS_TOKEN: 'ads-token',
      META_AD_ACCOUNT_ID: ACCOUNT_ID,
      MARKETING_API_BASE_URL: fake.baseUrl,
    });
  });

  afterAll(async () => {
    await t.cleanup();
    fake.server.close();
    delete process.env.META_ADS_ACCESS_TOKEN;
    delete process.env.META_AD_ACCOUNT_ID;
    delete process.env.MARKETING_API_BASE_URL;
    resetEnvCache();
  });

  it('trae campañas reales con moneda de la cuenta; segundo sync es update', async () => {
    // El scheduler de bootstrap ya pudo correr; el disparo manual garantiza una corrida.
    const res = await fetch(`${t.baseUrl}/api/campaigns/sync`, { method: 'POST' });
    expect(res.status).toBe(202);

    const synced = await waitFor(async () => {
      const row = await t.db.query.campaigns.findFirst({
        where: eq(schema.campaigns.externalId, 'CAMP-1'),
      });
      return row?.source === 'meta_api' ? row : null;
    });
    expect(synced.name).toBe('Traileros Julio USD');
    expect(synced.spend).toBe('1234.56');
    expect(synced.currency).toBe('USD');
    expect(synced.clicks).toBe(789);
    expect(synced.leadsReported).toBe(42); // solo action_type lead, no link_click
    expect(synced.status).toBe('active');
    expect(synced.startDate).toBe('2026-07-01');

    const paused = await t.db.query.campaigns.findFirst({
      where: eq(schema.campaigns.externalId, 'CAMP-2'),
    });
    expect(paused?.status).toBe('paused');
    expect(paused?.spend).toBe('0.00'); // sin insights → 0 real, no inventado

    // Segundo sync directo: idempotente (updated, no duplicados)
    const result = await t.app.get(CampaignSyncService).run();
    expect(result.created).toBe(0);
    expect(result.updated).toBe(2);
    const all = await t.db.query.campaigns.findMany();
    expect(all.filter((c) => c.externalId === 'CAMP-1')).toHaveLength(1);

    const events = await t.db.query.domainEvents.findMany();
    expect(events.some((e) => e.type === 'campaign.synced' && e.actor === 'system')).toBe(true);
    expect(events.some((e) => e.type === 'campaign.sync_requested' && e.actor === 'user')).toBe(
      true,
    );
  });

  it('adopta la campaña CSV con mismo externalId sin tocar campos locales', async () => {
    // CAMP-3 aún no existe en Meta: el CSV la crea primero con datos locales.
    const [agent] = await t.db.insert(schema.agents).values({ name: 'Gladys' }).returning();
    await t.db.insert(schema.campaigns).values({
      externalId: 'CAMP-3',
      name: 'CSV vieja',
      source: 'csv',
      spend: '100.00',
      currency: 'USD',
      modality: 'foreign',
      targetAgentId: agent!.id,
    });
    // Campaña puramente local (sin externalId): intocable.
    await t.db.insert(schema.campaigns).values({ name: 'Local manual', source: 'manual' });

    fake.campaigns.push({ id: 'CAMP-3', name: 'Traileros Agosto', status: 'ACTIVE' });
    fake.insights.set('CAMP-3', { spend: '500.10', clicks: '10', leads: 5 });

    const result = await t.app.get(CampaignSyncService).run();
    expect(result.created).toBe(0);
    expect(result.updated).toBe(3);

    const adopted = await t.db.query.campaigns.findFirst({
      where: eq(schema.campaigns.externalId, 'CAMP-3'),
    });
    expect(adopted?.source).toBe('meta_api');
    expect(adopted?.name).toBe('Traileros Agosto');
    expect(adopted?.spend).toBe('500.10');
    // Campos locales de negocio intactos:
    expect(adopted?.modality).toBe('foreign');
    expect(adopted?.targetAgentId).toBe(agent!.id);

    const local = await t.db.query.campaigns.findFirst({
      where: eq(schema.campaigns.name, 'Local manual'),
    });
    expect(local?.source).toBe('manual');
    expect(local?.spend).toBe('0.00');
  });

  it('re-atribuye referrals huérfanos cuando su campaña aparece', async () => {
    const [person] = await t.db
      .insert(schema.people)
      .values({ phone: '+5218712340001' })
      .returning();
    const [orphan] = await t.db
      .insert(schema.leads)
      .values({
        personId: person!.id,
        origin: 'paid',
        referralPayload: { sourceId: 'CAMP-4', sourceType: 'ad' },
      })
      .returning();

    // Sync sin CAMP-4: el lead sigue huérfano.
    await t.app.get(CampaignSyncService).run();
    let lead = await t.db.query.leads.findFirst({ where: eq(schema.leads.id, orphan!.id) });
    expect(lead?.campaignId).toBeNull();

    // CAMP-4 aparece en Meta → siguiente sync la trae y re-atribuye.
    fake.campaigns.push({ id: 'CAMP-4', name: 'CTWA Nueva', status: 'ACTIVE' });
    const result = await t.app.get(CampaignSyncService).run();
    expect(result.reattributed).toBe(1);

    lead = await t.db.query.leads.findFirst({ where: eq(schema.leads.id, orphan!.id) });
    const campaign = await t.db.query.campaigns.findFirst({
      where: eq(schema.campaigns.externalId, 'CAMP-4'),
    });
    expect(lead?.campaignId).toBe(campaign?.id);

    const events = await t.db.query.domainEvents.findMany({
      where: eq(schema.domainEvents.type, 'lead.attributed'),
    });
    const reattr = events.find(
      (e) => (e.payload as { reattributed?: boolean }).reattributed === true,
    );
    expect(reattr?.aggregateId).toBe(orphan!.id);
  });

  it('sin credenciales: run() es no-op y el trigger manual responde 409', async () => {
    const saved = process.env.META_ADS_ACCESS_TOKEN;
    delete process.env.META_ADS_ACCESS_TOKEN;
    resetEnvCache();
    try {
      const result = await t.app.get(CampaignSyncService).run();
      expect(result).toEqual({ skipped: true, created: 0, updated: 0, reattributed: 0 });

      const res = await fetch(`${t.baseUrl}/api/campaigns/sync`, { method: 'POST' });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { code: string }).code).toBe('MARKETING_NOT_CONFIGURED');
    } finally {
      process.env.META_ADS_ACCESS_TOKEN = saved;
      resetEnvCache();
    }
  });
});
