export default {
  register(server) {
    server.registerCustomTool('search_items', {
      name: 'search_items',
      description: 'Search for items by query',
      inputSchema: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'Search query',
            required: true 
          },
          filters: { 
            type: 'object', 
            description: 'Additional filters',
            properties: {
              status: { type: 'string', enum: ['active', 'inactive'] },
              category: { type: 'string' },
              created_after: { type: 'string', format: 'date-time' },
              created_before: { type: 'string', format: 'date-time' }
            }
          },
          sort: {
            type: 'string',
            enum: ['created_at', 'updated_at', 'name'],
            default: 'created_at'
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc'
          }
        },
        required: ['query']
      },
      apiEndpoint: '/items/search',
      method: 'POST'
    });

    server.registerCustomTool('bulk_operations', {
      name: 'bulk_operations',
      description: 'Perform bulk operations on multiple items',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['update', 'delete', 'archive'],
            required: true
          },
          item_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of item IDs to operate on',
            required: true
          },
          updates: {
            type: 'object',
            description: 'Updates to apply (only for update operation)'
          }
        },
        required: ['operation', 'item_ids']
      },
      handler: async (args, apiClient) => {
        const { operation, item_ids, updates } = args;
        
        switch (operation) {
          case 'update':
            return apiClient.post('/items/bulk/update', {
              ids: item_ids,
              updates
            });
          
          case 'delete':
            return apiClient.post('/items/bulk/delete', {
              ids: item_ids
            });
          
          case 'archive':
            return apiClient.post('/items/bulk/archive', {
              ids: item_ids
            });
          
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      }
    });

    server.registerCustomResource('items://recent', {
      uri: 'items://recent',
      name: 'Recent Items',
      description: 'List of recently created or updated items',
      mimeType: 'application/json',
      handler: async (uri, apiClient) => {
        const items = await apiClient.get('/items', {
          sort: 'updated_at',
          order: 'desc',
          limit: 20
        });
        
        return {
          title: 'Recent Items',
          updated_at: new Date().toISOString(),
          items
        };
      }
    });

    server.registerCustomResource('items://stats', {
      uri: 'items://stats',
      name: 'Item Statistics',
      description: 'Statistics about items in the system',
      mimeType: 'application/json',
      handler: async (uri, apiClient) => {
        const stats = await apiClient.get('/items/stats');
        
        return {
          title: 'Item Statistics',
          generated_at: new Date().toISOString(),
          ...stats
        };
      }
    });
  }
};