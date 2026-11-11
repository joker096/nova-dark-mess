import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// Local llama.cpp server (OpenAI-compatible /v1/chat/completions).
const llamacpp = createOpenAICompatible({
  baseURL: process.env.LLM_BASE_URL ?? 'http://localhost:8080/v1',
  apiKey: process.env.LLM_API_KEY ?? 'not-needed',
});

export default {
  agents: {
    default: {
      model: llamacpp.languageModel(process.env.LLM_MODEL ?? 'qwen3.8-local'),
      system: 'You are a thorough QA agent. Verify every outcome.',
    },
  },
  targets: [{
    engine: web(),
    app: {
      url: process.env.APP_URL ?? 'http://localhost:3000',
      command: {
        executable: 'npx',
        args: ['vite', '--port=3000', '--host=0.0.0.0'],
        log: '.e2e/logs/app.log',
        reuseExisting: true,
      },
    },
  }],
} satisfies E2EConfig;
