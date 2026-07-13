import { describe, expect, it } from 'vitest';
import { mergeClientConfig } from '../src/state/store.jsx';

describe('client config hydration', () => {
  it('fills missing sections from the server config when localStorage has an old config shape', () => {
    const serverConfig = {
      proxy: { enabled: true, url: 'http://127.0.0.1:7897' },
      load: {
        rpm: 10,
        totalRequests: 5000,
        maxConcurrent: 10,
        jitterSeconds: 5,
        retries: 0,
        stopAfterConsecutiveFailures: 10
      },
      prompt: {
        strategy: 'weight',
        weights: { '2-5w': 10, '5-10w': 35, '10-15w': 35, '15-20w': 20 },
        scroll: { incrementMin: 3000, incrementMax: 5000 },
        expectedOutput: { min: 1500, max: 3000, step: 500 }
      },
      output: { maxOutputTokens: 20000 },
      apis: [
        {
          id: 'api-1',
          name: 'API 1',
          enabled: true,
          protocol: 'openai',
          baseUrl: 'https://api.example.com',
          path: '',
          apiKey: 'sk-...1234',
          model: 'gpt-4o-mini',
          stream: true,
          useProxy: true
        }
      ]
    };

    const oldLocalConfig = {
      apis: [
        {
          id: 'api-1',
          apiKey: 'sk-real-key',
          baseUrl: 'https://local.example.com'
        }
      ]
    };

    const merged = mergeClientConfig(serverConfig, oldLocalConfig);

    expect(merged.prompt.weights['2-5w']).toBe(10);
    expect(merged.prompt.scroll.incrementMin).toBe(3000);
    expect(merged.prompt.expectedOutput.step).toBe(500);
    expect(merged.load.rpm).toBe(10);
    expect(merged.output.maxOutputTokens).toBe(20000);
    expect(merged.proxy.enabled).toBe(true);
    expect(merged.apis[0]).toMatchObject({
      id: 'api-1',
      name: 'API 1',
      apiKey: 'sk-real-key',
      baseUrl: 'https://local.example.com',
      protocol: 'openai',
      stream: true,
      useProxy: true
    });
  });

  it('falls back to the server config when localStorage contains a non-object value', () => {
    const serverConfig = {
      proxy: { enabled: true, url: 'http://127.0.0.1:7897' },
      load: { rpm: 10 },
      prompt: {
        weights: { '2-5w': 10 },
        scroll: { incrementMin: 3000 },
        expectedOutput: { step: 500 }
      },
      output: { maxOutputTokens: 20000 },
      apis: [{ id: 'api-1', name: 'API 1' }]
    };

    expect(mergeClientConfig(serverConfig, 'stale')).toBe(serverConfig);
    expect(mergeClientConfig(serverConfig, null)).toBe(serverConfig);
    expect(mergeClientConfig(serverConfig, [])).toBe(serverConfig);
  });

  it('ignores non-object nested config sections from stale localStorage', () => {
    const serverConfig = {
      proxy: { enabled: true, url: 'http://127.0.0.1:7897' },
      load: { rpm: 10 },
      prompt: {
        weights: { '2-5w': 10 },
        scroll: { incrementMin: 3000 },
        expectedOutput: { step: 500 }
      },
      output: { maxOutputTokens: 20000 },
      apis: [{ id: 'api-1', name: 'API 1', stream: true }]
    };

    const merged = mergeClientConfig(serverConfig, {
      proxy: 'bad',
      load: 'bad',
      prompt: { weights: 'bad', scroll: ['bad'], expectedOutput: null },
      output: ['bad'],
      apis: ['bad']
    });

    expect(merged.load).toEqual(serverConfig.load);
    expect(merged.prompt.weights).toEqual(serverConfig.prompt.weights);
    expect(merged.prompt.scroll).toEqual(serverConfig.prompt.scroll);
    expect(merged.prompt.expectedOutput).toEqual(serverConfig.prompt.expectedOutput);
    expect(merged.output).toEqual(serverConfig.output);
    expect(merged.apis[0]).toEqual(serverConfig.apis[0]);
  });
});
