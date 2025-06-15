export class TokenManager {
  constructor(clientId, clientSecret, authUrl) {
    this.config = { clientId, clientSecret, authUrl };
    this.tokenCache = new Map();
  }

  async getValidToken(service = 'default') {
    const cached = this.tokenCache.get(service);
    
    if (cached && this.isTokenValid(cached)) {
      return cached.access_token;
    }

    const newToken = await this.requestNewToken();
    this.tokenCache.set(service, newToken);
    return newToken.access_token;
  }

  isTokenValid(token) {
    if (!token || !token.expires_at) return false;
    const buffer = 30 * 1000; // 30 seconds buffer
    return Date.now() < token.expires_at - buffer;
  }

  async requestNewToken() {
    const requestBody = {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret
    };

    try {
      const response = await fetch(this.config.authUrl, {
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

      const data = JSON.parse(responseText);
      
      // Some APIs return {token: "..."} instead of {access_token: "..."}
      const accessToken = data.access_token || data.token;
      const expiresIn = data.expires_in || 3600; // Default 1 hour if not specified
      
      return {
        access_token: accessToken,
        token_type: data.token_type || 'Bearer',
        expires_in: expiresIn,
        expires_at: Date.now() + (expiresIn * 1000)
      };
    } catch (error) {
      console.error('Token request failed:', error);
      throw new Error(`Failed to obtain access token: ${error.message}`);
    }
  }

  clearCache() {
    this.tokenCache.clear();
  }

  async refreshToken(service = 'default') {
    this.tokenCache.delete(service);
    return this.getValidToken(service);
  }
}