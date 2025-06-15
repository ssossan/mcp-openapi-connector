#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'test-openapi-connector',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'test_simple',
        description: 'Simple test tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Test message'
            }
          }
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === 'test_simple') {
    return {
      content: [
        {
          type: 'text',
          text: `Hello! You said: ${(args as any)?.message || 'nothing'}`
        }
      ]
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: [] };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: [] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Test MCP server started');
}

main().catch(console.error);