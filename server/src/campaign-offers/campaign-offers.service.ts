import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { campaignOffers } from '../database/schema';
import { DomainError, notFound } from '../common/domain-error';
import { DomainEventsService } from '../events/domain-events.service';
import { CampaignOfferCreate, CampaignOfferUpdate } from './campaign-offers.schemas';

export interface CampaignOfferView {
  id: string;
  campaignId: string;
  version: number;
  status: string;
  publishedAt: Date | null;
  isCurrent: boolean;
  [key: string]: unknown;
}

/**
 * Oferta versionada por campaña (campaign-offers): borrador → publicación inmutable. Un draft a la
 * vez por campaña; publicar congela el contenido para siempre — cambiarlo después crea una versión
 * nueva. La vigente se deriva (mayor `version` con `status='published'`), nunca una bandera mutable.
 */
@Injectable()
export class CampaignOffersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: DomainEventsService,
  ) {}

  async createDraft(campaignId: string, content: CampaignOfferCreate): Promise<CampaignOfferView> {
    const maxRows = await this.db
      .select({ maxVersion: sql<number>`coalesce(max(${campaignOffers.version}), 0)` })
      .from(campaignOffers)
      .where(eq(campaignOffers.campaignId, campaignId));
    const maxVersion = maxRows[0]?.maxVersion ?? 0;

    const [inserted] = await this.db
      .insert(campaignOffers)
      .values({ ...content, campaignId, version: maxVersion + 1 })
      .returning();

    await this.events.append({
      type: 'campaign_offer.created',
      aggregateType: 'campaign_offer',
      aggregateId: inserted!.id,
      actor: 'user',
      payload: { campaignId, version: inserted!.version },
    });

    return this.toView(inserted!, inserted!.version);
  }

  async update(id: string, content: CampaignOfferUpdate): Promise<CampaignOfferView> {
    const existing = await this.db.query.campaignOffers.findFirst({
      where: eq(campaignOffers.id, id),
    });
    if (!existing) throw notFound('OFFER_NOT_FOUND', `No existe la oferta ${id}`);
    if (existing.status === 'published') {
      throw new DomainError(
        'OFFER_PUBLISHED',
        'No se puede editar una oferta ya publicada; cree una versión nueva',
        409,
      );
    }

    const [updated] = await this.db
      .update(campaignOffers)
      .set({ ...content, updatedAt: new Date() })
      .where(eq(campaignOffers.id, id))
      .returning();

    const maxVersion = await this.maxPublishedVersion(existing.campaignId);
    return this.toView(updated!, maxVersion);
  }

  async publish(id: string): Promise<CampaignOfferView> {
    const existing = await this.db.query.campaignOffers.findFirst({
      where: eq(campaignOffers.id, id),
    });
    if (!existing) throw notFound('OFFER_NOT_FOUND', `No existe la oferta ${id}`);
    if (existing.status === 'published') {
      throw new DomainError('OFFER_ALREADY_PUBLISHED', 'Esta oferta ya está publicada', 409);
    }

    const [published] = await this.db
      .update(campaignOffers)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(campaignOffers.id, id))
      .returning();

    await this.events.append({
      type: 'campaign_offer.published',
      aggregateType: 'campaign_offer',
      aggregateId: id,
      actor: 'user',
      payload: { campaignId: existing.campaignId, version: existing.version },
    });

    return this.toView(published!, published!.version);
  }

  async listForCampaign(campaignId: string): Promise<CampaignOfferView[]> {
    const rows = await this.db
      .select()
      .from(campaignOffers)
      .where(eq(campaignOffers.campaignId, campaignId))
      .orderBy(desc(campaignOffers.version));

    const maxVersion = await this.maxPublishedVersion(campaignId);
    return rows.map((r) => this.toView(r, maxVersion));
  }

  private async maxPublishedVersion(campaignId: string): Promise<number | null> {
    const rows = await this.db
      .select({ maxVersion: sql<number | null>`max(${campaignOffers.version})` })
      .from(campaignOffers)
      .where(and(eq(campaignOffers.campaignId, campaignId), eq(campaignOffers.status, 'published')));
    return rows[0]?.maxVersion ?? null;
  }

  private toView(row: typeof campaignOffers.$inferSelect, maxPublishedVersion: number | null): CampaignOfferView {
    return {
      ...row,
      isCurrent: row.status === 'published' && row.version === maxPublishedVersion,
    };
  }
}
