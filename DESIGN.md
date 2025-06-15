# MCP OpenAPI Connector Design Document

## Overview

This document describes the architecture of a unified MCP server for connecting OpenAPI-based APIs with built-in authentication management, replacing the previous gateway-based approach (MCP + separate authentication proxy).

## Previous Architecture Issues

### Architecture Complexity
- **Two Process Management**: MCP Server (stdio) + Auth Proxy (HTTP:9000)
- **Distributed Configuration**: Duplicate environment variables for MCP and proxy
- **Debugging Difficulty**: Need to investigate two services when issues occur

### Usability Challenges
- **Complex Setup**: Managing two services
- **Port Management**: Need to ensure localhost:9000 is available
- **Error Handling**: Difficult to identify which service caused errors

## Solution: MCP Server with Built-in Authentication

### Architecture Overview

```
Claude Desktop/Cursor → MCP Server (Built-in Auth) → OpenAPI-based API
                         ↑
                    Token Management & Auth
```

### Key Components

#### 1. Unified MCP Server (`mcp-openapi-connector.js`)

```javascript
// Main module structure
class MCPOpenAPIConnector {
  constructor() {
    this.tokenManager = new TokenManager()
    this.apiClient = new SaaSAPIClient()
    this.mcpTransport = new StdioTransport()
  }
  
  // MCP standard methods
  async listTools() { /* Tool list */ }
  async callTool(name, args) { 
    // Internal authenticated API call
  }
  
  // Built-in authentication
  async authenticateAndCall(endpoint, params) {
    const token = await this.tokenManager.getValidToken()
    return this.apiClient.call(endpoint, params, token)
  }
}
```

#### 2. Token Management Module (`lib/token-manager.js`)

```javascript
class TokenManager {
  constructor(clientId, clientSecret, authUrl) {
    this.cache = new Map()
    this.config = { clientId, clientSecret, authUrl }
  }
  
  async getValidToken() {
    // Same logic as current proxy
    // - Cache check
    // - Expiration check
    // - Auto refresh
  }
}
```

#### 3. API Client (`lib/saas-client.js`)

```javascript
class APIClient {
  async call(endpoint, params, token) {
    // API call with auth header
    // Error handling (re-auth on 401, etc)
  }
}
```

### Configuration Simplification

#### Claude Desktop Configuration Example

```json
{
  "mcpServers": {
    "openapi-connector": {
      "command": "node",
      "args": ["./mcp-openapi-connector.js"],
      "env": {
        "CLIENT_ID": "your-client-id",
        "CLIENT_SECRET": "your-client-secret", 
        "AUTH_URL": "https://api.saas.com/auth",
        "API_BASE_URL": "https://api.saas.com"
      }
    }
  }
}
```

## Technical Benefits

### 1. Simple Dependencies
- **Single Process**: MCP server only
- **Stdio Communication**: Direct Claude ↔ MCP server communication
- **No Port Required**: No HTTP port management needed

### 2. Improved Robustness
- **Unified Error Handling**: Complete within one process
- **Centralized Logging**: All logs in one place
- **Simplified Debugging**: Single process investigation

### 3. Performance Optimization
- **Reduced Overhead**: No HTTP communication layer
- **Memory Efficiency**: Token cache in single process
- **Faster Response**: Internal function calls only

## Implementation Plan

### Phase 1: Foundation Setup
1. **Project Structure Design**
   ```
   mcp-openapi-connector/
   ├── mcp-openapi-connector.js  # Main server
   ├── lib/
   │   ├── token-manager.js     # Auth management
   │   ├── saas-client.js       # API calls
   │   └── mcp-handler.js       # MCP protocol handling
   ├── tools/                   # API specific tools
   └── config/
       └── api-configs.json     # API configurations
   ```

2. **Minimal Dependencies**
   - `@modelcontextprotocol/sdk` only
   - HTTP client (axios/fetch)
   - Environment management (dotenv)

### Phase 2: Authentication Migration
1. **TokenManager Class**
   - Port logic from current token-proxy.js
   - Cache functionality (TTL management)
   - Error handling (401 re-auth)

2. **APIClient Class**
   - Automatic auth header attachment
   - Rate limiting support
   - Error classification/handling

### Phase 3: MCP Server Implementation
1. **Basic MCP Server**
   - Stdio communication
   - Tool registration/execution
   - Resource management

2. **OpenAPI Integration**
   - Dynamic tool generation (from OpenAPI specs)
   - Parameter validation
   - Response formatting

### Phase 4: Configuration & Operations
1. **Configuration Automation**
   - Claude Desktop config generation
   - Environment variable templates
   - Health check functionality

2. **Monitoring & Logging**
   - Structured log output
   - Metrics collection
   - Performance monitoring

## Migration Strategy

### 1. Parallel Development
- Maintain current repository
- Develop new unified version separately
- Migration guidance after feature parity

### 2. Phased Migration
1. **PoC Version**: Basic CRUD operations only
2. **Full Feature Version**: All API support
3. **Optimized Version**: Performance & UX improvements

### 3. Backward Compatibility
- Support current configuration format
- Provide auto-migration scripts
- Create migration guides

## Risks & Challenges

### Technical Risks
- **MCP Protocol Changes**: Adapting to spec changes
- **Memory Usage**: Leaks during long-running sessions
- **Error Propagation**: Error handling in stdio communication

### Operational Risks
- **Configuration Complexity**: When supporting many APIs
- **Debugging Difficulty**: Stdio communication visibility
- **Version Management**: API spec changes

### Mitigation
1. **Comprehensive Testing**: Unit, integration, E2E tests
2. **Enhanced Logging**: Detailed debug information
3. **Configuration Validation**: Startup value checks
4. **Documentation**: Detailed troubleshooting guides

## Conclusion

The MCP server with built-in authentication offers significant advantages over the current gateway approach:

✅ **Usability**: Greatly simplified setup and operation  
✅ **Maintainability**: Single process management and debugging  
✅ **Performance**: Reduced overhead  
✅ **Extensibility**: Easy addition of new OpenAPI-based APIs  

This design provides a more user-friendly and practical solution for OpenAPI-based API integration through MCP.