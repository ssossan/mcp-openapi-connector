#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TokenManager } from './lib/token-manager.js';
import { SaaSAPIClient } from './lib/saas-client.js';
import { MCPHandler } from './lib/mcp-handler.js';
import type { MCPToolDefinition, MCPResourceDefinition } from './types/mcp.js';
import dotenv from 'dotenv';

dotenv.config();

interface CustomToolsModule {
  default: {
    register: (server: MCPOpenAPIConnector) => void;
  };
}

export class MCPOpenAPIConnector {
  private tokenManager: TokenManager;
  private apiClient: SaaSAPIClient;
  private mcpHandler: MCPHandler;
  private server: Server;

  constructor() {
    this.validateEnvironment();
    
    this.tokenManager = new TokenManager(
      process.env.CLIENT_ID!,
      process.env.CLIENT_SECRET!,
      process.env.API_BASE_URL!,
      process.env.AUTH_PATH || '/auth/token'
    );
    
    this.apiClient = new SaaSAPIClient(
      process.env.API_BASE_URL!,
      this.tokenManager
    );
    
    this.mcpHandler = new MCPHandler(this.apiClient, process.env.AUTH_PATH || '/auth/token');
    this.server = new Server(
      {
        name: 'mcp-openapi-connector',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );
  }

  private validateEnvironment(): void {
    const required = ['CLIENT_ID', 'CLIENT_SECRET', 'API_BASE_URL', 'OPENAPI_SPEC_PATH'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      const error = `Missing required environment variables: ${missing.join(', ')}. Please set these in your .env file or Claude Desktop configuration.`;
      console.error(error);
      throw new Error(error);
    }
  }

  private setupBasicHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: await this.mcpHandler.listTools()
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        const result = await this.mcpHandler.callTool(name, args || {});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error(`Tool execution error for ${name}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: await this.mcpHandler.listResources()
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      try {
        const content = await this.mcpHandler.readResource(uri);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(content, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error(`Resource read error for ${uri}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `Error: ${errorMessage}`
            }
          ]
        };
      }
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: []
      };
    });
  }

  private async loadTools(): Promise<void> {
    // Always register test/debug tools first
    this.mcpHandler.registerTool('test_saas_connection', {
      name: 'test_saas_connection',
      description: 'Test SaaS API connection',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async (_args, _apiClient) => {
        return { status: 'success', message: 'SaaS MCP server is working!' };
      }
    });

    this.mcpHandler.registerTool('test_saas_auth', {
      name: 'test_saas_auth',
      description: 'Test SaaS API authentication',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async (_args, apiClient) => {
        try {
          // Try to get a token to test authentication
          const token = await apiClient.tokenManager.getValidToken();
          return { 
            status: 'success', 
            message: 'Authentication successful!',
            token_preview: token.substring(0, 20) + '...'
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return { 
            status: 'error', 
            message: `Authentication failed: ${errorMessage}`,
            error: String(error)
          };
        }
      }
    });

    // Load OpenAPI spec if provided
    const openAPIPath = process.env.OPENAPI_SPEC_PATH;
    if (openAPIPath) {
      try {
        await this.mcpHandler.loadOpenAPITools(openAPIPath, {
          prefix: process.env.OPENAPI_TOOL_PREFIX || '',
          includeOnly: process.env.OPENAPI_INCLUDE_ONLY?.split(',').filter(Boolean),
          exclude: process.env.OPENAPI_EXCLUDE?.split(',').filter(Boolean)
        });
      } catch (error) {
        console.error('Failed to load OpenAPI spec:', error);
        throw error; // Fail if OpenAPI loading fails
      }
    } else {
      console.error('Warning: No OPENAPI_SPEC_PATH provided. This server requires an OpenAPI specification to generate tools.');
    }
  }

  async start(): Promise<void> {
    // Load tools first
    await this.loadTools();
    
    // Set up handlers
    this.setupBasicHandlers();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('MCP OpenAPI Connector v1.0 started');
    console.error(`Connected to API: ${process.env.API_BASE_URL}`);
  }

  registerCustomTool(name: string, definition: MCPToolDefinition): void {
    this.mcpHandler.registerTool(name, definition);
  }

  registerCustomResource(uri: string, definition: MCPResourceDefinition): void {
    this.mcpHandler.registerResource(uri, definition);
  }
}

async function loadCustomTools(server: MCPOpenAPIConnector): Promise<void> {
  const customToolsPath = process.env.CUSTOM_TOOLS_PATH;
  if (customToolsPath) {
    try {
      const customTools: CustomToolsModule = await import(customToolsPath);
      if (customTools.default && typeof customTools.default.register === 'function') {
        customTools.default.register(server);
        console.error(`Loaded custom tools from ${customToolsPath}`);
      }
    } catch (error) {
      console.error(`Failed to load custom tools from ${customToolsPath}:`, error);
    }
  }
}

async function main(): Promise<void> {
  try {
    const server = new MCPOpenAPIConnector();
    await loadCustomTools(server);
    await server.start();
  } catch (error) {
    console.error('Failed to start server:', error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    // For MCP servers, it's better to exit gracefully
    // rather than calling process.exit which can cause JSON parsing errors
    return;
  }
}

main().catch(console.error);