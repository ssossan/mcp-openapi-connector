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

```bash
git clone https://github.com/yourusername/mcp-openapi-connector.git
cd mcp-openapi-connector
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` with your API credentials:
```env
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
AUTH_URL=https://api.saas.com/oauth/token
API_BASE_URL=https://api.saas.com/v1
```

## Usage

### Claude Desktop Configuration

Add to your Claude Desktop config file:

```json
{
  "mcpServers": {
    "openapi-connector": {
      "command": "node",
      "args": ["/path/to/mcp-openapi-connector.js"],
      "env": {
        "CLIENT_ID": "your-client-id",
        "CLIENT_SECRET": "your-client-secret",
        "AUTH_URL": "https://api.saas.com/oauth/token",
        "API_BASE_URL": "https://api.saas.com/v1"
      }
    }
  }
}
```

### Available Tools

The server includes these default tools:

- `list_items` - List all items with pagination
- `get_item` - Get a specific item by ID
- `create_item` - Create a new item
- `update_item` - Update an existing item
- `delete_item` - Delete an item

### OpenAPI Integration

The server can automatically generate tools from an OpenAPI specification:

1. Place your OpenAPI spec file (JSON format) in the project
2. Set the path in your environment:

```env
OPENAPI_SPEC_PATH=./config/openapi.json
OPENAPI_TOOL_PREFIX=api_  # Optional: prefix for generated tool names
OPENAPI_INCLUDE_ONLY=listItems,createItem  # Optional: only include specific operations
OPENAPI_EXCLUDE=deleteItem  # Optional: exclude specific operations
```

The server will automatically generate MCP tools from all operations in your OpenAPI spec.

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
CUSTOM_TOOLS_PATH=./tools/my-custom-tools.js
```

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses Node.js --watch flag for automatic reloading.

### Testing

```bash
npm test
```

## Architecture

```
Claude Desktop ↔ MCP Server (stdio) → OpenAPI-based API
                    ↓
             TokenManager
           (OAuth2 handling)
```

### Key Components

- **mcp-openapi-connector.js** - Main server entry point
- **lib/token-manager.js** - OAuth2 token management with caching
- **lib/saas-client.js** - HTTP client with automatic authentication
- **lib/mcp-handler.js** - MCP protocol handling and tool registration

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
NODE_ENV=development node mcp-openapi-connector.js
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

Built using the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) by Anthropic.