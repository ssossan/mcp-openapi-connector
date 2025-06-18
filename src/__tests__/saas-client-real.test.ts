import { jest } from '@jest/globals';
import { SaaSAPIClient } from '../lib/saas-client';
import { TokenManager } from '../lib/token-manager';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('SaaSAPIClient (Real)', () => {
  let client: SaaSAPIClient;
  let tokenManager: TokenManager;
  const mockApiBaseUrl = 'https://api.example.com';

  beforeEach(() => {
    tokenManager = new TokenManager('test-id', 'test-secret', 'https://auth.example.com');
    client = new SaaSAPIClient(mockApiBaseUrl, tokenManager);
    jest.clearAllMocks();
  });

  describe('call', () => {
    it('should make GET request with authentication', async () => {
      // Mock token request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          expires_in: 3600
        })),
        status: 200,
        statusText: 'OK'
      } as Response);

      // Mock API request
      const mockResponse = { data: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      const result = await client.call('/test');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Token + API call
      
      // Check API call was made with correct headers
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });

    it('should handle 401 and retry with new token', async () => {
      // Mock initial token request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'old-token',
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

      // Mock new token request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'new-token',
          expires_in: 3600
        })),
        status: 200,
        statusText: 'OK'
      } as Response);

      // Mock successful retry
      const mockResponse = { success: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      const result = await client.call('/test');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial token + 401 + refresh token + retry
    });

    it('should handle query parameters correctly', async () => {
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
        json: () => Promise.resolve({}),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);

      await client.call('/test', {
        method: 'GET',
        params: { id: '123', tags: ['tag1', 'tag2'] }
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://api.example.com/test?id=123&tags=tag1&tags=tag2',
        expect.any(Object)
      );
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      // Mock token for all convenience method tests
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          expires_in: 3600
        })),
        status: 200,
        statusText: 'OK'
      } as Response);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        headers: new Headers({ 'content-type': 'application/json' })
      } as Response);
    });

    it('should call get method correctly', async () => {
      await client.get('/test', { id: '123' });

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://api.example.com/test?id=123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should call post method correctly', async () => {
      const body = { name: 'test' };
      await client.post('/test', body);

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body)
        })
      );
    });
  });
});