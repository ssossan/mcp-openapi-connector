export interface TokenResponse {
  access_token?: string;
  token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface CachedToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  refresh_token?: string;
}

export interface TokenManagerConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  authPath?: string;
  scope?: string;
  grantType?: string;
}

export interface APIClientConfig extends TokenManagerConfig {
  baseUrl: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
}

export interface APIRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, any>;
  timeout?: number;
}