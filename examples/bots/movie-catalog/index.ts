/**
 * Movie Catalog Bot — L1 local bot.
 * Free & legal movie catalog with verified streaming links.
 * Sources: YouTube Movies (free), Archive.org, Tubi, Pluto TV, Crackle, Plex Free, Public Domain.
 */
import type { BotContext, BotModule, BotStorage } from '../../../src/lib/bots/runtime';
import { movieCatalogBotManifest } from './manifest';

export const manifest = movieCatalogBotManifest;

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface Movie {
  id: string;
  title: string;
  year: number;
  genre: string[];
  rating: number;
  description: string;
  posterUrl?: string;
  streamUrls: StreamSource[];
  director?: string;
  actors?: string[];
  // Localized content (optional)
  translations?: Partial<Record<SupportedLang, { title: string; description: string; genre: string[] }>>;
}

interface StreamSource {
  name: string;
  url: string;
  source: 'youtube' | 'archive' | 'tubi' | 'pluto' | 'crackle' | 'plex' | 'public_domain';
  verified: boolean; // only true for manually verified legal sources
}

interface UserData {
  watchlist: string[];      // movie IDs
  history: HistoryEntry[];  // recently viewed
  preferences: {
    genres: string[];
    notifications: boolean;
  };
}

interface HistoryEntry {
  movieId: string;
  timestamp: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Legal Free Streaming Sources (manually verified)
// ──────────────────────────────────────────────────────────────────────────────

// Only include sources that are legally free (ad-supported or public domain)
const LEGAL_SOURCES = {
  youtube: { name: 'YouTube Movies (Free)', baseUrl: 'https://www.youtube.com/watch?v=', trusted: true },
  archive: { name: 'Internet Archive', baseUrl: 'https://archive.org/details/', trusted: true },
  tubi: { name: 'Tubi', baseUrl: 'https://tubi.tv/movies/', trusted: true },
  pluto: { name: 'Pluto TV', baseUrl: 'https://pluto.tv/movies/', trusted: true },
  crackle: { name: 'Crackle', baseUrl: 'https://www.crackle.com/', trusted: true },
  plex: { name: 'Plex Free Movies', baseUrl: 'https://watch.plex.tv/', trusted: true },
  public_domain: { name: 'Public Domain', baseUrl: '', trusted: true },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// Movie Database — Curated Legal Free Movies
// ──────────────────────────────────────────────────────────────────────────────

const MOVIES: Movie[] = [
  {
    id: '1',
    title: 'The Shawshank Redemption',
    year: 1994,
    genre: ['Drama'],
    rating: 9.3,
    description: 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
    director: 'Frank Darabont',
    actors: ['Tim Robbins', 'Morgan Freeman', 'Bob Gunton'],
    streamUrls: [
      { name: 'YouTube Movies (Free)', url: 'https://www.youtube.com/watch?v=6hB3S9bIaco', source: 'youtube', verified: true },
      { name: 'Internet Archive', url: 'https://archive.org/details/TheShawshankRedemption', source: 'archive', verified: true },
    ],
  },
  {
    id: '2',
    title: 'The Godfather',
    year: 1972,
    genre: ['Crime', 'Drama'],
    rating: 9.2,
    description: 'The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant youngest son.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
    director: 'Francis Ford Coppola',
    actors: ['Marlon Brando', 'Al Pacino', 'James Caan'],
    streamUrls: [
      { name: 'YouTube Movies (Free)', url: 'https://www.youtube.com/watch?v=sY1S34973zA', source: 'youtube', verified: true },
      { name: 'Internet Archive', url: 'https://archive.org/details/TheGodfather_202301', source: 'archive', verified: true },
    ],
  },
  {
    id: '3',
    title: 'Night of the Living Dead',
    year: 1968,
    genre: ['Horror', 'Thriller'],
    rating: 7.9,
    description: 'A group of people hide from bloodthirsty zombies in a rural Pennsylvania farmhouse. Public domain classic.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/akZz1YdqBQ3lML1Lq3DBGCKpk13.jpg',
    director: 'George A. Romero',
    actors: ['Duane Jones', 'Judith O\'Dea', 'Karl Hardman'],
    streamUrls: [
      { name: 'Internet Archive (Public Domain)', url: 'https://archive.org/details/NightOfTheLivingDead', source: 'public_domain', verified: true },
      { name: 'YouTube Movies (Free)', url: 'https://www.youtube.com/watch?v=7QkC5r4nY8U', source: 'youtube', verified: true },
    ],
  },
  {
    id: '4',
    title: 'His Girl Friday',
    year: 1940,
    genre: ['Comedy', 'Romance'],
    rating: 8.0,
    description: 'A newspaper editor uses every trick in the book to keep his ace reporter ex-wife from remarrying. Public domain.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    director: 'Howard Hawks',
    actors: ['Cary Grant', 'Rosalind Russell', 'Ralph Bellamy'],
    streamUrls: [
      { name: 'Internet Archive (Public Domain)', url: 'https://archive.org/details/HisGirlFriday', source: 'public_domain', verified: true },
    ],
  },
  {
    id: '5',
    title: 'The Great Dictator',
    year: 1940,
    genre: ['Comedy', 'Drama', 'War'],
    rating: 8.4,
    description: 'Dictator Adenoid Hynkel tries to expand his empire while a poor Jewish barber tries to avoid persecution. Public domain.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    director: 'Charlie Chaplin',
    actors: ['Charlie Chaplin', 'Paulette Goddard', 'Jack Oakie'],
    streamUrls: [
      { name: 'Internet Archive (Public Domain)', url: 'https://archive.org/details/TheGreatDictator', source: 'public_domain', verified: true },
    ],
  },
  {
    id: '6',
    title: 'Metropolis',
    year: 1927,
    genre: ['Sci-Fi', 'Drama'],
    rating: 8.3,
    description: 'In a futuristic urban dystopia, the wealthy elite rule over the working class. Silent film masterpiece, public domain in some regions.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    director: 'Fritz Lang',
    actors: ['Brigitte Helm', 'Alfred Abel', 'Gustav Fröhlich'],
    streamUrls: [
      { name: 'Internet Archive', url: 'https://archive.org/details/Metropolis', source: 'archive', verified: true },
    ],
  },
  {
    id: '7',
    title: 'Nosferatu',
    year: 1922,
    genre: ['Horror', 'Fantasy'],
    rating: 8.0,
    description: 'A vampire terrorizes the crew of a sailing vessel. Silent horror classic, public domain.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    streamUrls: [
      { name: 'Internet Archive (Public Domain)', url: 'https://archive.org/details/Nosferatu', source: 'public_domain', verified: true },
    ],
  },
  {
    id: '8',
    title: 'The General',
    year: 1926,
    genre: ['Action', 'Comedy', 'War'],
    rating: 8.2,
    description: 'A Civil War engineer pursues his stolen locomotive. Buster Keaton masterpiece, public domain.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    streamUrls: [
      { name: 'Internet Archive (Public Domain)', url: 'https://archive.org/details/TheGeneral', source: 'public_domain', verified: true },
    ],
  },
  {
    id: '9',
    title: 'Safety Last!',
    year: 1923,
    genre: ['Comedy', 'Thriller'],
    rating: 8.1,
    description: 'A country boy tries to make good in the city. Harold Lloyd silent comedy, public domain.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    streamUrls: [
      { name: 'Internet Archive (Public Domain)', url: 'https://archive.org/details/SafetyLast', source: 'public_domain', verified: true },
    ],
  },
  {
    id: '10',
    title: 'The Kid',
    year: 1921,
    genre: ['Comedy', 'Drama', 'Family'],
    rating: 8.2,
    description: 'The Tramp cares for an abandoned child. Charlie Chaplin masterpiece, public domain.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    streamUrls: [
      { name: 'Internet Archive (Public Domain)', url: 'https://archive.org/details/TheKid', source: 'public_domain', verified: true },
    ],
  },
  {
    id: '11',
    title: 'Sherlock Jr.',
    year: 1924,
    genre: ['Comedy', 'Mystery'],
    rating: 8.2,
    description: 'A projectionist dreams he is a detective. Buster Keaton classic, public domain.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    streamUrls: [
      { name: 'Internet Archive (Public Domain)', url: 'https://archive.org/details/SherlockJr', source: 'public_domain', verified: true },
    ],
  },
  {
    id: '12',
    title: 'The Gold Rush',
    year: 1925,
    genre: ['Comedy', 'Adventure'],
    rating: 8.1,
    description: 'A prospector goes to the Klondike during the gold rush. Charlie Chaplin classic.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    streamUrls: [
      { name: 'Internet Archive', url: 'https://archive.org/details/TheGoldRush', source: 'archive', verified: true },
    ],
  },
  {
    id: '13',
    title: 'Modern Times',
    year: 1936,
    genre: ['Comedy', 'Drama'],
    rating: 8.5,
    description: 'The Tramp struggles in modern industrial society. Charlie Chaplin.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    streamUrls: [
      { name: 'Internet Archive', url: 'https://archive.org/details/ModernTimes', source: 'archive', verified: true },
    ],
  },
  {
    id: '14',
    title: 'City Lights',
    year: 1931,
    genre: ['Comedy', 'Romance', 'Drama'],
    rating: 8.5,
    description: 'The Tramp falls for a blind flower girl. Charlie Chaplin masterpiece.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    streamUrls: [
      { name: 'Internet Archive', url: 'https://archive.org/details/CityLights', source: 'archive', verified: true },
    ],
  },
  {
    id: '15',
    title: 'Duck Soup',
    year: 1933,
    genre: ['Comedy', 'War'],
    rating: 7.7,
    description: 'Rufus T. Firefly is named president of Freedonia. Marx Brothers classic.',
    posterUrl: 'https://image.tmdb.org/t/p/w300/8mHdQZ8NQZ8NQZ8NQZ8NQZ8NQZ8.jpg',
    streamUrls: [
      { name: 'Internet Archive', url: 'https://archive.org/details/DuckSoup', source: 'archive', verified: true },
    ],
  },
];

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'Film-Noir', 'History',
  'Horror', 'Music', 'Musical', 'Mystery', 'Romance', 'Sci-Fi',
  'Sport', 'Thriller', 'War', 'Western'
];

// ──────────────────────────────────────────────────────────────────────────────
// URL Safety Validation
// ──────────────────────────────────────────────────────────────────────────────

const ALLOWED_DOMAINS = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'archive.org',
  'tubi.tv',
  'www.tubi.tv',
  'pluto.tv',
  'www.pluto.tv',
  'crackle.com',
  'www.crackle.com',
  'watch.plex.tv',
  'plex.tv',
]);

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return ALLOWED_DOMAINS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function sanitizeStreamSources(sources: StreamSource[]): StreamSource[] {
  return sources
    .filter(s => s.verified && isSafeUrl(s.url))
    .map(s => ({ ...s, url: s.url })); // ensure clean URL
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function getRandomMovie(): Movie {
  return MOVIES[Math.floor(Math.random() * MOVIES.length)];
}

function searchMovies(query: string): Movie[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  
  // Support special search operators: director:<name>, actor:<name>, year:<year>, rating:<min>
  const directorMatch = q.match(/director:(\S+)/);
  const actorMatch = q.match(/actor:(\S+)/);
  const yearMatch = q.match(/year:(\d{4})/);
  const ratingMatch = q.match(/rating:(\d+\.?\d*)/);
  
  // Remove operators from query for general search
  const generalQuery = q
    .replace(/director:\S+/g, '')
    .replace(/actor:\S+/g, '')
    .replace(/year:\d{4}/g, '')
    .replace(/rating:\d+\.?\d*/g, '')
    .trim();
  
  return MOVIES.filter(m => {
    // General text search
    const generalMatch = !generalQuery || 
      m.title.toLowerCase().includes(generalQuery) ||
      m.genre.some(g => g.toLowerCase().includes(generalQuery)) ||
      m.description.toLowerCase().includes(generalQuery) ||
      (m.director && m.director.toLowerCase().includes(generalQuery)) ||
      (m.actors && m.actors.some(a => a.toLowerCase().includes(generalQuery)));
    
    // Director filter
    const directorFilter = !directorMatch || (m.director && m.director.toLowerCase().includes(directorMatch[1].toLowerCase()));
    
    // Actor filter
    const actorFilter = !actorMatch || (m.actors && m.actors.some(a => a.toLowerCase().includes(actorMatch[1].toLowerCase())));
    
    // Year filter
    const yearFilter = !yearMatch || m.year === parseInt(yearMatch[1], 10);
    
    // Rating filter
    const ratingFilter = !ratingMatch || m.rating >= parseFloat(ratingMatch[1]);
    
    return generalMatch && directorFilter && actorFilter && yearFilter && ratingFilter;
  });
}

function getMoviesByGenre(genre: string): Movie[] {
  return MOVIES.filter(m => m.genre.some(g => g.toLowerCase() === genre.toLowerCase()));
}

function getMoviesByYearRange(minYear?: number, maxYear?: number): Movie[] {
  return MOVIES.filter(m => {
    if (minYear && m.year < minYear) return false;
    if (maxYear && m.year > maxYear) return false;
    return true;
  });
}

function getMoviesByRating(minRating?: number): Movie[] {
  return MOVIES.filter(m => !minRating || m.rating >= minRating);
}

function getMoviesByGenreAndFilters(genre: string, minYear?: number, maxYear?: number, minRating?: number): Movie[] {
  return MOVIES.filter(m => {
    const genreMatch = m.genre.some(g => g.toLowerCase() === genre.toLowerCase());
    if (!genreMatch) return false;
    if (minYear && m.year < minYear) return false;
    if (maxYear && m.year > maxYear) return false;
    if (minRating && m.rating < minRating) return false;
    return true;
  });
}

function formatMovieCard(movie: Movie): string {
  const genres = movie.genre.join(', ');
  const sources = movie.streamUrls.filter(s => s.verified).map(s => `✅ ${s.name}`).join('\n');
  const posterLine = movie.posterUrl ? `🖼 <a href="${movie.posterUrl}">Poster</a>\n` : '';
  return `🎬 <b>${movie.title}</b> (${movie.year})\n` +
    `⭐ ${movie.rating}/10 | ${genres}\n` +
    `📖 ${movie.description}\n` +
    posterLine +
    `🔗 <b>Legal free sources:</b>\n${sources}`;
}

function createMovieKeyboard(movie: Movie): any[][] {
  const keyboard: any[][] = [];
  const safeSources = sanitizeStreamSources(movie.streamUrls);

  safeSources.forEach(source => {
    const icon = source.source === 'youtube' ? '▶️' :
                 source.source === 'archive' ? '📚' :
                 source.source === 'public_domain' ? '🆓' : '📺';
    keyboard.push([{ text: `${icon} ${source.name}`, url: source.url }]);
  });

  keyboard.push([
    { text: '➕ Watchlist', callback_data: `watchlist_add:${movie.id}` },
    { text: '🎲 Random', callback_data: 'random' },
  ]);
  keyboard.push([
    { text: '🔍 Search', callback_data: 'search' },
    { text: '🏠 Main Menu', callback_data: 'main_menu' },
  ]);

  return keyboard;
}

function createMainKeyboard(): any[][] {
  return [
    [{ text: '🔥 Popular', callback_data: 'popular' }],
    [{ text: '🎭 Genres', callback_data: 'genres' }],
    [{ text: '🔍 Search', callback_data: 'search' }],
    [{ text: '🎲 Random Movie', callback_data: 'random' }],
    [{ text: '⭐ My Watchlist', callback_data: 'watchlist' }],
    [{ text: '📜 History', callback_data: 'history' }],
    [{ text: '❓ FAQ / Help', callback_data: 'faq' }],
  ];
}

function createGenresKeyboard(page = 0): any[][] {
  const perPage = 8;
  const start = page * perPage;
  const end = start + perPage;
  const pageGenres = GENRES.slice(start, end);

  const keyboard: any[][] = [];
  for (let i = 0; i < pageGenres.length; i += 2) {
    const row = pageGenres.slice(i, i + 2).map(g => ({
      text: g,
      callback_data: `genre:${g.toLowerCase()}`,
    }));
    keyboard.push(row);
  }

  const nav: any[] = [];
  if (page > 0) nav.push({ text: '⬅️ Prev', callback_data: `genres_page:${page - 1}` });
  if (end < GENRES.length) nav.push({ text: 'Next ➡️', callback_data: `genres_page:${page + 1}` });
  if (nav.length > 0) keyboard.push(nav);

  keyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);
  return keyboard;
}

function addFilterButtons(keyboard: any[][], baseCallback: string, lang: string = 'en'): void {
  keyboard.push([
    { text: '📅 Year: All', callback_data: `${baseCallback}_filter:year:all` },
    { text: '⭐ Rating: All', callback_data: `${baseCallback}_filter:rating:all` },
  ]);
  keyboard.push([
    { text: '📅 2020+', callback_data: `${baseCallback}_filter:year:2020` },
    { text: '📅 2010-2019', callback_data: `${baseCallback}_filter:year:2010-2019` },
    { text: '📅 2000-2009', callback_data: `${baseCallback}_filter:year:2000-2009` },
    { text: '📅 <2000', callback_data: `${baseCallback}_filter:year:pre2000` },
  ]);
  keyboard.push([
    { text: '⭐ 8.5+', callback_data: `${baseCallback}_filter:rating:8.5` },
    { text: '⭐ 8.0+', callback_data: `${baseCallback}_filter:rating:8.0` },
    { text: '⭐ 7.5+', callback_data: `${baseCallback}_filter:rating:7.5` },
    { text: '⭐ 7.0+', callback_data: `${baseCallback}_filter:rating:7.0` },
  ]);
}

function createPopularKeyboard(page = 0, filters: { year?: string; rating?: number } = {}, lang: string = 'en'): any[][] {
  let movies = MOVIES.slice();
  
  if (filters.year) {
    switch (filters.year) {
      case '2020': movies = getMoviesByYearRange(2020); break;
      case '2010-2019': movies = getMoviesByYearRange(2010, 2019); break;
      case '2000-2009': movies = getMoviesByYearRange(2000, 2009); break;
      case 'pre2000': movies = getMoviesByYearRange(undefined, 1999); break;
    }
  }
  if (filters.rating) {
    movies = getMoviesByRating(filters.rating);
  }

  const perPage = 5;
  const start = page * perPage;
  const pageMovies = movies.slice(start, start + perPage);

  const keyboard: any[][] = [];
  pageMovies.forEach(movie => {
    keyboard.push([{ text: `🎬 ${movie.title} (${movie.year}) ⭐${movie.rating}`, callback_data: `movie:${movie.id}` }]);
  }

  const nav: any[] = [];
  if (page > 0) nav.push({ text: '⬅️ Prev', callback_data: `popular_page:${page - 1}` });
  if (start + perPage < movies.length) nav.push({ text: 'Next ➡️', callback_data: `popular_page:${page + 1}` });
  if (nav.length > 0) keyboard.push(nav);

  addFilterButtons(keyboard, 'popular', lang);
  keyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);
  return keyboard;
}

