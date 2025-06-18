import { jest } from '@jest/globals';
import { MCPHandler } from '../lib/mcp-handler.js';
import { SaaSAPIClient } from '../lib/saas-client.js';
import { TokenManager } from '../lib/token-manager.js';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('Integration Tests', () => {
  let tokenManager: TokenManager;
  let saasClient: SaaSAPIClient;
  let mcpHandler: MCPHandler;

  beforeEach(() => {
    tokenManager = new TokenManager(
      'test-client-id',
      'test-client-secret',
      'https://api.example.com',
      '/auth/token'
    );
    saasClient = new SaaSAPIClient('https://api.example.com', tokenManager);
    mcpHandler = new MCPHandler(saasClient);
    jest.clearAllMocks();
  });

  describe('End-to-end API workflow', () => {
    it('should authenticate and make API calls', async () => {
      // Mock token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600
        })),
        status: 200,
        statusText: 'OK'
      } as Response);

      // Mock API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [{ id: '1', name: 'John' }] }),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      // Register a tool
      mcpHandler.registerTool('get_users', {
        name: 'get_users',
        description: 'Get users',
        inputSchema: { type: 'object', properties: {}, required: [] },
        _apiEndpoint: '/users',
        _method: 'GET'
      });

      // Call the tool
      const result = await mcpHandler.callTool('get_users', {});

      expect(result).toEqual({ users: [{ id: '1', name: 'John' }] });
      expect(mockFetch).toHaveBeenCalledTimes(2); // Token + API call
    });

    it('should handle authentication errors and retry', async () => {
      // Mock initial token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'old-token',
          token_type: 'Bearer',
          expires_in: 3600
        })),
        status: 200,
        statusText: 'OK'
      } as Response);

      // Mock 401 response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Token expired')
      } as Response);

      // Mock new token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'new-token',
          token_type: 'Bearer',
          expires_in: 3600
        })),
        status: 200,
        statusText: 'OK'
      } as Response);

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      mcpHandler.registerTool('test_api', {
        name: 'test_api',
        description: 'Test API',
        inputSchema: { type: 'object', properties: {}, required: [] },
        _apiEndpoint: '/test',
        _method: 'GET'
      });

      const result = await mcpHandler.callTool('test_api', {});

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial token + 401 + refresh token + retry
    });

    it('should handle custom tool handlers', async () => {
      const customHandler = jest.fn(() => Promise.resolve({ custom: 'result' })) as any;

      mcpHandler.registerTool('custom_tool', {
        name: 'custom_tool',
        description: 'Custom tool',
        inputSchema: { type: 'object', properties: {}, required: [] },
        handler: customHandler as any
      });

      const result = await mcpHandler.callTool('custom_tool', { input: 'test' });

      expect(result).toEqual({ custom: 'result' });
      expect(customHandler).toHaveBeenCalledWith({ input: 'test' }, saasClient);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Tool registration and listing', () => {
    it('should register multiple tools and list them correctly', async () => {
      mcpHandler.registerTool('tool1', {
        name: 'tool1',
        description: 'First tool',
        inputSchema: { type: 'object', properties: {}, required: [] },
        // _internal: 'should not appear' // This property doesn't exist in MCPToolDefinition
      });

      mcpHandler.registerTool('tool2', {
        name: 'tool2',
        description: 'Second tool',
        inputSchema: { type: 'object', properties: {}, required: [] }
      });

      const tools = await mcpHandler.listTools();

      expect(tools).toHaveLength(2);
      expect(tools[0]).toEqual({
        name: 'tool1',
        description: 'First tool',
        inputSchema: { type: 'object', properties: {}, required: [] }
      });
      expect(tools[0]).not.toHaveProperty('_internal');
      expect(tools[1].name).toBe('tool2');
    });
  });

  describe('Resource management', () => {
    it('should register and read resources', async () => {
      const resourceHandler = jest.fn(() => Promise.resolve('resource content')) as any;

      mcpHandler.registerResource('test://resource', {
        uri: 'test://resource',
        name: 'Test Resource',
        description: 'A test resource',
        mimeType: 'text/plain',
        handler: resourceHandler as any
      });

      const resources = await mcpHandler.listResources();
      expect(resources).toHaveLength(1);

      const content = await mcpHandler.readResource('test://resource');
      expect(content).toBe('resource content');
      expect(resourceHandler).toHaveBeenCalledWith('test://resource', saasClient);
    });
  });
});