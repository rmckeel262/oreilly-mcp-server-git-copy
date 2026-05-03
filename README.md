# O'Reilly MCP Server
Model Context Protocol (MCP) stdio server for O'Reilly learning tools.

## Features
- `search_books`
- `search_topics`
- `search_programming_languages`
- `get_learning_path`
- `get_book_details`

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Set required environment variables:
   ```bash
   export OREILLY_API_KEY="{{OREILLY_API_KEY}}"
   ```
3. Start the MCP server (stdio):
   ```bash
   npm start
   ```

## Warp MCP config example
Use this in `.mcp.json`:
```json
{
  "mcpServers": {
    "oreilly-learning": {
      "command": "node",
      "args": ["/Users/abhisheksaxena/oreilly-mcp-server/server.js"],
      "env": {
        "OREILLY_API_KEY": "${OREILLY_API_KEY}"
      }
    }
  }
}
```

## Requirements
- Node.js 16+
- Valid O'Reilly API key

## License
MIT
