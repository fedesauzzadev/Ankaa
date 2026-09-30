# f13-mini-validator · Mini-validador de ejemplos contra schemas

| Campo     | Valor                                        |
| --------- | -------------------------------------------- |
| Estado    | draft                                        |
| Fase      | 13                                           |
| Deriva de | Backlog M8.6; hueco explícito del pack elite |

## 1. Objetivo

Agregar validación determinista y offline de `example`/`examples` contra un
subset documentado de JSON Schema/OpenAPI, para detectar incompatibilidades que
no puede cubrir un átomo superficial como `SCHEMA-007`.

## 2. Alcance propuesto

- Resolver `$ref` locales de `components.schemas` con ciclos controlados.
- Validar un subset explícito: tipos, `enum`, `required`, `properties`, `items`,
  `minLength`/`maxLength`, `minimum`/`maximum` y combinadores aprobados.
- Emitir findings estables con JSON Pointer al ejemplo y al schema.
- Mantener INV-1, INV-2, INV-3, INV-4 e INV-7: sin red, sin LLM, sin ejecución de
  código y sin escribir fuera de outputs explícitos.

## 3. Fuera de alcance

- Compatibilidad completa con JSON Schema o vocabularios ajenos al subset.
- Validación de ejemplos externos por URL.
- Inferir o corregir ejemplos automáticamente.
- Sustituir `SCHEMA-007`, que seguirá cubriendo solo la compatibilidad entre
  `enum` y `type`.

## 4. Criterios de aceptación preliminares

- [ ] **AC-MV.1** El subset soportado está especificado antes de implementar.
- [ ] **AC-MV.2** Casos válidos e inválidos tienen findings deterministas y
      pointers reproducibles.
- [ ] **AC-MV.3** `$ref` remoto, ciclos no resolubles y keywords fuera del
      subset producen un resultado explícito, nunca un falso éxito silencioso.
- [ ] **AC-MV.4** Fixtures de ataque y tests de límites cubren profundidad,
      tamaño y ciclos.
- [ ] **AC-MV.5** `pnpm check` e invariantes permanecen verdes.

## 5. Decisión pendiente

No implementar hasta acordar el subset, el formato de `example`/`examples` que
se inspeccionará y el costo aceptable de precisión/performance. Cuando se
apruebe, crear un plan y tasks propios antes de tocar parser o core.
