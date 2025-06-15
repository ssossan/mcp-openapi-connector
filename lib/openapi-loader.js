import { readFile } from 'fs/promises';
import { join } from 'path';

export class OpenAPILoader {
  constructor() {
    this.specs = new Map();
  }

  async loadSpec(specPath) {
    try {
      const content = await readFile(specPath, 'utf-8');
      const spec = JSON.parse(content);
      
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

  generateToolsFromSpec(spec, options = {}) {
    const tools = [];
    const { prefix = '', includeOnly, exclude = [] } = options;
    
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
          const toolName = this.generateToolName(path, method, operation, prefix);
          
          if (exclude.includes(toolName)) continue;
          if (includeOnly && !includeOnly.includes(toolName)) continue;
          
          const tool = this.createToolFromOperation(
            toolName,
            path,
            method.toUpperCase(),
            operation,
            spec
          );
          
          tools.push(tool);
        }
      }
    }
    
    return tools;
  }

  generateToolName(path, method, operation, prefix) {
    if (operation.operationId) {
      return prefix + operation.operationId;
    }
    
    const pathParts = path.split('/').filter(p => p && !p.startsWith('{'));
    const resourceName = pathParts[pathParts.length - 1] || 'resource';
    
    return prefix + method.toLowerCase() + '_' + resourceName;
  }

  createToolFromOperation(name, path, method, operation, spec) {
    const tool = {
      name,
      description: operation.summary || operation.description || `${method} ${path}`,
      _apiEndpoint: path,
      _method: method
    };

    // Check for special content types
    if (operation.requestBody && operation.requestBody.content) {
      const contentTypes = Object.keys(operation.requestBody.content);
      if (contentTypes.includes('multipart/form-data')) {
        tool._contentType = 'multipart/form-data';
      } else if (contentTypes.includes('application/x-www-form-urlencoded')) {
        tool._contentType = 'application/x-www-form-urlencoded';
      }
    }

    const inputSchema = {
      type: 'object',
      properties: {},
      required: []
    };

    // Path parameters
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if (param.in === 'path') {
          inputSchema.properties[param.name] = this.parameterToSchema(param);
          inputSchema.required.push(param.name);
        } else if (param.in === 'query') {
          inputSchema.properties[param.name] = this.parameterToSchema(param);
          if (param.required) {
            inputSchema.required.push(param.name);
          }
        }
      }
    }

    // Request body
    if (operation.requestBody && operation.requestBody.content) {
      const jsonContent = operation.requestBody.content['application/json'];
      if (jsonContent && jsonContent.schema) {
        const bodySchema = this.resolveSchema(jsonContent.schema, spec);
        
        if (bodySchema.properties) {
          Object.assign(inputSchema.properties, bodySchema.properties);
          if (bodySchema.required) {
            inputSchema.required.push(...bodySchema.required);
          }
        }
      }
    }

    // Always add inputSchema, even if empty (required by Claude Desktop)
    tool.inputSchema = inputSchema;

    return tool;
  }

  parameterToSchema(param) {
    const schema = param.schema || {};
    
    return {
      type: schema.type || 'string',
      description: param.description,
      ...(schema.enum && { enum: schema.enum }),
      ...(schema.minimum !== undefined && { minimum: schema.minimum }),
      ...(schema.maximum !== undefined && { maximum: schema.maximum }),
      ...(schema.pattern && { pattern: schema.pattern }),
      ...(schema.format && { format: schema.format })
    };
  }

  resolveSchema(schema, spec) {
    if (schema.$ref) {
      const refPath = schema.$ref.split('/');
      let resolved = spec;
      
      for (let i = 1; i < refPath.length; i++) {
        resolved = resolved[refPath[i]];
      }
      
      return this.resolveSchema(resolved, spec);
    }
    
    if (schema.allOf) {
      const merged = { type: 'object', properties: {}, required: [] };
      
      for (const subSchema of schema.allOf) {
        const resolved = this.resolveSchema(subSchema, spec);
        if (resolved.properties) {
          Object.assign(merged.properties, resolved.properties);
        }
        if (resolved.required) {
          merged.required.push(...resolved.required);
        }
      }
      
      return merged;
    }
    
    return schema;
  }

  async loadAndGenerateTools(specPath, options = {}) {
    const spec = await this.loadSpec(specPath);
    return this.generateToolsFromSpec(spec, options);
  }
}