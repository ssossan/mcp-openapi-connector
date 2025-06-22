import { readFile } from 'fs/promises';
import type { 
  OpenAPISpec, 
  Schema, 
  Parameter, 
  Operation, 
  MCPTool, 
  OpenAPILoaderOptions 
} from '../types/openapi.js';

export class OpenAPILoader {
  private specs: Map<string, OpenAPISpec>;

  constructor() {
    this.specs = new Map();
  }

  async loadSpec(specPath: string): Promise<OpenAPISpec> {
    try {
      const content = await readFile(specPath, 'utf-8');
      const spec: OpenAPISpec = JSON.parse(content);
      
      if (!spec.openapi || !spec.paths) {
        throw new Error('Invalid OpenAPI specification');
      }
      
      this.specs.set(specPath, spec);
      return spec;
    } catch (error) {
      console.error(`Failed to load OpenAPI spec from ${specPath}:`, error);
      throw error;
    }
  }

  generateToolsFromSpec(spec: OpenAPISpec, options: OpenAPILoaderOptions = {}): MCPTool[] {
    const tools: MCPTool[] = [];
    const { prefix = '', includeOnly, exclude = [] } = options;
    
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase()) && operation) {
          const toolName = this.generateToolName(path, method, operation, prefix);
          
          if (exclude.includes(toolName)) continue;
          if (includeOnly && !includeOnly.includes(toolName)) continue;
          
          const tool = this.createToolFromOperation(
            toolName,
            path,
            method.toUpperCase(),
            operation,
            pathItem,
            spec
          );
          
          tools.push(tool);
        }
      }
    }
    
    return tools;
  }

  private generateToolName(path: string, method: string, operation: Operation, prefix: string): string {
    if (operation.operationId) {
      return prefix + operation.operationId;
    }
    
    const pathParts = path.split('/').filter(p => p && !p.startsWith('{'));
    const resourceName = pathParts[pathParts.length - 1] || 'resource';
    
    return prefix + method.toLowerCase() + '_' + resourceName;
  }

  private createToolFromOperation(
    name: string, 
    path: string, 
    method: string, 
    operation: Operation, 
    pathItem: any,
    spec: OpenAPISpec
  ): MCPTool {
    const tool: MCPTool = {
      name,
      description: operation.summary || operation.description || `${method} ${path}`,
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      _apiEndpoint: path,
      _method: method
    };

    // Check for special content types
    if (operation.requestBody?.content) {
      const contentTypes = Object.keys(operation.requestBody.content);
      if (contentTypes.includes('multipart/form-data')) {
        tool._contentType = 'multipart/form-data';
      } else if (contentTypes.includes('application/x-www-form-urlencoded')) {
        tool._contentType = 'application/x-www-form-urlencoded';
      }
    }

    const inputSchema = {
      type: 'object' as const,
      properties: {} as Record<string, Schema>,
      required: [] as string[]
    };

    // Store parameter types for proper handling in MCP handler
    const pathParams: string[] = [];
    const queryParams: string[] = [];
    const bodyParams: string[] = [];

    // Path parameters - check both operation-level and path-level parameters
    const allParameters: Parameter[] = [];
    
    // Add path-level parameters
    if (pathItem.parameters) {
      allParameters.push(...pathItem.parameters);
    }
    
    // Add operation-level parameters
    if (operation.parameters) {
      allParameters.push(...operation.parameters);
    }
    
    for (const param of allParameters) {
      if (param.in === 'path') {
        inputSchema.properties[param.name] = this.parameterToSchema(param);
        inputSchema.required.push(param.name);
        pathParams.push(param.name);
      } else if (param.in === 'query') {
        inputSchema.properties[param.name] = this.parameterToSchema(param);
        if (param.required) {
          inputSchema.required.push(param.name);
        }
        queryParams.push(param.name);
      }
    }
    
    // Fallback: Extract path parameters from URL template if not explicitly defined
    const pathTemplate = path;
    const pathParamMatches = pathTemplate.match(/\{([^}]+)\}/g);
    if (pathParamMatches) {
      for (const match of pathParamMatches) {
        const paramName = match.slice(1, -1); // Remove { and }
        if (!pathParams.includes(paramName)) {
          // Add missing path parameter
          pathParams.push(paramName);
          inputSchema.properties[paramName] = {
            type: 'string',
            description: `Path parameter: ${paramName}`
          };
          inputSchema.required.push(paramName);
        }
      }
    }

    // Request body
    if (operation.requestBody?.content) {
      const jsonContent = operation.requestBody.content['application/json'];
      if (jsonContent?.schema) {
        const bodySchema = this.resolveSchema(jsonContent.schema, spec);
        
        if (bodySchema.properties) {
          Object.assign(inputSchema.properties, bodySchema.properties);
          if (bodySchema.required) {
            inputSchema.required.push(...bodySchema.required);
          }
          bodyParams.push(...Object.keys(bodySchema.properties));
        }
      }
    }

    // Store parameter type information for MCP handler
    tool._pathParams = pathParams;
    tool._queryParams = queryParams;
    tool._bodyParams = bodyParams;
    

    // Always add inputSchema, even if empty (required by Claude Desktop)
    tool.inputSchema = inputSchema;

    return tool;
  }

  private parameterToSchema(param: Parameter): Schema {
    const schema = param.schema || {};
    
    return {
      type: schema.type || 'string',
      description: param.description,
      ...(schema.enum && { enum: schema.enum }),
      ...(schema.minimum !== undefined && { minimum: schema.minimum }),
      ...(schema.maximum !== undefined && { maximum: schema.maximum }),
      ...(schema.pattern && { pattern: schema.pattern }),
      ...(schema.format && { format: schema.format }),
      ...(schema.items && { items: schema.items }),
      ...(schema.minItems !== undefined && { minItems: schema.minItems }),
      ...(schema.maxItems !== undefined && { maxItems: schema.maxItems }),
      ...(schema.uniqueItems !== undefined && { uniqueItems: schema.uniqueItems })
    };
  }

  private resolveSchema(schema: Schema, spec: OpenAPISpec): Schema {
    if (schema.$ref) {
      const refPath = schema.$ref.split('/');
      let resolved: any = spec;
      
      for (let i = 1; i < refPath.length; i++) {
        resolved = resolved[refPath[i]];
      }
      
      return this.resolveSchema(resolved, spec);
    }
    
    if (schema.allOf) {
      const merged: Schema = { 
        type: 'object', 
        properties: {}, 
        required: [] 
      };
      
      for (const subSchema of schema.allOf) {
        const resolved = this.resolveSchema(subSchema, spec);
        if (resolved.properties) {
          Object.assign(merged.properties!, resolved.properties);
        }
        if (resolved.required) {
          merged.required!.push(...resolved.required);
        }
      }
      
      return merged;
    }
    
    return schema;
  }

  async loadAndGenerateTools(specPath: string, options: OpenAPILoaderOptions = {}): Promise<MCPTool[]> {
    const spec = await this.loadSpec(specPath);
    return this.generateToolsFromSpec(spec, options);
  }
}