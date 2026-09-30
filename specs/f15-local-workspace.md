# f15-local-workspace · Espacio de trabajo local guiado

| Campo     | Valor                                                                       |
| --------- | --------------------------------------------------------------------------- |
| Estado    | ready                                                                       |
| Fecha     | 2026-10-01                                                                  |
| Fase      | 15                                                                          |
| Deriva de | SDD, ADR-013, ADR-015, `f8-scan-org`, `f10-dashboard`, `f14-agent-api-gate` |

## 1. Objetivo / user story

Como persona que no conoce todos los comandos quiero iniciar ApiGovScan desde
una terminal o una interfaz web local, elegir qué analizar, entender el
progreso, volver a resultados anteriores y comparar ejecuciones, sin subir mis
specs ni tener que recordar flags.

El producto mantiene dos superficies guiadas sobre los mismos casos de uso:

- `apigovscan guided`: asistente por terminal con elecciones y confirmaciones.
- `apigovscan workspace`: aplicación web local servida por el proceso CLI.

La CLI existente sigue disponible y conserva su comportamiento; no se exige
abrir un navegador para usar ApiGovScan.

## 2. Alcance

### In

- Inicio guiado y catálogo de acciones existentes con descripciones y
  validaciones antes de ejecutar.
- Flujos para analizar un directorio local, un repositorio Git individual o
  una organización de GitHub; revisión base-candidato con `review`.
- Progreso observable por fase y repositorio (`n de m`), mensajes de espera,
  errores accionables, cancelación y reanudación cuando la operación lo admita.
  No se muestran porcentajes ficticios.
- Historial local de ejecuciones con resultados íntegros; selección de dos
  resultados para comparación por contratos/findings cuando sus formatos lo
  soporten.
- `scan-org` reanudable: continuar una ejecución interrumpida o iniciar un
  reanálisis desde cero. Los resultados previos se conservan para comparar.
- En modo continuar, una respuesta cacheada solo se reutiliza si se verifica
  la identidad del repo, la revisión del origen y la huella efectiva de
  configuración, versión del motor y packs. Si no puede verificarse, se vuelve
  a analizar o se informa el bloqueo; nunca se declara vigente un resultado
  obsoleto.
- Asistente de preparación de CI que previsualiza los archivos a generar y
  requiere confirmación explícita antes de escribirlos en destinos indicados.
- Estado y reportes bajo `.apigovscan/workspace/` por defecto; un directorio
  alternativo solo mediante una opción explícita del usuario. Las ejecuciones
  previas no se borran al reanalizar.
- Toda interfaz usa casos de uso tipados compartidos con la CLI; no traduce
  entradas del usuario a comandos de shell arbitrarios.
- El usuario decide iniciar cada operación con red, como consultar/clonar
  repositorios GitHub; el análisis de los archivos clonados sigue siendo local.

### Out

- Portal hospedado, autenticación multiusuario, telemetría, sincronización o
  subida de reportes.
- Ejecución de comandos arbitrarios, shell remoto o construcción de una API
  genérica de filesystem.
- Activar branch protection, crear secrets o modificar settings del proveedor
  CI automáticamente.
- Reanudar en caliente cualquier operación que no tenga checkpoints seguros;
  esas operaciones pueden reiniciarse con estado honesto.
- Borrar historial automáticamente o presentar resultados viejos como si
  fueran actuales.

## 3. Contrato

### Comandos y navegación

- `guided` presenta un menú por terminal y ejecuta los mismos casos de uso que
  la interfaz web. Cancelar o responder que no a una confirmación no escribe ni
  inicia la acción confirmada.
- `workspace [--port <n>]` inicia el servidor en `127.0.0.1`; el puerto
  predeterminado es efímero. Imprime la URL y termina solo al recibir cierre o
  cancelación explícitos.
- La web contiene Inicio, Nuevo análisis/revisión, Progreso, Resultados,
  Comparar y Preparar CI. Mantiene visible la navegación, el estado de carga y
  la acción siguiente.
- Las entradas de paths son directorios/archivos seleccionados o escritos
  expresamente por el usuario; el browser no obtiene acceso implícito al disco.
  URLs aceptadas se limitan a esquemas soportados y se muestran antes de
  clonar/consultar.
- Cada acción confirma fuente, destino, modo continuar/desde cero y cualquier
  escritura antes de empezar.

### Persistencia y ejecución

- Cada ejecución tiene id, tipo, fuente identificable, estado, tiempo de
  inicio/fin, versión del schema, resultados y detalle de progreso.
- Escrituras durables son atómicas; un resultado de repo y su checkpoint se
  publican juntos. Un fallo no transforma un resultado incompleto en éxito.
- Historial y resultados no contienen tokens, credenciales ni cuerpos de
  requests. Un secret nunca se copia al workspace.
