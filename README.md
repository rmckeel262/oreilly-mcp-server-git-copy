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

## Browser app (GUI)
Launch the visual learning app:

1. Ensure your API key is set:
   ```bash
   export OREILLY_API_KEY="{{OREILLY_API_KEY}}"
   ```
2. Start the web app server:
   ```bash
   npm run web
   ```
3. Open `http://localhost:4173` in your browser.

### What you can do in the GUI
- Search O'Reilly books in real time
- Open book pages directly on O'Reilly
- Save books to a personal learning list
- Keep your saved list in browser storage between sessions

## Always-on deployment (Railway)
This repository includes `railway.json` so Railway deploys the GUI app with health checks and restart policy.

1. Create a new Railway project from this repository.
2. Set required variable in Railway service settings:
   - `OREILLY_API_KEY`
3. Deploy the service.
4. Open the generated Railway domain (or attach your custom domain).

The deployed service runs:
- `node web-server.js`
- Health check path: `/health`

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
