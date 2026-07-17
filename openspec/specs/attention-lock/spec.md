# attention-lock

## Requirements

### Requirement: Atomic bot/human lock on bot sends
Bot `send_message` SHALL verify bot mode via an atomic conditional UPDATE on the
conversation (`WHERE attention_mode='bot'`): if no row matches (a human took over),
the action fails with 409 `BOT_NOT_ACTIVE` and nothing is sent. The human attention-mode
toggle remains the only way to re-enable the bot; the bot cannot change `attentionMode`
except to hand off to human.

#### Scenario: Human takeover wins the race
- **WHEN** a recruiter switches the conversation to human while a bot send is in flight
- **THEN** the bot's action fails with `BOT_NOT_ACTIVE` and no outbound message persists

#### Scenario: Bot cannot re-enable itself
- **WHEN** the bot attempts any action that would set `attentionMode='bot'`
- **THEN** no such action exists in the catalog (handoff only goes bot→human)
