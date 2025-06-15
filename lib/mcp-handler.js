import { OpenAPILoader } from './openapi-loader.js';

export class MCPHandler {
  constructor(saasClient) {
    this.saasClient = saasClient;
    this.tools = new Map();
    this.resources = new Map();
    this.openAPILoader = new OpenAPILoader();
  }

  registerTool(name, definition) {
    this.tools.set(name, definition);
  }

  registerResource(uri, definition) {
    this.resources.set(uri, definition);
  }

  async listTools() {
    const tools = Array.from(this.tools.values()).map(tool => {
      // Remove internal fields that start with underscore
      const cleanTool = {};
      for (const [key, value] of Object.entries(tool)) {
        if (!key.startsWith('_')) {
          cleanTool[key] = value;
        }
      }
      return cleanTool;
    });
    
    console.error(`[MCP] listTools() returning ${tools.length} tools:`);
    tools.forEach(tool => console.error(`[MCP] - ${tool.name}`));
    
    return tools;
  }

  async listResources() {
    return Array.from(this.resources.values());
  }

  async callTool(name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    if (tool.handler) {
      return await tool.handler(args, this.saasClient);
    }

    if (tool._apiEndpoint) {
      const method = tool._method || 'GET';
      const endpoint = this.buildEndpoint(tool._apiEndpoint, args);
      
      // Handle file uploads and special content types
      let options = { method };
      
      if (method === 'GET') {
        options.params = args;
      } else {
        // Check if this is a file upload endpoint
        if (tool._contentType === 'multipart/form-data' || args.file || args.data) {
          options.body = args;
          options.headers = { 'Content-Type': tool._contentType || 'application/json' };
        } else {
          options.body = args;
        }
      }

      return await this.saasClient.call(endpoint, options);
    }

    throw new Error(`Tool ${name} has no handler or API endpoint defined`);
  }

  async readResource(uri) {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource ${uri} not found`);
    }

    if (resource.handler) {
      return await resource.handler(uri, this.saasClient);
    }

    throw new Error(`Resource ${uri} has no handler defined`);
  }

  buildEndpoint(template, params) {
    let endpoint = template;
    
    Object.keys(params).forEach(key => {
      const placeholder = `{${key}}`;
      if (endpoint.includes(placeholder)) {
        endpoint = endpoint.replace(placeholder, params[key]);
        delete params[key];
      }
    });

    return endpoint;
  }

  async loadOpenAPITools(specPath, options = {}) {
    try {
      console.error(`[MCP] Starting to load OpenAPI tools from: ${specPath}`);
      const tools = await this.openAPILoader.loadAndGenerateTools(specPath, options);
      
      console.error(`[MCP] Generated ${tools.length} tools from OpenAPI spec`);
      
      for (const tool of tools) {
        console.error(`[MCP] Registering tool: ${tool.name}`);
        this.registerTool(tool.name, tool);
      }
      
      console.error(`[MCP] Successfully loaded ${tools.length} tools from OpenAPI spec: ${specPath}`);
      return tools.length;
    } catch (error) {
      console.error(`[MCP] Failed to load OpenAPI tools from ${specPath}:`, error);
      throw error;
    }
  }

  registerDefaultTools() {
    // Add a simple test tool first
    this.registerTool('test_saas_connection', {
      name: 'test_saas_connection',
      description: 'Test SaaS API connection',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async (args, apiClient) => {
        return { status: 'success', message: 'SaaS MCP server is working!' };
      }
    });

    this.registerTool('test_saas_auth', {
      name: 'test_saas_auth',
      description: 'Test SaaS API authentication',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async (args, apiClient) => {
        try {
          // Try to get a token to test authentication
          const token = await apiClient.tokenManager.getValidToken();
          return { 
            status: 'success', 
            message: 'Authentication successful!',
            token_preview: token.substring(0, 20) + '...'
          };
        } catch (error) {
          return { 
            status: 'error', 
            message: `Authentication failed: ${error.message}`,
            error: error.toString()
          };
        }
      }
    });

    this.registerTool('list_items', {
      name: 'list_items',
      description: 'List all items from the SaaS API',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of items to return' },
          offset: { type: 'number', description: 'Number of items to skip' }
        }
      },
      _apiEndpoint: '/items',
      _method: 'GET'
    });

    this.registerTool('get_item', {
      name: 'get_item',
      description: 'Get a specific item by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Item ID', required: true }
        },
        required: ['id']
      },
      _apiEndpoint: '/items/{id}',
      _method: 'GET'
    });

    this.registerTool('create_item', {
      name: 'create_item',
      description: 'Create a new item',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Item name', required: true },
          description: { type: 'string', description: 'Item description' },
          metadata: { type: 'object', description: 'Additional metadata' }
        },
        required: ['name']
      },
      _apiEndpoint: '/items',
      _method: 'POST'
    });

    this.registerTool('update_item', {
      name: 'update_item',
      description: 'Update an existing item',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Item ID', required: true },
          name: { type: 'string', description: 'New item name' },
          description: { type: 'string', description: 'New item description' },
          metadata: { type: 'object', description: 'Updated metadata' }
        },
        required: ['id']
      },
      _apiEndpoint: '/items/{id}',
      _method: 'PUT'
    });

    this.registerTool('delete_item', {
      name: 'delete_item',
      description: 'Delete an item',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Item ID', required: true }
        },
        required: ['id']
      },
      _apiEndpoint: '/items/{id}',
      _method: 'DELETE'
    });
  }
}