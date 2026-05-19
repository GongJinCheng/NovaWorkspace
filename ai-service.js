// ai-service.js
// AI Service - 支持 OpenAI 兼容接口

class AIService {
  constructor() {
    this.apiKey = localStorage.getItem('ai-api-key') || '';
    this.baseUrl = localStorage.getItem('ai-base-url') || 'https://api.openai.com/v1';
    this.model = localStorage.getItem('ai-model') || 'gpt-3.5-turbo';
  }

  // 保存配置
  saveConfig(config) {
    this.apiKey = config.apiKey || this.apiKey;
    this.baseUrl = config.baseUrl || this.baseUrl;
    this.model = config.model || this.model;
    
    localStorage.setItem('ai-api-key', this.apiKey);
    localStorage.setItem('ai-base-url', this.baseUrl);
    localStorage.setItem('ai-model', this.model);
  }

  // 检查是否已配置
  isConfigured() {
    return !!this.apiKey;
  }

  // 调用 AI API
  async chat(messages, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('请先配置 AI API Key');
    }

    const url = `${this.baseUrl}/chat/completions`;
    
    const body = {
      model: options.model || this.model,
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 4096,
      stream: false
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('AI API Error:', error);
      throw error;
    }
  }

  // 流式调用
  async chatStream(messages, options = {}, onChunk) {
    if (!this.isConfigured()) {
      throw new Error('请先配置 AI API Key');
    }

    const url = `${this.baseUrl}/chat/completions`;
    
    const body = {
      model: options.model || this.model,
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 4096,
      stream: true
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error('AI Stream Error:', error);
      throw error;
    }
  }

  // ===== 内置 AI 功能 =====

  // Markdown 格式化整理
  async formatMarkdown(content) {
    const messages = [
      {
        role: 'system',
        content: `你是一个专业的 Markdown 格式化助手。请对用户提供的 Markdown 内容进行整理和格式化，要求：
1. 保持原有内容不变，只做格式优化
2. 修正标题层级（确保层级正确）
3. 统一列表格式
4. 添加适当的空行，提高可读性
5. 修正代码块格式
6. 确保表格格式正确
7. 输出整理后的完整内容，不要添加额外说明`
      },
      {
        role: 'user',
        content: content
      }
    ];

        return await this.chat(messages, { temperature: 0.3 });
  }

  // 获取可用模型列表
  async fetchModels() {
    if (!this.apiKey || !this.baseUrl) {
      throw new Error('请先填写 API Key 和 Base URL');
    }

    const url = `${this.baseUrl}/models`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`获取模型失败: ${response.status}`);
      }

      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        return data.data.map(m => m.id).sort();
      }
      if (Array.isArray(data)) {
        return data.map(m => m.id || m).sort();
      }
      return [];
    } catch (error) {
      console.error('Fetch models error:', error);
      throw error;
    }
  }

  // 代码解释
  async explainCode(code, language = '') {
    const messages = [
      {
        role: 'system',
        content: '你是一个专业的代码解释助手。请用简洁易懂的语言解释代码的功能和逻辑。'
      },
      {
        role: 'user',
        content: `请解释以下 ${language} 代码：\n\n\`\`\`${language}\n${code}\n\`\`\``
      }
    ];

    return await this.chat(messages);
  }

  // 内容摘要
  async summarize(content) {
    const messages = [
      {
        role: 'system',
        content: '你是一个内容摘要助手。请生成简洁准确的摘要。'
      },
      {
        role: 'user',
        content: `请为以下内容生成摘要：\n\n${content}`
      }
    ];

    return await this.chat(messages, { temperature: 0.5 });
  }

  // 翻译
  async translate(content, targetLang = '中文') {
    const messages = [
      {
        role: 'system',
        content: `你是一个专业的翻译助手。请将内容翻译成${targetLang}，保持原有格式。`
      },
      {
        role: 'user',
        content: content
      }
    ];

        return await this.chat(messages, { temperature: 0.3 });
  }

  // 获取可用模型列表
  async fetchModels() {
    if (!this.apiKey || !this.baseUrl) {
      throw new Error('请先填写 API Key 和 Base URL');
    }

    const url = `${this.baseUrl}/models`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`获取模型失败: ${response.status}`);
      }

      const data = await response.json();
      if (data.data && Array.isArray(data.data)) {
        return data.data.map(m => m.id).sort();
      }
      if (Array.isArray(data)) {
        return data.map(m => m.id || m).sort();
      }
      return [];
    } catch (error) {
      console.error('Fetch models error:', error);
      throw error;
    }
  }
}

// 导出单例
window.aiService = new AIService();