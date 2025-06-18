import { jest } from '@jest/globals';
import { MCPHandler } from '../lib/mcp-handler.js';
import { OpenAPILoader } from '../lib/openapi-loader.js';
import type { SaaSAPIClient } from '../lib/saas-client.js';
import type { MCPToolDefinition } from '../types/mcp.js';

// Mock the OpenAPILoader
jest.mock('../lib/openapi-loader.js');
const MockedOpenAPILoader = OpenAPILoader as jest.MockedClass<typeof OpenAPILoader>;

describe('MCPHandler', () => {
  let mcpHandler: MCPHandler;
  let mockSaasClient: jest.Mocked<SaaSAPIClient>;
  let mockOpenAPILoader: jest.Mocked<OpenAPILoader>;

  beforeEach(() => {
    mockSaasClient = {
      call: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      tokenManager: {
        getValidToken: jest.fn(),
        refreshToken: jest.fn(),
        clearCache: jest.fn(),
        requestTokenDirect: jest.fn()
      }
    } as any;

    mockOpenAPILoader = {
      loadAndGenerateTools: jest.fn(),
      loadSpec: jest.fn(),
      generateToolsFromSpec: jest.fn()
    } as any;

    MockedOpenAPILoader.mockImplementation(() => mockOpenAPILoader);

    mcpHandler = new MCPHandler(mockSaasClient);
    jest.clearAllMocks();
  });

  describe('registerTool', () => {
    it('should register a tool', () => {
      const tool: MCPToolDefinition = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {}, required: [] }
      };

      mcpHandler.registerTool('test_tool', tool);

      const tools = mcpHandler.listTools();
      expect(tools).resolves.toHaveLength(1);
    });
  });

  describe('listTools', () => {
    it('should return list of registered tools without internal fields', async () => {
      const tool: MCPToolDefinition = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {}, required: [] },
        _apiEndpoint: '/internal/endpoint',
        _method: 'GET'
      };

      mcpHandler.registerTool('test_tool', tool);

      const tools = await mcpHandler.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {}, required: [] }
      });
      expect(tools[0]).not.toHaveProperty('_apiEndpoint');
      expect(tools[0]).not.toHaveProperty('_method');
    });
  });

  describe('callTool', () => {
    it('should call tool handler if defined', async () => {
      const mockHandler = jest.fn(() => Promise.resolve({ result: 'success' })) as any;
      const tool: MCPToolDefinition = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: { type: 'object', properties: {}, required: [] },
        handler: mockHandler
      };

      mcpHandler.registerTool('test_tool', tool);

      const result = await mcpHandler.callTool('test_tool', { param: 'value' });

      expect(result).toEqual({ result: 'success' });
      expect(mockHandler).toHaveBeenCalledWith({ param: 'value' }, mockSaasClient);
    });

    it('should call API endpoint for GET requests', async () => {
      const tool: MCPToolDefinition = {
        name: 'get_users',
        description: 'Get users',
        inputSchema: { type: 'object', properties: {}, required: [] },
        _apiEndpoint: '/users',
        _method: 'GET'
      };

      mockSaasClient.call.mockResolvedValue({ users: [] });

      mcpHandler.registerTool('get_users', tool);

      const result = await mcpHandler.callTool('get_users', { limit: 10 });

      expect(result).toEqual({ users: [] });
      expect(mockSaasClient.call).toHaveBeenCalledWith('/users', {
        method: 'GET',
        params: { limit: 10 }
      });
    });

    it('should call API endpoint for POST requests', async () => {
      const tool: MCPToolDefinition = {
        name: 'create_user',
        description: 'Create user',
        inputSchema: { type: 'object', properties: {}, required: [] },
        _apiEndpoint: '/users',
        _method: 'POST'
      };

      mockSaasClient.call.mockResolvedValue({ id: '123' });

      mcpHandler.registerTool('create_user', tool);

      const result = await mcpHandler.callTool('create_user', { name: 'John' });

      expect(result).toEqual({ id: '123' });
      expect(mockSaasClient.call).toHaveBeenCalledWith('/users', {
        method: 'POST',
        body: { name: 'John' }
      });
    });

    it('should handle path parameters in endpoints', async () => {
      const tool: MCPToolDefinition = {
        name: 'get_user',
        description: 'Get user by ID',
        inputSchema: { type: 'object', properties: {}, required: [] },
        _apiEndpoint: '/users/{id}',
        _method: 'GET'
      };

      mockSaasClient.call.mockResolvedValue({ id: '123', name: 'John' });

      mcpHandler.registerTool('get_user', tool);

      const result = await mcpHandler.callTool('get_user', { id: '123', include: 'profile' });

      expect(result).toEqual({ id: '123', name: 'John' });
      expect(mockSaasClient.call).toHaveBeenCalledWith('/users/123', {
        method: 'GET',
        params: { include: 'profile' }
      });
    });

    it('should handle authentication endpoints specially', async () => {
      const tool: MCPToolDefinition = {
        name: 'get_token',
        description: 'Get auth token',
        inputSchema: { type: 'object', properties: {}, required: [] },
        _apiEndpoint: '/auth/token',
        _method: 'POST'
      };

      mockSaasClient.tokenManager.requestTokenDirect.mockResolvedValue({
        access_token: 'token123',
        token_type: 'Bearer',
        expires_in: 3600,
        expires_at: Date.now() + 3600000
      });

      mcpHandler.registerTool('get_token', tool);

      const result = await mcpHandler.callTool('get_token', {});

      expect(result).toEqual({
        access_token: 'token123',
        token_type: 'Bearer',
        expires_in: 3600,
        expires_at: expect.any(Number)
      });
      expect(mockSaasClient.tokenManager.requestTokenDirect).toHaveBeenCalled();
    });

    it('should handle file uploads with multipart/form-data', async () => {
      const tool: MCPToolDefinition = {
        name: 'upload_file',
        description: 'Upload file',
        inputSchema: { type: 'object', properties: {}, required: [] },
        _apiEndpoint: '/upload',
        _method: 'POST',
        _contentType: 'multipart/form-data'
      };

      mockSaasClient.call.mockResolvedValue({ fileId: 'file123' });

      mcpHandler.registerTool('upload_file', tool);

      const result = await mcpHandler.callTool('upload_file', { file: 'filedata' });

      expect(result).toEqual({ fileId: 'file123' });
      expect(mockSaasClient.call).toHaveBeenCalledWith('/upload', {
        method: 'POST',
        body: { file: 'filedata' },
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    });

    it('should throw error for unknown tool', async () => {
      await expect(mcpHandler.callTool('unknown_tool', {})).rejects.toThrow(
        'Tool unknown_tool not found'
      );
    });

    it('should throw error for tool without handler or endpoint', async () => {
      const tool: MCPToolDefinition = {
        name: 'invalid_tool',
        description: 'Invalid tool',
        inputSchema: { type: 'object', properties: {}, required: [] }
      };

      mcpHandler.registerTool('invalid_tool', tool);

      await expect(mcpHandler.callTool('invalid_tool', {})).rejects.toThrow(
        'Tool invalid_tool has no handler or API endpoint defined'
      );
    });
  });

  describe('loadOpenAPITools', () => {
    it('should load and register tools from OpenAPI spec', async () => {
      const mockTools = [
        {
          name: 'getUsers',
          description: 'Get users',
          inputSchema: { type: 'object' as const, properties: {}, required: [] },
          _apiEndpoint: '/users',
          _method: 'GET'
        },
        {
          name: 'createUser',
          description: 'Create user',
          inputSchema: { type: 'object' as const, properties: {}, required: [] },
          _apiEndpoint: '/users',
          _method: 'POST'
        }
      ];

      mockOpenAPILoader.loadAndGenerateTools.mockResolvedValue(mockTools);

      const count = await mcpHandler.loadOpenAPITools('/path/to/spec.json');

      expect(count).toBe(2);
      expect(mockOpenAPILoader.loadAndGenerateTools).toHaveBeenCalledWith(
        '/path/to/spec.json',
        {}
      );

      const tools = await mcpHandler.listTools();
      expect(tools).toHaveLength(2);
    });

    it('should pass options to OpenAPI loader', async () => {
      mockOpenAPILoader.loadAndGenerateTools.mockResolvedValue([]);

      const options = { prefix: 'api_', includeOnly: ['getUsers'] };
      await mcpHandler.loadOpenAPITools('/path/to/spec.json', options);

      expect(mockOpenAPILoader.loadAndGenerateTools).toHaveBeenCalledWith(
        '/path/to/spec.json',
        options
      );
    });

    it('should throw error if OpenAPI loading fails', async () => {
      mockOpenAPILoader.loadAndGenerateTools.mockRejectedValue(
        new Error('Failed to load spec')
      );

      await expect(
        mcpHandler.loadOpenAPITools('/path/to/spec.json')
      ).rejects.toThrow('Failed to load spec');
    });
  });

  describe('registerResource', () => {
    it('should register a resource', () => {
      const resource = {
        uri: 'test://resource',
        name: 'Test Resource',
        description: 'A test resource',
        mimeType: 'text/plain'
      };

      mcpHandler.registerResource('test://resource', resource);

      const resources = mcpHandler.listResources();
      expect(resources).resolves.toHaveLength(1);
    });
  });

  describe('readResource', () => {
    it('should call resource handler', async () => {
      const mockHandler = jest.fn(() => Promise.resolve('resource content')) as any;
      const resource = {
        uri: 'test://resource',
        name: 'Test Resource',
        description: 'A test resource',
        mimeType: 'text/plain',
        handler: mockHandler
      };

      mcpHandler.registerResource('test://resource', resource);

      const result = await mcpHandler.readResource('test://resource');

      expect(result).toBe('resource content');
      expect(mockHandler).toHaveBeenCalledWith('test://resource', mockSaasClient);
    });

    it('should throw error for unknown resource', async () => {
      await expect(mcpHandler.readResource('unknown://resource')).rejects.toThrow(
        'Resource unknown://resource not found'
      );
    });

    it('should throw error for resource without handler', async () => {
      const resource = {
        uri: 'test://resource',
        name: 'Test Resource',
        description: 'A test resource',
        mimeType: 'text/plain'
      };

      mcpHandler.registerResource('test://resource', resource);

      await expect(mcpHandler.readResource('test://resource')).rejects.toThrow(
        'Resource test://resource has no handler defined'
      );
    });
  });
});