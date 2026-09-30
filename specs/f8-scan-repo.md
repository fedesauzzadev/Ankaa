# f8-scan-repo · Analizar un repositorio Git individual

| Campo     | Valor                            |
| --------- | -------------------------------- |
| Estado    | cerrada                          |
| Fase      | 8                                |
| Deriva de | `f8-scan-org`; INV-1/INV-2/INV-7 |

## 1. Objetivo

Permitir analizar un único repositorio remoto sin clonarlo manualmente:
`apigovscan scan-repo <git-url>`. Es un comando de red explícito; `analyze`,
parse y engine mantienen su boundary offline.

## 2. Alcance

### Dentro

- Aceptar URLs HTTPS Git de cualquier proveedor y URLs SSH (`ssh://` o forma
  SCP `user@host:path`) usando las credenciales/agent/config local de Git.
- Rechazar protocolos distintos de HTTPS/SSH, userinfo embebido en URLs HTTPS,
  query strings y fragments. No imprimir URLs en logs; no capturar ni mostrar
  contenido del repo.
- Clonar con `git clone --depth 1` en un directorio único creado bajo el temp
  del sistema y eliminar únicamente ese directorio al terminar, incluso ante
  error. `--workdir` explícito conserva el clone y no se limpia.
- Desactivar prompts de terminal de Git/SSH; autenticar solo con los helpers
  del usuario. Timeout configurable con un default acotado.
- Correr el pipeline y el pack del usuario como `analyze` en la raíz clonada;
  respetar config/license existentes en el repo. Reporte opcional JSON o
  console y `--out` explícito (no sobrescribir sin `--force`).
- Mensajes de error redactados: nunca incluir URL completa, credenciales ni
  salida cruda de Git.

### Fuera

- Clonar repositorios sin una invocación explícita, en `analyze` o en el core.
- `file://`, HTTP sin TLS, protocolos Git arbitrarios, clones recursivos/submodules,
  checkout de branches/tags/revisions, pull requests o escrituras al repo remoto.
- Gestionar/guardar tokens o claves SSH.

## 3. Contrato CLI

```text
apigovscan scan-repo <git-url>
  [--format console|json] [--out <file>] [--force] [--workdir <dir>]
  [--license-key <key>]
```

- Sin `--workdir`, el clone es temporal y se limpia; con `--workdir`, debe ser
  un directorio existente y vacío, y el clone queda allí con nombre estable.
- Exit `0` reporte emitido, `2` error de argumento, clonación o análisis.
- `scan-repo` no agrega llamadas a red al análisis: solo Git durante el paso
  explícito de clonación.

## 4. Criterios de aceptación

- [x] **AC-SR.1** HTTPS y SSH válidos parsean; esquemas no permitidos, HTTPS con
      credenciales/query/fragment y entradas malformadas se rechazan antes de Git.
- [x] **AC-SR.2** E2E con comando Git stub que materializa una fixture de repo
      analiza por el pipeline local y emite console/JSON con forma válida.
- [x] **AC-SR.3** Fallos de Git/SSH son timeout-bound, redactados y exit 2; no
      se imprime URL, credencial ni salida Git.
- [x] **AC-SR.4** El temp clone se limpia en éxito y error; `--workdir` conserva
      el clone y rechaza destinos no vacíos.
- [x] **AC-SR.5** `--out` solo escribe el path explícito y respeta `--force`
      (INV-7); reportes repetidos son deterministas salvo duración.
- [x] **AC-SR.6** No cambia `analyze`/core ni sus límites de red (INV-1); tests
      focalizados y `pnpm check` verde; CI configura matrices Node 22/24.

## 5. Riesgos/decisiones

- El usuario debe confiar en el host y repositorio que solicita clonar; el
  comando no permite clonar en background ni amplía el alcance de `analyze`.
- HTTPS se limita a TLS. SSH utiliza el cliente Git/SSH instalado y su
  configuración local, con prompts interactivos desactivados.
- El primer corte solo clona la branch default shallow; checkout configurable
  se pospone.

## Changelog

- 2026-09-30 · Spec creada `ready` tras acordar HTTPS multi-host + SSH con
  credenciales locales; no se admiten protocolos arbitrarios ni secretos inline.
- 2026-09-30 · Implementada M8.11: `scan-repo` shallow, temporal por defecto o
  retenido en `--workdir`, con errores redactados, formatos console/JSON y
  escritura explícita. Tests usan un stub de `git` para comprobar el flujo sin red.
