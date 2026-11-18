#!/usr/bin/env node
// Operator tool for the hash-only abuse reports the anonymous relay keeps.
//
//   node scripts/anon-reports.mjs list
//   node scripts/anon-reports.mjs list --json
//   node scripts/anon-reports.mjs purge-expired
//   node scripts/anon-reports.mjs remove <reportId>
//   node scripts/anon-reports.mjs --dir ./anon-reports list
//
// The report files are the relay's durable store (one JSON file per report).
// A running relay keeps them in memory too, so after a manual removal restart
// the relay (or call its expiry cleanup) before relying on the block state.
// No personal data exists in these records: only report id, hashes, category
// and timestamps.

import fs from 'node:fs';
import path from 'node:path';

const REPORT_ID = /^[0-9a-f]{32}$/;
const HASH = /^[0-9a-f]{64}$/;
const CATEGORIES = new Set(['spam', 'harassment', 'illegal']);

function parseArgs(argv) {
  let dir = process.env.ANON_REPORTS_DIR || './anon-reports';
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') {
      dir = argv[++i];
    } else if (argv[i] === '--json') {
      args.push('--json');
    } else {
      args.push(argv[i]);
    }
  }
  return { dir: path.resolve(dir), args };
}

function isStoredReport(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.reportId === 'string' &&
      REPORT_ID.test(value.reportId) &&
      typeof value.queueIdHash === 'string' &&
      HASH.test(value.queueIdHash) &&
      typeof value.signingKeyHash === 'string' &&
      HASH.test(value.signingKeyHash) &&
      CATEGORIES.has(value.category) &&
      Number.isFinite(value.expiresAt),
  );
}

function readReports(dir) {
  if (!fs.existsSync(dir)) return { records: [], invalid: [] };
  const records = [];
  const invalid = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || !REPORT_ID.test(name.slice(0, -5))) continue;
    const file = path.join(dir, name);
    let record = null;
    try {
      record = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      record = null;
    }
    if (!isStoredReport(record)) {
      invalid.push(name);
      continue;
    }
    records.push({ ...record, file });
  }
  records.sort((a, b) => (a.receivedAt || 0) - (b.receivedAt || 0));
  return { records, invalid };
}

function formatTime(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : '?';
}

function short(hash) {
  return typeof hash === 'string' ? hash.slice(0, 12) : '?';
}

function commandList(dir, json) {
  const { records, invalid } = readReports(dir);
  const now = Date.now();
  if (json) {
    console.log(JSON.stringify({ dir, reports: records.map(({ file, ...record }) => record), invalid }, null, 2));
    return 0;
  }
  console.log(`reports in ${dir}: ${records.length}`);
  if (records.length === 0) return 0;
  console.log(
    ['report id', 'category', 'queue hash', 'signing key hash', 'received', 'expires', 'state']
      .map((heading, index) => heading.padEnd([33, 11, 14, 18, 21, 21, 7][index]))
      .join(' '),
  );
  for (const record of records) {
    const state = now > record.expiresAt ? 'expired' : 'live';
    console.log(
      [
        record.reportId.padEnd(33),
        record.category.padEnd(11),
        short(record.queueIdHash).padEnd(14),
        short(record.signingKeyHash).padEnd(18),
        formatTime(record.receivedAt).padEnd(21),
        formatTime(record.expiresAt).padEnd(21),
        state,
      ].join(' '),
    );
  }
  if (invalid.length > 0) {
    console.warn(`\nignored ${invalid.length} malformed file(s): ${invalid.join(', ')}`);
  }
  return 0;
}

function commandPurgeExpired(dir) {
  const { records } = readReports(dir);
  const now = Date.now();
  let removed = 0;
  for (const record of records) {
    if (now <= record.expiresAt) continue;
    fs.rmSync(record.file, { force: true });
    removed += 1;
  }
  console.log(`removed ${removed} expired report(s) from ${dir}`);
  if (removed > 0) console.log('restart the relay to drop them from its in-memory store.');
  return 0;
}

function commandRemove(dir, reportId) {
  if (!REPORT_ID.test(String(reportId || ''))) {
    console.error('remove needs a 32-character hex report id');
    return 2;
  }
  const file = path.join(dir, `${reportId}.json`);
  if (!fs.existsSync(file)) {
    console.error(`no report file for ${reportId} in ${dir}`);
    return 1;
  }
  fs.rmSync(file, { force: true });
  console.log(`removed ${reportId}`);
  console.log('restart the relay to drop it from its in-memory store.');
  return 0;
}

const { dir, args } = parseArgs(process.argv.slice(2));
const [command = 'list', argument] = args;
let code = 2;

if (command === 'list') code = commandList(dir, args.includes('--json'));
else if (command === 'purge-expired') code = commandPurgeExpired(dir);
else if (command === 'remove') code = commandRemove(dir, argument);
else {
  console.error('usage: node scripts/anon-reports.mjs [--dir DIR] list [--json] | purge-expired | remove <id>');
}

process.exitCode = code;
