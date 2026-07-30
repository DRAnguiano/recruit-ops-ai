## Context

Pestaña `activeTab === 'funnel'` en `src/App.tsx` (líneas ~786-935): 6 `KPICard` + tabla
«Control Operativo por Reclutadora» + gráfica de barras apiladas «Arribo Diario por Agente».
Métricas ya calculadas en el componente (líneas ~473-497): `filteredLeadsForPeriod`,
`totalLeadsFB`, `respondedLeads`, `realConversations` (`isConversationReal`), `hiringCount`
(`status='hired'`). El tema vive en `src/index.css` con tokens `--color-tm-orange` (#FF671F) y
navy; el resto del color es clases Tailwind hardcodeadas (`orange-500` ×32, etc.).

Datos reales hoy (crm_reclutamiento, periodo demo): 278 leads, 278 conversaciones reales,
0 contestados (gap `firstResponse`), 0 contratados. El embudo será fiel a esto.

## Goals / Non-Goals

**Goals:** embudo visual por etapas con caída entre pasos; KPI cards de resumen; acento azul
brillante en toda la plataforma sobre blanco; naranja solo en alertas.

**Non-Goals:** calcular `firstResponse*`; arreglar `isConversationReal=true` hardcodeado; añadir
etapas de perfilamiento sin dato; tocar backend; rediseñar la lógica de otras pestañas.

## Decisions

### 1. Etapas del embudo derivadas solo de señales existentes
Cuatro etapas, en orden, cada una subconjunto lógico de la anterior:
1. **Leads ingresados** = `filteredLeadsForPeriod.length`
2. **Conversaciones reales** = leads con `isConversationReal`
3. **Contestados** = leads con `responded`
4. **Contratados** = leads con `status='hired'`

Cada etapa muestra su conteo, su % respecto al total (tope del embudo) y la **caída vs. la etapa
anterior**. No se inventan «perfilado/apto» (no hay campo); se deja un comentario de que se
insertarán cuando exista el dato. Regla §2 (la UI no inventa datos) respetada.

### 2. Componente `WeeklyFunnel` presentacional
Nuevo `src/components/WeeklyFunnel.tsx` que recibe `stages: { label, value, hint }[]` ya calculadas
desde App.tsx (App.tsx sigue siendo el dueño del cálculo, como con el resto de métricas). Render:
barras horizontales de ancho proporcional al total, con etiqueta, conteo, % del total y delta de
caída. Sin dependencia nueva (CSS/flex, no recharts) para que el embudo sea nítido y controlable.
Estado vacío cuando no hay leads en el periodo (coherente con `hide-empty-capacity-sections`).

### 3. Mapa de color naranja → azul
Barrido mecánico de clases, preservando tono/intensidad:
- `orange-500`/`#f97316`/`tm-orange` (acento) → `blue-600` (#2563EB)
- `orange-600` (hover/fuerte) → `blue-700` (#1D4ED8)
- `orange-400` → `blue-500`; `orange-100`/`orange-50` (fondos suaves) → `blue-100`/`blue-50`;
  `orange-200` (bordes) → `blue-200`; `orange-800`/`orange-950` (texto sobre claro) → `blue-800`/`blue-950`.
- **Excepción alertas**: donde el naranja marca atención urgente (déficit alto de flota/circuito en
  CoverageView, avisos de SLA) se conserva `amber-*`/`tm-orange`. Se decide caso por caso al editar
  cada archivo, no con un find-replace ciego.
- **Semáforo intacto**: `green-*`/`yellow-*`/`red-*` de estados no se tocan.
`index.css`: se conserva `--color-tm-orange` (ahora semántico = alerta) y `body` a blanco/#F8FAFC.

### 4. Sidebar navy: acento en BLANCO, no azul (contraste)
El sidebar (`Sidebar.tsx`) mantiene su fondo navy (`bg-navy-850`), que ya es el «azul» de marca.
Sobre navy, el azul-acento (#2563EB) se perdería por bajo contraste, así que los elementos que hoy
son naranja pasan a **blanco** para destacar:
- **Opción activa**: `bg-tm-orange text-white` → `bg-white text-navy-900 font-semibold shadow-md`
  (píldora blanca sobre navy = estado activo nítido). Icono activo `text-blue-600`; badge activo
  `bg-navy-900 text-white` (oscuro sobre la píldora blanca).
- **Recuadro del camión (Torre de Control)**: `bg-tm-orange` → `bg-white` con el icono `text-blue-600`
  (blanco + azul de marca, alto contraste sobre navy). No naranja.
- **«Transmontes S.A. de C.V.» (footer)**: `text-tm-orange/90` → `text-white`.
Contraste verificado: navy-900 (#001529) sobre blanco ≈ 17:1; blue-600 sobre blanco ≈ 4.6:1;
blanco sobre navy ≈ 15:1. Todos por encima de AA.

### 5. Un solo change (atómico) pese a tocar 9 archivos
Embudo y color van juntos porque el embudo debe nacer azul (evita recolorearlo después). El barrido
es mecánico; el conteo de tareas queda ≤15. Si al implementar el color se dispara, se parte el color
a un change aparte.

## Risks / Trade-offs

- **Embudo con 3 de 4 etapas en 0 hoy** → es fiel al gap real (`firstResponse` sin computar); se
  llenará al cerrar ese backlog. Se comunica al usuario, no se maquilla.
- **Find-replace de color puede pisar una alerta legítima** → por eso el barrido es archivo por
  archivo revisando contexto, no `sed` global.
- **`realConversations == total`** (por `isConversationReal=true` hardcodeado) → el embudo mostrará
  la 1ª y 2ª etapa iguales; es un gap de dato preexistente, anotado, fuera de alcance aquí.
