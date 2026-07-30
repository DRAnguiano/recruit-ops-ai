# spa-blue-accent-theme

## Purpose

La plataforma usa azul brillante como color de acento sobre fondo blanco, con naranja/ámbar
reservado a alertas de atención urgente y el semáforo de estados (verde/amarillo/rojo) intacto.

## Requirements

### Requirement: Blue is the platform accent on white
The SPA SHALL use a bright blue (`#2563EB`, hover `#1D4ED8`) as its accent color on a white/near-white
background across views, replacing the previous orange accent.

#### Scenario: Accent applied across views
- **WHEN** any main view renders (funnel, campaigns, capacity, imports, admin, sidebar)
- **THEN** interactive and brand-accent elements use the blue accent, not orange

### Requirement: Orange reserved for urgent-attention alerts
Orange/amber SHALL be used only for urgent-attention indicators (e.g. high fleet/circuit deficit,
overdue SLA), not as a general accent.

#### Scenario: Orange only on alerts
- **WHEN** a view shows an urgent-attention indicator
- **THEN** it may use orange/amber; elsewhere the accent is blue

### Requirement: Status semaphore is preserved
The green/yellow/red status semaphore SHALL remain unchanged by the accent migration.

#### Scenario: Semaphore untouched
- **WHEN** a status indicator renders green/yellow/red
- **THEN** its colors are unaffected by the accent change
