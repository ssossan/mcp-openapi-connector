# MCP OpenAPI Connector

A unified Model Context Protocol (MCP) server for connecting OpenAPI-based APIs with built-in authentication management. This project enables Claude Desktop, Cursor, and other MCP-compatible clients to interact with authenticated OpenAPI-based APIs without requiring separate proxy servers.

## Features

- **Single Process Architecture**: No separate proxy server needed
- **Built-in OAuth2 Authentication**: Automatic token management and refresh
- **OpenAPI Integration**: Automatically generate MCP tools from OpenAPI/Swagger specifications
- **Extensible Tool System**: Easy to add custom tools and resources
- **Error Handling**: Automatic retry and authentication error recovery
- **Simple Configuration**: Single configuration file for all settings
- **Multiple API Support**: Easily adapt to any OAuth2-based API

## Installation

### Via npm (Recommended)

```bash
npm install -g @ssossan/mcp-openapi-connector
```

Or use directly with npx:

```bash
npx @ssossan/mcp-openapi-connector
```

### From Source

```bash
git clone https://github.com/ssossan/mcp-openapi-connector.git
cd mcp-openapi-connector
npm install
```

## Quick Setup (Recommended)

Run the interactive setup wizard:

```bash
npm run setup
```

This will:
- Collect your API configuration through interactive prompts
- Generate `generated/.env` file with your settings
- Create `generated/claude-desktop-config.json` for easy Claude Desktop integration
- Provide step-by-step instructions for Claude Desktop configuration

## Manual Configuration

Alternatively, you can set up manually:

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` with your API credentials:
```env
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
API_BASE_URL=https://api.example.com
AUTH_PATH=/oauth/token
OPENAPI_SPEC_PATH=./config/openapi.json
```

## Usage

### Development Mode

For development with automatic recompilation:
```bash
npm run dev
```

### Production Mode

Build and run the compiled version:
```bash
npm run build
npm start
```

### Claude Desktop Configuration

Add to your Claude Desktop config file:

**Using npm package (Recommended):**
```json
{
  "mcpServers": {
    "openapi-connector": {
      "command": "npx",
      "args": ["@ssossan/mcp-openapi-connector"],
      "env": {
        "CLIENT_ID": "your-client-id",
        "CLIENT_SECRET": "your-client-secret",
        "API_BASE_URL": "https://api.example.com",
        "AUTH_PATH": "/oauth/token",
        "OPENAPI_SPEC_PATH": "/path/to/openapi.json"
      }
    }
  }
}
```

**Using global installation:**
```json
{
  "mcpServers": {
    "openapi-connector": {
      "command": "mcp-openapi-connector",
      "env": {
        "CLIENT_ID": "your-client-id",
        "CLIENT_SECRET": "your-client-secret",
        "API_BASE_URL": "https://api.example.com",
        "AUTH_PATH": "/oauth/token",
        "OPENAPI_SPEC_PATH": "/path/to/openapi.json"
      }
    }
  }
}
```

**Using from source:**
```json
{
  "mcpServers": {
    "openapi-connector": {
      "command": "node",
      "args": ["/path/to/mcp-openapi-connector/dist/mcp-openapi-connector.js"],
      "cwd": "/path/to/mcp-openapi-connector",
      "env": {
        "CLIENT_ID": "your-client-id",
        "CLIENT_SECRET": "your-client-secret",
        "API_BASE_URL": "https://api.example.com",
        "AUTH_PATH": "/oauth/token",
        "OPENAPI_SPEC_PATH": "/path/to/openapi.json"
      }
    }
  }
}
```

### OpenAPI Integration

The server automatically generates tools from an OpenAPI specification. **An OpenAPI specification is required for the server to function.**

1. Place your OpenAPI spec file (JSON format) in the project
2. Set the path in your environment:

```env
OPENAPI_SPEC_PATH=./config/openapi.json
OPENAPI_TOOL_PREFIX=api_  # Optional: prefix for generated tool names
OPENAPI_INCLUDE_ONLY=listItems,createItem  # Optional: only include specific operations
OPENAPI_EXCLUDE=deleteItem  # Optional: exclude specific operations
```

The server will automatically generate MCP tools from all operations in your OpenAPI spec. Without an OpenAPI specification, the server will only provide test/debug tools.

### Custom Tools

Create custom tools by adding a JavaScript file:

```javascript
export default {
  register(server) {
    server.registerCustomTool('my_tool', {
      name: 'my_tool',
      description: 'My custom tool',
      inputSchema: {
        type: 'object',
        properties: {
          param: { type: 'string', required: true }
        }
      },
      apiEndpoint: '/my-endpoint',
      method: 'POST'
    });
  }
};
```

Then set `CUSTOM_TOOLS_PATH` in your environment:

```env
CUSTOM_TOOLS_PATH=./src/tools/my-custom-tools.ts
```

## Publishing to npm

For maintainers:

```bash
npm run build
npm test
npm publish --access public
```

## Development

### Available Scripts

```bash
npm run dev          # Development mode with tsx
npm run build        # Compile TypeScript to JavaScript
npm start            # Build and run production version
npm run test         # Build and run test server
npm run test:dev     # Run test server in development mode
npm run typecheck    # Type check without compilation
npm run clean        # Remove build output
```

### TypeScript Development

This project is built with TypeScript for better type safety and development experience:

- **Source code**: `src/` directory
- **Build output**: `dist/` directory  
- **Type definitions**: Automatically generated `.d.ts` files

## Architecture

```
Claude Desktop ↔ MCP Server (stdio) → OpenAPI-based API
                    ↓
             TokenManager
           (OAuth2 handling)
```

### Key Components

- **src/mcp-openapi-connector.ts** - Main server entry point
- **src/lib/token-manager.ts** - OAuth2 token management with caching
- **src/lib/saas-client.ts** - HTTP client with automatic authentication
- **src/lib/mcp-handler.ts** - MCP protocol handling and tool registration
- **src/lib/openapi-loader.ts** - OpenAPI specification parser and tool generator
- **src/types/** - TypeScript type definitions

## Migration from v1.x

If you're using the previous gateway-based version:

1. Remove the proxy server configuration
2. Update your Claude Desktop config to point directly to this server
3. Use the same environment variables (no changes needed)

## Example: Using with a Generic OpenAPI-based API

See the `config/openapi-example.json` file for a sample OpenAPI specification that demonstrates how to structure your API for MCP integration.

## Troubleshooting

### Authentication Errors

- Verify CLIENT_ID and CLIENT_SECRET are correct
- Check AUTH_URL points to the correct OAuth2 endpoint
- Ensure your credentials have the necessary scopes

### Connection Issues

- Check API_BASE_URL is correct
- Verify network connectivity
- Check server logs for detailed error messages

### Debug Mode

Set `NODE_ENV=development` for verbose logging:

```bash
NODE_ENV=development npm run dev
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

Built using the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) by Anthropic.