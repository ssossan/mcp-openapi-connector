import type { MCPResourceDefinition, MCPToolDefinition, OpenAPIToolsOptions } from '../types/mcp.js';
import { OpenAPILoader } from './openapi-loader.js';
import type { SaaSAPIClient } from './saas-client.js';

export class MCPHandler {
  private saasClient: SaaSAPIClient;
  private tools: Map<string, MCPToolDefinition>;
  private resources: Map<string, MCPResourceDefinition>;
  private openAPILoader: OpenAPILoader;
  private authPath: string;

  constructor(saasClient: SaaSAPIClient, authPath: string = '/auth/token') {
    this.saasClient = saasClient;
    this.tools = new Map();
    this.resources = new Map();
    this.openAPILoader = new OpenAPILoader();
    this.authPath = authPath;
  }

  registerTool(name: string, definition: MCPToolDefinition): void {
    this.tools.set(name, definition);
  }

  registerResource(uri: string, definition: MCPResourceDefinition): void {
    this.resources.set(uri, definition);
  }

  async listTools(): Promise<any[]> {
    const tools = Array.from(this.tools.values()).map(tool => {
      // Remove internal fields that start with underscore
      const cleanTool: any = {};
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

  async listResources(): Promise<MCPResourceDefinition[]> {
    return Array.from(this.resources.values());
  }

  async callTool(name: string, args: any): Promise<any> {
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
      
      // Special handling for authentication endpoints - call directly without bearer token
      if (endpoint === this.authPath || name.includes('auth') && name.includes('token')) {
        console.error(`[MCP] Calling authentication endpoint directly: ${endpoint}`);
        return await this.saasClient.tokenManager.requestTokenDirect();
      }
      
      // Handle file uploads and special content types
      let options: any = { method };
      
      // Separate parameters by type
      const queryParams: Record<string, any> = {};
      let bodyParams: any = {};
      
      
      if (tool._queryParams) {
        for (const param of tool._queryParams) {
          if (args[param] !== undefined) {
            queryParams[param] = args[param];
          }
        }
      }
      
      if (tool._bodyParams) {
        for (const param of tool._bodyParams) {
          if (args[param] !== undefined) {
            let value = args[param];
            // Handle JSON strings (common issue with MCP parameter passing)
            if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
              try {
                value = JSON.parse(value);
              } catch (e) {
                // Silently ignore JSON parse errors
              }
            }
            bodyParams[param] = value;
          }
        }
      }
      
      // Fallback: If no body params detected but we have non-path args, treat as body params
      if (Object.keys(bodyParams).length === 0 && method !== 'GET') {
        const pathParamNames = tool._pathParams || [];
        // Add common path parameter names as fallback
        const commonPathParams = ['id', 'userId', 'memberId'];
        
        for (const [key, value] of Object.entries(args)) {
          // Skip common path parameters and explicitly defined path parameters
          if (!pathParamNames.includes(key) && !commonPathParams.includes(key)) {
            let processedValue = value;
            // Handle JSON strings
            if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
              try {
                processedValue = JSON.parse(value);
              } catch (e) {
                // Silently ignore JSON parse errors
              }
            }
            bodyParams[key] = processedValue;
          }
        }
        
        if (bodyParams.fields && Array.isArray(bodyParams.fields)) {
          bodyParams = bodyParams.fields; // Replace the object with the array directly
        }
      }
      
      
      if (method === 'GET') {
        options.params = queryParams;
      } else {
        // Set query parameters if they exist
        if (Object.keys(queryParams).length > 0) {
          options.params = queryParams;
        }
        
        // Check if this is a file upload endpoint
        if (tool._contentType === 'multipart/form-data' || args.file || args.data) {
          options.body = bodyParams;
          options.headers = { 'Content-Type': tool._contentType || 'application/json' };
        } else if (Object.keys(bodyParams).length > 0) {
          options.body = bodyParams;
        }
      }

      return await this.saasClient.call(endpoint, options);
    }

    throw new Error(`Tool ${name} has no handler or API endpoint defined`);
  }

  async readResource(uri: string): Promise<any> {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Resource ${uri} not found`);
    }

    if (resource.handler) {
      return await resource.handler(uri, this.saasClient);
    }

    throw new Error(`Resource ${uri} has no handler defined`);
  }

  private buildEndpoint(template: string, params: Record<string, any>): string {
    let endpoint = template;
    
    Object.keys(params).forEach(key => {
      const placeholder = `{${key}}`;
      if (endpoint.includes(placeholder)) {
        endpoint = endpoint.replace(placeholder, String(params[key]));
        delete params[key];
      }
    });

    return endpoint;
  }

  async loadOpenAPITools(specPath: string, options: OpenAPIToolsOptions = {}): Promise<number> {
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

}