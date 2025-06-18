import { jest } from '@jest/globals';
import { SaaSAPIClient } from '../lib/saas-client.js';
import { TokenManager } from '../lib/token-manager.js';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('SaaSAPIClient', () => {
  let client: SaaSAPIClient;
  let mockTokenManager: jest.Mocked<TokenManager>;
  const mockApiBaseUrl = 'https://api.example.com';

  beforeEach(() => {
    mockTokenManager = {
      getValidToken: jest.fn(),
      refreshToken: jest.fn(),
      clearCache: jest.fn(),
      requestTokenDirect: jest.fn()
    } as any;

    client = new SaaSAPIClient(mockApiBaseUrl, mockTokenManager);
    jest.clearAllMocks();
  });

  describe('call', () => {
    it('should make GET request with query parameters', async () => {
      mockTokenManager.getValidToken.mockResolvedValue('test-token');
      
      const mockResponse = { data: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      const result = await client.call('/test', {
        method: 'GET',
        params: { id: '123', name: 'test' }
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test?id=123&name=test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should make POST request with JSON body', async () => {
      mockTokenManager.getValidToken.mockResolvedValue('test-token');
      
      const mockResponse = { success: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      const requestBody = { name: 'test', value: 123 };
      const result = await client.call('/test', {
        method: 'POST',
        body: requestBody
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify(requestBody)
        })
      );
    });

    it('should handle array parameters in GET requests', async () => {
      mockTokenManager.getValidToken.mockResolvedValue('test-token');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      await client.call('/test', {
        method: 'GET',
        params: { tags: ['tag1', 'tag2'], id: '123' }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test?tags=tag1&tags=tag2&id=123',
        expect.any(Object)
      );
    });

    it('should retry on 401 error and refresh token', async () => {
      mockTokenManager.getValidToken
        .mockResolvedValueOnce('old-token')
        .mockResolvedValueOnce('new-token');
      
      mockTokenManager.refreshToken.mockResolvedValue('new-token');

      // First call fails with 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Unauthorized')
      } as Response);

      // Second call succeeds
      const mockResponse = { data: 'success' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      const result = await client.call('/test');

      expect(result).toEqual(mockResponse);
      expect(mockTokenManager.refreshToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle non-JSON responses', async () => {
      mockTokenManager.getValidToken.mockResolvedValue('test-token');
      
      const textResponse = 'Plain text response';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(textResponse),
        headers: new Headers({ 'content-type': 'text/plain' })
      } as Response);

      const result = await client.call('/test');

      expect(result).toBe(textResponse);
    });

    it('should throw error on API failure', async () => {
      mockTokenManager.getValidToken.mockResolvedValue('test-token');
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error')
      } as Response);

      await expect(client.call('/test')).rejects.toThrow(
        'API request failed: 500 Internal Server Error - Server error'
      );
    });

    it('should retry on network errors', async () => {
      mockTokenManager.getValidToken.mockResolvedValue('test-token');
      
      // First two calls fail with network error
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
          headers: new Headers({ 'content-type': 'application/json' })
        } as Response);

      const result = await client.call('/test');

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      mockTokenManager.getValidToken.mockResolvedValue('test-token');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);
    });

    it('should call get method correctly', async () => {
      await client.get('/test', { id: '123' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test?id=123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should call post method correctly', async () => {
      const body = { name: 'test' };
      await client.post('/test', body);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body)
        })
      );
    });

    it('should call put method correctly', async () => {
      const body = { name: 'updated' };
      await client.put('/test', body);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(body)
        })
      );
    });

    it('should call delete method correctly', async () => {
      await client.delete('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should call patch method correctly', async () => {
      const body = { name: 'patched' };
      await client.patch('/test', body);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(body)
        })
      );
    });
  });
});