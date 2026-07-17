import { Module } from '@nestjs/common';
import { loadEnv } from '../../config/env';
import { ChannelCredentialsController } from './channel-credentials.controller';
import {
  ChannelCredentialsService,
  CREDENTIAL_CIPHER,
} from './channel-credentials.service';
import { ChannelCredentialsSeed } from './channel-credentials.seed';
import { CredentialCipher } from './credential-cipher';

/**
 * Almacén cifrado de credenciales de canal (channel-credentials). Provee el
 * cipher (null si no hay llave maestra), el servicio de resolución + CRUD, el
 * controller y el seed de migración desde env. Exporta el servicio para que
 * guards, senders y downloaders de ChannelsModule resuelvan credenciales.
 */
@Module({
  controllers: [ChannelCredentialsController],
  providers: [
    {
      provide: CREDENTIAL_CIPHER,
      useFactory: (): CredentialCipher | null => {
        const key = loadEnv().CHANNEL_CREDENTIALS_KEY;
        return key ? new CredentialCipher(key) : null;
      },
    },
    ChannelCredentialsService,
    ChannelCredentialsSeed,
  ],
  exports: [ChannelCredentialsService],
})
export class ChannelCredentialsModule {}