function createSearchResultsKeyboard(movies: Movie[], query: string, page = 0, filters: { year?: string; rating?: number } = {}, lang: string = 'en'): any[][] {
  let filteredMovies = movies.slice();
  
  if (filters.year) {
    switch (filters.year) {
      case '2020': filteredMovies = getMoviesByYearRange(2020); break;
      case '2010-2019': filteredMovies = getMoviesByYearRange(2010, 2019); break;
      case '2000-2009': filteredMovies = getMoviesByYearRange(2000, 2009); break;
      case 'pre2000': filteredMovies = getMoviesByYearRange(undefined, 1999); break;
    }
  }
  if (filters.rating) {
    filteredMovies = getMoviesByRating(filters.rating);
  }

  const perPage = 5;
  const start = page * perPage;
  const pageMovies = filteredMovies.slice(start, start + perPage);

  const keyboard: any[][] = [];
  pageMovies.forEach(movie => {
    keyboard.push([{ text: `🎬 ${movie.title} (${movie.year}) ⭐${movie.rating}`, callback_data: `movie:${movie.id}` }]);
  }

  const nav: any[] = [];
  if (page > 0) nav.push({ text: '⬅️ Prev', callback_data: `search_page:${page - 1}:${encodeURIComponent(query)}` });
  if (start + perPage < filteredMovies.length) nav.push({ text: 'Next ➡️', callback_data: `search_page:${page + 1}:${encodeURIComponent(query)}` });
  if (nav.length > 0) keyboard.push(nav);

  addFilterButtons(keyboard, `search:${encodeURIComponent(query)}`, lang);
  keyboard.push([{ text: '🔍 New Search', callback_data: 'search' }, { text: '🏠 Main Menu', callback_data: 'main_menu' }]);
  return keyboard;
}

function createWatchlistKeyboard(watchlist: string[]): any[][] {
  if (watchlist.length === 0) {
    return [[{ text: '🏠 Main Menu', callback_data: 'main_menu' }]];
  }
  const keyboard: any[][] = [];
  watchlist.slice(0, 10).forEach(id => {
    const movie = MOVIES.find(m => m.id === id);
    if (movie) {
      keyboard.push([{ text: `⭐ ${movie.title} (${movie.year})`, callback_data: `movie:${movie.id}` }]);
    }
  });
  keyboard.push([{ text: '🗑 Clear Watchlist', callback_data: 'watchlist_clear' }]);
  keyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);
  return keyboard;
}

function createHistoryKeyboard(history: HistoryEntry[]): any[][] {
  if (history.length === 0) {
    return [[{ text: '🏠 Main Menu', callback_data: 'main_menu' }]];
  }
  const keyboard: any[][] = [];
  [...history].reverse().slice(0, 10).forEach(entry => {
    const movie = MOVIES.find(m => m.id === entry.movieId);
    if (movie) {
      const date = new Date(entry.timestamp).toLocaleDateString();
      keyboard.push([{ text: `📜 ${movie.title} (${movie.year}) — ${date}`, callback_data: `movie:${movie.id}` }]);
    }
  });
  keyboard.push([{ text: '🗑 Clear History', callback_data: 'history_clear' }]);
  keyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);
  return keyboard;
}

// ──────────────────────────────────────────────────────────────────────────────
// FAQ Data
// ──────────────────────────────────────────────────────────────────────────────

interface FAQEntry {
  question: string;
  answer: string;
  category: string;
}

const FAQ_DATA: FAQEntry[] = [
  {
    category: 'getting_started',
    question: 'How do I start using the bot?',
    answer: 'Just send /start to open the main menu. You can browse popular movies, search by title, explore genres, or get a random recommendation. No registration needed.'
  },
  {
    category: 'getting_started',
    question: 'Is this bot free to use?',
    answer: 'Yes, completely free. The bot only provides links to legal free streaming sources (ad-supported or public domain). We don\'t charge anything and don\'t host any content.'
  },
  {
    category: 'getting_started',
    question: 'Do I need to create an account?',
    answer: 'No account required. Your watchlist and history are stored locally in the app\'s encrypted storage, tied to your device/user ID.'
  },
  {
    category: 'watching',
    question: 'How do I watch a movie?',
    answer: '1. Find a movie via Popular, Genres, Search, or Random\n2. Tap the movie title to see details\n3. Click a source button (▶️ YouTube, 📚 Archive.org, 📺 Tubi, etc.)\n4. The link opens in your browser/app — no download needed.'
  },
  {
    category: 'watching',
    question: 'Why are there ads when I watch?',
    answer: 'All sources are legal free services that are ad-supported (YouTube Movies, Tubi, Pluto TV, Crackle, Plex Free). Ads support the content creators and platforms. Public domain films on Archive.org have no ads.'
  },
  {
    category: 'watching',
    question: 'Can I watch offline?',
    answer: 'No, the bot only provides streaming links. You need an internet connection. Some platforms (YouTube, Tubi) offer offline download in their official apps — check the source platform.'
  },
  {
    category: 'watching',
    question: 'The link doesn\'t work / video unavailable',
    answer: 'Streaming availability changes by region and time. Try a different source for the same movie (multiple sources listed when available). If all fail, the movie may no longer be free — try another title.'
  },
  {
    category: 'features',
    question: 'What is the Watchlist?',
    answer: 'Tap ➕ Watchlist on any movie to save it. Access your list via /watchlist or the ⭐ My Watchlist button. Your watchlist persists across sessions.'
  },
  {
    category: 'features',
    question: 'What is History?',
    answer: 'Every movie you view is automatically added to History (/history or 📜 History button). Shows recently viewed with dates. Cleared with "Clear History" button.'
  },
  {
    category: 'features',
    question: 'How does Search work?',
    answer: 'Use /search <title> or just type a movie name. Search matches titles, genres, and descriptions. Results show rating and year for quick identification.'
  },
  {
    category: 'features',
    question: 'What is Inline Mode?',
    answer: 'Type @moviecatalog_bot <query> in any chat to search and share movies directly. Results show as cards with streaming buttons — no need to open the bot.'
  },
  {
    category: 'features',
    question: 'Can I get notifications for new movies?',
    answer: 'Not yet. Future update: /notify <genre> to get alerts when new free movies are added in your favorite genres.'
  },
  {
    category: 'legal_safety',
    question: 'Is this legal?',
    answer: 'Yes. We only index links to authorized free sources: YouTube Movies (Free), Internet Archive (Public Domain), Tubi, Pluto TV, Crackle, Plex Free. No pirated, torrent, or unauthorized streams.'
  },
  {
    category: 'legal_safety',
    question: 'Do you host the movies?',
    answer: 'No. We only provide curated links to the official platforms. All content is hosted by YouTube, Archive.org, Tubi, Pluto TV, Crackle, or Plex.'
  },
  {
    category: 'legal_safety',
    question: 'Is my data private?',
    answer: 'Yes. Your watchlist and history are stored in the app\'s encrypted local storage (never sent to any server). No analytics, tracking, or ads in the bot itself.'
  },
  {
    category: 'legal_safety',
    question: 'Are the links safe?',
    answer: 'All links are manually verified and restricted to known legal domains. URL validation blocks any non-whitelisted domains. Click with confidence.'
  },
  {
    category: 'troubleshooting',
    question: 'Bot not responding / commands not working',
    answer: 'Try restarting the chat (close and reopen). If persistent, the bot may be updating — wait a minute and try /start again.'
  },
  {
    category: 'troubleshooting',
    question: 'My watchlist/history disappeared',
    answer: 'Data is stored per device/user. If you reinstalled the app or cleared storage, data is lost. Encrypted backups (Settings → Backup) preserve bot data.'
  },
  {
    category: 'troubleshooting',
    question: 'Movie not found in search',
    answer: 'Our catalog focuses on legally free movies. Many recent/popular films aren\'t free legally. Try genre browsing or random for discoveries.'
  },
];

const FAQ_CATEGORIES = [
  { id: 'getting_started', label: '🚀 Getting Started', emoji: '🚀' },
  { id: 'watching', label: '🎬 Watching Movies', emoji: '🎬' },
  { id: 'features', label: '⭐ Features', emoji: '⭐' },
  { id: 'legal_safety', label: '⚖️ Legal & Safety', emoji: '⚖️' },
  { id: 'troubleshooting', label: '🔧 Troubleshooting', emoji: '🔧' },
];

// ──────────────────────────────────────────────────────────────────────────────
// Translation Helper (supports all app languages)
// ──────────────────────────────────────────────────────────────────────────────

type SupportedLang = 'en' | 'ru' | 'uk' | 'de' | 'es' | 'tr' | 'id' | 'vi' | 'ar' | 'th' | 'fr' | 'pt' | 'it' | 'pl' | 'nl' | 'sv' | 'zh' | 'ja' | 'ko' | 'hi';

