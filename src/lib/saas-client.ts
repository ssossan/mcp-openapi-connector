import type { APIRequestOptions } from '../types/auth.js';
import type { TokenManager } from './token-manager.js';

export class SaaSAPIClient {
  private apiBaseUrl: string;
  public readonly tokenManager: TokenManager;

  constructor(apiBaseUrl: string, tokenManager: TokenManager) {
    this.apiBaseUrl = apiBaseUrl;
    this.tokenManager = tokenManager;
  }

  async call(endpoint: string, options: APIRequestOptions = {}, authRetryCount: number = 0): Promise<any> {
    const { method = 'GET', params, body, headers = {} } = options;
    
    let url = `${this.apiBaseUrl}${endpoint}`;
    
    if (params && method === 'GET') {
      const queryParams = new URLSearchParams();
      
      // Handle array parameters correctly
      for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
          // Add each array item as a separate parameter
          value.forEach(item => queryParams.append(key, String(item)));
        } else if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      }
      
      url += `?${queryParams.toString()}`;
    }

    const token = await this.tokenManager.getValidToken();
    
    const requestOptions: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (body && method !== 'GET') {
      requestOptions.body = JSON.stringify(body);
    }

    try {
      const response = await this.makeRequestWithRetry(url, requestOptions);
      
      if (!response.ok) {
        if (response.status === 401 && authRetryCount < 2) {
          console.error('Authentication error detected, refreshing token...');
          await this.handleAuthError();
          return this.call(endpoint, options, authRetryCount + 1);
        }
        
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
    } catch (error) {
      console.error(`API call failed for ${endpoint}:`, error);
      throw error;
    }
  }

  private async makeRequestWithRetry(url: string, options: RequestInit, retries: number = 3): Promise<Response> {
    let lastError: Error;
    
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        return response;
      } catch (error) {
        lastError = error as Error;
        if (i < retries - 1) {
          const delay = Math.min(1000 * Math.pow(2, i), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }

  private async handleAuthError(): Promise<void> {
    try {
      await this.tokenManager.refreshToken();
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw error;
    }
  }

  async get(endpoint: string, params?: Record<string, any>): Promise<any> {
    return this.call(endpoint, { method: 'GET', params });
  }

  async post(endpoint: string, body?: any): Promise<any> {
    return this.call(endpoint, { method: 'POST', body });
  }

  async put(endpoint: string, body?: any): Promise<any> {
    return this.call(endpoint, { method: 'PUT', body });
  }

  async delete(endpoint: string): Promise<any> {
    return this.call(endpoint, { method: 'DELETE' });
  }

  async patch(endpoint: string, body?: any): Promise<any> {
    return this.call(endpoint, { method: 'PATCH', body });
  }
}