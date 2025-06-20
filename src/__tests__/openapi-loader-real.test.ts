import { jest } from '@jest/globals';
import { OpenAPILoader } from '../lib/openapi-loader';
import { readFile } from 'fs/promises';

// Mock fs/promises
jest.mock('fs/promises');
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;

describe('OpenAPILoader (Real)', () => {
  let loader: OpenAPILoader;

  beforeEach(() => {
    loader = new OpenAPILoader();
    jest.clearAllMocks();
  });

  describe('loadSpec', () => {
    it('should load and parse valid OpenAPI spec', async () => {
      const mockSpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              summary: 'Get users',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockSpec));

      const result = await loader.loadSpec('/path/to/spec.json');

      expect(result).toEqual(mockSpec);
      expect(mockReadFile).toHaveBeenCalledWith('/path/to/spec.json', 'utf-8');
    });

    it('should throw error for invalid OpenAPI spec', async () => {
      const invalidSpec = {
        info: { title: 'Test API', version: '1.0.0' }
        // Missing openapi and paths
      };

      mockReadFile.mockResolvedValue(JSON.stringify(invalidSpec));

      await expect(loader.loadSpec('/path/to/spec.json')).rejects.toThrow(
        'Invalid OpenAPI specification'
      );
    });

    it('should throw error for invalid JSON', async () => {
      mockReadFile.mockResolvedValue('invalid json');

      await expect(loader.loadSpec('/path/to/spec.json')).rejects.toThrow();
    });
  });

  describe('generateToolsFromSpec', () => {
    const mockSpec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            summary: 'Get all users',
            description: 'Retrieve a list of all users',
            parameters: [
              {
                name: 'limit',
                in: 'query' as const,
                schema: { type: 'integer' },
                description: 'Maximum number of users to return'
              }
            ],
            responses: { '200': { description: 'Success' } }
          },
          post: {
            operationId: 'createUser',
            summary: 'Create user',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' }
                    },
                    required: ['name']
                  }
                }
              }
            },
            responses: { '201': { description: 'Created' } }
          }
        },
        '/users/{id}': {
          get: {
            operationId: 'getUserById',
            summary: 'Get user by ID',
            parameters: [
              {
                name: 'id',
                in: 'path' as const,
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: { '200': { description: 'Success' } }
          }
        }
      }
    } as any;

    it('should generate tools from OpenAPI spec', () => {
      const tools = loader.generateToolsFromSpec(mockSpec);

      expect(tools).toHaveLength(3);
      
      const getUsersTool = tools.find(t => t.name === 'getUsers');
      expect(getUsersTool).toBeDefined();
      expect(getUsersTool?.description).toBe('Get all users');
      expect(getUsersTool?._apiEndpoint).toBe('/users');
      expect(getUsersTool?._method).toBe('GET');

      const createUserTool = tools.find(t => t.name === 'createUser');
      expect(createUserTool).toBeDefined();
      expect(createUserTool?._method).toBe('POST');

      const getUserByIdTool = tools.find(t => t.name === 'getUserById');
      expect(getUserByIdTool).toBeDefined();
      expect(getUserByIdTool?._apiEndpoint).toBe('/users/{id}');
    });

    it('should apply prefix option', () => {
      const tools = loader.generateToolsFromSpec(mockSpec, { prefix: 'api_' });

      expect(tools).toHaveLength(3);
      expect(tools.every(t => t.name.startsWith('api_'))).toBe(true);
      expect(tools.find(t => t.name === 'api_getUsers')).toBeDefined();
    });

    it('should filter tools with includeOnly option', () => {
      const tools = loader.generateToolsFromSpec(mockSpec, { 
        includeOnly: ['getUsers', 'createUser'] 
      });

      expect(tools).toHaveLength(2);
      expect(tools.find(t => t.name === 'getUsers')).toBeDefined();
      expect(tools.find(t => t.name === 'createUser')).toBeDefined();
      expect(tools.find(t => t.name === 'getUserById')).toBeUndefined();
    });

    it('should exclude tools with exclude option', () => {
      const tools = loader.generateToolsFromSpec(mockSpec, { 
        exclude: ['getUserById'] 
      });

      expect(tools).toHaveLength(2);
      expect(tools.find(t => t.name === 'getUsers')).toBeDefined();
      expect(tools.find(t => t.name === 'createUser')).toBeDefined();
      expect(tools.find(t => t.name === 'getUserById')).toBeUndefined();
    });
  });

  describe('loadAndGenerateTools', () => {
    it('should load spec and generate tools', async () => {
      const mockSpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              operationId: 'test',
              responses: { '200': { description: 'Success' } }
            }
          }
        }
      };

      mockReadFile.mockResolvedValue(JSON.stringify(mockSpec));

      const tools = await loader.loadAndGenerateTools('/path/to/spec.json');

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test');
      expect(mockReadFile).toHaveBeenCalledWith('/path/to/spec.json', 'utf-8');
    });
  });
});