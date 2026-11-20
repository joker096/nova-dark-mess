/**
 * CLI entry point for running the Nova Gateway.
 * 
 * Usage:
 *   npx ts-node src/cli.ts --config gateway.json
 *   npx ts-node src/cli.ts --generate-identity --output identity.json
 */

import { createBotGateway, generateBotIdentity, loadBotIdentity, saveBotIdentity } from './createBotGateway';
import { BotGatewayConfig } from './createBotGateway';

interface CliArgs {
  config?: string;
  generateIdentity?: boolean;
  output?: string;
  help?: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--config') args.config = process.argv[++i];
    else if (arg === '--generate-identity') args.generateIdentity = true;
    else if (arg === '--output') args.output = process.argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  
  if (args.help) {
    printHelp();
    return;
  }
  
  if (args.generateIdentity) {
    const identity = await generateBotIdentity();
    const outputPath = args.output ?? 'identity.json';
    await saveBotIdentity(args.output!, {
      fingerprint: identity.fingerprint,
      signingKey: identity.signingKey,
      signingKeyPublic: identity.signingKeyPublic,
      encryptionKey: identity.encryptionKey,
      encryptionKeyPublic: identity.encryptionKeyPublic,
    });
    console.log(`Generated identity: ${identity.fingerprint}`);
    console.log(`Saved to ${outputPath}`);
    return;
  }
  
  if (!args.config) {
    console.error('Error: --config required (or use --generate-identity)');
    printHelp();
    process.exit(1);
  }
  
  await runGateway(args.config);
}

async function runGateway(configPath: string): Promise<void> {
  const fs = await import('fs/promises');
  const configData = await fs.readFile(configPath, 'utf-8');
  const config: BotGatewayConfig = JSON.parse(configData);
  
  console.log('[Nova Gateway] Starting...');
  console.log(`[Nova Gateway] Config: ${configPath}`);
  
  let identity = config.identity;
  if (!identity && config.identityPath) {
    const loaded = await loadBotIdentity(config.identityPath);
    if (!loaded) {
      console.error(`Failed to load identity from ${config.identityPath}`);
      process.exit(1);
    }
    identity = loaded;
  }
  
  if (!identity) {
    console.error('No identity provided. Use --generate-identity or provide identity in config.');
    process.exit(1);
  }
  
  const { gateway, httpApi, shutdown } = await createBotGateway({
    ...config,
    identity: identity!,
  });
  
  console.log(`[Nova Gateway] Initialized for ${gateway.getFingerprint()}`);
  if (httpApi) {
    console.log(`[Nova Gateway] HTTP API: ${httpApi.getWebhookUrl('https://your-domain.com')}`);
  }
  
  // Handle graceful shutdown
  const handleShutdown = async () => {
    console.log('[Nova Gateway] Shutting down...');
    await shutdown();
    process.exit(0);
  };
  
  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
  
  // Keep process alive
  await new Promise(() => {});
}

function printHelp(): void {
  console.log(`
Nova Gateway — Headless P2P transport for Nova bots

Usage:
  npx ts-node src/cli.ts --config gateway.json
  npx ts-node src/cli.ts --generate-identity --output identity.json

Options:
  --config <path>           Path to gateway config JSON
  --generate-identity       Generate new bot identity keypair
  --output <path>           Output path for generated identity (default: identity.json)
  --help, -h                Show this help

Config format (gateway.json):
{
  "identity": {
    "fingerprint": "nova_pk_...",
    "signingKey": "base64...",
    "signingKeyPublic": "base64...",
    "encryptionKey": "base64...",
    "encryptionKeyPublic": "base64..."
  },
  "signalingUrl": "wss://signaling.nova.messenger",
  "identityPath": "./identity.json",
  "callbacks": {
    "onIncomingMessage": "function reference not serializable - use programmatic API"
  },
  "httpApi": {
    "enabled": true,
    "port": 8080,
    "host": "0.0.0.0"
  }
}

Programmatic usage:
  import { createBotGateway, generateBotIdentity } from '@nova/gateway';
  
  const { gateway, shutdown } = await createBotGateway({
    identity: { ... },
    signalingUrl: 'wss://signaling.nova.messenger',
    httpApi: { enabled: true, port: 8080 }
  });
`);
}

main().catch((error) => {
  console.error('[Nova Gateway] Fatal error:', error);
  process.exit(1);
});