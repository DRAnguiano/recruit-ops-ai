import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ActionResult, BotAction, BotActionsService } from './bot-actions.service';
import { BotSignatureGuard } from './guards/bot-signature.guard';

const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send_message'),
    conversationId: z.string().uuid(),
    body: z.string().min(1).max(4096),
  }),
  z.object({
    type: z.literal('extract_data'),
    conversationId: z.string().uuid(),
    fields: z
      .array(
        z.object({
          key: z.string().min(1).max(64),
          value: z.string().min(1).max(500),
          evidence: z.object({
            quote: z.string().max(1000),
            messageId: z.string().uuid(),
          }),
        }),
      )
      .min(1)
      .max(20),
  }),
  z.object({
    type: z.literal('request_handoff'),
    conversationId: z.string().uuid(),
    reason: z.string().min(1).max(500),
  }),
]);

const bodySchema = z.object({
  contractVersion: z.literal(1),
  actions: z.array(actionSchema).min(1).max(5),
});

/** Contrato v1 del bot: catálogo cerrado, autenticado por HMAC. */
@Controller('bot/v1')
export class BotController {
  constructor(private readonly actions: BotActionsService) {}

  @Post('actions')
  @HttpCode(200)
  @UseGuards(BotSignatureGuard)
  async executeActions(
    @Body(new ZodValidationPipe(bodySchema)) body: z.infer<typeof bodySchema>,
  ): Promise<{ results: ActionResult[] }> {
    return { results: await this.actions.execute(body.actions as BotAction[]) };
  }
}
