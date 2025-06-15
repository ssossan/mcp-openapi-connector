import type { TokenManagerConfig, TokenResponse, CachedToken } from '../types/auth.js';

export class TokenManager {
  private config: TokenManagerConfig;
  private tokenCache: Map<string, CachedToken>;

  constructor(clientId: string, clientSecret: string, authUrl: string, authPath: string = '/auth/token') {
    this.config = { clientId, clientSecret, authUrl, authPath };
    this.tokenCache = new Map();
  }

  async getValidToken(service: string = 'default'): Promise<string> {
    const cached = this.tokenCache.get(service);
    
    if (cached && this.isTokenValid(cached)) {
      return cached.access_token;
    }

    const newToken = await this.requestNewToken();
    this.tokenCache.set(service, newToken);
    return newToken.access_token;
  }

  private isTokenValid(token: CachedToken): boolean {
    if (!token || !token.expires_at) return false;
    const buffer = 30 * 1000; // 30 seconds buffer
    return Date.now() < token.expires_at - buffer;
  }

  private async requestNewToken(): Promise<CachedToken> {
    const requestBody = {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret
    };

    const fullAuthUrl = this.config.authUrl + (this.config.authPath || '/auth/token');
    console.error(`[Auth] Requesting token from: ${fullAuthUrl}`);
    console.error(`[Auth] Request body: ${JSON.stringify(requestBody)}`);

    try {
      const response = await fetch(fullAuthUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText} - ${responseText}`);
      }

      const data: TokenResponse = JSON.parse(responseText);
      
      // Some APIs return {token: "..."} instead of {access_token: "..."}
      const accessToken = data.access_token || data.token;
      if (!accessToken) {
        throw new Error('No access token in response');
      }
      
      const expiresIn = data.expires_in || 3600; // Default 1 hour if not specified
      
      return {
        access_token: accessToken,
        token_type: data.token_type || 'Bearer',
        expires_in: expiresIn,
        expires_at: Date.now() + (expiresIn * 1000)
      };
    } catch (error) {
      console.error('Token request failed:', error);
      throw new Error(`Failed to obtain access token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  clearCache(): void {
    this.tokenCache.clear();
  }

  async refreshToken(service: string = 'default'): Promise<string> {
    this.tokenCache.delete(service);
    return this.getValidToken(service);
  }

  async requestTokenDirect(): Promise<CachedToken> {
    return this.requestNewToken();
  }
}