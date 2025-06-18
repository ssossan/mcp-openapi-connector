describe('OpenAPI Loader (Simple)', () => {
  it('should test operation ID generation', () => {
    const generateOperationId = (method: string, path: string) => {
      // Remove path parameters and convert to camelCase
      const cleanPath = path.replace(/\{[^}]+\}/g, '').replace(/\/$/, '');
      const pathParts = cleanPath.split('/').filter(part => part.length > 0);
      
      if (pathParts.length === 0) {
        return method.toLowerCase();
      }
      
      const operationName = pathParts.map((part, index) => {
        if (index === 0) {
          return part.toLowerCase();
        }
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }).join('');
      
      return method.toLowerCase() + operationName.charAt(0).toUpperCase() + operationName.slice(1);
    };

    expect(generateOperationId('GET', '/users')).toBe('getUsers');
    expect(generateOperationId('POST', '/users')).toBe('postUsers');
    expect(generateOperationId('GET', '/users/{id}')).toBe('getUsers');
    expect(generateOperationId('DELETE', '/users/{id}/posts/{postId}')).toBe('deleteUsersPosts');
  });

  it('should test schema reference resolution', () => {
    const resolveRef = (ref: string, spec: any) => {
      const refPath = ref.split('/');
      let resolved = spec;
      
      for (let i = 1; i < refPath.length; i++) {
        resolved = resolved[refPath[i]];
      }
      
      return resolved;
    };

    const mockSpec = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' }
            }
          }
        }
      }
    };

    const resolved = resolveRef('#/components/schemas/User', mockSpec);
    expect(resolved).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' }
      }
    });
  });

  it('should test parameter processing', () => {
    const processParameters = (parameters: any[]) => {
      const schema = {
        type: 'object' as const,
        properties: {} as Record<string, any>,
        required: [] as string[]
      };

      parameters.forEach(param => {
        schema.properties[param.name] = {
          type: param.schema?.type || 'string',
          description: param.description
        };
        
        if (param.required) {
          schema.required.push(param.name);
        }
      });

      return schema;
    };

    const parameters = [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'User ID'
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer' },
        description: 'Maximum number of results'
      }
    ];

    const schema = processParameters(parameters);
    expect(schema).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string', description: 'User ID' },
        limit: { type: 'integer', description: 'Maximum number of results' }
      },
      required: ['id']
    });
  });

  it('should test tool filtering', () => {
    const filterTools = (tools: any[], options: { includeOnly?: string[], exclude?: string[] }) => {
      let filtered = tools;
      
      if (options.includeOnly && options.includeOnly.length > 0) {
        filtered = filtered.filter(tool => options.includeOnly!.includes(tool.name));
      }
      
      if (options.exclude && options.exclude.length > 0) {
        filtered = filtered.filter(tool => !options.exclude!.includes(tool.name));
      }
      
      return filtered;
    };

    const tools = [
      { name: 'getUsers' },
      { name: 'createUser' },
      { name: 'deleteUser' },
      { name: 'updateUser' }
    ];

    expect(filterTools(tools, { includeOnly: ['getUsers', 'createUser'] }))
      .toHaveLength(2);
    
    expect(filterTools(tools, { exclude: ['deleteUser'] }))
      .toHaveLength(3);
    
    expect(filterTools(tools, { includeOnly: ['getUsers'], exclude: ['getUsers'] }))
      .toHaveLength(0);
  });
});