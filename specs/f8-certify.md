# f8-certify · Verificación de integridad del reporte

| Campo     | Valor                                            |
| --------- | ------------------------------------------------ |
| Estado    | draft                                            |
| Fase      | 8                                                |
| Deriva de | backlog `f8-elite-100`; report JSON; INV-2/INV-7 |

## 1. Objetivo

Definir cómo un consumidor comprueba que un reporte, su score y el pack
asociado no cambiaron entre su generación y su verificación. No asumir que un
hash sin firma demuestra quién produjo el reporte: un hash solo detecta cambios
si el hash esperado llega por un canal confiable.

## 2. Historia de consumidor pendiente

La feature no pasa a `ready` hasta nombrar quién firma, quién verifica, dónde se
intercambia el artefacto y qué decisión toma CI ante un reporte inválido,
expirado o no confiable.

## 3. Opciones a decidir

- Hash/digest reproducible con verificación fuera de banda, o firma digital con
  clave privada del productor y clave pública confiada por el consumidor.
- Certificado detached o envelope con reporte, hash, score y referencia exacta
  del pack.
- Custodia de claves: responsabilidad exclusiva del consumidor o integración
  con un proveedor/KMS que no añada red al core.
- Alcance de lo firmado: bytes exactos del reporte o representación canónica de
  campos seleccionados; política ante cambios de formato/versiones.
- CLI local de `certify`/`verify`, códigos de salida y fixture de manipulación.

## 4. Límites

- `analyze` y el engine siguen sin red.
- No incluir claves privadas, secretos ni gestión de identidad en el repositorio.
- No llamar a un reporte “tamper-evident” si el consumidor no tiene una raíz de
  confianza para verificar su autenticidad.
- Verificar que los datos firmados son los que el consumidor usará (reporte,
  score y pack); no sustituir la revisión de una fuente confiable.

## 5. Criterios para pasar a `ready`

Historia de consumidor y canal de confianza acordados; amenaza y formato de
integridad definidos; límites de custodia/responsabilidad especificados; AC de
firma/verificación, manipulación y compatibilidad con pruebas negativas.
