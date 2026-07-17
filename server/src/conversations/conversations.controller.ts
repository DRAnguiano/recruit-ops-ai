import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { uuidParam } from '../common/uuid-param.pipe';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { paginationQuerySchema } from '../common/pagination';
import { ChannelQueuesService } from '../channels/channel-queues.service';
import { OutboundService, SendInput } from '../channels/outbound.service';
import { ConversationsService } from './conversations.service';

const listQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open', 'closed']).optional(),
  channel: z.string().min(1).optional(),
  assignedAgentId: z.string().uuid().optional(),
  attentionMode: z.enum(['human', 'bot']).optional(),
  personId: z.string().uuid().optional(),
});

const assignBodySchema = z.object({ agentId: z.string().uuid().nullable() });
const attentionModeBodySchema = z.object({ mode: z.enum(['human', 'bot']) });

/** Texto libre XOR plantilla (inbox-api delta). */
const sendBodySchema = z.union([
  z.object({ body: z.string().min(1).max(4096) }),
  z.object({
    templateId: z.string().uuid(),
    variables: z.array(z.string().min(1).max(500)).max(20).default([]),
  }),
]);

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly outbound: OutboundService,
    private readonly queues: ChannelQueuesService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>) {
    return this.conversations.list(query);
  }

  @Get(':id')
  getById(@Param('id', uuidParam()) id: string) {
    return this.conversations.getById(id);
  }

  @Get(':id/messages')
  listMessages(
    @Param('id', uuidParam()) id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.conversations.listMessages(id, query.limit, query.cursor);
  }

  @Post(':id/messages')
  async send(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(sendBodySchema)) body: z.infer<typeof sendBodySchema>,
  ) {
    const input: SendInput =
      'body' in body
        ? { kind: 'text', body: body.body }
        : { kind: 'template', templateId: body.templateId, variables: body.variables };
    const message = await this.outbound.createOutbound(id, input);
    await this.queues.enqueueOutbound(message.id);
    return {
      id: message.id,
      direction: message.direction,
      type: message.type,
      body: message.body,
      sentAt: message.sentAt,
      delivery: message.delivery,
    };
  }

  @Post(':id/assign')
  assign(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(assignBodySchema)) body: z.infer<typeof assignBodySchema>,
  ) {
    return this.conversations.assignAgent(id, body.agentId);
  }

  @Post(':id/attention-mode')
  setAttentionMode(
    @Param('id', uuidParam()) id: string,
    @Body(new ZodValidationPipe(attentionModeBodySchema))
    body: z.infer<typeof attentionModeBodySchema>,
  ) {
    return this.conversations.setAttentionMode(id, body.mode);
  }

  @Post(':id/close')
  close(@Param('id', uuidParam()) id: string) {
    return this.conversations.close(id);
  }
}
