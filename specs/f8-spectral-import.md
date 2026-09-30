# f8-spectral-import · Import offline de reglas Spectral

| Campo     | Valor                                   |
| --------- | --------------------------------------- |
| Estado    | draft                                   |
| Fase      | 8                                       |
| Deriva de | ADR-014; `f8-rules-import`; INV-1/INV-4 |

## 1. Objetivo

Transpilar un subconjunto explícito de reglas Spectral a drafts de reglas
ApiGovScan para que el engine existente las valide y ejecute. No ejecutar el
DSL de Spectral ni agregar un segundo motor.

## 2. Límites innegociables

- Importación local y offline: leer un archivo que el usuario señale y escribir
  drafts solo al output explícito.
- Nada de JSONPath en runtime, `eval`, `new Function`, funciones JS custom ni
  carga de reglas desde red.
- Cada regla importada conserva la fuente Spectral (título/URL) y el origen
  (`given`/función) como metadata de explicación.
- Las reglas no representables se omiten con un motivo individual; nunca se
  aproximan silenciosamente ni se convierten en reglas de éxito aparente.

## 3. Corte candidato

Empezar por reglas OAS con `given` y funciones que tengan traducción directa a
átomos whitelist del engine (por ejemplo, `truthy`, `pattern` y
`operation-singular-tag`, sujeto al spike ADR-014). El corte exacto queda
pendiente de inventario verificable contra la versión fijada del ruleset.

## 4. Preguntas para pasar a `ready`

- ¿Qué versión/esquema de ruleset Spectral se aceptan y cómo se seleccionan
  rulesets extends sin resolver paquetes ni URLs?
- ¿Cuál es la lista cerrada de funciones, expresiones `given` y opciones
  transliterables, cada una con tests positivos y negativos?
- ¿Cómo se representa severidad, descripción, documentación y source URL en
  custom rules?
- ¿Qué límite de tamaño/profundidad protege al importador de archivos enormes?
- ¿Qué salida resume reglas importadas y reglas omitidas, y cuál es el formato
  de error ante una regla inválida?

## 5. Fuera de alcance

Ejecutar rulesets Spectral; equivalencia completa con Spectral; reglas con JS
custom o validación completa JSON Schema; red, LLM o publicación automática de
drafts.

## Referencias

- [ADR-014](../docs/02-arquitectura.md): Spectral se transpila, no se ejecuta.
- [f8-rules-import](f8-rules-import.md): pipeline local de importación.
