# Setup

Configure `@gleanwork/connector-mcp` in your AI coding assistant.

The MCP server itself requires no Glean credentials. Credentials (`GLEAN_INSTANCE`, `GLEAN_API_TOKEN`) are set in your connector project's `.env` file — the `create_connector` tool generates a `.env.example` you can copy and fill in. They are only needed when you run the connector to ingest data.

---

## Claude Code

Add to `.claude/mcp.json` in your project, or `~/.claude/mcp.json` globally:

```json snippet=docs/snippets/claude-code.json
{
  "mcpServers": {
    "local": {
      "command": "npx",
      "args": [
        "-y",
        "@gleanwork/connector-mcp"
      ],
      "type": "stdio"
    }
  }
}
```

## Cursor

Add to `.cursor/mcp.json`:

```json snippet=docs/snippets/cursor.json
{
  "mcpServers": {
    "local": {
      "command": "npx",
      "args": [
        "-y",
        "@gleanwork/connector-mcp"
      ],
      "type": "stdio"
    }
  }
}
```

## Cursor Agent

Add to `.cursor/mcp.json` (same file as Cursor):

```json snippet=docs/snippets/cursor-agent.json
{
  "mcpServers": {
    "local": {
      "command": "npx",
      "args": [
        "-y",
        "@gleanwork/connector-mcp"
      ],
      "type": "stdio"
    }
  }
}
```

## VS Code

Add to `~/Library/Application Support/Code/User/mcp.json` (macOS) or `~/.config/Code/User/mcp.json` (Linux):

```json snippet=docs/snippets/vscode.json
{
  "servers": {
    "local": {
      "command": "npx",
      "args": [
        "-y",
        "@gleanwork/connector-mcp"
      ],
      "type": "stdio"
    }
  }
}
```

## Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json snippet=docs/snippets/windsurf.json
{
  "mcpServers": {
    "local": {
      "command": "npx",
      "args": [
        "-y",
        "@gleanwork/connector-mcp"
      ]
    }
  }
}
```

## Goose

Add to `~/.config/goose/config.yaml`:

```yaml snippet=docs/snippets/goose.yaml
extensions:
  local:
    name: local
    cmd: npx
    args:
      - '-y'
      - '@gleanwork/connector-mcp'
    type: stdio
    timeout: 300
    enabled: true
    bundled: null
    description: null
    env_keys: []
    envs: {}
```

## Codex

Add to `~/.codex/config.toml`:

```toml snippet=docs/snippets/codex.toml
[mcp_servers.local]
command = "npx"
args = [ "-y", "@gleanwork/connector-mcp" ]
```

## Junie (JetBrains)

Add to `~/.junie/mcp/mcp.json`:

> **Note:** Junie is stdio-only. HTTP transport is not supported without `mcp-remote`.

```json snippet=docs/snippets/junie.json
{
  "mcpServers": {
    "local": {
      "command": "npx",
      "args": [
        "-y",
        "@gleanwork/connector-mcp"
      ],
      "type": "stdio"
    }
  }
}
```

## JetBrains AI Assistant

> **Note:** Configuration must be pasted into **Settings → Tools → AI Assistant → Model Context Protocol → Add → As JSON**. Direct file writing is not supported.

```json snippet=docs/snippets/jetbrains.json
{
  "mcpServers": {
    "local": {
      "command": "npx",
      "args": [
        "-y",
        "@gleanwork/connector-mcp"
      ],
      "type": "stdio"
    }
  }
}
```

## Gemini CLI

Add to `~/.gemini/settings.json`:

```json snippet=docs/snippets/gemini.json
{
  "mcpServers": {
    "local": {
      "command": "npx",
      "args": [
        "-y",
        "@gleanwork/connector-mcp"
      ]
    }
  }
}
```

## OpenCode

Add to `~/.config/opencode/opencode.json`:

```json snippet=docs/snippets/opencode.json
{
  "mcp": {
    "local": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "@gleanwork/connector-mcp"
      ]
    }
  }
}
```
