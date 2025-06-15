import type { Schema } from './openapi.js';
import type { SaaSAPIClient } from '../lib/saas-client.js';

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, Schema>;
    required?: string[];
  };
  handler?: (args: any, apiClient: SaaSAPIClient) => Promise<any>;
  _apiEndpoint?: string;
  _method?: string;
  _contentType?: string;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
  handler?: (uri: string, apiClient: SaaSAPIClient) => Promise<any>;
}

export interface OpenAPIToolsOptions {
  prefix?: string;
  includeOnly?: string[];
  exclude?: string[];
}