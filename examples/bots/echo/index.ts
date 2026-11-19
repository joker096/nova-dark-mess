/**
 * Echo bot — the reference L1 bot (docs/bots-roadmap.md, Phase B1).
 *
 * An L1 bot is a plain JS/TS module with a default export of `init(ctx)`.
 * It receives a permission-gated BotContext and has no network access.
 * Run it through the test fixture in src/lib/bots/runtime.test.ts or install
 * it from a manifest file at runtime (Phase B3 UI).
 */
import type { BotContext, BotModule } from '../../../src/lib/bots/runtime';
import { echoBotManifest } from './manifest';

export const manifest = echoBotManifest;

const echoBot: BotModule = {
  init(ctx: BotContext): void {
    ctx.onUpdate((update) => {
      if (update.type === 'message' && update.payload.isCommand) {
        if (update.payload.command === 'start') {
          void ctx.sendMessage(update.payload.chat.id, 'Press a button — I will echo it back.', {
            keyboard: [
              [{ text: 'Ping', callback_data: 'echo:ping' }],
              [{ text: 'Nova docs', url: 'https://mess.cvr.name/' }],
            ],
          });
        } else {
          void ctx.sendMessage(update.payload.chat.id, 'I echo messages and answer buttons. Try /start.');
        }
        return;
      }
      if (update.type === 'message') {
        void ctx.sendMessage(update.payload.chat.id, update.payload.text);
        return;
      }
      if (update.type === 'callback_query') {
        void ctx.answerCallbackQuery(update.payload.id, { text: `You pressed: ${update.payload.data}` });
        void ctx.editMessage(
          update.payload.chat.id,
          update.payload.messageId,
          `Last pressed: ${update.payload.data}`,
          { keyboard: [[{ text: 'Ping', callback_data: 'echo:ping' }]] },
        );
      }
    });
  },
};

export default echoBot;
