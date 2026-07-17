import { z } from 'zod';

const secret = z.string().min(1);
const label = z.string().min(1).max(120);

/**
 * Alta de credencial: discriminada por `kind`, cada tipo exige exactamente sus
 * campos de secreto (channel-credentials). Los secretos entran aquí y se cifran;
 * jamás vuelven a salir por las lecturas.
 */
export const credentialCreateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('meta_app'),
    label,
    secrets: z.object({ app_secret: secret, verify_token: secret }).strict(),
  }),
  z.object({
    kind: z.literal('whatsapp'),
    label,
    secrets: z.object({ access_token: secret, phone_number_id: secret }).strict(),
  }),
  z.object({
    kind: z.literal('meta_page'),
    label,
    secrets: z.object({ page_id: secret, page_access_token: secret }).strict(),
  }),
  z.object({
    kind: z.literal('telegram'),
    label,
    secrets: z.object({ bot_token: secret, webhook_secret: secret }).strict(),
  }),
]);

export type CredentialCreate = z.infer<typeof credentialCreateSchema>;

/**
 * Edición: `label`/`active` sueltos; `secrets` opcional rota el juego completo
 * (el servicio valida que los campos coincidan con el `kind` de la fila).
 */
export const credentialUpdateSchema = z
  .object({
    label: label.optional(),
    active: z.boolean().optional(),
    secrets: z.record(secret).optional(),
  })
  .strict()
  .refine((v) => v.label !== undefined || v.active !== undefined || v.secrets !== undefined, {
    message: 'nada que actualizar',
  });

export type CredentialUpdate = z.infer<typeof credentialUpdateSchema>;
