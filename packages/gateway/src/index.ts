/**
 * Nova Gateway — Headless P2P transport for bots (L2/L3).
 * 
 * The gateway runs a P2PManager holding the bot's identity keypair,
 * joining the mesh as a regular E2EE participant. It forwards
 * messages between the bot runtime (via HTTP or local IPC) and the
 * P2P network.
 */

export { BotGateway, type BotGatewayOptions, type GatewayMessage, type GatewayCallbacks } from './BotGateway';
export { createBotGateway, type BotGatewayConfig } from './createBotGateway';
export { GatewayStorage } from './GatewayStorage';
export { GatewayHttpApi } from './GatewayHttpApi';