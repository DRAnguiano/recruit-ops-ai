/**
 * Cliente de la API de ofertas versionadas por campaña (add-campaign-offers): borrador →
 * publicación inmutable. Publicar congela el contenido; para cambiarlo se crea una versión nueva.
 */

import { CampaignOffer, CampaignOfferContent } from '../types';
import { api } from './client';

export function listCampaignOffers(campaignId: string): Promise<CampaignOffer[]> {
  return api<CampaignOffer[]>(`/api/campaigns/${campaignId}/offers`);
}

export function createCampaignOfferDraft(
  campaignId: string,
  content: Partial<CampaignOfferContent>,
): Promise<CampaignOffer> {
  return api<CampaignOffer>(`/api/campaigns/${campaignId}/offers`, {
    method: 'POST',
    body: JSON.stringify(content),
  });
}

export function updateCampaignOfferDraft(
  id: string,
  content: Partial<CampaignOfferContent>,
): Promise<CampaignOffer> {
  return api<CampaignOffer>(`/api/campaign-offers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(content),
  });
}

export function publishCampaignOffer(id: string): Promise<CampaignOffer> {
  return api<CampaignOffer>(`/api/campaign-offers/${id}/publish`, { method: 'POST' });
}
