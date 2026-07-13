const defaultPaths = {
  openai: '/v1/chat/completions',
  claude: '/v1/messages',
  gemini: '/v1beta/models/{model}:generateContent'
};

const modelListPaths = {
  openai: '/v1/models',
  claude: '/v1/models',
  gemini: '/v1beta/models'
};

export function buildRequest({ api, promptText, systemInstruction, stream, maxOutputTokens }) {
  const protocol = api.protocol || 'openai';
  const requestStream = stream ?? api.stream;
  // 请求体最大输出 token：优先使用全局传入值，回退到 api 自带值。
  const outputTokens = maxOutputTokens ?? api.outputTokens;
  const path = resolveCompletionPath(api, protocol, requestStream);
  const url = `${api.baseUrl.replace(/\/+$/, '')}${path}`;
  const headers = {
    'content-type': 'application/json'
  };
  let body;

  if (protocol === 'claude') {
    headers['x-api-key'] = api.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: api.model,
      max_tokens: outputTokens,
      stream: requestStream,
      system: systemInstruction,
      messages: [{ role: 'user', content: promptText }]
    };
  } else if (protocol === 'gemini') {
    headers['x-goog-api-key'] = api.apiKey;
    body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\n${promptText}` }]
        }
      ],
      generationConfig: {
        maxOutputTokens: outputTokens
      }
    };
  } else {
    headers.authorization = `Bearer ${api.apiKey}`;
    body = {
      model: api.model,
      stream: requestStream,
      max_tokens: outputTokens,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: promptText }
      ]
    };
  }

  return {
    url,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    },
    stream: requestStream,
    protocol
  };
}

export function resolveCompletionPath(api, protocol = api.protocol || 'openai', stream = api.stream) {
  if (api.path) return api.path.startsWith('/') ? api.path : `/${api.path}`;
  if (protocol === 'gemini') {
    const action = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    return defaultPaths.gemini.replace('{model}', encodeURIComponent(api.model)).replace('generateContent', action);
  }
  return defaultPaths[protocol] || defaultPaths.openai;
}

export function previewCompletionUrl(api) {
  if (!api.baseUrl) return '';
  const protocol = api.protocol || 'openai';
  const model = api.model || '{model}';
  const path = resolveCompletionPath({ ...api, model }, protocol, api.stream);
  return `${api.baseUrl.replace(/\/+$/, '')}${path}`;
}

// API Key 永久脱敏，保留头尾少量字符用于辨别是否填错。
export function redactApiKey(apiKey) {
  const key = String(apiKey || '');
  if (!key) return '';
  if (key.length <= 8) return `${key.slice(0, 2)}****`;
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

// 按协议构建请求预览：URL、请求头、请求体结构、请求参数。API Key 脱敏。
// 正文默认折叠，body 中以占位说明代替完整正文。
export function buildRequestPreview({ api, promptMeta, maxOutputTokens, expectedOutputTokens }) {
  const protocol = api.protocol || 'openai';
  const requestStream = api.stream;
  const url = previewCompletionUrl(api);
  const redactedKey = redactApiKey(api.apiKey);
  const estimatedTokens = promptMeta?.estimatedTokens || 0;
  const bodyUserContent = `{正文约 ${estimatedTokens} token 的中文长文本，默认折叠，可二次展开}`;
  const headers = { 'content-type': 'application/json' };
  let body;
  let params;

  if (protocol === 'claude') {
    headers['x-api-key'] = redactedKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: api.model || '{model}',
      max_tokens: maxOutputTokens,
      stream: requestStream,
      system: '{systemInstruction}',
      messages: [{ role: 'user', content: bodyUserContent }]
    };
    params = {
      model: api.model || '{model}',
      max_tokens: maxOutputTokens,
      stream: requestStream,
      expectedOutputTokens
    };
  } else if (protocol === 'gemini') {
    headers['x-goog-api-key'] = redactedKey;
    body = {
      contents: [{ role: 'user', parts: [{ text: bodyUserContent }] }],
      generationConfig: { maxOutputTokens }
    };
    params = {
      model: api.model || '{model}',
      maxOutputTokens,
      stream: requestStream,
      expectedOutputTokens
    };
  } else {
    headers.authorization = `Bearer ${redactedKey}`;
    body = {
      model: api.model || '{model}',
      stream: requestStream,
      max_tokens: maxOutputTokens,
      messages: [
        { role: 'system', content: '{systemInstruction}' },
        { role: 'user', content: bodyUserContent }
      ]
    };
    params = {
      model: api.model || '{model}',
      stream: requestStream,
      max_tokens: maxOutputTokens,
      expectedOutputTokens
    };
  }

  return { protocol, url, headers, body, params };
}

export function buildModelListRequest(api) {
  const protocol = api.protocol || 'openai';
  const baseUrl = api.baseUrl.replace(/\/+$/, '');
  const path = modelListPaths[protocol] || modelListPaths.openai;
  const headers = {};

  if (protocol === 'claude') {
    headers['x-api-key'] = api.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (protocol === 'gemini') {
    headers['x-goog-api-key'] = api.apiKey;
  } else {
    headers.authorization = `Bearer ${api.apiKey}`;
  }

  return {
    url: `${baseUrl}${path}`,
    init: {
      method: 'GET',
      headers
    },
    protocol
  };
}

export function extractModelIds(protocol, payload) {
  if (protocol === 'gemini') {
    return (payload.models || [])
      .map((model) => model.name || model.baseModelId)
      .filter(Boolean)
      .map((name) => String(name).replace(/^models\//, ''));
  }

  return (payload.data || payload.models || [])
    .map((model) => model.id || model.name || model.model)
    .filter(Boolean)
    .map(String);
}