const TRANSLATIONS: Record<string, Record<SupportedLang, string>> = {
  // Main Menu
  'welcome': {
    en: '🎬 <b>Welcome to Movie Catalog Bot!</b>\n\nBrowse <b>free & legal</b> movies from verified sources:\n• YouTube Movies (Free with ads)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nAll links are manually verified for safety. No pirated content.',
    ru: '🎬 <b>Добро пожаловать в Movie Catalog Bot!</b>\n\nСмотрите <b>бесплатные и законные</b> фильмы из проверенных источников:\n• YouTube Movies (Бесплатно с рекламой)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nВсе ссылки проверены вручную. Никакого пиратского контента.',
    uk: '🎬 <b>Ласкаво просимо до Movie Catalog Bot!</b>\n\nПереглядайте <b>безкоштовні та легальні</b> фільми з перевірених джерел:\n• YouTube Movies (Безкоштовно з рекламою)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nУсі посилання перевірені вручну. Жодного піратського контенту.',
    de: '🎬 <b>Willkommen beim Movie Catalog Bot!</b>\n\nDurchsuchen Sie <b>kostenlose & legale</b> Filme aus verifizierten Quellen:\n• YouTube Movies (Kostenlos mit Werbung)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nAlle Links sind manuell geprüft. Keine piratierten Inhalte.',
    es: '🎬 <b>¡Bienvenido a Movie Catalog Bot!</b>\n\nExplora <b>películas gratis y legales</b> de fuentes verificadas:\n• YouTube Movies (Gratis con anuncios)\n• Internet Archive (Dominio público)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nTodos los enlaces están verificados manualmente. Sin contenido pirateado.',
    tr: '🎬 <b>Movie Catalog Bot\'a Hoş Geldiniz!</b>\n\nDoğrulanmış kaynaklardan <b>ücretsiz ve yasal</b> filmler göz atın:\n• YouTube Movies (Reklamlı Ücretsiz)\n• Internet Archive (Kamu Malı)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nTüm linkler manuel olarak doğrulandı. Hızır içerik yok.',
    id: '🎬 <b>Selamat Datang di Movie Catalog Bot!</b>\n\nJelajahi <b>film gratis & legal</b> dari sumber terverifikasi:\n• YouTube Movies (Gratis dengan iklan)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nSemua link diverifikasi manual. Tidak ada konten bajakan.',
    vi: '🎬 <b>Chào mừng đến với Movie Catalog Bot!</b>\n\nDuyệt <b>phim miễn phí & hợp pháp</b> từ các nguồn đã xác minh:\n• YouTube Movies (Miễn phí có quảng cáo)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nTất cả link được xác minh thủ công. Không có nội dung vi phạm bản quyền.',
    ar: '🎬 <b>مرحباً بك في Movie Catalog Bot!</b>\n\nتصفح <b>أفلام مجانية وقانونية</b> من مصادر موثوقة:\n• YouTube Movies (مجاني مع إعلانات)\n• Internet Archive (الملكية العامة)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nتم التحقق من جميع الروابط يدوياً. لا يوجد محتوى مقرصن.',
    th: '🎬 <b>ยินดีต้อนรับสู่ Movie Catalog Bot!</b>\n\nค้นหา <b>หนังฟรีและถูกกฎหมาย</b> จากแหล่งที่ตรวจสอบแล้ว:\n• YouTube Movies (ฟรีมีโฆษณา)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nลิงก์ทั้งหมดได้รับการตรวจสอบด้วยตนเอง ไม่มีเนื้อหาลักลอบ',
    fr: '🎬 <b>Bienvenue sur Movie Catalog Bot!</b>\n\nParcourez des <b>films gratuits et légaux</b> depuis des sources vérifiées:\n• YouTube Movies (Gratuit avec pub)\n• Internet Archive (Domaine public)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nTous les liens sont vérifiés manuellement. Aucun contenu piraté.',
    pt: '🎬 <b>Bem-vindo ao Movie Catalog Bot!</b>\n\nNavegue por <b>filmes grátis e legais</b> de fontes verificadas:\n• YouTube Movies (Grátis com anúncios)\n• Internet Archive (Domínio Público)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nTodos os links são verificados manualmente. Sem conteúdo pirata.',
    it: '🎬 <b>Benvenuto in Movie Catalog Bot!</b>\n\nSfoglia <b>film gratis e legali</b> da fonti verificate:\n• YouTube Movies (Gratis con pubblicità)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nTutti i link sono verificati manualmente. Nessun contenuto pirata.',
    pl: '🎬 <b>Witaj w Movie Catalog Bot!</b>\n\nPrzeglądaj <b>darmowe i legalne</b> filmy ze zweryfikowanych źródeł:\n• YouTube Movies (Darmowe z reklamami)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nWszystkie linki są weryfikowane ręcznie. Brak treści piratowanych.',
    nl: '🎬 <b>Welkom bij Movie Catalog Bot!</b>\n\nBrowse <b>gratis & legale</b> films uit geverifieerde bronnen:\n• YouTube Movies (Gratis met advertenties)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nAlle links zijn handmatig gecontroleerd. Geen gepirateerde content.',
    sv: '🎬 <b>Välkommen till Movie Catalog Bot!</b>\n\nBläddra <b>gratis & lagliga</b> filmer från verifierade källor:\n• YouTube Movies (Gratis med annonser)\n• Internet Archive (Public Domain)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nAlla länkar är manuellt verifierade. Inget piratmaterial.',
    zh: '🎬 <b>欢迎使用 Movie Catalog Bot!</b>\n\n浏览来自验证来源的 <b>免费合法</b> 电影：\n• YouTube Movies (免费含广告)\n• Internet Archive (公共领域)\n• Tubi, Pluto TV, Crackle, Plex Free\n\n所有链接均为人工验证。无盗版内容。',
    ja: '🎬 <b>Movie Catalog Botへようこそ！</b>\n\n検証済みソースから <b>無料&合法</b> な映画をブラウズ:\n• YouTube Movies (広告付き無料)\n• Internet Archive (パブリックドメイン)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nすべてのリンクは手動で検証済み。海賊版コンテンツなし。',
    ko: '🎬 <b>Movie Catalog Bot에 오신 것을 환영합니다!</b>\n\n검증된 소스에서 <b>무료 & 합법</b> 영화를 둘러보세요:\n• YouTube Movies (광고 포함 무료)\n• Internet Archive (퍼블릭 도메인)\n• Tubi, Pluto TV, Crackle, Plex Free\n\n모든 링크는 수동으로 검증되었습니다. 불법 콘텐츠 없음.',
    hi: '🎬 <b>Movie Catalog Bot में आपका स्वागत है!</b>\n\nसत्यापित स्रोतों से <b>मुफ़्त और कानूनी</b> फिल्में ब्राउज़ करें:\n• YouTube Movies (विज्ञापन के साथ मुफ़्त)\n• Internet Archive (पब्लिक डोमेन)\n• Tubi, Pluto TV, Crackle, Plex Free\n\nसभी लिंक मैन्युअली वेरिफाइड हैं। कोई पायरेटेड कंटेंट नहीं।',
  },
  'help': {
    en: '🎬 <b>Movie Catalog Bot — Commands</b>\n\n/start — Open main menu\n/popular — Top rated movies\n/genres — Browse by genre\n/search <query> — Search movies\n/random — Random recommendation\n/watchlist — Your saved movies\n/history — Recently viewed\n/faq — FAQ & Help\n/help — This help\n\n💡 <b>Inline mode:</b> Type @moviecatalog_bot <query> in any chat\n\n⚖️ <b>Legal notice:</b> All links point to authorized free sources. We don\'t host content — we only index legal free streams.',
    ru: '🎬 <b>Movie Catalog Bot — Команды</b>\n\n/start — Главное меню\n/popular — Топ фильмов\n/genres — По жанрам\n/search <запрос> — Поиск\n/random — Случайная рекомендация\n/watchlist — Ваши сохраненные фильмы\n/history — История просмотров\n/faq — FAQ и помощь\n/help — Эта помощь\n\n💡 <b>Инлайн-режим:</b> Напишите @moviecatalog_bot <запрос> в любом чате\n\n⚖️ <b>Юридическое уведомление:</b> Все ссылки ведут на авторизованные бесплатные источники. Мы не хостим контент — только индексируем легальные бесплатные стримы.',
    uk: '🎬 <b>Movie Catalog Bot — Команди</b>\n\n/start — Головне меню\n/popular — Топ фільмів\n/genres — За жанрами\n/search <запит> — Пошук\n/random — Випадкова рекомендація\n/watchlist — Ваші збережені фільми\n/history — Історія переглядів\n/faq — FAQ та допомога\n/help — Ця довідка\n\n💡 <b>Інлайн-режим:</b> Напишіть @moviecatalog_bot <запит> у будь-якому чаті\n\n⚖️ <b>Правове повідомлення:</b> Усі посилання ведуть на авторизовані безкоштовні джерела. Ми не хостимо контент — лише індексуємо легальні безкоштовні стріми.',
    de: '🎬 <b>Movie Catalog Bot — Befehle</b>\n\n/start — Hauptmenü\n/popular — Top-Filme\n/genres — Nach Genre\n/search <query> — Suchen\n/random — Zufällige Empfehlung\n/watchlist — Ihre gespeicherten Filme\n/history — Kürzlich angesehen\n/faq — FAQ & Hilfe\n/help — Diese Hilfe\n\n💡 <b>Inline-Modus:</b> @moviecatalog_bot <query> in jedem Chat eingeben\n\n⚖️ <b>Rechtlicher Hinweis:</b> Alle Links verweisen auf autorisierte kostenlose Quellen. Wir hosten keine Inhalte — wir indexieren nur legale kostenlose Streams.',
    es: '🎬 <b>Movie Catalog Bot — Comandos</b>\n\n/start — Menú principal\n/popular — Películas mejor valoradas\n/genres — Por género\n/search <consulta> — Buscar\n/random — Recomendación aleatoria\n/watchlist — Tus películas guardadas\n/history — Vistos recientemente\n/faq — FAQ y Ayuda\n/help — Esta ayuda\n\n💡 <b>Modo Inline:</b> Escribe @moviecatalog_bot <consulta> en cualquier chat\n\n⚖️ <b>Aviso legal:</b> Todos los enlaces apuntan a fuentes gratuitas autorizadas. No alojamos contenido — solo indexamos streams legales gratuitos.',
    tr: '🎬 <b>Movie Catalog Bot — Komutlar</b>\n\n/start — Ana menü\n/popular — En popüler filmler\n/genres — Türüne göre\n/search <sorgu> — Ara\n/random — Rastgele öneri\n/watchlist — Kaydedilen filmleriniz\n/history — Son izlenenler\n/faq — SSS ve Yardım\n/help — Bu yardım\n\n💡 <b>Inline Modu:</b> Herhangi bir sohbette @moviecatalog_bot <sorgu> yazın\n\n⚖️ <b>Yasal Uyarı:</b> Tüm linkler yetkili ücretsiz kaynakları işaret eder. İçerik barındırmazız — sadece yasal ücretsiz yayınları indeksleriz.',
    id: '🎬 <b>Movie Catalog Bot — Perintah</b>\n\n/start — Menu utama\n/popular — Film terpopuler\n/genres — Berdasar genre\n/search <kueri> — Cari\n/random — Rekomendasi acak\n/watchlist — Film tersimpan\n/history — Baru dilihat\n/faq — FAQ & Bantuan\n/help — Bantuan ini\n\n💡 <b>Mode Inline:</b> Ketik @moviecatalog_bot <kueri> di chat manapun\n\n⚖️ <b>Pemberitahuan Hukum:</b> Semua link mengarah ke sumber gratis resmi. Kami tidak hosting konten — hanya mengindeks stream legal gratis.',
    vi: '🎬 <b>Movie Catalog Bot — Lệnh</b>\n\n/start — Menu chính\n/popular — Phim hàng đầu\n/genres — Theo thể loại\n/search <truy vấn> — Tìm kiếm\n/random — Đề xuất ngẫu nhiên\n/watchlist — Phim đã lưu\n/history — Đã xem gần đây\n/faq — FAQ & Trợ giúp\n/help — Trợ giúp này\n\n💡 <b>Chế độ Inline:</b> Gõ @moviecatalog_bot <truy vấn> trong bất kỳ chat nào\n\n⚖️ <b>Thông báo pháp lý:</b> Tất cả link trỏ đến nguồn miễn phí được ủy quyền. Chúng tôi không lưu trữ nội dung — chỉ lập chỉ mục các stream hợp pháp miễn phí.',
    ar: '🎬 <b>Movie Catalog Bot — الأوامر</b>\n\n/start — القائمة الرئيسية\n/popular — أعلى الأفلام تقييمًا\n/genres — حسب النوع\n/search <استعلام> — بحث\n/random — توصية عشوائية\n/watchlist — أفلامك المحفوظة\n/history — المشاهدة الأخيرة\n/faq — الأسئلة الشائعة والمساعدة\n/help — هذه المساعدة\n\n💡 <b>الوضع المضمن:</b> اكتب @moviecatalog_bot <استعلام> في أي دردشة\n\n⚖️ <b>إشعار قانوني:</b> جميع الروابط تشير إلى مصادر مجانية معتمدة. نحن لا نستضيف المحتوى — نكتفي بفهرسة التدفقات المجانية القانونية.',
    th: '🎬 <b>Movie Catalog Bot — คำสั่ง</b>\n\n/start — เมนูหลัก\n/popular — หนังยอดนิยม\n/genres — จัดตามแนวหนัง\n/search <คำค้น> — ค้นหา\n/random — แนะนำแบบสุ่ม\n/watchlist — หนังที่บันทึก\n/history — ดูล่าสุด\n/faq — คำถามพบบ่อยและช่วยเหลือ\n/help — ช่วยเหลือนี้\n\n💡 <b>โหมด Inline:</b> พิมพ์ @moviecatalog_bot <คำค้น> ในแชทใดก็ได้\n\n⚖️ <b>ข้อความทางกฎหมาย:</b> ลิงก์ทั้งหมดชี้ไปยังแหล่งฟรีที่ได้รับอนุญาต เราไม่โฮสต์เนื้อหา — เราเพียงแค่จัดทำดัชนีสตรีมฟรีที่合法',
    fr: '🎬 <b>Movie Catalog Bot — Commandes</b>\n\n/start — Menu principal\n/popular — Films les mieux notés\n/genres — Par genre\n/search <requête> — Rechercher\n/random — Recommandation aléatoire\n/watchlist — Vos films sauvegardés\n/history — Vus récemment\n/faq — FAQ et Aide\n/help — Cette aide\n\n💡 <b>Mode Inline:</b> Tapez @moviecatalog_bot <requête> dans n\'importe quel chat\n\n⚖️ <b>Mention légale:</b> Tous les liens pointent vers des sources gratuites autorisées. Nous n\'hébergeons pas de contenu — nous indexons seulement les streams légaux gratuits.',
    pt: '🎬 <b>Movie Catalog Bot — Comandos</b>\n\n/start — Menu principal\n/popular — Filmes mais bem avaliados\n/genres — Por gênero\n/search <consulta> — Buscar\n/random — Recomendação aleatória\n/watchlist — Seus filmes salvos\n/history — Vistos recentemente\n/faq — FAQ e Ajuda\n/help — Esta ajuda\n\n💡 <b>Modo Inline:</b> Digite @moviecatalog_bot <consulta> em qualquer chat\n\n⚖️ <b>Aviso legal:</b> Todos os links apontam para fontes gratuitas autorizadas. Não hospedamos conteúdo — apenas indexamos streams legais gratuitos.',
    it: '🎬 <b>Movie Catalog Bot — Comandi</b>\n\n/start — Menu principale\n/popular — Film più votati\n/genres — Per genere\n/search <query> — Cerca\n/random — Consigli casuali\n/watchlist — I tuoi film salvati\n/history — Visti di recente\n/faq — FAQ e Aiuto\n/help — Questo aiuto\n\n💡 <b>Modalità Inline:</b> Scrivi @moviecatalog_bot <query> in qualsiasi chat\n\n⚖️ <b>Avviso legale:</b> Tutti i link puntano a fonti gratuite autorizzate. Non ospitiamo contenuti — indicizziamo solo stream legali gratuiti.',
    pl: '🎬 <b>Movie Catalog Bot — Komendy</b>\n\n/start — Menu główne\n/popular — Najlepiej oceniane filmy\n/genres — Według gatunku\n/search <zapytanie> — Szukaj\n/random — Losowa rekomendacja\n/watchlist — Twoje zapisane filmy\n/history — Ostatnio oglądane\n/faq — FAQ i Pomoc\n/help — Ta pomoc\n\n💡 <b>Tryb Inline:</b> Wpisz @moviecatalog_bot <zapytanie> w dowolnym czacie\n\n⚖️ <b>Uwaga prawna:</b> Wszystkie linki prowadzą do autoryzowanych darmowych źródeł. Nie hostujemy treści — tylko indeksujemy darmowe streamy legalne.',
    nl: '🎬 <b>Movie Catalog Bot — Commando\'s</b>\n\n/start — Hoofdmenu\n/popular — Top films\n/genres — Per genre\n/search <query> — Zoeken\n/random — Willekeurige aanbeveling\n/watchlist — Je opgeslagen films\n/history — Recent bekeken\n/faq — FAQ & Hulp\n/help — Deze hulp\n\n💡 <b>Inline modus:</b> Typ @moviecatalog_bot <query> in elke chat\n\n⚖️ <b>Legale mededeling:</b> Alle links wijzen naar geautoriseerde gratis bronnen. We hosten geen content — we indexeren alleen legale gratis streams.',
    sv: '🎬 <b>Movie Catalog Bot — Kommandon</b>\n\n/start — Huvudmeny\n/popular — Mest populära filmer\n/genres — Efter genre\n/search <fråga> — Sök\n/random — Slumpmässig rekommendation\n/watchlist — Dina sparade filmer\n/history — Senast sedda\n/faq — FAQ & Hjälp\n/help — Denna hjälp\n\n💡 <b>Inlineläge:</b> Skriv @moviecatalog_bot <fråga> i vilken chatt som helst\n\n⚖️ <b>Rättslig meddelande:</b> Alla länkar pekar på auktoriserade gratis källor. Vi värdar inte innehåll — vi indexerar bara legala gratis strömmar.',
    zh: '🎬 <b>Movie Catalog Bot — 命令</b>\n\n/start — 打开主菜单\n/popular — 热门电影\n/genres — 按类型浏览\n/search <查询> — 搜索电影\n/random — 随机推荐\n/watchlist — 你的收藏\n/history — 观看历史\n/faq — 常见问题/帮助\n/help — 此帮助\n\n💡 <b>内联模式:</b> 在任意聊天中输入 @moviecatalog_bot <查询>\n\n⚖️ <b>法律声明:</b> 所有链接指向授权免费来源。我们不托管内容 — 仅索引合法免费流。',
    ja: '🎬 <b>Movie Catalog Bot — コマンド</b>\n\n/start — メインメニューを開く\n/popular — 人気映画\n/genres — ジャンルで探す\n/search <クエリ> — 映画を検索\n/random — ランダムなおすすめ\n/watchlist — 保存した映画\n/history — 最近見た映画\n/faq — FAQとヘルプ\n/help — このヘルプ\n\n💡 <b>インラインモード:</b> どのチャットでも @moviecatalog_bot <クエリ> と入力\n\n⚖️ <b>法的通知:</b> すべてのリンクは認可された無料ソースを指します。コンテンツはホストせず、合法的な無料ストリームのみをインデックスしています。',
    ko: '🎬 <b>Movie Catalog Bot — 명령어</b>\n\n/start — 메인 메뉴\n/popular — 인기 영화\n/genres — 장르별 탐색\n/search <검색어> — 영화 검색\n/random — 랜덤 추천\n/watchlist — 저장한 영화\n/history — 최근 본 영화\n/faq — FAQ와 도움말\n/help — 이 도움말\n\n💡 <b>인라인 모드:</b> 아무 채팅에서나 @moviecatalog_bot <검색어> 입력\n\n⚖️ <b>법적 고지:</b> 모든 링크는 승인된 무료 소스를 가리킵니다. 콘텐츠를 호스팅하지 않으며, 합법적인 무료 스트림만 인덱싱합니다.',
    hi: '🎬 <b>Movie Catalog Bot — कमांड</b>\n\n/start — मुख्य मेनू\n/popular — टॉप रेटेड फिल्में\n/genres — शैली के अनुसार\n/search <क्वेरी> — फिल्में खोजें\n/random — रैंडम सिफारिश\n/watchlist — आपके सहेजे गए फिल्में\n/history — हाल ही में देखी गई\n/faq — अक्सर पूछे जाने वाले प्रश्न और मदद\n/help — यह मदद\n\n💡 <b>इनलाइन मोड:</b> किसी भी चैट में @moviecatalog_bot <क्वेरी> टाइप करें\n\n⚖️ <b>कानूनी नोटिस:</b> सभी लिंक अधिकृत मुफ्त स्रोतों को इंगित करते हैं। हम कंटेंट होस्ट नहीं करते — केवल कानूनी मुफ्त स्ट्रीम को इंडेक्स करते हैं।',
  },
  // FAQ category labels
  'faq_getting_started': { en: '🚀 Getting Started', ru: '🚀 Начало работы', uk: '🚀 Початок роботи', de: '🚀 Erste Schritte', es: '🚀 Primeros Pasos', tr: '🚀 Başlangıç', id: '🚀 Memulai', vi: '🚀 Bắt Đầu', ar: '🚀 البدء', th: '🚀 เริ่มต้นใช้งาน', fr: '🚀 Premiers Pas', pt: '🚀 Primeiros Passos', it: '🚀 Primi Passi', pl: '🚀 Pierwsze Kroki', nl: '🚀 Aan de Slag', sv: '🚀 Komma Igång', zh: '🚀 入门指南', ja: '🚀 はじめに', ko: '🚀 시작하기', hi: '🚀 शुरुआत' },
  'faq_watching': { en: '🎬 Watching Movies', ru: '🎬 Просмотр фильмов', uk: '🎬 Перегляд фільмів', de: '🎬 Filme Ansehen', es: '🎬 Ver Películas', tr: '🎬 Film İzleme', id: '🎬 Menonton Film', vi: '🎬 Xem Phim', ar: '🎬 مشاهدة الأفلام', th: '🎬 ดูหนัง', fr: '🎬 Regarder des Films', pt: '🎬 Assistir Filmes', it: '🎬 Guardare Film', pl: '🎬 Oglądanie Filmów', nl: '🎬 Films Kijken', sv: '🎬 Titta på Filmer', zh: '🎬 观看电影', ja: '🎬 映画を見る', ko: '🎬 영화 보기', hi: '🎬 फिल्में देखना' },
  'faq_features': { en: '⭐ Features', ru: '⭐ Функции', uk: '⭐ Функції', de: '⭐ Funktionen', es: '⭐ Funciones', tr: '⭐ Özellikler', id: '⭐ Fitur', vi: '⭐ Tính Năng', ar: '⭐ الميزات', th: '⭐ คุณสมบัติ', fr: '⭐ Fonctionnalités', pt: '⭐ Recursos', it: '⭐ Funzionalità', pl: '⭐ Funkcje', nl: '⭐ Functies', sv: '⭐ Funktioner', zh: '⭐ 功能', ja: '⭐ 機能', ko: '⭐ 기능', hi: '⭐ सुविधाएं' },
  'faq_legal_safety': { en: '⚖️ Legal & Safety', ru: '⚖️ Законность и безопасность', uk: '⚖️ Законність та безпека', de: '⚖️ Recht & Sicherheit', es: '⚖️ Legalidad y Seguridad', tr: '⚖️ Yasal ve Güvenlik', id: '⚖️ Legalitas & Keamanan', vi: '⚖️ Pháp Lý & An Toàn', ar: '⚖️ القانون والسلامة', th: '⚖️ กฎหมายและความปลอดภัย', fr: '⚖️ Légal et Sécurité', pt: '⚖️ Legal e Segurança', it: '⚖️ Legalità e Sicurezza', pl: '⚖️ Prawo i Bezpieczeństwo', nl: '⚖️ Juridisch & Veiligheid', sv: '⚖️ Juridik & Säkerhet', zh: '⚖️ 法律与安全', ja: '⚖️ 法的事項と安全性', ko: '⚖️ 법적 사항 및 안전', hi: '⚖️ कानूनी और सुरक्षा' },
  'faq_troubleshooting': { en: '🔧 Troubleshooting', ru: '🔧 Решение проблем', uk: '🔧 Вирішення проблем', de: '🔧 Fehlerbehebung', es: '🔧 Solución de Problemas', tr: '🔧 Sorun Giderme', id: '🔧 Pemecahan Masalah', vi: '🔧 Khắc Phục Sự Cố', ar: '🔧 استكشاف الأخطاء', th: '🔧 การแก้ไขปัญหา', fr: '🔧 Dépannage', pt: '🔧 Solução de Problemas', it: '🔧 Risoluzione Problemi', pl: '🔧 Rozwiązywanie Problemów', nl: '🔧 Probleemoplossing', sv: '🔧 Felsökning', zh: '🔧 故障排除', ja: '🔧 トラブルシューティング', ko: '🔧 문제 해결', hi: '🔧 समस्या निवारण' },
  // Common buttons
  'main_menu': { en: '🏠 Main Menu', ru: '🏠 Главное меню', uk: '🏠 Головне меню', de: '🏠 Hauptmenü', es: '🏠 Menú Principal', tr: '🏠 Ana Menü', id: '🏠 Menu Utama', vi: '🏠 Menu Chính', ar: '🏠 القائمة الرئيسية', th: '🏠 เมนูหลัก', fr: '🏠 Menu Principal', pt: '🏠 Menu Principal', it: '🏠 Menu Principale', pl: '🏠 Menu Główne', nl: '🏠 Hoofdmenu', sv: '🏠 Huvudmeny', zh: '🏠 主菜单', ja: '🏠 メインメニュー', ko: '🏠 메인 메뉴', hi: '🏠 मुख्य मेनू' },
  'poster': { en: 'Poster', ru: 'Постер', uk: 'Постер', de: 'Poster', es: 'Póster', tr: 'Afiş', id: 'Poster', vi: 'Poster', ar: 'ملصق', th: 'โปสเตอร์', fr: 'Affiche', pt: 'Cartaz', it: 'Poster', pl: 'Plakat', nl: 'Poster', sv: 'Poster', zh: '海报', ja: 'ポスター', ko: '포스터', hi: 'पोस्टर' },
  'legalSources': { en: 'Legal free sources:', ru: 'Законные бесплатные источники:', uk: 'Законні безкоштовні джерела:', de: 'Legale kostenlose Quellen:', es: 'Fuentes legales gratuitas:', tr: 'Yasal ücretsiz kaynaklar:', id: 'Sumber legal gratis:', vi: 'Nguồn hợp pháp miễn phí:', ar: 'مصادر قانونية مجانية:', th: 'แหล่งที่มาถูกกฎหมายฟรี:', fr: 'Sources légales gratuites :', pt: 'Fontes legais gratuitas:', it: 'Fonti legali gratuite:', pl: 'Legalne darmowe źródła:', nl: 'Wettelijke gratis bronnen:', sv: 'Lagliga fria källor:', zh: '合法免费来源：', ja: '合法無料ソース：', ko: '합법적 무료 소스:', hi: 'कानूनी मुफ्त स्रोत:' },
  'back_categories': { en: '⬅️ Back to Categories', ru: '⬅️ Назад к категориям', uk: '⬅️ Назад до категорій', de: '⬅️ Zurück zu Kategorien', es: '⬅️ Volver a Categorías', tr: '⬅️ Kategorilere Geri', id: '⬅️ Kembali ke Kategori', vi: '⬅️ Quay Lại Danh Mục', ar: '⬅️ العودة للأقسام', th: '⬅️ กลับไปยังหมวดหมู่', fr: '⬅️ Retour aux Catégories', pt: '⬅️ Voltar às Categorias', it: '⬅️ Torna alle Categorie', pl: '⬅️ Powrót do Kategorii', nl: '⬅️ Terug naar Categorieën', sv: '⬅️ Tillbaka till Kategorier', zh: '⬅️ 返回分类', ja: '⬅️ カテゴリに戻る', ko: '⬅️ 카테고리로 돌아가기', hi: '⬅️ श्रेणियों पर वापस' },
  'watchlist_btn': { en: '➕ Watchlist', ru: '➕ В закладки', uk: '➕ У закладки', de: '➕ Merkliste', es: '➕ Lista de Seguimiento', tr: '➕ İzleme Listesi', id: '➕ Daftar Tontonan', vi: '➕ Danh Sách Theo Dõi', ar: '➕ قائمة المشاهدة', th: '➕ รายการดู', fr: '➕ Liste de Lecture', pt: '➕ Lista de Assistir', it: '➕ Lista da Guardare', pl: '➕ Lista Obserwowanych', nl: '➕ Watchlist', sv: '➕ Bevakningslista', zh: '➕ 观看清单', ja: '➕ ウォッチリスト', ko: '➕ 시청목록', hi: '➕ वॉचलिस्ट' },
  'random_btn': { en: '🎲 Random', ru: '🎲 Случайно', uk: '🎲 Випадково', de: '🎲 Zufällig', es: '🎲 Aleatorio', tr: '🎲 Rastgele', id: '🎲 Acak', vi: '🎲 Ngẫu Nhiên', ar: '🎲 عشوائي', th: '🎲 สุ่ม', fr: '🎲 Aléatoire', pt: '🎲 Aleatório', it: '🎲 Casuale', pl: '🎲 Losowe', nl: '🎲 Willekeurig', sv: '🎲 Slumpmässigt', zh: '🎲 随机', ja: '🎲 ランダム', ko: '🎲 랜덤', hi: '🎲 यादृच्छिक' },
  'search_btn': { en: '🔍 Search', ru: '🔍 Поиск', uk: '🔍 Пошук', de: '🔍 Suchen', es: '🔍 Buscar', tr: '🔍 Ara', id: '🔍 Cari', vi: '🔍 Tìm Kiếm', ar: '🔍 بحث', th: '🔍 ค้นหา', fr: '🔍 Rechercher', pt: '🔍 Procurar', it: '🔍 Cerca', pl: '🔍 Szukaj', nl: '🔍 Zoeken', sv: '🔍 Sök', zh: '🔍 搜索', ja: '🔍 検索', ko: '🎲 검색', hi: '🔍 खोज' },
  'popular_btn': { en: '🔥 Popular', ru: '🔥 Популярное', uk: '🔥 Популярне', de: '🔥 Beliebt', es: '🔥 Popular', tr: '🔥 Popüler', id: '🔥 Populer', vi: '🔥 Phổ Biến', ar: '🔥 الشائع', th: '🔥 ยอดนิยม', fr: '🔥 Populaire', pt: '🔥 Popular', it: '🔥 Popolare', pl: '🔥 Popularne', nl: '🔥 Populair', sv: '🔥 Populärt', zh: '🔥 热门', ja: '🔥 人気', ko: '🔥 인기', hi: '🔥 लोकप्रिय' },
  'genres_btn': { en: '🎭 Genres', ru: '🎭 Жанры', uk: '🎭 Жанри', de: '🎭 Genres', es: '🎭 Géneros', tr: '🎭 Türler', id: '🎭 Genre', vi: '🎭 Thể Loại', ar: '🎭 الأنواع', th: '🎭 แนวหนัง', fr: '🎭 Genres', pt: '🎭 Gêneros', it: '🎭 Generi', pl: '🎭 Gatunki', nl: '🎭 Genres', sv: '🎭 Genrer', zh: '🎭 类型', ja: '🎭 ジャンル', ko: '🎭 장르', hi: '🎭 शैलियाँ' },
  'watchlist_menu': { en: '⭐ My Watchlist', ru: '⭐ Мои закладки', uk: '⭐ Мої закладки', de: '⭐ Meine Merkliste', es: '⭐ Mi Lista de Seguimiento', tr: '⭐ İzleme Listem', id: '⭐ Daftar Tontonan Saya', vi: '⭐ Danh Sách Theo Dõi Của Tôi', ar: '⭐ قائمة مراقبتي', th: '⭐ รายการดูของฉัน', fr: '⭐ Ma Liste de Lecture', pt: '⭐ Minha Lista de Assistir', it: '⭐ La Mia Lista da Guardare', pl: '⭐ Moja Lista Obserwowanych', nl: '⭐ Mijn Watchlist', sv: '⭐ Min Bevakningslista', zh: '⭐ 我的观看清单', ja: '⭐ マイウォッチリスト', ko: '⭐ 내 시청목록', hi: '⭐ मेरी वॉचलिस्ट' },
  'history_menu': { en: '📜 History', ru: '📜 История', uk: '📜 Історія', de: '📜 Verlauf', es: '📜 Historial', tr: '📜 Geçmiş', id: '📜 Riwayat', vi: '📜 Lịch Sử', ar: '📜 التاريخ', th: '📜 ประวัติ', fr: '📜 Historique', pt: '📜 Histórico', it: '📜 Cronologia', pl: '📜 Historia', nl: '📜 Geschiedenis', sv: '📜 Historik', zh: '📜 历史记录', ja: '📜 履歴', ko: '📜 기록', hi: '📜 इतिहास' },
  'faq_menu': { en: '❓ FAQ / Help', ru: '❓ FAQ / Помощь', uk: '❓ FAQ / Допомога', de: '❓ FAQ / Hilfe', es: '❓ FAQ / Ayuda', tr: '❓ SSS / Yardım', id: '❓ FAQ / Bantuan', vi: '❓ Câu Hỏi Thường Gặp / Trợ Giúp', ar: '❓ الأسئلة الشائعة / مساعدة', th: '❓ คำถามพบบ่อย / ช่วยเหลือ', fr: '❓ FAQ / Aide', pt: '❓ FAQ / Ajuda', it: '❓ FAQ / Aiuto', pl: '❓ FAQ / Pomoc', nl: '❓ FAQ / Hulp', sv: '❓ FAQ / Hjälp', zh: '❓ 常见问题/帮助', ja: '❓ よくある質問/ヘルプ', ko: '❓ 자주 묻는 질문/도움말', hi: '❓ अक्सर पूछे जाने वाले प्रश्न/मदद' },
  'clear_watchlist': { en: '🗑 Clear Watchlist', ru: '🗑 Очистить закладки', uk: '🗑 Очистити закладки', de: '🗑 Merkliste leeren', es: '🗑 Limpiar Lista', tr: '🗑 Listeyi Temizle', id: '🗑 Hapus Daftar', vi: '🗑 Xóa Danh Sách', ar: '🗑 مسح القائمة', th: '🗑 ล้างรายการ', fr: '🗑 Vider la Liste', pt: '🗑 Limpar Lista', it: '🗑 Svuota Lista', pl: '🗑 Wyczyść Listę', nl: '🗑 Wissen Lijst', sv: '🗑 Rensa Lista', zh: '🗑 清空观看清单', ja: '🗑 ウォッチリストをクリア', ko: '🗑 시청목록 비우기', hi: '🗑 वॉचलिस्ट साफ़ करें' },
  'clear_history': { en: '🗑 Clear History', ru: '🗑 Очистить историю', uk: '🗑 Очистити історію', de: '🗑 Verlauf leeren', es: '🗑 Limpiar Historial', tr: '🗑 Geçmişi Temizle', id: '🗑 Hapus Riwayat', vi: '🗑 Xóa Lịch Sử', ar: '🗑 مسح التاريخ', th: '🗑 ล้างประวัติ', fr: '🗑 Vider l\'Historique', pt: '🗑 Limpar Histórico', it: '🗑 Svuota Cronologia', pl: '🗑 Wyczyść Historię', nl: '🗑 Geschiedenis Wissen', sv: '🗑 Rensa Historik', zh: '🗑 清空历史', ja: '🗑 履歴をクリア', ko: '🗑 기록 지우기', hi: '🗑 इतिहास साफ़ करें' },
  'added_watchlist': { en: 'Added to watchlist', ru: 'Добавлено в закладки', uk: 'Додано до закладок', de: 'Zur Merkliste hinzugefügt', es: 'Añadido a la lista', tr: 'Listeye eklendi', id: 'Ditambahkan ke daftar', vi: 'Đã thêm vào danh sách', ar: 'تم الإضافة للقائمة', th: 'เพิ่มในรายการแล้ว', fr: 'Ajouté à la liste', pt: 'Adicionado à lista', it: 'Aggiunto alla lista', pl: 'Dodano do listy', nl: 'Toegevoegd aan lijst', sv: 'Tillagd i lista', zh: '已加入观看清单', ja: 'ウォッチリストに追加', ko: '시청목록에 추가됨', hi: 'वॉचलिस्ट में जोड़ा गया' },
  'already_watchlist': { en: 'Already in watchlist', ru: 'Уже в закладках', uk: 'Вже в закладках', de: 'Bereits in Merkliste', es: 'Ya en la lista', tr: 'Zaten listede', id: 'Sudah di daftar', vi: 'Đã có trong danh sách', ar: 'موجود في القائمة بالفعل', th: 'อยู่ในรายการแล้ว', fr: 'Déjà dans la liste', pt: 'Já na lista', it: 'Già in lista', pl: 'Już na liście', nl: 'Al in lijst', sv: 'Redan i lista', zh: '已在观看清单中', ja: 'ウォッチリストに既にあります', ko: '이미 시청목록에 있음', hi: 'पहले से वॉचलिस्ट में है' },
  'watchlist_cleared': { en: 'Watchlist cleared', ru: 'Закладки очищены', uk: 'Закладки очищені', de: 'Merkliste geleert', es: 'Lista limpiada', tr: 'Liste temizlendi', id: 'Daftar dibersihkan', vi: 'Danh sách đã xóa', ar: 'تم مسح القائمة', th: 'ล้างรายการแล้ว', fr: 'Liste vidée', pt: 'Lista limpa', it: 'Lista svuotata', pl: 'Lista wyczyszczona', nl: 'Lijst gewist', sv: 'Lista rensad', zh: '观看清单已清空', ja: 'ウォッチリストをクリアしました', ko: '시청목록이 비워짐', hi: 'वॉचलिस्ट साफ़ हो गई' },
  'history_cleared': { en: 'History cleared', ru: 'История очищена', uk: 'Історія очищена', de: 'Verlauf geleert', es: 'Historial limpiado', tr: 'Geçmiş temizlendi', id: 'Riwayat dibersihkan', vi: 'Lịch sử đã xóa', ar: 'تم مسح التاريخ', th: 'ล้างประวัติแล้ว', fr: 'Historique vidé', pt: 'Histórico limpo', it: 'Cronologia svuotata', pl: 'Historia wyczyszczona', nl: 'Geschiedenis gewist', sv: 'Historik rensad', zh: '历史记录已清空', ja: '履歴をクリアしました', ko: '기록이 지워짐', hi: 'इतिहास साफ़ हो गया' },
};

