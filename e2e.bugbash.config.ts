import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import base from './e2e.config.ts';

const shared: E2EConfig = base;

// What the local demo cannot do, plus the explorer's blind spots.
const context =
  'This is a demo messenger app with mock data (no backend, no real accounts, no email, no AI). Never report missing backend features as bugs. ' +
  'The bottom screen-switcher widget (bottom-right) is a demo navigation aid, not a product bug. ' +
  'The app has 4 screens: Chats list, Chat with Katie, Kyiv Channel, Katie Profile. ' +
  'Not bugs: mock data that is clearly placeholder (Katie Rogers, Kyiv channel); the demo screen switcher widget at bottom-right.';

const persona = {
  model: createOpenAICompatible({
    baseURL: process.env.LLM_BASE_URL ?? 'http://localhost:8080/v1',
    apiKey: process.env.LLM_API_KEY ?? 'not-needed',
  }).languageModel(process.env.LLM_MODEL ?? 'qwen3.8-local'),
  maxSteps: 40,
  maxModelCalls: 40,
  context,
};

export default {
  ...shared,
  tests: [shared.tests ?? 'tests/**/*.e2e.ts', 'tests/bugbash/**/*.e2e.ts'].flat(),
  targets: [{ name: 'web', engine: web(), app: { url: process.env.APP_URL ?? 'http://localhost:3000' } }],
  retries: 0,
  reporters: ['list'],
  agents: {
    default: persona,
  },
} satisfies E2EConfig;
