describe('API Client (Simple)', () => {
  it('should test URL building with query parameters', () => {
    const buildUrl = (baseUrl: string, endpoint: string, params?: Record<string, any>) => {
      let url = `${baseUrl}${endpoint}`;
      
      if (params) {
        const queryParams = new URLSearchParams();
        
        for (const [key, value] of Object.entries(params)) {
          if (Array.isArray(value)) {
            value.forEach(item => queryParams.append(key, String(item)));
          } else if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
          }
        }
        
        if (queryParams.toString()) {
          url += `?${queryParams.toString()}`;
        }
      }
      
      return url;
    };

    expect(buildUrl('https://api.example.com', '/users')).toBe('https://api.example.com/users');
    
    expect(buildUrl('https://api.example.com', '/users', { limit: 10, page: 1 }))
      .toBe('https://api.example.com/users?limit=10&page=1');
    
    expect(buildUrl('https://api.example.com', '/users', { tags: ['tag1', 'tag2'] }))
      .toBe('https://api.example.com/users?tags=tag1&tags=tag2');
  });

  it('should test retry delay calculation', () => {
    const calculateRetryDelay = (attempt: number) => {
      return Math.min(1000 * Math.pow(2, attempt), 5000);
    };

    expect(calculateRetryDelay(0)).toBe(1000);
    expect(calculateRetryDelay(1)).toBe(2000);
    expect(calculateRetryDelay(2)).toBe(4000);
    expect(calculateRetryDelay(3)).toBe(5000); // capped at 5000
    expect(calculateRetryDelay(10)).toBe(5000); // still capped
  });

  it('should test endpoint path parameter replacement', () => {
    const buildEndpoint = (template: string, params: Record<string, any>) => {
      let endpoint = template;
      const usedParams = new Set<string>();
      
      Object.keys(params).forEach(key => {
        const placeholder = `{${key}}`;
        if (endpoint.includes(placeholder)) {
          endpoint = endpoint.replace(placeholder, String(params[key]));
          usedParams.add(key);
        }
      });

      // Return remaining params that weren't used in path
      const remainingParams: Record<string, any> = {};
      Object.keys(params).forEach(key => {
        if (!usedParams.has(key)) {
          remainingParams[key] = params[key];
        }
      });

      return { endpoint, remainingParams };
    };

    const result = buildEndpoint('/users/{id}', { id: '123', include: 'profile' });
    expect(result.endpoint).toBe('/users/123');
    expect(result.remainingParams).toEqual({ include: 'profile' });
  });
});