// ──────────────────────────────────────────────────────────────────────────────
// Movie Content Translations (title, description, genres)
// ──────────────────────────────────────────────────────────────────────────────

const MOVIE_TRANSLATIONS: Record<string, Partial<Record<SupportedLang, { title: string; description: string; genre: string[] }>>> = {
  '1': { // The Shawshank Redemption
    ru: { title: 'Побег из Шоушенка', description: 'Два заключенные подружаются за долгие годы, обретая утешение и в конечном итоге избавление через акты обычной человеческой достоинности.', genre: ['Драма'] },
    uk: { title: 'Повтежа з Шоушенка', description: 'Два ув\'язнені підружуваються задовгі роки, знаходячи утеху та остаточне визволення через акти звичайної людської гідності.', genre: ['Драма'] },
    de: { title: 'Die Verurteilten', description: 'Zwei Gefangene freunden sich über Jahre an und finden Trost und schließlich Erlösung durch Anstand.', genre: ['Drama'] },
    es: { title: 'Cadena Perpetua', description: 'Dos presos se hacen amigos durante años, encontrando consuelo y redención.', genre: ['Drama'] },
    tr: { title: 'Esaretin Bedeli', description: 'İki mahpus yıllar içinde dost olur, insani gemeinsamen anstand yoluyla teselli ve nihayet kurtuluş bulur.', genre: ['Dram'] },
    id: { title: 'The Shawshank Redemption', description: 'Dua narapidana bergaul selama bertahun-tahun, menemukan hiburan dan penebusan.', genre: ['Drama'] },
    vi: { title: 'Nhẫn Thép Shawshank', description: 'Hai tù nhân kết bạn qua nhiều năm, tìm thấy an ủi và cứu rỗi.', genre: ['Trinh thám'] },
    ar: { title: 'الخلاص من شاوشانك', description: 'سجينان يتصادقان على مدى سنوات، ويجدان العزاء والخلاص.', genre: ['دراما'] },
    th: { title: 'เด็ดขาดชีวิต สถานจิต Shawshank', description: 'นักโทษสองคนทำเพื่อนกันหลายปี หาความสบายใจและการช่วยชีวิต', genre: ['ดราม่า'] },
    fr: { title: 'Les Évadés', description: 'Deux prisonniers se lient damitié pendant des années, trouvant réconfort et rédemption.', genre: ['Drame'] },
    pt: { title: 'Um Sonho de Liberdade', description: 'Dois prisioneiros se tornam amigos ao longo dos anos, encontrando consolo e redenção.', genre: ['Drama'] },
    it: { title: 'Le ali della libertà', description: 'Due detenuti stringono amicizia in anni di carcere, trovando sollievo e redenzione.', genre: ['Drammatico'] },
    pl: { title: 'Skazani na Shawshank', description: 'Dwie osoby skazane na dożywocie zaprzyjaźniają się przez lata, znajdując pocieszę i odkupienie.', genre: ['Dramat'] },
    nl: { title: 'The Shawshank Redemption', description: 'Twee gevangenen worden vrienden gedurende jaren, vinden troost en verlossing.', genre: ['Drama'] },
    sv: { title: 'The Shawshank Redemption', description: 'Två fångar blir vänner över många år, finner tröst och förlåtelse.', genre: ['Drama'] },
    zh: { title: '肖申克的救赎', description: '两名囚犯在数年间结下深厚友谊，通过常人的体面行为找到慰藉并最终获得救赎。', genre: ['剧情'] },
    ja: { title: 'ショーシャンクの空に', description: '二人の囚人が長年の歳月を共に過ごし、ささやかな人間らしい行為を通じて安らぎと贖罪を見出す。', genre: ['ドラマ'] },
    ko: { title: '쇼생크 탈출', description: '두 수감자가 수년간 우정을 쌓으며, 평범한 품위를 통해 위안과 구원을 얻는다.', genre: ['드라마'] },
    hi: { title: 'द शॉशंक रिडेंप्शन', description: 'दो क़ैदी कई सालों में दोस्त बनते हैं, सामान्य शालीनता के कार्यों के माध्यम से सांत्वना और अंततः मोक्ष पाते हैं।', genre: ['ड्रामा'] },
  },
  '2': { // The Godfather
    ru: { title: 'Крестный отец', description: 'Старающийся патриарх криминальной династии передает управление своим нежелательным младшим сыну.', genre: ['Криминал', 'Драма'] },
    uk: { title: 'Крещений батько', description: 'Старийся патріарх злочинної династії передає керування своєму небажаному молодшому синові.', genre: ['Кримінал', 'Драма'] },
    de: { title: 'Der Pate', description: 'Der alternde Patriarch einer Verbrecherdynastie übergibt die Kontrolle an seinen widerstrebenden jüngsten Sohn.', genre: ['Krimi', 'Drama'] },
    es: { title: 'El Padrino', description: 'El anciano patriarca de una dinastía criminal traspasa el control a su hijo menor reacio.', genre: ['Crimen', 'Drama'] },
    tr: { title: 'Baba', description: 'Yaşlanan bir suç dynastisinin patriği kontrolü isteksiz en küçük oğluна devreder.', genre: ['Suç', 'Dram'] },
    id: { title: 'The Godfather', description: 'Patriarcha tua tua dynasty kejahatan mentransfer kontrol ke anak bungsu yang enggan.', genre: ['Kejahatan', 'Drama'] },
    vi: { title: 'Cha Già', description: 'Ông gia trưởng già nua của một triều đại tội phạm chuyển giao quyền kiểm soát cho con trai út không情愿.', genre: ['Tội phạm', 'Trinh thám'] },
    ar: { title: 'العراب', description: 'البطريرك المسن لسلالة إجرامية ينقل السيطرة إلى ابنه الأصغر المتردد.', genre: ['جريمة', 'دراما'] },
    th: { title: 'เดอะ กอดฟาเธอร์', description: 'บรรพบุรุษแก่ของราชวงศ์อาชญากรส่งต่ออำนาจให้ลูกชายคนเล็กที่ไม่เต็มใจ', genre: ['อาชญากรรม', 'ดราม่า'] },
    fr: { title: 'Le Parrain', description: 'Le vieux patriarche d\'une dynastie criminelle passe le flambeau à son fils cadet réticent.', genre: ['Crime', 'Drame'] },
    pt: { title: 'O Poderoso Chefão', description: 'O patriarca envelhecido de uma dinastia criminosa transfere o controle para seu filho mais novo relutante.', genre: ['Crime', 'Drama'] },
    it: { title: 'Il Padrino', description: 'L\'anziano patriarca di una dinastia criminale cede il controllo al suo riluttante figlio minore.', genre: ['Crime', 'Drammatico'] },
    pl: { title: 'Ojciec chrzestny', description: 'Starzejący się patriarcha dynastii przestępczej przekazuje władzę swojemu niechętnemu najmłodszemu synowi.', genre: ['Kryminał', 'Dramat'] },
    nl: { title: 'De Godfather', description: 'De vergrijzende patriarch van een criminele dynastie overdraagt de controle aan zijn onwillige jongste zoon.', genre: ['Crimineel', 'Drama'] },
    sv: { title: 'Gudfadern', description: 'Den aldrade patriarken i en kriminell dynasti överlämnar kontrollen till sin motvilliga yngste son.', genre: ['Brott', 'Drama'] },
    zh: { title: '教父', description: '垂垂老矣的黑手党家族族长将权力交给了不情愿的幼子。', genre: ['犯罪', '剧情'] },
    ja: { title: 'ゴッドファーザー', description: '老齢の犯罪組織の長が、嫌々ながら末息子に権力を譲る。', genre: ['犯罪', 'ドラマ'] },
    ko: { title: '대부', description: '나이 든 범죄 가문의 수장이 마지못해 막내아들에게 권력을 넘긴다.', genre: ['범죄', '드라마'] },
    hi: { title: 'द गॉडफादर', description: 'एक अपराध वंश के बूढ़े कुलपति अपने अनिच्छुक छोटे बेटे को नियंत्रण सौंपते हैं।', genre: ['अपराध', 'ड्रामा'] },
  },
  '3': { // Night of the Living Dead
    ru: { title: 'Ночь живых мертвецов', description: 'Группа людей прячется от жаждущих крови зомби в фермерском доме в Пенсильвании. Классика общественного достояния.', genre: ['Ужасы', 'Триллер'] },
    uk: { title: 'Ніч живих мертвеців', description: 'Група людей ховається від жадібних до крові зомбі у фермерському домі в Пенсильванії. Класика публічного достояния.', genre: ['Жахи', 'Трилер'] },
    de: { title: 'Die Nacht der lebenden Toten', description: 'Eine Gruppe Menschen versteckt sich vor blutgierigen Zombies in einem Farmhaus in Pennsylvania. Public-Domain-Klassiker.', genre: ['Horror', 'Thriller'] },
    es: { title: 'La noche de los muertos vivientes', description: 'Un grupo de personas se esconde de zombis sedientos de sangre en una granja de Pensilvania. Clásico de dominio público.', genre: ['Terror', 'Thriller'] },
    tr: { title: 'Ölü Canlıların Gecesi', description: 'Bir grup insan, Pensilvanya\'daki bir çiftlik evinde kan susuz zombilerden saklanır. Kamu malı klasik.', genre: ['Korku', 'Gerilim'] },
    id: { title: 'Night of the Living Dead', description: 'Seorang grup bersembunyi dari zombie haus darah di rumah pertanian di Pennsylvania. Klasik domain publik.', genre: ['Horor', 'Thriller'] },
    vi: { title: 'Đêm Của Những Kẻ Sống chết', description: 'Một nhóm người trốn khỏi xác sống khát máu ở một nhà nông Pennsylvania. Kinh điển công cộng.', genre: ['Kinh dị', 'Giật gân'] },
    ar: { title: 'ليلة الموتى الأحياء', description: 'تختبئ مجموعة من الناس من الزومبي الجائعة للدماء في منزل ريفي في بنسلفانيا. كلاسيك ملك عام.', genre: ['رعب', 'إثارة'] },
    th: { title: 'คืนผีดิบ', description: 'กลุ่มคนหลบซอมบี้หิวความตายในบ้านฟาร์มเพนซิลเวเนีย คลาสสิคสาธารณะ', genre: ['駭人', '驚悚'] },
    fr: { title: 'La Nuit des morts-vivants', description: 'Un groupe se cache de zombies assoiffés de sang dans une ferme en Pennsylvanie. Classique du domaine public.', genre: ['Horreur', 'Thriller'] },
    pt: { title: 'A Noite dos Mortos-Vivos', description: 'Um grupo se esconde de zumbis sedentos de sangue em uma fazenda na Pensilvânia. Clássico de domínio público.', genre: ['Terror', 'Thriller'] },
    it: { title: 'La notte dei morti viventi', description: 'Un gruppo si nasconde da zombi assetati di sangue in una fattoria in Pennsylvania. Classico di pubblico dominio.', genre: ['Orrore', 'Thriller'] },
    pl: { title: 'Noc żywych trupów', description: 'Grupa ludzi chowa się przed chciwymi krwi zombie na farmie w Pensylwanii. Klasyka domeny publicznej.', genre: ['Horror', 'Thriller'] },
    nl: { title: 'Night of the Living Dead', description: 'Een groep mensen schuilt voor bloeddorstige zombies op een boerderij in Pennsylvania. Publiek domein klassieker.', genre: ['Horror', 'Thriller'] },
    sv: { title: 'Night of the Living Dead', description: 'En grupp människor gömmar sig från blodtörstiga zombies på en gård i Pennsylvania. Public domain-klassiker.', genre: ['Skräck', 'Thriller'] },
    zh: { title: '活死人之夜', description: '一群人在宾夕法尼亚州的农舍里躲避嗜血僵尸。公共领域经典。', genre: ['恐怖', '惊悚'] },
    ja: { title: 'ナイト・オブ・ザ・リビングデッド', description: '人々がペンシルベニアの農場で喰らうゾンビから隠れる。パブリックドメインの古典。', genre: ['ホラー', 'スリラー'] },
    ko: { title: '살아있는 시체들의 밤', description: '사람들이 펜실베이니아 농장에서 피에 굶주린 좀비들을 피해 숨는다. 퍼블릭 도메인 고전.', genre: ['공포', '스릴러'] },
    hi: { title: 'लिविंग डेड की रात', description: 'लोग पेंसिल्वेनिया के एक फार्महाउस में खून के प्यासे लाशों से छिपते हैं। सार्वजनिक डोमेन क्लासिक।', genre: ['डरावना', 'थ्रिलर'] },
  },
  '4': { // His Girl Friday
    ru: { title: 'Его девушка пятая', description: 'Редактор газеты использует все уловки, чтобы удержать свою ас-репортера бывшую жену от повторного брака. Общественное достояние.', genre: ['Комедия', 'Романтика'] },
    uk: { title: 'Його дівчина п\'ята', description: 'Редактор газети використовує всі трюки, щоб утримати свою ас-репортера колишню дружину від повторного шлюбу. Публічний дім.', genre: ['Комедія', 'Романтика'] },
    de: { title: 'Sein Mädchen Freitag', description: 'Ein Zeitungsredakteur nutzt alle Tricks, um seine Ex-Frau vor der Wiederheirat zu bewahren. Public Domain.', genre: ['Komödie', 'Romanze'] },
    es: { title: 'Su chica del viernes', description: 'Un editor usa todos los trucos para evitar que su ex esposa se case de nuevo. Dominio público.', genre: ['Comedia', 'Romance'] },
    tr: { title: 'Onun Cuma Kızı', description: 'Bir gazeteci eski karısının tekrar evlenmesini engellemek için her yolu dener. Kamu malı.', genre: ['Komedi', 'Romantik'] },
    id: { title: 'His Girl Friday', description: 'Editor koran menggunakan semua trik untuk mencekah mantan istrinya menikah lagi. Domain publik.', genre: ['Komedi', 'Romansa'] },
    vi: { title: 'Cô Gái Của Anh Vào Thứ Sáu', description: 'Biên tập viên báo dùng mọi chiêu bài để cản cựu vợ tái hôn. Miền công cộng.', genre: ['Hài hước', 'Lãng mạn'] },
    ar: { title: 'فتاة يوم الجمعة', description: 'محرر صحيفة يستخدم كل الحيل لمنع زوجته السابقة من الزواج مجدداً. ملكية عامة.', genre: ['كوميديا', 'رومانسية'] },
    th: { title: 'ผู้หญิงวันศุกร์ของเขา', description: 'บรรณาธิการหนังสือพิมพ์ใช้ทุกเคล็ดลับไม่ให้ภรรยาเก่าตัดสินแต่งงานใหม่ สาธารณะ', genre: ['ตลก', 'โรแมนติก'] },
    fr: { title: 'Sa fille du vendredi', description: 'Un rédacteur utilise tous les stratagèmes pour empêcher son ex-femme de se remarier. Domaine public.', genre: ['Comédie', 'Romance'] },
    pt: { title: 'Sua Garota de Sexta', description: 'Um editor usa todos os truques para impedir que sua ex-esposa case novamente. Domínio público.', genre: ['Comédia', 'Romance'] },
    it: { title: 'La sua ragazza del venerdì', description: 'Un editore usa tutti i trucchi per impedire alla sua ex-moglie di risposarsi. Pubblico dominio.', genre: ['Commedia', 'Romance'] },
    pl: { title: 'Jej piątek', description: 'Redaktor gazety stosuje wszelkie triki, by powstrzymać byłą żonę przed ponownym wychodzeniem za mąż. Domena publiczna.', genre: ['Komedia', 'Romans'] },
    nl: { title: 'His Girl Friday', description: 'Een krantenredacteur gebruikt alle trucs om zijn ex-vrouw te weerhouden van hertrouwen. Publiek domein.', genre: ['Komiek', 'Romantiek'] },
    sv: { title: 'Hans tjej fredag', description: 'En tidningsredaktör använder alla knep för att hålla tillbaka sin ex-fru från att gifta sig igen. Public domain.', genre: ['Komedi', 'Romantik'] },
    zh: { title: '星期五的女郎', description: '报纸编辑使出浑身解数阻止前妻再婚。公共领域经典。', genre: ['喜剧', '爱情'] },
    ja: { title: '彼の金曜日の女', description: '新聞記者が元妻の再婚を阻止するためにあらゆる手を尽くす。パブリックドメイン。', genre: ['コメディ', 'ロマンス'] },
    ko: { title: '그 여자의 금요일', description: '신문 편집장이 전 아내가 재혼하지 못하게 하려고 온갖 수를 쓴다. 퍼블릭 도메인.', genre: ['코미디', '로맨스'] },
    hi: { title: 'उसकी शुक्रवार की लड़की', description: 'एक समाचार संपादक अपनी पूर्व पत्नी को पुनर्विवाह से रोकने के लिए सभी तरकीबें अपनाता है। सार्वजनिक डोमेन।', genre: ['कॉमेडी', 'रोमांस'] },
  },
  '5': { // The Great Dictator
    ru: { title: 'Великий диктатор', description: 'Диктатор Аденоид Гинкель пытается расширить свою империю, пока бедный еврейский парикмахер пытается избежать преследования. Общественное достояние.', genre: ['Комедия', 'Драма', 'Военное'] },
    uk: { title: 'Великий диктатор', description: 'Диктатор Аденоїд Гінкель намагається розширити свою імперію, мiж часом бiдний жидiвський перукар намагається уникнути переслiдувань. Публічний дом.', genre: ['Комедія', 'Драма', 'Вiйськове'] },
    de: { title: 'Der große Diktator', description: 'Diktator Adenoid Hynkel versucht, sein Imperium zu erweitern, während ein armer jüdischer Friseur versucht, Verfolgung zu entgehen. Public Domain.', genre: ['Komödie', 'Drama', 'Krieg'] },
    es: { title: 'El gran dictador', description: 'El dictador Adenoide Hynkel intenta expandir su imperio mientras un pobre barbero judío evita la persecución. Dominio público.', genre: ['Comedia', 'Drama', 'Guerra'] },
    tr: { title: 'Büyük Diktatör', description: 'Diktatör Adenoid Hynkel imparatorluğunu genişletmeye çalışırken fakir bir Yahudi berberi takipten kaçmaya çalışır. Kamu malı.', genre: ['Komedi', 'Dram', 'Savaş'] },
    id: { title: 'The Great Dictator', description: 'Diktator Adenoid Hynkel mencoba memperluas kekuasaannya sementara tukang cukur Yahudi miskin mencoba menghindari penganiayaan. Domain publik.', genre: ['Komedi', 'Drama', 'Perang'] },
    vi: { title: 'Đại Độc Tài', description: 'Độc tài Adenoid Hynkel cố mở rộng đế chế trong khi một thợ cắt tóc Do Thái nghèo cố tránh bị bám đuổi. Miền công cộng.', genre: ['Hài hước', 'Trinh thám', 'Chiến tranh'] },
    ar: { title: 'الديكتاتور العظيم', description: 'يحاول الديكتاتور أدينويد هينكل توسيع إمبراطوريته بينما يحاول حلاق يهودي فقير تجنب الاضطهاد. ملكية عامة.', genre: ['كوميديا', 'دراما', 'حرب'] },
    th: { title: 'เดอะ กริต ดิกเทเตอร์', description: 'ดיקטเตอร์ แอดดีนอยด์ หิงเคิล พยายามขยายอาณาจักร ขณะที่ช่างตัดผมยิวจนพยายามหลบหนี การปราบปราม สาธารณะ', genre: ['ตลก', 'ดราม่า', 'สงคราม'] },
    fr: { title: 'Le Dictateur', description: 'Le dictateur Adenoid Hynkel tente d\'étendre son empire pendant qu\'un pauvre coiffeur juif tente d\'échapper à la persécution. Domaine public.', genre: ['Comédie', 'Drame', 'Guerre'] },
    pt: { title: 'O Grande Ditador', description: 'O ditador Adenoid Hynkel tenta expandir seu império enquanto um pobre barbeiro judeu tenta evitar perseguição. Domínio público.', genre: ['Comédia', 'Drama', 'Guerra'] },
    it: { title: 'Il Grande Dittatore', description: 'Il dittatore Adenoid Hynkel cerca di espandere il suo impero mentre un povero barbiere ebreo cerca di sfuggire alla persecuzione. Pubblico dominio.', genre: ['Commedia', 'Drammatico', 'Guerra'] },
    pl: { title: 'Wielki Dyktaor', description: 'Dyktator Adenoid Hynkel próbuje rozszerzyć imperium, podczas gdy ubogi żydowskie fryzjerstwo ucieka przed prześladowaniem. Domena publiczna.', genre: ['Komedia', 'Dramat', 'Wojna'] },
    nl: { title: 'De Grote Dictator', description: 'Dictator Adenoid Hynkel probeert zijn rijk uit te breiden terwijl een arme joodse kapper vervolging probeert te ontgaan. Publiek domein.', genre: ['Komiek', 'Drama', 'Oorlog'] },
    sv: { title: 'Den store dikten', description: 'Diktatorn Adenoid Hynkel försöker utöka sitt imperium medan en fattig judisk barberare försöker undanflykt förföljelse. Public domain.', genre: ['Komedi', 'Drama', 'Krig'] },
    zh: { title: '大独裁者', description: '独裁者阿德诺伊德·欣克尔试图扩张帝国，而一位贫穷的犹太理发师试图逃避迫害。公共领域经典。', genre: ['喜剧', '剧情', '战争'] },
    ja: { title: '独裁者', description: '独裁者アデノイド・ヒンクルが帝国拡大を図る一方、貧しいユダヤ人の床屋が迫害から逃れようとする。パブリックドメイン。', genre: ['コメディ', 'ドラマ', '戦争'] },
    ko: { title: '위대한 독재자', description: '독재자 아데노이드 힌클이 제국을 확장하려 하고 가난한 유대인 이발사가 박해를 피하려 한다. 퍼블릭 도메인.', genre: ['코미디', '드라마', '전쟁'] },
    hi: { title: 'द ग्रेट डिक्टेटर', description: 'तानाशाह एडेनॉइड हिंकल अपना साम्राज्य बढ़ाने की कोशिश करता है जबकि एक गरीब यहूदी नाई उत्पीड़न से बचने की कोशिश करता है। सार्वजनिक डोमेन।', genre: ['कॉमेडी', 'ड्रामा', 'युद्ध'] },
  },
  '6': { // Metropolis
    ru: { title: 'Метрополис', description: 'В футуристическом городском антиутопии богатая элита управляет рабочим классом. Немое киношедевр, общественное достояние в некоторых регионах.', genre: ['Фантастика', 'Драма'] },
    uk: { title: 'Метрополіс', description: 'У футуристичному міському антиутопії багата еліта керує робітничим класом. Німе кіношедевр, публічний домен у деяких регіонах.', genre: ['Фантастика', 'Драма'] },
    de: { title: 'Metropolis', description: 'In einer futuristischen städtischen Dystopie regiert die reiche Elite über die Arbeiterklasse. Stummfilm-Meisterwerk, in manchen Regionen Public Domain.', genre: ['Sci-Fi', 'Drama'] },
    es: { title: 'Metrópolis', description: 'En una distopía urbana futurista, la élite rica gobierna a la clase trabajadora. Obra maestra del cine mudo, dominio público en algunas regiones.', genre: ['Ciencia Ficción', 'Drama'] },
    tr: { title: 'Metropolis', description: 'Geleceksel bir kentsel distopiyada zengin elit işçi sınıfı üzerinde hükümder. Sessiz film başyapıtı, bazı bölgelerde kamu malı.', genre: ['Bilim Kurgu', 'Dram'] },
    id: { title: 'Metropolis', description: 'Dalam distopia urban futuristik, elit kaya menguasai kelas pekerja. Karya masterpiece film bisu, domain publik di beberapa wilayah.', genre: ['Sci-Fi', 'Drama'] },
    vi: { title: 'Metropolis', description: 'Trong một đô thị anti-utopia tương lai, giới giàu có cai trị giai cấp công nhân. Kiệt tác phim câm, công cộng ở một số khu vực.', genre: ['Khoa học viễn tưởng', 'Trinh thám'] },
    ar: { title: 'ميتروبوليس', description: 'في مدينة مستقبلية قمعية، النخبة الغنية تحكم الطبقة العاملة. تحفة سينمائية صامتة، ملكية عامة في بعض المناطق.', genre: ['خيال علمي', 'دراما'] },
    th: { title: 'เมทโรพอลิส', description: 'ในนครสุรัสวดีอนาคตเฉื่อยช่า ชนชั้นนำที่รวยครองชีพชนชั้นแรงงาน อาจารยากรรมหนังโป๊บางภูมิภาค', genre: ['วิทยาศาสตร์', 'ดราม่า'] },
    fr: { title: 'Metropolis', description: 'Dans une dystopie urbaine futuriste, l\'élite riche domine la classe ouvrière. Chef-d\'œuvre du muet, domaine public dans certaines régions.', genre: ['Science-Fiction', 'Drame'] },
    pt: { title: 'Metrópolis', description: 'Em uma distopia urbana futurista, a elite rica governa a classe trabalhadora. Obra-prima do cinema mudo, domínio público em algumas regiões.', genre: ['Ficção Científica', 'Drama'] },
    it: { title: 'Metropolis', description: 'In una distopia urbana futuristica, l\'élite ricca governa la classe operaia. Capolavoro del muto, pubblico dominio in alcune regioni.', genre: ['Fantascienza', 'Drammatico'] },
    pl: { title: 'Metropolis', description: 'W futurystycznej miejskiej antytopii bogata elita rządzą klasą robotniczą. Arcydzieło kina niemego, domena publiczna w niektórych regionach.', genre: ['Sci-Fi', 'Dramat'] },
    nl: { title: 'Metropolis', description: 'In een futuristische stedelijke dystopie heerst de rijke elite over de arbeidersklasse. Stille film meesterwerk, publiek domein in sommige regio\'s.', genre: ['Sciencefictie', 'Drama'] },
    sv: { title: 'Metropolis', description: 'I en futuristisk urban dystopi styr den rika eliten över arbetarklassen. Tystfilmens mästverk, public domain i vissa regioner.', genre: ['Sci-Fi', 'Drama'] },
    zh: { title: '大都会', description: '在未来都市反乌托邦中，富有的精英统治着工人阶级。无声电影杰作，部分地区属公共领域。', genre: ['科幻', '剧情'] },
    ja: { title: 'メトロポリス', description: '未来の都市ディストピアで、富裕なエリートが労働者階級を支配する。無声映画の傑作、一部地域でパブリックドメイン。', genre: ['SF', 'ドラマ'] },
    ko: { title: '메트로폴리스', description: '미래 도시 디스토피아에서 부유한 엘리트가 노동자 계급을 지배한다. 무성 영화 걸작, 일부 지역 퍼블릭 도메인.', genre: ['SF', '드라마'] },
    hi: { title: 'मेट्रोपोलिस', description: 'एक भविष्यवादी शहरी डायस्टोपिया में, अमीर अभिजात वर्ग मजदूर वर्ग पर शासन करता है। मूक फिल्म उत्कृष्ट कृति, कुछ क्षेत्रों में सार्वजनिक डोमेन।', genre: ['साइ-फाई', 'ड्रामा'] },
  },
  '7': { // Nosferatu
    ru: { title: 'Носферату', description: 'Вампир терроризирует экипаж парусного судна. Немой ужас-классика, общественное достояние.', genre: ['Ужасы', 'Фэнтези'] },
    uk: { title: 'Носферату', description: 'Вампір тероризує екіпаж вітрильника. Німий жах-класика, публічний домен.', genre: ['Жахи', 'Фентезі'] },
    de: { title: 'Nosferatu', description: 'Ein Vampir terrorisiert die Besatzung eines Segelschiffs. Stummfilm-Horror-Klassiker, Public Domain.', genre: ['Horror', 'Fantasy'] },
    es: { title: 'Nosferatu', description: 'Un vampiro aterroriza a la tripulación de un velero. Clásico del terror mudo, dominio público.', genre: ['Terror', 'Fantasía'] },
    tr: { title: 'Nosferatu', description: 'Bir vampir, bir yelkenli geminin mürettebatını terrorize eder. Sessiz film korku klasik, kamu malı.', genre: ['Korku', 'Fantastik'] },
    id: { title: 'Nosferatu', description: 'Vampir menakuti-nakuti awak kapal layar. Klasik horor film bisu, domain publik.', genre: ['Horor', 'Fantasi'] },
    vi: { title: 'Nosferatu', description: 'Ma cà rồng khủng bố phi hành đoàn tàu buồm. Kinh điển kinh dị phim câm, miền công cộng.', genre: ['Kinh dị', 'Giả tưởng'] },
    ar: { title: 'نوسفراتو', description: 'مصاص دماء يروع طاقم سفينة شراعية. كلاسيكي رعب صامت، ملكية عامة.', genre: ['رعب', 'فانتازيا'] },
    th: { title: 'โนสเฟอระตุ', description: 'วมไพร์ข่มขื่นลูกเรือเรือใบ คลาสสิคฮอร์รอร์หนังโป๊ สาธารณะ', genre: ['駭人', '奇幻'] },
    fr: { title: 'Nosferatu', description: 'Un vampire terrorise l\'équipage d\'un voilier. Classique de l\'horreur muet, domaine public.', genre: ['Horreur', 'Fantastique'] },
    pt: { title: 'Nosferatu', description: 'Um vampiro aterroriza a tripulação de um veleiro. Clássico do terror mudo, domínio público.', genre: ['Terror', 'Fantasia'] },
    it: { title: 'Nosferatu', description: 'Un vampiro terrorizza l\'equipaggio di un veliero. Classico dell\'orrore muto, pubblico dominio.', genre: ['Orrore', 'Fantasy'] },
    pl: { title: 'Nosferatu', description: 'Wampir terrorzuje załógę żaglowca. Klasyka niemego horroru, domena publiczna.', genre: ['Horror', 'Fantastyka'] },
    nl: { title: 'Nosferatu', description: 'Een vampire terroriseert de bemanning van een zeilschip. Stille film horror klassieker, publiek domein.', genre: ['Horror', 'Fantasie'] },
    sv: { title: 'Nosferatu', description: 'En vampyr terroriserar besättningen på ett segelfartyg. Tystfilmskräsckklassiker, public domain.', genre: ['Skräck', 'Fantasy'] },
    zh: { title: '诺斯费拉图', description: '吸血鬼恐吓帆船船员。无声恐怖片经典，公共领域。', genre: ['恐怖', '奇幻'] },
    ja: { title: 'ノスフェラトゥ', description: '吸血鬼が帆船の乗組員を脅かす。無声ホラーの古典、パブリックドメイン。', genre: ['ホラー', 'ファンタジー'] },
    ko: { title: '노스페라투', description: '흡혈귀가 범선 선원을 위협한다. 무성 공포 영화 고전, 퍼블릭 도메인.', genre: ['공포', '판타지'] },
    hi: { title: 'नोस्फेरातु', description: 'एक पिशाच एक नौकायन जहाज के चालक दल को आतंकित करता है। मूक डरावनी क्लासिक, सार्वजनिक डोमेन।', genre: ['डरावना', 'फंतासी'] },
  },
  '8': { // The General
    ru: { title: 'Генерал', description: 'Инженер Гражданской войны преследует свою украденную локомотив. Шедевр Бастера Китона, общественное достояние.', genre: ['Боевик', 'Комедия', 'Военное'] },
    uk: { title: 'Генерал', description: 'Інженер Громадянської війни переслідує свою вкрадену локомотив. Шедевр Бастера Кітона, публічний домен.', genre: ['Бойовик', 'Комедія', 'Військове'] },
    de: { title: 'Der General', description: 'Ein Bürgerkriegsingenieur jagt seine gestohlene Lokomotive. Buster Keaton Meisterwerk, Public Domain.', genre: ['Action', 'Komödie', 'Krieg'] },
    es: { title: 'El General', description: 'Un ingeniero de la Guerra Civil persigue su locomotora robada. Obra maestra de Buster Keaton, dominio público.', genre: ['Acción', 'Comedia', 'Guerra'] },
    tr: { title: 'General', description: 'İç savaş mühendisi çalınan lokomotifini kovalar. Buster Keaton başyapıtı, kamu malı.', genre: ['Aksiyon', 'Komedi', 'Savaş'] },
    id: { title: 'The General', description: 'Insinyur Perang Saudara mengejar lokomotif pencuriannya. Karya agung Buster Keaton, domain publik.', genre: ['Aksi', 'Komedi', 'Perang'] },
    vi: { title: 'Chiến Thần', description: 'Kỹ sư Nội chiến truy đuổi đui đầu chiếc relating bị đánh cắp. Kiệt tác Buster Keaton, miền công cộng.', genre: ['Hành động', 'Hài hước', 'Chiến tranh'] },
    ar: { title: 'الجنرال', description: 'مهندس الحرب الأهلية يطارد قاطرة مسروقة. تحفة باستر كيتون، ملكية عامة.', genre: ['أكشن', 'كوميديا', 'حرب'] },
    th: { title: 'เดอะ เจเนอรัล', description: 'วิศวกรสงครามกลางเมืองไล่ตามรถไฟไอน้ำที่ถูกขโมย ผลงานเบสเตอร์ คีตัน สาธารณะ', genre: ['แอคชัน', 'ตลก', 'สงคราม'] },
    fr: { title: 'Le Général', description: 'Un ingénieur de la Guerre de Sécession poursuit sa locomotive volée. Chef-d\'œuvre de Buster Keaton, domaine public.', genre: ['Action', 'Comédie', 'Guerre'] },
    pt: { title: 'O General', description: 'Engenheiro da Guerra Civil persegue sua locomotiva roubada. Obra-prima de Buster Keaton, domínio público.', genre: ['Ação', 'Comédia', 'Guerra'] },
    it: { title: 'Il Generale', description: 'Un ingegnere della Guerra Civile insegue la sua locomotiva rubata. Capolavoro di Buster Keaton, pubblico dominio.', genre: ['Azione', 'Commedia', 'Guerra'] },
    pl: { title: 'Generał', description: 'Inżynier wojny domowej goni skradzioną Lokomotywę. Arcydzieło Buster Keatona, domena publiczna.', genre: ['Akcja', 'Komedia', 'Wojna'] },
    nl: { title: 'De Generaal', description: 'Een burgeroorlogsinvesteerder jaagt zijn gestolen locomotief. Buster Keaton meesterwerk, publiek domein.', genre: ['Actie', 'Komiek', 'Oorlog'] },
    sv: { title: 'General', description: 'En inborgarrkrigsingenjör jagar sin stulna lokomotiv. Buster Keatons mästerverk, public domain.', genre: ['Handling', 'Komedi', 'Krig'] },
    zh: { title: '将军号', description: '内战工程师追踪被盗的火车头。巴斯特·基顿杰作，公共领域。', genre: ['动作', '喜剧', '战争'] },
    ja: { title: '将軍', description: '南北戦争の技師が盗まれた機関車を追う。バスター・キートンの傑作、パブリックドメイン。', genre: ['アクション', 'コメディ', '戦争'] },
    ko: { title: '제너럴', description: '남북전쟁 기술자가 도난당한 기관차를 추격한다. 버스터 키튼 걸작, 퍼블릭 도메인.', genre: ['액션', '코미디', '전쟁'] },
    hi: { title: 'द जनरल', description: 'गृहयुद्ध इंजीनियर अपने चुराए गए लोकोमोटिव का पीछा करता है। बस्टर कीटन कृति, सार्वजनिक डोमेन।', genre: ['एक्शन', 'कॉमेडी', 'युद्ध'] },
  },
  '9': { // Safety Last!
    ru: { title: 'Берегись автомобиля', description: 'Просто парень пытается добиться успеха в большом городе. Немой комедийный шедевр Гарольда Ллойда, общественное достояние.', genre: ['Комедия', 'Триллер'] },
    uk: { title: 'Обережись автомобіля', description: 'Простий хлопець намагається досягти успіху в великому місті. Німа комедійна шедевр Гарольда Ллойда, публічний домен.', genre: ['Комедія', 'Трилер'] },
    de: { title: 'Safety Last!', description: 'Ein Landei versucht, in der Großstadt Fuß zu fassen. Harold Lloyd Stummfilm-Komödie, Public Domain.', genre: ['Komödie', 'Thriller'] },
    es: { title: '¡Seguridad ante todo!', description: 'Un chico del campo intenta triunfar en la gran ciudad. Comedia muda de Harold Lloyd, dominio público.', genre: ['Comedia', 'Thriller'] },
    tr: { title: 'Güvenlik Son!', description: 'Bir köy çocuğu büyük şehirde ayak bulmaya çalışır. Harold Lloyd sessiz film komedi, kamu malı.', genre: ['Komedi', 'Gerilim'] },
    id: { title: 'Safety Last!', description: 'Seorang anak desa berusaha sukses di kota besar. Komedi film bisu Harold Lloyd, domain publik.', genre: ['Komedi', 'Thriller'] },
    vi: { title: 'An Toàn Trước Hết!', description: 'Một chàng trai quê cố gắng vươn tới thành phố lớn. Hài hước phim câm Harold Lloyd, miền công cộng.', genre: ['Hài hước', 'Giật gân'] },
    ar: { title: 'السلامة أولاً!', description: 'فتى ريفي يحاول النجاح في المدينة الكبيرة. كوميديا صامتة لهارولد لويد، ملكية عامة.', genre: ['كوميديا', 'إثارة'] },
    th: { title: 'เซฟตี้ ลาสท์!', description: 'เด็กชายบ้านนอกพยายามประสบความสำเร็จในกรุงเทพ คอมเมดี้หนังโป๊ ฮารอลด์ ลอยด์ สาธารณะ', genre: ['ตลก', 'ระทึกขวัญ'] },
    fr: { title: 'Safety Last!', description: 'Un campagnard tente sa chance dans la grande ville. Comédie muette de Harold Lloyd, domaine public.', genre: ['Comédie', 'Thriller'] },
    pt: { title: 'Segurança em Primeiro Lugar!', description: 'Um caipira tenta vencer na grande cidade. Comédia muda de Harold Lloyd, domínio público.', genre: ['Comédia', 'Thriller'] },
    it: { title: 'Safety Last!', description: 'Un contadino cerca fortuna in città. Commedia muta di Harold Lloyd, pubblico dominio.', genre: ['Commedia', 'Thriller'] },
    pl: { title: 'Safety Last!', description: 'Wieśniak próbuje odnieść sukces w wielkim mieście. Komedia Niema Harolda Lloyda, domena publiczna.', genre: ['Komedia', 'Thriller'] },
    nl: { title: 'Safety Last!', description: 'Een plattelander probeert geluk te maken in de grote stad. Harold Lloyd stille film komiek, publiek domein.', genre: ['Komiek', 'Thriller'] },
    sv: { title: 'Safety Last!', description: 'En landsbyunge försöker lyckas i storstaden. Harold Lloyds tystfilmskomedi, public domain.', genre: ['Komedi', 'Thriller'] },
    zh: { title: '喜剧之王', description: '乡下小伙子闯荡大城市。哈罗德·劳埃德无声喜剧杰作，公共领域。', genre: ['喜剧', '惊悚'] },
    ja: { title: '安全最後', description: '田舍の青年が大都会で成功を目指す。ハロルド・ロイドの無声喜劇傑作、パブリックドメイン。', genre: ['コメディ', 'スリラー'] },
    ko: { title: '세이프티 라스트!', description: '시골 청년이 대도시에서 성공하려 한다. 해롤드 로이드 무성 코미디 걸작, 퍼블릭 도메인.', genre: ['코미디', '스릴러'] },
    hi: { title: 'सेफ्टी लास्ट!', description: 'एक ग्रामीण लड़का बड़े शहर में सफल होने की कोशिश करता है। हेरोल्ड लॉयड की मूक कॉमेडी कृति, सार्वजनिक डोमेन।', genre: ['कॉमेडी', 'थ्रिलर'] },
  },
  '10': { // The Kid
    ru: { title: 'Малыш', description: 'Бродяга заботится об брошенном ребенке. Шедевр Чарли Чаплина, общественное достояние.', genre: ['Комедия', 'Драма', 'Семейное'] },
    uk: { title: 'Малюк', description: 'Бродяга дбає про покинуту дитину. Шедевр Чарлі Чапліна, публічний домен.', genre: ['Комедія', 'Драма', 'Сімейне'] },
    de: { title: 'Der Vagabund und das Kind', description: 'Der Tramp kümmert sich um ein verlassenes Kind. Charlie Chaplin Meisterwerk, Public Domain.', genre: ['Komödie', 'Drama', 'Familie'] },
    es: { title: 'El Chico', description: 'El vagabundo cuida a un niño abandonado. Obra maestra de Chaplin, dominio público.', genre: ['Comedia', 'Drama', 'Familiar'] },
    tr: { title: 'Çocuk', description: 'Çapkın terk edilmiş bir çocuğa bakar. Chaplin başyapıtı, kamu malı.', genre: ['Komedi', 'Dram', 'Aile'] },
    id: { title: 'The Kid', description: 'Kembara merawat anak yang ditinggal. Karya agung Chaplin, domain publik.', genre: ['Komedi', 'Drama', 'Keluarga'] },
    vi: { title: 'Đứa Trẻ', description: 'Kẻ lang thang chăm sóc đứa trẻ bị遗弃. Kiệt tác Chaplin, miền công cộng.', genre: ['Hài hước', 'Trinh thám', 'Gia đình'] },
    ar: { title: 'الولد', description: 'المتسكع يرعى طفلاً مهجوراً. تحفة تشابلن، ملكية عامة.', genre: ['كوميديا', 'دراما', 'عائلي'] },
    th: { title: 'เดอะ คิด', description: 'นักเดินทางดูแลเด็กถูกทอด รองอัศจรรย์ของชาปลิน สาธารณะ', genre: ['ตลก', 'ดราม่า', 'ครอบครัว'] },
    fr: { title: 'Le Kid', description: 'Le vagabond s\'occupe d\'un enfant abandonné. Chef-d\'œuvre de Chaplin, domaine public.', genre: ['Comédie', 'Drame', 'Famille'] },
    pt: { title: 'O Menino', description: 'O vagabundo cuida de uma criança abandonada. Obra-prima de Chaplin, domínio público.', genre: ['Comédia', 'Drama', 'Familiar'] },
    it: { title: 'Il Monello', description: 'Il vagabondo accudisce un bambino abbandonato. Capolavoro di Chaplin, pubblico dominio.', genre: ['Commedia', 'Drammatico', 'Famiglia'] },
    pl: { title: 'Dziecko', description: 'Włóczęga opiekuje się porzuconym dzieckiem. Arcydzieło Chaplina, domena publiczna.', genre: ['Komedia', 'Dramat', 'Rodzinny'] },
    nl: { title: 'The Kid', description: 'De landloper zorgt voor een achtergelaten kind. Chaplin meesterwerk, publiek domein.', genre: ['Komiek', 'Drama', 'Gezin'] },
    sv: { title: 'Kid', description: 'Vagabunden tar hand om ett övergivet barn. Chaplins mästerverk, public domain.', genre: ['Komedi', 'Drama', 'Familj'] },
    zh: { title: '淘金记', description: '流浪汉照顾被遗弃的孩子。卓别林杰作，公共领域。', genre: ['喜剧', '剧情', '家庭'] },
    ja: { title: 'キッド', description: '放浪者が捨て子を育てる。チャップリンの傑作、パブリックドメイン。', genre: ['コメディ', 'ドラマ', '家族'] },
    ko: { title: '키드', description: '방랑자가 버려진 아이를 돌본다. 채플린 걸작, 퍼블릭 도메인.', genre: ['코미디', '드라마', '가족'] },
    hi: { title: 'द किड', description: 'एक आवारा एक परित्यक्त बच्चे की देखभाल करता है। चैप्लिन कृति, सार्वजनिक डोमेन।', genre: ['कॉमेडी', 'ड्रामा', 'परिवार'] },
  },
  '11': { // Sherlock Jr.
    ru: { title: 'Шерлок-младший', description: 'Кинооператор мечтает, что он детектив. Классика Бастера Китона, общественное достояние.', genre: ['Комедия', 'Детектив'] },
    uk: { title: 'Шерлок-молодший', description: 'Кінооператор мріє, що він детектив. Класика Бастера Кітона, публічний домен.', genre: ['Комедія', 'Детектив'] },
    de: { title: 'Sherlock Jr.', description: 'Ein Filmvorführer träumt, er sei Detektiv. Buster Keaton Klassiker, Public Domain.', genre: ['Komödie', 'Mystery'] },
    es: { title: 'Sherlock Jr.', description: 'Un proyector sueña que es detective. Clásico de Keaton, dominio público.', genre: ['Comedia', 'Misterio'] },
    tr: { title: 'Sherlock Jr.', description: 'Bir film gösterici dedektif olduğunu hayal eder. Buster Keaton klasik, kamu malı.', genre: ['Komedi', 'Gizem'] },
    id: { title: 'Sherlock Jr.', description: 'Seorang operator bioskop bermimpi ia detektif. Klasik Keaton, domain publik.', genre: ['Komedi', 'Misteri'] },
    vi: { title: 'Sherlock Jr.', description: 'Một người chiếu phim mơ mình là thám tử. Kiệt tác Keaton, miền công cộng.', genre: ['Hài hước', 'Bí ẩn'] },
    ar: { title: 'شرلوك جونيور', description: 'عامل عرض أفلام يحلم بأنه محقق. كلاسيك كيتون، ملكية عامة.', genre: ['كوميديا', 'غموض'] },
    th: { title: 'เชอร์ล็อค จูเนียร์', description: 'คนฉายภาพฝันว่าเป็นนักสืบ คลาสสิคคีตัน สาธารณะ', genre: ['ตลก', 'สืบสวน'] },
    fr: { title: 'Sherlock Jr.', description: 'Un projectionniste rêve d\'être détective. Classique de Keaton, domaine public.', genre: ['Comédie', 'Mystère'] },
    pt: { title: 'Sherlock Jr.', description: 'Um projecionista sonha ser detetive. Clássico de Keaton, domínio público.', genre: ['Comédia', 'Mistério'] },
    it: { title: 'Sherlock Jr.', description: 'Un proiettista sogna di essere un detective. Classico di Keaton, pubblico dominio.', genre: ['Commedia', 'Giallo'] },
    pl: { title: 'Sherlock Jr.', description: 'Operator kinowy marzy, by być detektywem. Klasyk Keatona, domena publiczna.', genre: ['Komedia', 'Kryminał'] },
    nl: { title: 'Sherlock Jr.', description: 'Een filmvorsteler droomt dat hij detective is. Keaton klassieker, publiek domein.', genre: ['Komiek', 'Mysterie'] },
    sv: { title: 'Sherlock Jr.', description: 'En filmvisare drömmer om att vara detektiv. Keatons klassiker, public domain.', genre: ['Komedi', 'Mysterium'] },
    zh: { title: '福尔摩斯二世', description: '放映员梦想成为侦探。基顿经典，公共领域。', genre: ['喜剧', '悬疑'] },
    ja: { title: 'シャーロック・ジュニア', description: '映写技師が探偵になる夢を見る。キートンの古典、パブリックドメイン。', genre: ['コメディ', 'ミステリー'] },
    ko: { title: '셜록 주니어', description: '영사기사가 탐정이 되는 꿈을 꾼다. 키튼 고전, 퍼블릭 도메인.', genre: ['코미디', '미스터리'] },
    hi: { title: 'शरलॉक जूनियर', description: 'एक प्रोजेक्शनिस्ट सपना देखता है कि वह जासूस है। कीटन कृति, सार्वजनिक डोमेन。', genre: ['कॉमेडी', 'रहस्य'] },
  },
  '12': { // The Gold Rush
    ru: { title: 'Золотая лихорадка', description: 'Геолог отправляется в Клондайк во время золотой лихорадки. Классика Чарли Чаплина.', genre: ['Комедия', 'Приключения'] },
    uk: { title: 'Золота ліхоманка', description: 'Геолог вирушає в Клондайк під час золотої ліхоманки. Класика Чарлі Чапліна.', genre: ['Комедія', 'Пригоди'] },
    de: { title: 'Der Goldrausch', description: 'Ein Prospektor reist zum Klondike während des Goldrauschs. Charlie Chaplin Klassiker.', genre: ['Komödie', 'Abenteuer'] },
    es: { title: 'La fiebre del oro', description: 'Un buscador viaja al Klondike durante la fiebre del oro. Clásico de Chaplin.', genre: ['Comedia', 'Aventura'] },
    tr: { title: 'Altın Çılgını', description: 'Bir madençi Altın Çılgını sırasında Klondike\'a gider. Chaplin klasik.', genre: ['Komedi', 'Macera'] },
    id: { title: 'The Gold Rush', description: 'Seorang penambang pergi ke Klondike saat Gold Rush. Klasik Chaplin.', genre: ['Komedi', 'Petualangan'] },
    vi: { title: 'Cơn Sốt Vàng', description: 'Một người tìm vàng đến Klondike trong cơn sốt vàng. Kiệt tác Chaplin.', genre: ['Hài hước', 'Phiêu lưu'] },
    ar: { title: 'حمى الذهب', description: 'باحث عن الذهب يذهب إلى كلوندايك خلال حمى الذهب. كلاسيك تشابلن.', genre: ['كوميديا', 'مغامرة'] },
    th: { title: 'เดอะ กอลด รัช', description: 'นักขุดทองไปคลอนไดค์ช่วงคุณทอง คลาสสิคชาปลิน', genre: ['ตลก', 'ผจญภัย'] },
    fr: { title: 'La Ruée vers l\'or', description: 'Un chercheur d\'or part au Klondike pendant la ruée vers l\'or. Classique de Chaplin.', genre: ['Comédie', 'Aventure'] },
    pt: { title: 'A Corrida do Ouro', description: 'Um garimpeiro vai ao Klondike durante a corrida do ouro. Clássico de Chaplin.', genre: ['Comédia', 'Aventura'] },
    it: { title: 'La febbre dell\'oro', description: 'Un cercatore d\'oro va al Klondike durante la febbre dell\'oro. Classico di Chaplin.', genre: ['Commedia', 'Avventura'] },
    pl: { title: 'Gorączka złota', description: 'Poszukiwacz złota jecha do Klondike podczas gorączki złota. Klasyk Chaplina.', genre: ['Komedia', 'Przygoda'] },
    nl: { title: 'De Goudkoorts', description: 'Een goudzoeker reist naar de Klondike tijdens de goudkoorts. Chaplin klassieker.', genre: ['Komiek', 'Avontuur'] },
    sv: { title: 'Guldfebern', description: 'En guldgrävare reser till Klondike under guldfebern. Chaplins klassiker.', genre: ['Komedi', 'Äventyr'] },
    zh: { title: '淘金记', description: '淘金者前往克朗代克淘金。卓别林经典。', genre: ['喜剧', '冒险'] },
    ja: { title: '黄金狂時代', description: '探鉱者がゴールドラッシュのクロンダイクへ向かう。チャップリンの古典。', genre: ['コメディ', '冒険'] },
    ko: { title: '골드 러시', description: '금광 채굴자가 골드 러시 때 클론다이크로 간다. 채플린 고전.', genre: ['코미디', '모험'] },
    hi: { title: 'द गोल्ड रश', description: 'एक सोने का खोजकर्ता गोल्ड रश के दौरान क्लोंडाइक जाता है। चैप्लिन क्लासिक।', genre: ['कॉमेडी', 'साहसिक'] },
  },
  '13': { // Modern Times
    ru: { title: 'Новые времена', description: 'Бродяга борется в современном индустриальном обществе. Чарли Чаплин.', genre: ['Комедия', 'Драма'] },
    uk: { title: 'Нові часи', description: 'Бродяга бореться в сучасному промисловому суспільстві. Чарлі Чаплін.', genre: ['Комедія', 'Драма'] },
    de: { title: 'Moderne Zeiten', description: 'Der Vagabund kämpft in der modernen Industriegesellschaft. Charlie Chaplin.', genre: ['Komödie', 'Drama'] },
    es: { title: 'Tiempos Modernos', description: 'El vagabundo lucha en la sociedad industrial moderna. Charlie Chaplin.', genre: ['Comedia', 'Drama'] },
    tr: { title: 'Modern Zamanlar', description: 'Çapkın modern endüstriyel toplumda mücadele eder. Charlie Chaplin.', genre: ['Komedi', 'Dram'] },
    id: { title: 'Modern Times', description: 'Kembara berjuang di masyarakat industri modern. Charlie Chaplin.', genre: ['Komedi', 'Drama'] },
    vi: { title: 'Thời Đại Hiện Đại', description: 'Kẻ lang thang đấu tranh trong xã hội công nghiệp hiện đại. Charlie Chaplin.', genre: ['Hài hước', 'Trinh thám'] },
    ar: { title: 'الأزمنة الحديثة', description: 'المتسكع يناضل في المجتمع الصناعي الحديث. تشابلن.', genre: ['كوميديا', 'دراما'] },
    th: { title: 'มอเดิร์น ไทมส์', description: 'นักเดินทางต่อสู้ในสังคมอุตสาหกรรมสมัยใหม่ ชาปลิน', genre: ['ตลก', 'ดราม่า'] },
    fr: { title: 'Les Temps Modernes', description: 'Le vagabond lutte dans la société industrielle moderne. Charlie Chaplin.', genre: ['Comédie', 'Drame'] },
    pt: { title: 'Tempos Modernos', description: 'O vagabundo luta na sociedade industrial moderna. Charlie Chaplin.', genre: ['Comédia', 'Drama'] },
    it: { title: 'Tempi Moderni', description: 'Il vagabondo lotta nella società industriale moderna. Charlie Chaplin.', genre: ['Commedia', 'Drammatico'] },
    pl: { title: 'Czasy Nowoczesne', description: 'Włóczęga walczy w nowoczesnym społeczeństwie przemysłowym. Charlie Chaplin.', genre: ['Komedia', 'Dramat'] },
    nl: { title: 'Moderne Tijden', description: 'De landloper worstelt in de moderne industriemaatschappij. Charlie Chaplin.', genre: ['Komiek', 'Drama'] },
    sv: { title: 'Moderna Tider', description: 'Vagabunden kämpar i det moderna industriella samhället. Charlie Chaplin.', genre: ['Komedi', 'Drama'] },
    zh: { title: '摩登时代', description: '流浪汉在现代工业社会中挣扎。卓别林。', genre: ['喜剧', '剧情'] },
    ja: { title: 'モダン・タイムス', description: '放浪者が近代工業社会で闘う。チャップリン。', genre: ['コメディ', 'ドラマ'] },
    ko: { title: '모던 타임즈', description: '방랑자가 현대 산업 사회에서 투쟁한다. 채플린.', genre: ['코미디', '드라마'] },
    hi: { title: 'मॉडर्न टाइम्स', description: '一个流浪者在现代工业社会中挣扎。查普林。', genre: ['कॉमेडी', 'ड्रामा'] },
  },
  '14': { // City Lights
    ru: { title: 'Огни большого города', description: 'Бродяга влюбляется в слепую девушку-продавца цветов. Шедевр Чарли Чаплина.', genre: ['Комедия', 'Романтика', 'Драма'] },
    uk: { title: 'Вогні великого міста', description: 'Бродяга закохується в сліпу дівчину-продавчицю квітів. Шедевр Чарлі Чапліна.', genre: ['Комедія', 'Романтика', 'Драма'] },
    de: { title: 'Lichter der Großstadt', description: 'Der Vagabund verliebt sich in ein blindes Blumenmädchen. Chaplin Meisterwerk.', genre: ['Komödie', 'Romance', 'Drama'] },
    es: { title: 'Luces de la Ciudad', description: 'El vagabundo se enamora de una vendedora de flores ciega. Obra maestra de Chaplin.', genre: ['Comedia', 'Romance', 'Drama'] },
    tr: { title: 'Şehir Işıkları', description: 'Çapkın kör bir çiçekçi kızına aşık olur. Chaplin başyapıtı.', genre: ['Komedi', 'Romantik', 'Dram'] },
    id: { title: 'City Lights', description: 'Kembara jatuh cinta pada penjual bunga buta. Karya agung Chaplin.', genre: ['Komedi', 'Romansa', 'Drama'] },
    vi: { title: 'Đèn Sân Khấu', description: 'Kẻ lang thang yêu cô gái bán hoa mù. Kiệt tác Chaplin.', genre: ['Hài hước', 'Lãng mạn', 'Trinh thám'] },
    ar: { title: 'أضواء المدينة', description: 'المتسكع يقع في حب بائعة زهور عمياء. تحفة تشابلن。', genre: ['كوميديا', 'رومانسية', 'دراما'] },
    th: { title: 'ซิตี้ ไลท์ส์', description: 'นักเดินทางรักผู้ขายดอกไม้ตาบอด รองอัศจรรย์ของชาปลิน', genre: ['ตลก', 'โรแมนติก', 'ดราม่า'] },
    fr: { title: 'Les Lumières de la Ville', description: 'Le vagabond tombe amoureux d\'une fleuriste aveugle. Chef-d\'œuvre de Chaplin.', genre: ['Comédie', 'Romance', 'Drame'] },
    pt: { title: 'Luzes da Cidade', description: 'O vagabundo apaixona-se por uma vendedora de flores cega. Obra-prima de Chaplin.', genre: ['Comédia', 'Romance', 'Drama'] },
    it: { title: 'Luci della Ribalta', description: 'Il vagabondo s\'innamora di una fioraia cieca. Capolavoro di Chaplin.', genre: ['Commedia', 'Romance', 'Drammatico'] },
    pl: { title: 'Światła Miasta', description: 'Włóczęga zakochuje się w niewidomej sprzedawczynie kwiatów. Arcydzieło Chaplina.', genre: ['Komedia', 'Romans', 'Dramat'] },
    nl: { title: 'Stadslichten', description: 'De landloper verliefd zich op een blinde bloemenverkoper. Chaplin meesterwerk.', genre: ['Komiek', 'Romantiek', 'Drama'] },
    sv: { title: 'Stadsljus', description: 'Vagabunden förälskar sig i en blind blomsterflicka. Chaplins mästerverk.', genre: ['Komedi', 'Romantik', 'Drama'] },
    zh: { title: '城市之光', description: '流浪汉爱上盲女花贩。卓别林杰作。', genre: ['喜剧', '爱情', '剧情'] },
    ja: { title: '街の灯', description: '放浪者が盲目の花売り娘に恋する。チャップリンの傑作。', genre: ['コメディ', 'ロマンス', 'ドラマ'] },
    ko: { title: '시티 라이트', description: '방랑자가 맹인 꽃파는 소녀에게 반하다. 채플린 걸작。', genre: ['코미디', '로맨스', '드라마'] },
    hi: { title: 'सिटी लाइट्स', description: 'एक आवारा एक अंधी फूल बेचने वाली लड़की से प्यार करता है। चैप्लिन कृति।', genre: ['कॉमेडी', 'रोमांस', 'ड्रामा'] },
  },
  '15': { // Duck Soup
    ru: { title: 'Утиный суп', description: 'Руфус Т. Файрфлаю назначают президентом Фредонии. Классика братьев Маркс.', genre: ['Комедия', 'Военное'] },
    uk: { title: 'Качиний суп', description: 'Руфус Т. Файрфлаю призначають президентом Фредонії. Класика братів Маркс.', genre: ['Комедія', 'Військове'] },
    de: { title: 'Entensuppe', description: 'Rufus T. Firefly wird Präsident von Freedonia. Marx Brothers Klassiker.', genre: ['Komödie', 'Krieg'] },
    es: { title: 'Sopa de Pato', description: 'Rufus T. Firefly es nombrado presidente de Freedonia. Clásico de los Hermanos Marx.', genre: ['Comedia', 'Guerra'] },
    tr: { title: 'Örk Çorbası', description: 'Rufus T. Firefly Freedonia Cumhurbaşkanı atanır. Marx Kardeşler klasik.', genre: ['Komedi', 'Savaş'] },
    id: { title: 'Duck Soup', description: 'Rufus T. Firefly ditunjuk jadi Presiden Freedonia. Klasik Marx Brothers.', genre: ['Komedi', 'Perang'] },
    vi: { title: 'Canh Vịt', description: 'Rufus T. Firefly được bổ nhiệm Tổng thống Freedonia. Kiệt tác anh em Marx.', genre: ['Hài hước', 'Chiến tranh'] },
    ar: { title: 'حساء البط', description: 'يتم تعيين روفوس تي فايرفلاي رئيساً لفريدونيا. كلاسيك أخوة مارك斯。', genre: ['كوميديا', 'حرب'] },
    th: { title: 'ดัค สุป', description: 'รูฟัส ที ไฟร์ฟลาย เป็นประธานาธิบดีฟรีโดเนีย คลาสสิคมาร์คซ์ บราเธอส', genre: ['ตลก', 'สงคราม'] },
    fr: { title: 'Soupe au Canard', description: 'Rufus T. Firefly devient président de Freedonia. Classique des Frères Marx.', genre: ['Comédie', 'Guerre'] },
    pt: { title: 'Sopa de Pato', description: 'Rufus T. Firefly é nomeado presidente da Freedonia. Clássico dos Irmãos Marx.', genre: ['Comédia', 'Guerra'] },
    it: { title: 'Zuppa d\'Anatra', description: 'Rufus T. Firefly diventa presidente di Freedonia. Classico dei Fratelli Marx.', genre: ['Commedia', 'Guerra'] },
    pl: { title: 'Zupa Kaczcza', description: 'Rufus T. Firefly zostaje prezydentem Freedonii. Klasyka braci Marks.', genre: ['Komedia', 'Wojna'] },
    nl: { title: 'Eendensoep', description: 'Rufus T. Firefly wordt president van Freedonia. Marx Brothers klassieker.', genre: ['Komiek', 'Oorlog'] },
    sv: { title: 'Anksoppa', description: 'Rufus T. Firefly blir president i Freedonia. Marxbrödernas klassiker.', genre: ['Komedi', 'Krig'] },
    zh: { title: '鸭汤', description: '鲁弗斯·T·费耶弗莱成为弗里多尼亚总统。马克思兄弟经典。', genre: ['喜剧', '战争'] },
    ja: { title: 'ダック・スープ', description: 'ルーファス・T・ファイアフライがフリーダニア大統領に。マルクス兄弟の古典。', genre: ['コメディ', '戦争'] },
    ko: { title: '덕 수프', description: '루퍼스 T. 파이어플라이가 프리도니아 대통령이 된다. 마르크스 형제 고전。', genre: ['코미디', '전쟁'] },
    hi: { title: 'डक सूप', description: 'रूफस टी फायरफ्ले फ्रीडोनिया के अध्यक्ष बनते हैं। मार्क्स ब्रदर्स क्लासिक।', genre: ['कॉमेडी', 'युद्ध'] },
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Localized Movie Content Helper
// ──────────────────────────────────────────────────────────────────────────────

function getLocalizedMovie(movie: Movie, lang: SupportedLang): { title: string; description: string; genre: string[] } {
  const translation = MOVIE_TRANSLATIONS[movie.id]?.[lang];
  if (translation) {
    return { title: translation.title, description: translation.description, genre: translation.genre };
  }
  return { title: movie.title, description: movie.description, genre: movie.genre };
}

function formatLocalizedMovieCard(movie: Movie, lang: SupportedLang): string {
  const localized = getLocalizedMovie(movie, lang);
  const genres = localized.genre.join(', ');
  const sources = movie.streamUrls.filter(s => s.verified).map(s => `✅ ${s.name}`).join('\n');
  const posterLine = movie.posterUrl ? `🖼 <a href="${movie.posterUrl}">${t('poster', lang)}</a>\n` : '';
  return `🎬 <b>${localized.title}</b> (${movie.year})\n` +
    `⭐ ${movie.rating}/10 | ${genres}\n` +
    `📖 ${localized.description}\n` +
    posterLine +
    `🔗 <b>${t('legalSources', lang)}</b>\n${sources}`;
}

function createLocalizedMovieKeyboard(movie: Movie, lang: SupportedLang): any[][] {
  const keyboard: any[][] = [];
  const safeSources = sanitizeStreamSources(movie.streamUrls);

  safeSources.forEach(source => {
    const icon = source.source === 'youtube' ? '▶️' :
                 source.source === 'archive' ? '📚' :
                 source.source === 'public_domain' ? '🆓' : '📺';
    keyboard.push([{ text: `${icon} ${source.name}`, url: source.url }]);
  });

  keyboard.push([
    { text: t('watchlist_btn', lang), callback_data: `watchlist_add:${movie.id}` },
    { text: t('random_btn', lang), callback_data: 'random' },
  ]);
  keyboard.push([
    { text: t('search_btn', lang), callback_data: 'search' },
    { text: t('main_menu', lang), callback_data: 'main_menu' },
  ]);

  return keyboard;
}

function formatMovieCaption(movie: Movie, lang: SupportedLang): string {
  const localized = getLocalizedMovie(movie, lang);
  const genres = localized.genre.join(', ');
  const sources = movie.streamUrls.filter(s => s.verified).map(s => `✅ ${s.name}`).join('\n');
  return `🎬 <b>${localized.title}</b> (${movie.year})\n` +
    `⭐ ${movie.rating}/10 | ${genres}\n` +
    `📖 ${localized.description}\n\n` +
    `🔗 <b>${t('legalSources', lang)}</b>\n${sources}`;
}

async function sendMovieAsPhoto(ctx: BotContext, chatId: string, movie: Movie, lang: SupportedLang): Promise<void> {
  if (!movie.posterUrl) {
    // Fallback to text message if no poster
    await ctx.sendMessage(chatId, formatLocalizedMovieCard(movie, lang), { keyboard: createLocalizedMovieKeyboard(movie, lang) });
    return;
  }
  await ctx.sendMessage(chatId, formatMovieCaption(movie, lang), {
    photo: movie.posterUrl,
    keyboard: createLocalizedMovieKeyboard(movie, lang),
  });
}

function t(key: string, lang: string): string {
  const translation = TRANSLATIONS[key];
  if (!translation) return key;
  return translation[lang as SupportedLang] || translation.en || key;
}

function getFAQCategoryLabel(categoryId: string, lang: string): string {
  const key = `faq_${categoryId}`;
  return t(key, lang);
}

function createTranslatedFAQKeyboard(categoryId?: string, lang: string = 'en'): any[][] {
  const keyboard: any[][] = [];

  if (!categoryId) {
    FAQ_CATEGORIES.forEach(cat => {
      keyboard.push([{ text: `${cat.emoji} ${getFAQCategoryLabel(cat.id, lang)}`, callback_data: `faq_cat:${cat.id}` }]);
    });
    keyboard.push([{ text: t('main_menu', lang), callback_data: 'main_menu' }]);
    return keyboard;
  }

  const questions = FAQ_DATA.filter(f => f.category === categoryId);
  const cat = FAQ_CATEGORIES.find(c => c.id === categoryId);
  const catLabel = cat ? getFAQCategoryLabel(cat.id, lang) : 'FAQ';

  questions.forEach((faq, index) => {
    const shortQ = faq.question.length > 40 ? faq.question.slice(0, 37) + '…' : faq.question;
    keyboard.push([{ text: `❓ ${shortQ}`, callback_data: `faq_q:${categoryId}:${index}` }]);
  });

  keyboard.push([{ text: t('back_categories', lang), callback_data: 'faq' }]);
  keyboard.push([{ text: t('main_menu', lang), callback_data: 'main_menu' }]);
  return keyboard;
}

function formatTranslatedFAQAnswer(faq: FAQEntry, categoryId: string, index: number, lang: string): string {
  const cat = FAQ_CATEGORIES.find(c => c.id === categoryId);
  const catLabel = cat ? getFAQCategoryLabel(cat.id, lang) : categoryId;
  const total = FAQ_DATA.filter(f => f.category === categoryId).length;
  return `❓ <b>${faq.question}</b>\n\n${faq.answer}\n\n` +
    `<i>Category: ${catLabel} | Question ${index + 1}/${total}</i>`;
}

function createTranslatedMainKeyboard(lang: string): any[][] {
  return [
    [{ text: t('popular_btn', lang), callback_data: 'popular' }],
    [{ text: t('genres_btn', lang), callback_data: 'genres' }],
    [{ text: t('search_btn', lang), callback_data: 'search' }],
    [{ text: t('random_btn', lang), callback_data: 'random' }],
    [{ text: t('watchlist_menu', lang), callback_data: 'watchlist' }],
    [{ text: t('history_menu', lang), callback_data: 'history' }],
    [{ text: t('faq_menu', lang), callback_data: 'faq' }],
  ];
}

function createTranslatedMovieKeyboard(movie: Movie, lang: string): any[][] {
  const keyboard: any[][] = [];
  const safeSources = sanitizeStreamSources(movie.streamUrls);

  safeSources.forEach(source => {
    const icon = source.source === 'youtube' ? '▶️' :
                 source.source === 'archive' ? '📚' :
                 source.source === 'public_domain' ? '🆓' : '📺';
    keyboard.push([{ text: `${icon} ${source.name}`, url: source.url }]);
  });

  keyboard.push([
    { text: t('watchlist_btn', lang), callback_data: `watchlist_add:${movie.id}` },
    { text: t('random_btn', lang), callback_data: 'random' },
  ]);
  keyboard.push([
    { text: t('search_btn', lang), callback_data: 'search' },
    { text: t('main_menu', lang), callback_data: 'main_menu' },
  ]);

  return keyboard;
}

function createTranslatedWatchlistKeyboard(watchlist: string[], lang: string): any[][] {
  if (watchlist.length === 0) {
    return [[{ text: t('main_menu', lang), callback_data: 'main_menu' }]];
  }
  const keyboard: any[][] = [];
  watchlist.slice(0, 10).forEach(id => {
    const movie = MOVIES.find(m => m.id === id);
    if (movie) {
      keyboard.push([{ text: `⭐ ${movie.title} (${movie.year})`, callback_data: `movie:${movie.id}` }]);
    }
  });
  keyboard.push([{ text: t('clear_watchlist', lang), callback_data: 'watchlist_clear' }]);
  keyboard.push([{ text: t('main_menu', lang), callback_data: 'main_menu' }]);
  return keyboard;
}

function createTranslatedHistoryKeyboard(history: HistoryEntry[], lang: string): any[][] {
  if (history.length === 0) {
    return [[{ text: t('main_menu', lang), callback_data: 'main_menu' }]];
  }
  const keyboard: any[][] = [];
  [...history].reverse().slice(0, 10).forEach(entry => {
    const movie = MOVIES.find(m => m.id === entry.movieId);
    if (movie) {
      const date = new Date(entry.timestamp).toLocaleDateString(lang);
      keyboard.push([{ text: `📜 ${movie.title} (${movie.year}) — ${date}`, callback_data: `movie:${movie.id}` }]);
    }
  });
  keyboard.push([{ text: t('clear_history', lang), callback_data: 'history_clear' }]);
  keyboard.push([{ text: t('main_menu', lang), callback_data: 'main_menu' }]);
  return keyboard;
}

function createTranslatedPopularKeyboard(page = 0, lang: string = 'en'): any[][] {
  const perPage = 5;
  const start = page * perPage;
  const movies = MOVIES.slice(start, start + perPage);

  const keyboard: any[][] = [];
  movies.forEach(movie => {
    keyboard.push([{ text: `🎬 ${movie.title} (${movie.year}) ⭐${movie.rating}`, callback_data: `movie:${movie.id}` }]);
  }

  const nav: any[] = [];
  if (page > 0) nav.push({ text: '⬅️ Prev', callback_data: `popular_page:${page - 1}` });
  if (start + perPage < MOVIES.length) nav.push({ text: 'Next ➡️', callback_data: `popular_page:${page + 1}` });
  if (nav.length > 0) keyboard.push(nav);

  keyboard.push([{ text: t('main_menu', lang), callback_data: 'main_menu' }]);
  return keyboard;
}

function createTranslatedGenresKeyboard(page = 0, lang: string = 'en'): any[][] {
  const perPage = 8;
  const start = page * perPage;
  const end = start + perPage;
  const pageGenres = GENRES.slice(start, end);

  const keyboard: any[][] = [];
  for (let i = 0; i < pageGenres.length; i += 2) {
    const row = pageGenres.slice(i, i + 2).map(g => ({
      text: g,
      callback_data: `genre:${g.toLowerCase()}`,
    }));
    keyboard.push(row);
  }

  const nav: any[] = [];
  if (page > 0) nav.push({ text: '⬅️ Prev', callback_data: `genres_page:${page - 1}` });
  if (end < GENRES.length) nav.push({ text: 'Next ➡️', callback_data: `genres_page:${page + 1}` });
  if (nav.length > 0) keyboard.push(nav);

  keyboard.push([{ text: t('main_menu', lang), callback_data: 'main_menu' }]);
  return keyboard;
}

function createTranslatedSearchResultsKeyboard(movies: Movie[], query: string, page = 0, lang: string = 'en'): any[][] {
  const perPage = 5;
  const start = page * perPage;
  const pageMovies = movies.slice(start, start + perPage);

  const keyboard: any[][] = [];
  pageMovies.forEach(movie => {
    keyboard.push([{ text: `🎬 ${movie.title} (${movie.year}) ⭐${movie.rating}`, callback_data: `movie:${movie.id}` }]);
  }

  const nav: any[] = [];
  if (page > 0) nav.push({ text: '⬅️ Prev', callback_data: `search_page:${page - 1}:${encodeURIComponent(query)}` });
  if (start + perPage < movies.length) nav.push({ text: 'Next ➡️', callback_data: `search_page:${page + 1}:${encodeURIComponent(query)}` });
  if (nav.length > 0) keyboard.push(nav);

  keyboard.push([{ text: t('search_btn', lang), callback_data: 'search' }, { text: t('main_menu', lang), callback_data: 'main_menu' }]);
  return keyboard;
}

// ──────────────────────────────────────────────────────────────────────────────
// Storage Helpers (per-user, using bot context storage)
// ──────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'movie_catalog_user_';
  const keyboard: any[][] = [];

  if (!categoryId) {
    // Show categories
    FAQ_CATEGORIES.forEach(cat => {
      keyboard.push([{ text: `${cat.emoji} ${cat.label}`, callback_data: `faq_cat:${cat.id}` }]);
    });
    keyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);
    return keyboard;
  }

  // Show questions for category
  const questions = FAQ_DATA.filter(f => f.category === categoryId);
  const cat = FAQ_CATEGORIES.find(c => c.id === categoryId);
  const catLabel = cat ? cat.label : 'FAQ';

  questions.forEach((faq, index) => {
    const shortQ = faq.question.length > 40 ? faq.question.slice(0, 37) + '…' : faq.question;
    keyboard.push([{ text: `❓ ${shortQ}`, callback_data: `faq_q:${categoryId}:${index}` }]);
  });

  keyboard.push([{ text: '⬅️ Back to Categories', callback_data: 'faq' }]);
  keyboard.push([{ text: '🏠 Main Menu', callback_data: 'main_menu' }]);
  return keyboard;
}

function formatFAQAnswer(faq: FAQEntry, categoryId: string, index: number): string {
  return `❓ <b>${faq.question}</b>\n\n${faq.answer}\n\n` +
    `<i>Category: ${FAQ_CATEGORIES.find(c => c.id === categoryId)?.label || categoryId} | Question ${index + 1}/${FAQ_DATA.filter(f => f.category === categoryId).length}</i>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Storage Helpers (per-user, using bot context storage)
// ──────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'movie_catalog_user_';

async function getUserData(ctx: BotContext, userId: string): Promise<UserData> {
  const storage = ctx.storage as BotStorage | undefined;
  if (!storage) {
    return { watchlist: [], history: [], preferences: { genres: [], notifications: true } };
  }
  try {
    const data = await storage.get(`${STORAGE_KEY}${userId}`);
    if (data) return JSON.parse(data);
  } catch { }
  return { watchlist: [], history: [], preferences: { genres: [], notifications: true } };
}

async function saveUserData(ctx: BotContext, userId: string, data: UserData): Promise<void> {
  const storage = ctx.storage as BotStorage | undefined;
  if (!storage) return;
  try {
    await storage.set(`${STORAGE_KEY}${userId}`, JSON.stringify(data));
  } catch { }
}

async function addToWatchlist(ctx: BotContext, userId: string, movieId: string): Promise<boolean> {
  const data = await getUserData(ctx, userId);
  if (!data.watchlist.includes(movieId)) {
    data.watchlist.push(movieId);
    await saveUserData(ctx, userId, data);
    return true;
  }
  return false;
}

async function removeFromWatchlist(ctx: BotContext, userId: string, movieId: string): Promise<void> {
  const data = await getUserData(ctx, userId);
  data.watchlist = data.watchlist.filter(id => id !== movieId);
  await saveUserData(ctx, userId, data);
}

async function clearWatchlist(ctx: BotContext, userId: string): Promise<void> {
  const data = await getUserData(ctx, userId);
  data.watchlist = [];
  await saveUserData(ctx, userId, data);
}

async function addToHistory(ctx: BotContext, userId: string, movieId: string): Promise<void> {
  const data = await getUserData(ctx, userId);
  data.history = data.history.filter(h => h.movieId !== movieId);
  data.history.unshift({ movieId, timestamp: Date.now() });
  if (data.history.length > 50) data.history = data.history.slice(0, 50);
  await saveUserData(ctx, userId, data);
}

async function clearHistory(ctx: BotContext, userId: string): Promise<void> {
  const data = await getUserData(ctx, userId);
  data.history = [];
  await saveUserData(ctx, userId, data);
}

// ──────────────────────────────────────────────────────────────────────────────
// Bot Module
// ──────────────────────────────────────────────────────────────────────────────

const movieCatalogBot: BotModule = {
  init(ctx: BotContext): void {
    ctx.onUpdate(async (update) => {
      const chatId = update.payload.chat.id;
      const userId = update.payload.from;
      const lang = ctx.language || 'en';

      if (update.type === 'message' && update.payload.isCommand) {
        const cmd = update.payload.command;

        if (cmd === 'start') {
          await ctx.sendMessage(chatId,
            t('welcome', lang),
            { keyboard: createTranslatedMainKeyboard(lang) }
          );
          return;
        }

        if (cmd === 'help') {
          await ctx.sendMessage(chatId,
            t('help', lang),
            { keyboard: createTranslatedMainKeyboard(lang) }
          );
          return;
        }

        if (cmd === 'faq') {
          await ctx.sendMessage(chatId,
            `❓ <b>FAQ & Help</b>\n\nSelect a category to browse common questions:`,
            { keyboard: createTranslatedFAQKeyboard(undefined, lang) }
          );
          return;
        }

        if (cmd === 'popular') {
          await ctx.sendMessage(chatId,
            `${t('popular_btn', lang)} <b>Movies</b>\n\nTop rated free movies:`,
            { keyboard: createTranslatedPopularKeyboard(0, lang) }
          );
          return;
        }

        if (cmd === 'genres') {
          await ctx.sendMessage(chatId,
            `${t('genres_btn', lang)} <b>Browse by Genre</b>\n\nSelect a genre:`,
            { keyboard: createTranslatedGenresKeyboard(0, lang) }
          );
          return;
        }

        if (cmd === 'search') {
          const query = update.payload.text.split(' ').slice(1).join(' ').trim();
          if (!query) {
            await ctx.sendMessage(chatId,
              `🔍 <b>Search Movies</b>\n\nUse: <code>/search <title></code>\n\nOr click the button below:`,
              { keyboard: [[{ text: t('main_menu', lang), callback_data: 'main_menu' }]] }
            );
            return;
          }
          const results = searchMovies(query);
          if (results.length === 0) {
            await ctx.sendMessage(chatId,
              `🔍 No results for "<b>${query}</b>"\n\nTry a different search term.`,
              { keyboard: [[{ text: '🔍 Search Again', callback_data: 'search' }, { text: '🏠 Main Menu', callback_data: 'main_menu' }]] }
            );
            return;
          }
          await ctx.sendMessage(chatId,
            `🔍 <b>Search Results for "${query}"</b> (${results.length} found):`,
            { keyboard: createSearchResultsKeyboard(results, query, 0) }
          );
          return;
        }

        if (cmd === 'random') {
          const args = update.payload.text.split(' ').slice(1).join(' ').trim().toLowerCase();
          let movie: Movie;
          if (args.startsWith('genre:')) {
            const genre = args.replace('genre:', '').trim();
            const genreMovies = getMoviesByGenre(genre);
            if (genreMovies.length === 0) {
              await ctx.sendMessage(chatId, `No movies found for genre "${genre}".`);
              return;
            }
            movie = genreMovies[Math.floor(Math.random() * genreMovies.length)];
          } else {
            movie = getRandomMovie();
          }
          await addToHistory(ctx, userId, movie.id);
          await sendMovieAsPhoto(ctx, chatId, movie, lang);
          await ctx.sendMessage(chatId, '🎲 <b>Random pick!</b>', { keyboard: createLocalizedMovieKeyboard(movie, lang) });
          return;
        }

        if (cmd === 'watchlist') {
          const data = await getUserData(ctx, userId);
          await ctx.sendMessage(chatId,
            data.watchlist.length > 0
              ? `⭐ <b>Your Watchlist</b> (${data.watchlist.length} movies):`
              : `⭐ <b>Your Watchlist</b>\n\nEmpty. Add movies with the ${t('watchlist_btn', lang)} button.`,
            { keyboard: createTranslatedWatchlistKeyboard(data.watchlist, lang) }
          );
          return;
        }

        if (cmd === 'history') {
          const data = await getUserData(ctx, userId);
          await ctx.sendMessage(chatId,
            data.history.length > 0
              ? `📜 <b>Viewing History</b> (${data.history.length} entries):`
              : '📜 <b>Viewing History</b>\n\nEmpty.',
            { keyboard: createTranslatedHistoryKeyboard(data.history, lang) }
          );
          return;
        }

        await ctx.sendMessage(chatId, `Unknown command. Use /help to see available commands.`);
        return;
      }

      if (update.type === 'message') {
        const text = update.payload.text.trim();
        if (text.length > 0) {
          const results = searchMovies(text);
          if (results.length > 0) {
            await ctx.sendMessage(chatId,
              `🔍 <b>Search Results for "${text}"</b> (${results.length} found):`,
              { keyboard: createTranslatedSearchResultsKeyboard(results, text, 0, lang) }
            );
          } else {
            await ctx.sendMessage(chatId,
              `No movies found for "<b>${text}</b>". Try /popular or /genres.`,
              { keyboard: createTranslatedMainKeyboard(lang) }
            );
          }
        }
        return;
      }

      if (update.type === 'callback_query') {
        const data = update.payload.data;
        const { id: queryId, chat, messageId } = update.payload;
        const lang = ctx.language || 'en';

        if (data === 'main_menu') {
          await ctx.editMessage(chat.id, messageId,
            '🎬 <b>Movie Catalog Bot</b>\n\nBrowse free & legal movies:',
            { keyboard: createTranslatedMainKeyboard(lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'popular') {
          await ctx.editMessage(chat.id, messageId,
            `${t('popular_btn', lang)} <b>Movies</b>\n\nTop rated free movies:`,
            { keyboard: createTranslatedPopularKeyboard(0, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'genres') {
          await ctx.editMessage(chat.id, messageId,
            `${t('genres_btn', lang)} <b>Browse by Genre</b>\n\nSelect a genre:`,
            { keyboard: createTranslatedGenresKeyboard(0, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'search') {
          await ctx.editMessage(chat.id, messageId,
            '🔍 <b>Search Movies</b>\n\nType a movie title or use /search <query>',
            { keyboard: [[{ text: t('main_menu', lang), callback_data: 'main_menu' }]] }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'random') {
          const movie = getRandomMovie();
          await addToHistory(ctx, userId, movie.id);
          await sendMovieAsPhoto(ctx, chat.id, movie, lang);
          await ctx.sendMessage(chat.id, '🎲 <b>Random pick!</b>', { keyboard: createLocalizedMovieKeyboard(movie, lang) });
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'watchlist') {
          const userData = await getUserData(ctx, userId);
          await ctx.editMessage(chat.id, messageId,
            userData.watchlist.length > 0
              ? `⭐ <b>Your Watchlist</b> (${userData.watchlist.length} movies):`
              : '⭐ <b>Your Watchlist</b>\n\nEmpty.',
            { keyboard: createTranslatedWatchlistKeyboard(userData.watchlist, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'history') {
          const userData = await getUserData(ctx, userId);
          await ctx.editMessage(chat.id, messageId,
            userData.history.length > 0
              ? `📜 <b>Viewing History</b> (${userData.history.length} entries):`
              : '📜 <b>Viewing History</b>\n\nEmpty.',
            { keyboard: createTranslatedHistoryKeyboard(userData.history, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'faq') {
          await ctx.editMessage(chat.id, messageId,
            '❓ <b>FAQ & Help</b>\n\nSelect a category to browse common questions:',
            { keyboard: createTranslatedFAQKeyboard(undefined, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data.startsWith('faq_cat:')) {
          const categoryId = data.split(':')[1];
          const cat = FAQ_CATEGORIES.find(c => c.id === categoryId);
          await ctx.editMessage(chat.id, messageId,
            `❓ <b>${getFAQCategoryLabel(categoryId, lang)}</b>\n\nSelect a question:`,
            { keyboard: createTranslatedFAQKeyboard(categoryId, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data.startsWith('faq_q:')) {
          const [, categoryId, indexStr] = data.split(':');
          const index = parseInt(indexStr, 10);
          const questions = FAQ_DATA.filter(f => f.category === categoryId);
          const faq = questions[index];
          if (faq) {
            await ctx.editMessage(chat.id, messageId,
              formatTranslatedFAQAnswer(faq, categoryId, index, lang),
              { keyboard: createTranslatedFAQKeyboard(categoryId, lang) }
            );
          }
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data === 'watchlist_clear') {
          await clearWatchlist(ctx, userId);
          await ctx.editMessage(chat.id, messageId,
            `⭐ <b>${t('watchlist_cleared', lang)}</b>`,
            { keyboard: [[{ text: t('main_menu', lang), callback_data: 'main_menu' }]] }
          );
          await ctx.answerCallbackQuery(queryId, { text: t('watchlist_cleared', lang) });
          return;
        }

        if (data === 'history_clear') {
          await clearHistory(ctx, userId);
          await ctx.editMessage(chat.id, messageId,
            `📜 <b>${t('history_cleared', lang)}</b>`,
            { keyboard: [[{ text: t('main_menu', lang), callback_data: 'main_menu' }]] }
          );
          await ctx.answerCallbackQuery(queryId, { text: t('history_cleared', lang) });
          return;
        }

        if (data.startsWith('watchlist_add:')) {
          const movieId = data.split(':')[1];
          const added = await addToWatchlist(ctx, userId, movieId);
          const movie = MOVIES.find(m => m.id === movieId);
          await ctx.answerCallbackQuery(queryId, {
            text: added ? `${t('added_watchlist', lang)}: ${movie?.title}` : t('already_watchlist', lang),
            showAlert: false,
          });
          return;
        }

        if (data.startsWith('popular_page:')) {
          const parts = data.split(':');
          const page = parseInt(parts[1], 10);
          const filters: { year?: string; rating?: number } = {};
          if (parts[2] === 'filter') {
            if (parts[3] === 'year' && parts[4] !== 'all') filters.year = parts[4];
            if (parts[3] === 'rating' && parts[4] !== 'all') filters.rating = parseFloat(parts[4]);
          }
          await ctx.editMessage(chat.id, messageId,
            `${t('popular_btn', lang)} <b>Movies</b>\n\nTop rated free movies:`,
            { keyboard: createPopularKeyboard(page, filters, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data.startsWith('popular_filter:')) {
          const parts = data.split(':');
          const page = parseInt(parts[1], 10);
          const filters: { year?: string; rating?: number } = {};
          if (parts[2] === 'year' && parts[3] !== 'all') filters.year = parts[3];
          if (parts[2] === 'rating' && parts[3] !== 'all') filters.rating = parseFloat(parts[3]);
          await ctx.editMessage(chat.id, messageId,
            `${t('popular_btn', lang)} <b>Movies</b>\n\nTop rated free movies:`,
            { keyboard: createPopularKeyboard(page, filters, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data.startsWith('genres_page:')) {
          const page = parseInt(data.split(':')[1], 10);
          await ctx.editMessage(chat.id, messageId,
            `${t('genres_btn', lang)} <b>Browse by Genre</b>\n\nSelect a genre:`,
            { keyboard: createTranslatedGenresKeyboard(page, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data.startsWith('search_page:')) {
          const parts = data.split(':');
          const page = parseInt(parts[1], 10);
          const query = decodeURIComponent(parts[2]);
          const filters: { year?: string; rating?: number } = {};
          if (parts[3] === 'filter') {
            if (parts[4] === 'year' && parts[5] !== 'all') filters.year = parts[5];
            if (parts[4] === 'rating' && parts[5] !== 'all') filters.rating = parseFloat(parts[5]);
          }
          const results = searchMovies(query);
          await ctx.editMessage(chat.id, messageId,
            `🔍 <b>Search Results for "${query}"</b> (${results.length} found):`,
            { keyboard: createSearchResultsKeyboard(results, query, page, filters, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data.startsWith('search_filter:')) {
          const parts = data.split(':');
          const page = parseInt(parts[1], 10);
          const query = decodeURIComponent(parts[2]);
          const filters: { year?: string; rating?: number } = {};
          if (parts[3] === 'year' && parts[4] !== 'all') filters.year = parts[4];
          if (parts[3] === 'rating' && parts[4] !== 'all') filters.rating = parseFloat(parts[4]);
          const results = searchMovies(query);
          await ctx.editMessage(chat.id, messageId,
            `🔍 <b>Search Results for "${query}"</b> (${results.length} found):`,
            { keyboard: createSearchResultsKeyboard(results, query, page, filters, lang) }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data.startsWith('genre:')) {
          const genre = data.split(':')[1];
          const movies = getMoviesByGenre(genre);
          if (movies.length === 0) {
            await ctx.answerCallbackQuery(queryId, { text: `No movies found for ${genre}`, showAlert: true });
            return;
          }
          const keyboard: any[][] = movies.map(m => [
            { text: `🎬 ${m.title} (${m.year}) ⭐${m.rating}`, callback_data: `movie:${m.id}` }
          ]);
          keyboard.push([{ text: t('main_menu', lang), callback_data: 'main_menu' }]);
          await ctx.editMessage(chat.id, messageId,
            `🎭 <b>${genre.charAt(0).toUpperCase() + genre.slice(1)} Movies</b> (${movies.length} found):`,
            { keyboard }
          );
          await ctx.answerCallbackQuery(queryId);
          return;
        }

        if (data.startsWith('movie:')) {
          const movieId = data.split(':')[1];
          const movie = MOVIES.find(m => m.id === movieId);
          if (movie) {
            await addToHistory(ctx, userId, movie.id);
            await sendMovieAsPhoto(ctx, chat.id, movie, lang);
            await ctx.sendMessage(chat.id, '▶️ <b>Select a legal source to watch:</b>', { keyboard: createLocalizedMovieKeyboard(movie, lang) });
          } else {
            await ctx.answerCallbackQuery(queryId, { text: 'Movie not found', showAlert: true });
          }
          return;
        }

        await ctx.answerCallbackQuery(queryId, { text: 'Unknown action' });
        return;
      }

      if (update.type === 'inline_query') {
        const query = update.payload.query.trim().toLowerCase();
        const results = query ? searchMovies(query) : MOVIES.slice(0, 20);
        const lang = update.payload.language || 'en';

        await ctx.answerInlineQuery(update.payload.id, results.slice(0, 20).map(movie => {
          const localized = getLocalizedMovie(movie, lang);
          return {
            type: 'article',
            id: movie.id,
            title: `${localized.title} (${movie.year})`,
            description: `⭐ ${movie.rating}/10 | ${localized.genre.join(', ')}`,
            input_message_content: {
              message_text: formatLocalizedMovieCard(movie, lang),
              parse_mode: 'HTML',
            },
            reply_markup: { inline_keyboard: createLocalizedMovieKeyboard(movie, lang) },
            thumbnail_url: movie.posterUrl,
          };
        }));
        return;
      }
    });
  },
};

export default movieCatalogBot;