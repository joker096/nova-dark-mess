import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const dir = 'src/locales';
const files = ['ru', 'uk', 'de', 'es', 'tr', 'id', 'vi', 'th', 'fr', 'pt', 'it', 'pl', 'nl', 'sv', 'zh', 'ja', 'ko', 'hi'].map(l => `${l}.json`);

const posts = {
  ru: ['{{count}} пост', '{{count}} поста'], uk: ['{{count}} пост', '{{count}} поста'],
  es: ['{{count}} post', '{{count}} posts'], de: ['{{count}} post', '{{count}} posts'],
  tr: ['{{count}} post', '{{count}} posts'], id: ['{{count}} posts', '{{count}} posts'],
  vi: ['{{count}} posts', '{{count}} posts'], th: ['{{count}} posts', '{{count}} posts'],
  fr: ['{{count}} message', '{{count}} messages'], pt: ['{{count}} postagem', '{{count}} postagens'],
  it: ['{{count}} post', '{{count}} post'], pl: ['{{count}} wpis', '{{count}} postów'],
  nl: ['{{count}} bericht', '{{count}} berichten'], sv: ['{{count}} inlägg', '{{count}} inlägg'],
  zh: ['{{count}} 条帖子', '{{count}} 条帖子'], ja: ['{{count}}件の投稿', '{{count}}件の投稿'],
  ko: ['게시물 {{count}}개', '게시물 {{count}}개'], hi: ['{{count}} पोस्ट', '{{count}} पोस्ट'],
};
const votesZero = { ru: 'Нет голосов', uk: 'Немає голосів', es: 'Sin votos', de: 'Keine Stimmen', tr: 'Oy yok', id: 'Tidak ada suara', vi: 'Chưa có phiếu', th: 'ไม่มีโหวต', fr: 'Aucun vote', pt: 'Sem votos', it: 'Nessun voto', pl: 'Brak głosów', nl: 'Geen stemmen', sv: 'Inga röster', zh: '暂无投票', ja: '投票なし', ko: '표 없음', hi: 'कोई वोट नहीं' };
const votesOne = { ru: '{{count}} голос', uk: '{{count}} голос', es: '{{count}} voto', de: '{{count}} Stimme', tr: '{{count}} oy', id: '{{count}} suara', vi: '{{count}} phiếu', th: '{{count}} โหวต', fr: '{{count}} vote', pt: '{{count}} voto', it: '{{count}} voto', pl: '{{count}} głos', nl: '{{count}} stem', sv: '{{count}} röst', zh: '{{count}} 票', ja: '{{count}}票', ko: '{{count}} 투표', hi: '{{count}} वोट' };
const votesMany = { ru: '{{count}} голосов', uk: '{{count}} голосів', es: '{{count}} votos', de: '{{count}} Stimmen', tr: '{{count}} oy', id: '{{count}} suara', vi: '{{count}} phiếu', th: '{{count}} โหวต', fr: '{{count}} votes', pt: '{{count}} votos', it: '{{count}} voti', pl: '{{count}} głosów', nl: '{{count}} stemmen', sv: '{{count}} röster', zh: '{{count}} 票', ja: '{{count}} 票', ko: '{{count}}표', hi: '{{count}} वोट' };

for (const f of files) {
  const lang = f.replace('.json', '');
  const path = join(dir, f);
  let text = readFileSync(path, 'utf8');
  const [pOne, pMany] = posts[lang];
  const zeroPosts = `${pMany}`.replace('{{count}} posts', '{{count}} posts');
  // postsCount zero -> pluralized "posts" form
  const postsZero = lang === 'ru' ? '{{count}} постов' : lang === 'uk' ? '{{count}} постів' : pMany;
  text = text.replace(/"postsCount_one"/, `"postsCount_zero": "${postsZero}",\n    "postsCount_two": "${pMany}",\n    "postsCount_few": "${pMany}",\n    "postsCount_many": "${pMany}",\n    "postsCount_one"`);
  text = text.replace(/"votesCount_one"/, `"votesCount_zero": "${votesZero[lang]}",\n    "votesCount_two": "${votesMany[lang]}",\n    "votesCount_few": "${votesMany[lang]}",\n    "votesCount_many": "${votesMany[lang]}",\n    "votesCount_one": "${votesOne[lang]}"`);
  writeFileSync(path, text);
  console.log('updated', lang);
}
