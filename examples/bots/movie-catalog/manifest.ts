/**
 * Movie Catalog Bot manifest — a free movie catalog with streaming links.
 * L1 local bot module.
 */
import type { BotManifest } from '../../../src/lib/bots/types';

export const movieCatalogBotManifest: BotManifest = {
  id: 'movie_catalog',
  name: 'Movie Catalog 🎬',
  username: 'moviecatalog_bot',
  description: 'Free movie catalog with streaming links. Search, browse genres, and watch movies online.',
  version: '1.0.0',
  commands: [
    { command: 'start', description: 'Open main menu with categories' },
    { command: 'popular', description: 'Show popular movies' },
    { command: 'genres', description: 'Browse by genre' },
    { command: 'search', description: 'Search movies by title' },
    { command: 'random', description: 'Get a random movie recommendation' },
    { command: 'help', description: 'Show help and commands' },
  ],
  requestedPermissions: ['read_messages', 'send_messages', 'inline_keyboard', 'media'],
  entryPoint: '/examples/bots/movie-catalog/index.ts',
};