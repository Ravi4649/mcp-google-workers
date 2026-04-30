# MCP Client Configuration Examples

This guide shows how to configure different MCP clients to use the Google Workers server.

## Claude Code

Add this to your `~/.claude.json` or `claude.json`:

```json
{
  "mcpServers": {
    "google-workers": {
      "command": "node",
      "args": ["/full/path/to/mcp-google-workers/dist/index.js"],
      "env": {}
    }
  }
}
```

## Cursor

Add this to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "google-workers": {
      "command": "node",
      "args": ["/full/path/to/mcp-google-workers/dist/index.js"]
    }
  }
}
```

## Generic MCP Client

Most MCP clients support a similar configuration format:

```json
{
  "mcpServers": {
    "google-workers": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-google-workers/dist/index.js"]
    }
  }
}
```

## Using npm/npx (if published)

If the package is published to npm:

```json
{
  "mcpServers": {
    "google-workers": {
      "command": "npx",
      "args": ["mcp-google-workers"]
    }
  }
}
```

## Docker (optional advanced setup)

If you prefer running in a container:

```json
{
  "mcpServers": {
    "google-workers": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-v", "~/.config/google-workers:/app/config", "mcp-google-workers:latest"]
    }
  }
}
```

## Troubleshooting

### Invalid path errors
- Ensure you're using the **absolute path** to the built `dist/index.js`
- Check that the file exists at that location

### Permission errors
- Make sure the script is executable: `chmod +x dist/index.js`
- Verify Node.js is in your PATH

### Authentication issues
- Delete `token.json` and restart the server
- Re-authenticate using the provided URL