- Reanudar conserva el historial y procesa repos pendientes/fallidos o cuyos
  fingerprints verificables hayan cambiado. Desde cero crea una ejecución
  nueva y evalúa todo; no elimina ejecuciones anteriores.
- Correlación/compare solo se ofrece cuando los dos artefactos son compatibles;
  diferencias de formato o datos insuficientes se explican explícitamente.

### Operación compartida inicial: `analyze`

- **Inputs:** archivo local, directorio local o `-` (stdin en CLI), junto con
  las opciones de análisis ya soportadas.
- **Output:** reporte y exit code según `fail-on`; el adapter puede recibir
  eventos tipados de estado y progreso.
- **Errors:** argumentos/configuración inválidos, lectura o parseo fallido,
  evaluación/reporte fallidos y cancelación.
- **Writes:** ninguna por defecto; `--output` y `--write-baseline` escriben
  solo en los destinos explícitos existentes.
- **Network:** no. Usa el pipeline local compartido por CLI y MCP.
- **Progreso:** eventos con fase, elemento actual y contadores reales
  `completed`/`total`; nunca porcentajes estimados.
- **Cancelación:** `AbortSignal` cancela entre fases y puede abortar lectura o
  escritura local cuando el adapter lo soporta. Una cancelación termina en
  estado `cancelled`, exit code 2 y no presenta el reporte como exitoso.

### Seguridad del servidor local

- Bind exclusivo a loopback, puerto efímero por defecto, validación de `Host` y
  `Origin`, token aleatorio por proceso para mutaciones y expiración al cerrar.
- La interfaz solo invoca operaciones allowlistadas. No expone shell, lectura
  arbitraria, escritura arbitraria, rutas de red ni un endpoint genérico de
  ejecución.
- Rutas de salida se limitan a `.apigovscan/` o a destinos expresos del usuario
  y requieren preview/confirmación. Datos de interfaz se renderizan escapados.
- El store administrado rechaza componentes de workspace que sean symlinks o
  archivos donde espera directorios; el archivo de historial debe ser regular.
- No se almacenan credentials. Requests remotos solo ocurren como parte de una
  acción elegida y visible.

## 4. Criterios de aceptación

- [x] **AC-15.1** La spec de cada acción que se incorpora al catálogo define
      inputs, salida, errores, escritura y necesidad de red; las opciones antiguas
      de CLI no cambian de comportamiento.
- [x] **AC-15.2** `guided` permite iniciar y cancelar flujos soportados con
      validaciones; sus resultados coinciden con los del caso de uso CLI equivalente.
- [x] **AC-15.3** `workspace` sirve la app solo en loopback, imprime URL y
      permite navegación sin CDN ni recursos remotos.
- [x] **AC-15.4** Requests mutantes rechazan Host/Origin inválidos o token
      ausente/incorrecto; no hay rutas genéricas de shell ni filesystem.
- [ ] **AC-15.5** El usuario puede elegir directorio local, URL de repo o
      organización; cada origen remoto deja clara la acción de red antes de iniciar.
- [x] **AC-15.6** El progreso muestra fase, elemento actual y contadores
      reales; errores, cancelación y reanudación se distinguen de una ejecución
      exitosa.
- [x] **AC-15.7** Una ejecución interrumpida puede reanudarse sin perder
      resultados/checkpoints ya escritos; resultados parciales no se presentan como
      completos.
- [x] **AC-15.8** Continuar reutiliza un resultado únicamente si identidad,
      revisión, versión, packs y configuración efectiva coinciden; incertidumbre
      implica reanalizar o reportar error explícito.
- [x] **AC-15.9** Desde cero analiza todo y conserva los resultados anteriores;
      historial permite abrir un reporte y comparar dos ejecuciones compatibles.
- [x] **AC-15.10** Preparar CI previsualiza cambios y requiere confirmación; no
      habilita branch protection ni altera settings de plataformas.
- [x] **AC-15.11** Historial, progreso y errores no guardan/exponen credenciales
      ni contenidos completos de contratos fuera de reportes elegidos por el usuario.
- [x] **AC-15.12** INV-1/2/3/4/7, compatibilidad Windows/macOS/Linux, tests
      focalizados y `pnpm check` pasan.

## 5. Secuencia de entrega

1. **M15.1 — persistencia y reanudación de `scan-org`:** modelo de ejecuciones,
   checkpoints atómicos, resume vs. from-scratch, historial y tests de
   identidad/frescura. Mantiene la CLI existente compatible.
2. **M15.2 — casos de uso y progreso:** operaciones compartidas tipadas para
   las acciones guiadas; estados, cancelación y progreso sin porcentajes
   inventados.
3. **M15.3 — workspace web seguro:** extensión del servidor loopback, menú
   guiado, fuentes local/Git/repo y pantallas de progreso/resultados.
