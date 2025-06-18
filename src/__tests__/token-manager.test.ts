import { jest } from '@jest/globals';
import { TokenManager } from '../lib/token-manager.js';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('TokenManager', () => {
  let tokenManager: TokenManager;
  const mockClientId = 'test-client-id';
  const mockClientSecret = 'test-client-secret';
  const mockAuthUrl = 'https://api.example.com';
  const mockAuthPath = '/auth/token';

  beforeEach(() => {
    tokenManager = new TokenManager(mockClientId, mockClientSecret, mockAuthUrl, mockAuthPath);
    jest.clearAllMocks();
  });

  describe('getValidToken', () => {
    it('should request a new token when cache is empty', async () => {
      const mockTokenResponse = {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockTokenResponse)),
        status: 200,
        statusText: 'OK'
      } as Response);

      const token = await tokenManager.getValidToken();

      expect(token).toBe('test-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/auth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: mockClientId,
            clientSecret: mockClientSecret
          })
        })
      );
    });

    it('should return cached token if still valid', async () => {
      // First request
      const mockTokenResponse = {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockTokenResponse)),
        status: 200,
        statusText: 'OK'
      } as Response);

      const token1 = await tokenManager.getValidToken();
      const token2 = await tokenManager.getValidToken();

      expect(token1).toBe('test-token');
      expect(token2).toBe('test-token');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle alternative token response format', async () => {
      const mockTokenResponse = {
        token: 'test-token-alt',
        expires_in: 3600
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockTokenResponse)),
        status: 200,
        statusText: 'OK'
      } as Response);

      const token = await tokenManager.getValidToken();

      expect(token).toBe('test-token-alt');
    });

    it('should throw error when authentication fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
        status: 401,
        statusText: 'Unauthorized'
      } as Response);

      await expect(tokenManager.getValidToken()).rejects.toThrow(
        'Failed to obtain access token: Authentication failed: 401 Unauthorized - Unauthorized'
      );
    });

    it('should throw error when no access token in response', async () => {
      const mockTokenResponse = {
        expires_in: 3600
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockTokenResponse)),
        status: 200,
        statusText: 'OK'
      } as Response);

      await expect(tokenManager.getValidToken()).rejects.toThrow(
        'Failed to obtain access token: No access token in response'
      );
    });
  });

  describe('refreshToken', () => {
    it('should clear cache and request new token', async () => {
      const mockTokenResponse = {
        access_token: 'new-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockTokenResponse)),
        status: 200,
        statusText: 'OK'
      } as Response);

      const token = await tokenManager.refreshToken();

      expect(token).toBe('new-token');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearCache', () => {
    it('should clear the token cache', async () => {
      // First get a token
      const mockTokenResponse = {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockTokenResponse)),
        status: 200,
        statusText: 'OK'
      } as Response);

      await tokenManager.getValidToken();
      
      // Clear cache
      tokenManager.clearCache();
      
      // Next call should request new token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockTokenResponse)),
        status: 200,
        statusText: 'OK'
      } as Response);

      await tokenManager.getValidToken();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});