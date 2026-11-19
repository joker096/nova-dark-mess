/**
 * Headless bot gateway CLI entrypoint (Phase B4).
 *
 * Reads the bot identity mnemonic from NOVA_BOT_MNEMONIC (or generates one),
 * starts the gateway, and prints the bot's fingerprint and prekey bundle so
 * the owner can share it with contacts.
 *
 *   NOVA_BOT_MNEMONIC="..." npx tsx packages/bot-gateway/src/cli.ts
 */

import { createAnonymousIdentity, deriveIdentityFromMnemonic } from '../../../src/lib/crypto/identity';
import { BotGateway } from './index';

async function main() {
  const mnemonic = process.env.NOVA_BOT_MNEMONIC;
  const identity = mnemonic
    ? deriveIdentityFromMnemonic(mnemonic)
    : await createAnonymousIdentity();

  const gateway = new BotGateway({ identity });
  await gateway.initialize();
  const bundle = await gateway.getPreKeyBundle();

  process.stdout.write(JSON.stringify({
    fingerprint: gateway.fingerprint,
    bundle,
    mnemonic: identity.mnemonic,
  }));
  process.stdout.write('\n');

  // Keep the process alive so signaling/relay traffic can flow.
  process.stdin.resume();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
