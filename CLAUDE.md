# CRM/ATS AI-native de Reclutamiento Operativo

CRM/ATS multiempresa, omnicanal y AI-native para reclutamiento operativo (foco inicial:
operadores de quinta rueda en logística/transporte).

## Contexto obligatorio

Lee `openspec/project.md` antes de proponer o implementar cualquier cambio. Contiene la
tesis del producto, la arquitectura acordada, el modelo de datos, el roadmap por fases y la
secuencia de changes prevista. Es la fuente de verdad de las decisiones de diseño.

## Workflow

Este proyecto usa **OpenSpec Driven Development** (comandos `/opsx:propose`, `/opsx:apply`,
`/opsx:archive`, `/opsx:explore`, `/opsx:sync`):

- Ningún cambio de código sin un change OpenSpec aprobado en `openspec/changes/`.
- Changes atómicos: si `tasks.md` supera ~12-15 tareas, dividir en dos propuestas.
- Respetar la secuencia de changes de `openspec/project.md` §10 salvo indicación del usuario.
- Commitear `openspec/` junto con el código.

## Reglas no negociables (resumen — detalle en openspec/project.md §2)

1. **Nada de negocio hardcodeado**: empresas, vacantes, perfiles, criterios de score, horarios,
   zonas horarias y reglas de campaña/llamada/IA son datos configurables desde UI, nunca código.
2. **La IA nunca decide**: no avanza a viable/descartado/contratado, no inventa datos ni
   vacantes; opera vía tool-calling con catálogo cerrado validado por backend.
3. **La lógica de negocio nunca vive en prompts**; el motor determinista del sistema decide,
   la IA solo conversa y extrae datos con evidencia (cita textual + fuente).
4. **Score auditable siempre**: desglose por criterio, versión de reglas, evidencia por dato.
5. **Multi-proveedor de IA**: toda llamada a LLM pasa por la abstracción `LLMProvider`.
6. **Configuración versionada**: borrador → publicación inmutable; evaluaciones referencian versión.
7. **UTC en almacenamiento; TZ IANA del schedule para evaluar horarios**, nunca la del servidor.

## Stack

TypeScript + NestJS (monolito modular) · PostgreSQL · Redis + BullMQ · React SPA ·
S3-compatible · event log append-only (`domain_events`) como fuente de métricas y auditoría.

## Convenciones

TypeScript estricto sin `any` · archivos kebab-case · dominio en inglés, UI en español ·
env vars validadas con zod · errores de dominio tipados · módulos por dominio sin imports
cruzados salvo interfaces públicas · tests unitarios obligatorios para motor de score y
resolución de modo de IA.
