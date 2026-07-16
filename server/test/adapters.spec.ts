import { describe, expect, it } from 'vitest';
import { TelegramAdapter } from '../src/channels/adapters/telegram.adapter';
import { WhatsAppAdapter } from '../src/channels/adapters/whatsapp.adapter';

export const whatsappTextPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '8711000000', phone_number_id: '111' },
            contacts: [{ profile: { name: 'Juan Pérez' }, wa_id: '5218711234567' }],
            messages: [
              {
                from: '5218711234567',
                id: 'wamid.HBgLNTIxODcxMTIzNDU2NxUCABIYFjNFQjBEMUExRkU5RDVGQjAyQzc0NkUA',
                timestamp: '1752602400',
                text: { body: 'Hola, vi la vacante de tráiler' },
                type: 'text',
              },
            ],
          },
        },
      ],
    },
  ],
};

export const whatsappStatusPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            statuses: [{ id: 'wamid.X', status: 'delivered', recipient_id: '5218711234567' }],
          },
        },
      ],
    },
  ],
};

export const telegramMessageUpdate = {
  update_id: 900001,
  message: {
    message_id: 42,
    from: { id: 777000111, is_bot: false, first_name: 'María', last_name: 'García' },
    chat: { id: 777000111, type: 'private' },
    date: 1752602500,
    text: 'Me interesa la escuelita',
  },
};

describe('WhatsAppAdapter (channel-adapter)', () => {
  const adapter = new WhatsAppAdapter();

  it('normaliza un mensaje de texto con teléfono E.164 y nombre de perfil', () => {
    const [msg] = adapter.parse(whatsappTextPayload);
    expect(msg).toMatchObject({
      channel: 'whatsapp',
      externalUserId: '5218711234567',
      phoneE164: '+5218711234567',
      senderName: 'Juan Pérez',
      body: 'Hola, vi la vacante de tráiler',
    });
    expect(msg?.externalMessageId).toContain('wamid.');
    expect(msg?.sentAt.toISOString()).toBe('2025-07-15T18:00:00.000Z');
  });

  it('payload solo de statuses produce lista vacía (nunca lanza)', () => {
    expect(adapter.parse(whatsappStatusPayload)).toEqual([]);
  });

  it('extrae el referral de Click-to-WhatsApp cuando existe', () => {
    const payload = structuredClone(whatsappTextPayload);
    const message = payload.entry[0]!.changes[0]!.value.messages[0]! as Record<string, unknown>;
    message['referral'] = {
      source_url: 'https://fb.me/xyz',
      source_id: '120212345678901234',
      source_type: 'ad',
      ctwa_clid: 'CLID123',
    };
    const [msg] = adapter.parse(payload);
    expect(msg?.referral).toEqual({
      sourceId: '120212345678901234',
      sourceUrl: 'https://fb.me/xyz',
      sourceType: 'ad',
      ctwaClid: 'CLID123',
    });
  });

  it('sin objeto referral el campo queda undefined', () => {
    const [msg] = adapter.parse(whatsappTextPayload);
    expect(msg?.referral).toBeUndefined();
  });

  it('objetos ajenos (page/instagram) y basura producen lista vacía', () => {
    expect(adapter.parse({ object: 'page' })).toEqual([]);
    expect(adapter.parse(null)).toEqual([]);
    expect(adapter.parse('garbage')).toEqual([]);
  });

  it('nota de voz → kind=audio con media id, sin descargar nada', () => {
    const payload = structuredClone(whatsappTextPayload);
    payload.entry[0]!.changes[0]!.value.messages[0] = {
      from: '5218711234567',
      id: 'wamid.AUDIO1',
      timestamp: '1752602400',
      type: 'audio',
      audio: { id: 'MEDIA-AUDIO-1', mime_type: 'audio/ogg; codecs=opus', voice: true },
    } as never;
    const [msg] = adapter.parse(payload);
    expect(msg).toMatchObject({
      kind: 'audio',
      media: { externalId: 'MEDIA-AUDIO-1', mimeType: 'audio/ogg; codecs=opus' },
      body: undefined,
    });
  });

  it('imagen con caption → kind=image y el caption como body', () => {
    const payload = structuredClone(whatsappTextPayload);
    payload.entry[0]!.changes[0]!.value.messages[0] = {
      from: '5218711234567',
      id: 'wamid.IMG1',
      timestamp: '1752602400',
      type: 'image',
      image: { id: 'MEDIA-IMG-1', mime_type: 'image/jpeg', caption: 'mi licencia federal' },
    } as never;
    const [msg] = adapter.parse(payload);
    expect(msg).toMatchObject({
      kind: 'image',
      body: 'mi licencia federal',
      media: { externalId: 'MEDIA-IMG-1' },
    });
  });

  it('sticker/reaction → lista vacía (se ACKea sin persistir)', () => {
    const payload = structuredClone(whatsappTextPayload);
    payload.entry[0]!.changes[0]!.value.messages[0] = {
      from: '5218711234567',
      id: 'wamid.STICK1',
      timestamp: '1752602400',
      type: 'sticker',
      sticker: { id: 'MEDIA-STICKER-1' },
    } as never;
    expect(adapter.parse(payload)).toEqual([]);
  });
});

describe('TelegramAdapter (channel-adapter)', () => {
  const adapter = new TelegramAdapter();

  it('normaliza un update de mensaje con id chatId_messageId y sin teléfono', () => {
    const [msg] = adapter.parse(telegramMessageUpdate);
    expect(msg).toMatchObject({
      channel: 'telegram',
      externalMessageId: '777000111_42',
      externalUserId: '777000111',
      senderName: 'María García',
      phoneE164: undefined,
      body: 'Me interesa la escuelita',
    });
  });

  it('updates sin mensaje procesable producen lista vacía', () => {
    expect(adapter.parse({ update_id: 1, edited_message: { message_id: 1 } })).toEqual([]);
    expect(adapter.parse({ update_id: 2, my_chat_member: {} })).toEqual([]);
    expect(adapter.parse(null)).toEqual([]);
  });

  it('nota de voz de Telegram → kind=audio con file_id', () => {
    const [msg] = adapter.parse({
      update_id: 4,
      message: {
        message_id: 44,
        from: { id: 777000111, first_name: 'María' },
        chat: { id: 777000111 },
        date: 1752602700,
        voice: { file_id: 'TG-VOICE-1', mime_type: 'audio/ogg' },
      },
    });
    expect(msg).toMatchObject({
      kind: 'audio',
      media: { externalId: 'TG-VOICE-1', mimeType: 'audio/ogg' },
    });
  });

  it('foto con caption → mayor resolución y caption como body', () => {
    const [msg] = adapter.parse({
      update_id: 5,
      message: {
        message_id: 45,
        from: { id: 777000111, first_name: 'María' },
        chat: { id: 777000111 },
        date: 1752602800,
        caption: 'foto de mi licencia',
        photo: [{ file_id: 'TG-PHOTO-SMALL' }, { file_id: 'TG-PHOTO-BIG' }],
      },
    });
    expect(msg).toMatchObject({
      kind: 'image',
      body: 'foto de mi licencia',
      media: { externalId: 'TG-PHOTO-BIG' },
    });
  });

  it('extrae teléfono cuando el usuario comparte su propio contacto', () => {
    const [msg] = adapter.parse({
      update_id: 3,
      message: {
        message_id: 43,
        from: { id: 777000111, first_name: 'María' },
        chat: { id: 777000111 },
        date: 1752602600,
        contact: { phone_number: '+52 871 123 4567', user_id: 777000111 },
      },
    });
    expect(msg?.phoneE164).toBe('+528711234567');
  });
});
