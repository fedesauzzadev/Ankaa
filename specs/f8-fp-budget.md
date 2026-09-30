# f8-fp-budget · Métrica de feedback por regla

| Campo     | Valor                                                 |
| --------- | ----------------------------------------------------- |
| Estado    | draft                                                 |
| Fase      | 8                                                     |
| Deriva de | backlog `f8-elite-100`; `f3-learn`; INV-2/INV-5/INV-7 |

## 1. Objetivo

Ayudar a un equipo a detectar reglas que reciben mucho feedback de falso
positivo o `wontfix`, usando solo datos locales que el usuario ya decidió
entregar. La métrica informa; no cambia silenciosamente el pack ni desactiva
reglas.

## 2. Preguntas para pasar a `ready`

- ¿El denominador son findings emitidos, findings revisados o findings únicos
  por fingerprint? ¿Cómo se evita interpretar falta de feedback como cero FP?
- ¿Se agregan datos solo del feedback explícito de `learn`, del tracking del
  dashboard o de ambos? ¿Cómo se deduplican y vinculan reportes de distintas
  corridas?
- ¿El presupuesto usa umbral absoluto, proporción mínima de muestras, ventana
  temporal o periodo manual? ¿Qué significa exactamente `> X%`?
- ¿El resultado es un informe/aviso, recomendación de calibración o bloqueo?
  El default no puede mutar reglas ni cambiar severidad.
- ¿Cuál es la ruta explícita de entrada/salida para cumplir INV-7 y cómo se
  evita incluir ejemplos, rutas sensibles o contenido de specs en logs?

## 3. Límites

- Sin telemetría ni envío de feedback fuera del equipo (INV-1/privacidad).
- No calcular porcentajes cuando no existe muestra suficiente ni convertir
  silencios en aprobación.
- No usar `Date.now()` ni estado no versionado para influir en hashes,
  findings, orden o análisis determinista (INV-2).
- No escribir packs ni suppressions automáticamente; cualquier cambio sigue
  pasando por los flujos explícitos de `learn`/skills (INV-5/INV-7).

## 4. Criterios para pasar a `ready`

Definir fuente de datos, unidad de conteo/deduplicación, volumen mínimo,
ventana/umbral, salida y acción no-mutante; añadir ejemplos de muestra pequeña,
sin feedback, feedback mixto y regla con alta tasa, todos reproducibles.