4. **M15.4 — historial y comparación:** selector de ejecuciones, vistas de
   resultados y comparación por findings/contratos compatibles.
5. **M15.5 — wizard de terminal y setup de CI:** parity con acciones web,
   preview y escritura explícitamente confirmada.
6. **M15.6 — cierre de producto:** accesibilidad, UX multi-OS, documentación,
   seguridad, invariantes y tests end-to-end.

## 6. Plan de pruebas

- Store: atomicidad ante interrupción, schema inválido, doble proceso/lock,
  historial inmutable y rutas permitidas.
- Resume: corte después de un repo, repo fallido, cambio de commit, cambio de
  config/packs/versión, destino clonado existente y modo desde cero.
- UI: navegación, estados vacíos/en progreso/error/cancelado, inputs inválidos,
  confirmaciones, accesibilidad de teclado y mensajes sin contenido sensible.
- Seguridad: loopback, Host/Origin, token, payloads malformados, XSS, traversal,
  URLs/protocolos prohibidos, ausencia de ejecución de shell arbitraria y no
  persistencia de credentials.
- Paridad: mismos inputs/config producen mismos reportes que el CLI existente.

## 7. Dependencias y decisiones cerradas

- Ampliación local y acotada de ADR-013 según ADR-015; no es un portal ni un
  servicio de análisis remoto.
- Runtime y servidor permanecen en `packages/cli`; dominio y engine no ganan
  dependencias de red, Node APIs ni LLM.
- Estado de workspace local, versionado y verificable; no se almacena ningún
  secret.
- `scan-org` existente sigue sin reusar resultados salvo que el usuario elija
  explícitamente continuar.
- Un `git SHA` verificable y la huella de análisis son condición para reusar
  resultados remotos; timestamps aproximados no bastan.

## Changelog

- 2026-10-01 · Especificación creada `ready` con decisión de producto: workspace
  local guiado por terminal/web e historial reanudable, empezando por `scan-org`.
- 2026-10-01 · M15.1 implementado: `scan-org` conserva runs/checkpoints
  atómicamente y reutiliza solo repos con revisión/configuración/herramientas
  verificadas; `--from-scratch` crea otro run sin borrar el historial.
- 2026-10-01 · M15.2 implementado para el caso de uso `analyze`: contrato
  tipado de operación, fases/contadores reales, estados terminales y
  cancelación compartidos con el adapter CLI; sin cambios al reporte.
- 2026-10-01 · M15.3 implementado: `apigovscan workspace [--port <n>]` sirve la
  app guiada en loopback (puerto efímero por defecto) con token por proceso,
  validación Host/Origin en mutaciones, endpoints allowlistados tipados
  (`/api/catalog`, `/api/state`, `/api/result`, `/api/analyze/start|cancel`) y
  UI inline sin CDN;   `analyze` corre con progreso real y paridad de reportHash
  con la CLI; `dashboard` existente sin cambios (AC-15.3/15.4).
- 2026-10-01 · M15.4 implementado: historial de runs persistido bajo
  `.apigovscan/workspace/runs/` (un JSON atómico por ejecución, estados
  terminales, resultados íntegros), endpoints `/api/runs`, `/api/runs/:id` y
  `/api/compare` con compatibilidad estricta (ambos succeeded + mismos inputs;
  incompatibilidad explicada, nunca presentada como limpia), vista de historial
  y comparación por fingerprints (new/repeated/resolved reutilizando el
  comparador del dashboard), sin persistir cuerpos de contratos (AC-15.9/15.11).
- 2026-10-01 · M15.5 implementado: `apigovscan guided` — asistente de terminal
  con catálogo (descriptor tipado de `analyze` + preparación de CI), validación
  de paths re-preguntando, confirmación previa a ejecutar/escribir y cancelación
  sin efectos; analyze con paridad de reportHash con la CLI; preparación de CI
  que previsualiza el workflow completo (modo analyze o review con `review-ref`)
  y escribe un solo archivo tras confirmación, rehusando pisar existentes sin
  confirmación explícita y sin tocar branch protection/settings (AC-15.1/15.2/15.10).
- 2026-10-01 · M15.6 cierre: accesibilidad de la web (landmarks, labels,
  `aria-live` en progreso/resultados/historial, estados vacíos/loading/error
  verificados por test), verificación multi-OS vía matriz CI (ubuntu/windows/
  macos × Node 22/24 con gates de invariantes) y `pnpm check` verde. AC-15.6–8
  quedan cubiertos por los estados distinguibles del workspace y el resume
  verificado de `scan-org` (M15.1). **Pendiente:** AC-15.5 (orígenes remotos
  Git/org en las superficies guiadas, con consentimiento de red explícito) para
  poder cerrar la fase.
