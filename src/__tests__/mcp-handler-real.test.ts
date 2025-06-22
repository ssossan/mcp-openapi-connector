import { jest } from '@jest/globals';
import { MCPHandler } from '../lib/mcp-handler';
import { SaaSAPIClient } from '../lib/saas-client';
import { TokenManager } from '../lib/token-manager';

// Mock OpenAPILoader
jest.mock('../lib/openapi-loader', () => ({
  OpenAPILoader: jest.fn().mockImplementation(() => ({
    loadAndGenerateTools: jest.fn(() => Promise.resolve([])) as any,
    loadSpec: jest.fn(),
    generateToolsFromSpec: jest.fn()
  }))
}));

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('MCPHandler (Real)', () => {
  let mcpHandler: MCPHandler;
  let saasClient: SaaSAPIClient;
  let tokenManager: TokenManager;

  beforeEach(() => {
    tokenManager = new TokenManager('test-id', 'test-secret', 'https://auth.example.com');
    saasClient = new SaaSAPIClient('https://api.example.com', tokenManager);
    mcpHandler = new MCPHandler(saasClient);
    jest.clearAllMocks();
  });

  describe('tool management', () => {
    it('should register and list tools', async () => {
      const tool = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: []
        }
      };

      mcpHandler.registerTool('test_tool', tool);

      const tools = await mcpHandler.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test_tool');
      expect(tools[0].description).toBe('Test tool');
    });

    it('should filter out internal properties when listing tools', async () => {
      const tool = {
        name: 'api_tool',
        description: 'API tool',
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: []
        },
        _apiEndpoint: '/internal/endpoint',
        _method: 'GET'
      };

      mcpHandler.registerTool('api_tool', tool);

      const tools = await mcpHandler.listTools();
      expect(tools[0]).not.toHaveProperty('_apiEndpoint');
      expect(tools[0]).not.toHaveProperty('_method');
    });
  });

  describe('tool execution', () => {
    it('should execute tool with custom handler', async () => {
      const mockHandler = jest.fn<(args: any, client: SaaSAPIClient) => Promise<any>>()
        .mockResolvedValue({ result: 'success' });
      
      const tool = {
        name: 'custom_tool',
        description: 'Custom tool',
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: []
        },
        handler: mockHandler
      };

      mcpHandler.registerTool('custom_tool', tool);

      const result = await mcpHandler.callTool('custom_tool', { param: 'value' });

      expect(result).toEqual({ result: 'success' });
      expect(mockHandler).toHaveBeenCalledWith({ param: 'value' }, saasClient);
    });

    it('should execute API tool with GET method', async () => {
      // Mock token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          expires_in: 3600
        })),
        status: 200,
        statusText: 'OK'
      } as Response);

      // Mock API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [] }),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      const tool = {
        name: 'get_users',
        description: 'Get users',
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: []
        },
        _apiEndpoint: '/users',
        _method: 'GET'
      };

      mcpHandler.registerTool('get_users', tool);

      const result = await mcpHandler.callTool('get_users', { limit: 10 });

      expect(result).toEqual({ users: [] });
      expect(mockFetch).toHaveBeenCalledTimes(2); // Token + API call
    });

    it('should handle path parameters in API calls', async () => {
      // Mock token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          expires_in: 3600
        })),
        status: 200,
        statusText: 'OK'
      } as Response);

      // Mock API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '123', name: 'John' }),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      const tool = {
        name: 'get_user',
        description: 'Get user by ID',
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: []
        },
        _apiEndpoint: '/users/{id}',
        _method: 'GET',
        _pathParams: ['id'],
        _queryParams: ['include']
      };

      mcpHandler.registerTool('get_user', tool);

      const result = await mcpHandler.callTool('get_user', { id: '123', include: 'profile' });

      expect(result).toEqual({ id: '123', name: 'John' });
      
      // Check that the URL was built correctly with path parameter
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://api.example.com/users/123?include=profile',
        expect.any(Object)
      );
    });

    it('should throw error for unknown tool', async () => {
      await expect(mcpHandler.callTool('unknown_tool', {})).rejects.toThrow(
        'Tool unknown_tool not found'
      );
    });

    it('should throw error for tool without handler or endpoint', async () => {
      const tool = {
        name: 'invalid_tool',
        description: 'Invalid tool',
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: []
        }
      };

      mcpHandler.registerTool('invalid_tool', tool);

      await expect(mcpHandler.callTool('invalid_tool', {})).rejects.toThrow(
        'Tool invalid_tool has no handler or API endpoint defined'
      );
    });
  });

  describe('resource management', () => {
    it('should register and list resources', async () => {
      const resource = {
        uri: 'test://resource',
        name: 'Test Resource',
        description: 'A test resource',
        mimeType: 'text/plain'
      };

      mcpHandler.registerResource('test://resource', resource);

      const resources = await mcpHandler.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe('test://resource');
    });

    it('should read resource with handler', async () => {
      const mockHandler = jest.fn<(uri: string, client: SaaSAPIClient) => Promise<any>>()
        .mockResolvedValue('resource content');
      
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
      expect(mockHandler).toHaveBeenCalledWith('test://resource', saasClient);
    });

    it('should throw error for unknown resource', async () => {
      await expect(mcpHandler.readResource('unknown://resource')).rejects.toThrow(
        'Resource unknown://resource not found'
      );
    });
  });
});