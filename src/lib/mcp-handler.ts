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
      
      // Create a copy of args to avoid modifying the original
      const argsForEndpoint = { ...args };
      const endpoint = this.buildEndpoint(tool._apiEndpoint, argsForEndpoint);
      
      // Special handling for authentication endpoints - call directly without bearer token
      if (endpoint === this.authPath || name.includes('auth') && name.includes('token')) {
        return await this.saasClient.tokenManager.requestTokenDirect();
      }
      
      // Handle file uploads and special content types
      let options: any = { method };
      
      // Separate parameters by type (excluding path parameters that were already consumed)
      const queryParams: Record<string, any> = {};
      let bodyParams: any = {};
      const pathParamNames = tool._pathParams || [];
      
      
      
      if (tool._queryParams) {
        for (const param of tool._queryParams) {
          if (args[param] !== undefined && !pathParamNames.includes(param)) {
            queryParams[param] = args[param];
          }
        }
      }
      
      if (tool._bodyParams) {
        for (const param of tool._bodyParams) {
          if (args[param] !== undefined && !pathParamNames.includes(param)) {
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
        // Extract path parameters from endpoint template as fallback
        const pathParamsFromTemplate = (tool._apiEndpoint.match(/\{([^}]+)\}/g) || [])
          .map(param => param.slice(1, -1)); // Remove { and }
        
        for (const [key, value] of Object.entries(args)) {
          // Skip path parameters (both explicitly defined and extracted from template)
          if (!pathParamNames.includes(key) && !pathParamsFromTemplate.includes(key)) {
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
      }
      
      // Special handling for APIs that expect direct array body (moved outside fallback)
      if (bodyParams.body && Array.isArray(bodyParams.body)) {
        bodyParams = bodyParams.body; // Replace the object with the array directly
      } else if (bodyParams.fields && Array.isArray(bodyParams.fields)) {
        // Legacy handling for 'fields' parameter as direct body array
        bodyParams = bodyParams.fields; // Replace the object with the array directly
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
        } else if (Object.keys(bodyParams).length > 0 || Array.isArray(bodyParams)) {
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
      const tools = await this.openAPILoader.loadAndGenerateTools(specPath, options);
      
      for (const tool of tools) {
        this.registerTool(tool.name, tool);
      }
      
      // Register OpenAPI inspection tools
      this.registerOpenAPIInspectionTools(specPath);
      
      return tools.length;
    } catch (error) {
      console.error(`[MCP] Failed to load OpenAPI tools from ${specPath}:`, error);
      throw error;
    }
  }

  private registerOpenAPIInspectionTools(specPath: string): void {
    // Tool to get the raw OpenAPI specification
    this.registerTool('get_openapi_spec', {
      name: 'get_openapi_spec',
      description: 'Get the complete OpenAPI specification in JSON format',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const specContent = await this.openAPILoader.loadSpec(specPath);
        return {
          specification: specContent,
          summary: {
            title: specContent.info?.title,
            version: specContent.info?.version,
            description: specContent.info?.description,
            totalPaths: Object.keys(specContent.paths || {}).length,
            servers: specContent.servers?.map(s => s.url) || []
          }
        };
      }
    });

    // Tool to get generated tools information
    this.registerTool('get_generated_tools_info', {
      name: 'get_generated_tools_info', 
      description: 'Get information about tools generated from OpenAPI spec including parameter classifications',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const toolsInfo = Array.from(this.tools.values())
          .filter(tool => tool._apiEndpoint) // Only API-based tools
          .map(tool => ({
            name: tool.name,
            description: tool.description,
            apiEndpoint: tool._apiEndpoint,
            method: tool._method,
            contentType: tool._contentType,
            pathParams: tool._pathParams || [],
            queryParams: tool._queryParams || [],
            bodyParams: tool._bodyParams || [],
            inputSchema: tool.inputSchema
          }));

        return {
          totalTools: toolsInfo.length,
          tools: toolsInfo
        };
      }
    });

    // Tool to get API endpoints summary
    this.registerTool('get_api_endpoints_summary', {
      name: 'get_api_endpoints_summary',
      description: 'Get a summary of all available API endpoints from OpenAPI spec',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const specContent = await this.openAPILoader.loadSpec(specPath);
        const endpoints: any[] = [];
        
        if (specContent.paths) {
          for (const [path, pathItem] of Object.entries(specContent.paths)) {
            for (const [method, operation] of Object.entries(pathItem)) {
              if (typeof operation === 'object' && operation.operationId) {
                endpoints.push({
                  path,
                  method: method.toUpperCase(),
                  operationId: operation.operationId,
                  summary: operation.summary,
                  description: operation.description,
                  parameters: operation.parameters?.map((p: any) => ({
                    name: p.name,
                    in: p.in,
                    required: p.required,
                    type: p.schema?.type
                  })) || [],
                  hasRequestBody: !!operation.requestBody,
                  responses: Object.keys(operation.responses || {})
                });
              }
            }
          }
        }

        return {
          totalEndpoints: endpoints.length,
          endpoints: endpoints
        };
      }
    });

    // Tool to search/filter OpenAPI endpoints
    this.registerTool('search_api_endpoints', {
      name: 'search_api_endpoints',
      description: 'Search and filter API endpoints by method, path, or operation ID',
      inputSchema: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            description: 'Filter by HTTP method (GET, POST, PUT, PATCH, DELETE)',
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
          },
          pathPattern: {
            type: 'string',
            description: 'Filter by path pattern (supports partial matching)'
          },
          operationIdPattern: {
            type: 'string',
            description: 'Filter by operation ID pattern (supports partial matching)'
          }
        },
        required: []
      },
      handler: async (args) => {
        const specContent = await this.openAPILoader.loadSpec(specPath);
        const endpoints: any[] = [];
        
        if (specContent.paths) {
          for (const [path, pathItem] of Object.entries(specContent.paths)) {
            for (const [method, operation] of Object.entries(pathItem)) {
              if (typeof operation === 'object' && operation.operationId) {
                const endpoint = {
                  path,
                  method: method.toUpperCase(),
                  operationId: operation.operationId,
                  summary: operation.summary,
                  description: operation.description,
                  parameters: operation.parameters?.map((p: any) => ({
                    name: p.name,
                    in: p.in,
                    required: p.required,
                    type: p.schema?.type
                  })) || [],
                  hasRequestBody: !!operation.requestBody,
                  responses: Object.keys(operation.responses || {})
                };

                // Apply filters
                let matches = true;
                
                if (args.method && endpoint.method !== args.method.toUpperCase()) {
                  matches = false;
                }
                
                if (args.pathPattern && !endpoint.path.includes(args.pathPattern)) {
                  matches = false;
                }
                
                if (args.operationIdPattern && !endpoint.operationId.includes(args.operationIdPattern)) {
                  matches = false;
                }
                
                if (matches) {
                  endpoints.push(endpoint);
                }
              }
            }
          }
        }

        return {
          totalEndpoints: endpoints.length,
          filters: {
            method: args.method || 'all',
            pathPattern: args.pathPattern || 'none',
            operationIdPattern: args.operationIdPattern || 'none'
          },
          endpoints: endpoints
        };
      }
    });
  }

}