# Ankaa en tu editor (LSP)

`ankaa lsp` es un server LSP 3.17 sobre stdio, editor-agnóstico y 100% local
(INV-1: sin red; INV-2: determinista). Muestra los mismos findings que
`ankaa analyze` mientras escribís, con squiggle en la línea real para specs
YAML (posiciones vía CST; JSON y otros protocolos caen a diagnóstico
file-level).

```bash
ankaa lsp                 # espera frames LSP en stdin
ankaa lsp --debounce 150  # debounce de didChange en ms (default 300)
```

- Severidades: error → 1, warning → 2, info → 3.
- `source: "ankaa"`, `code: <ruleId>`, mensaje idéntico al CLI.
- Config: respeta `ankaa.yaml` (rules on/off, severidades) y
  `.ankaa/skills/` del workspace del editor.

## Neovim (0.11+, vim.lsp.start)

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = { "yaml", "json" },
  callback = function(args)
    vim.lsp.start({
      name = "ankaa",
      cmd = { "ankaa", "lsp" },
      root_dir = vim.fs.root(args.buf, { "ankaa.yaml", ".git" }),
    })
  end,
})
```

## Helix (`~/.config/helix/languages.toml`)

```toml
[language-server.ankaa]
command = "ankaa"
args = ["lsp"]

[[language]]
name = "yaml"
language-servers = ["yaml-language-server", "ankaa"]
```

## Zed (`~/.config/zed/languages.json`)

```json
{
  "yaml": {
    "lsp": {
      "ankaa": {
        "binary": { "name": "ankaa", "args": ["lsp"], "ignore_stderr": true }
      }
    }
  }
}
```

## Emacs (lsp-mode, registro manual)

```elisp
(with-eval-after-load 'lsp-mode
  (add-to-list 'lsp-language-id-configuration '(yaml-mode . "yaml"))
  (lsp-register-client
   (make-lsp-client
    :new-connection (lsp-stdio-connection '("ankaa" "lsp"))
    :server-id 'ankaa
    :major-modes '(yaml-mode json-mode))))
```

## VS Code

VS Code no acepta servers LSP sueltos sin extensión. Opciones:

1. Extensión genérica de cliente LSP (p. ej. "LSP Client" / `lsp-vscode`),
   configurada con `ankaa lsp` como comando.
2. Esperar la extensión propia (decisión de marketplace postergada, ver
   [`specs/f17-lsp.md`](../specs/f17-lsp.md) §7).

Spec: [`specs/f17-lsp.md`](../specs/f17-lsp.md).
