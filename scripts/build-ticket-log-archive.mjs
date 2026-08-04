import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const sourceDir = path.resolve(process.argv[2] || 'public/ticket-log-archive-data/source');
const outputDir = path.resolve(process.argv[3] || 'public/ticket-log-archive-data');
const filesDir = path.join(outputDir, 'files');
const indexPath = path.join(outputDir, 'index.json');

if (!existsSync(sourceDir)) {
  throw new Error(`Ticket log source directory not found: ${sourceDir}`);
}

await rm(filesDir, { force: true, recursive: true });
await mkdir(filesDir, { recursive: true });

const sourceFiles = (await walk(sourceDir))
  .filter(filePath => filePath.toLowerCase().endsWith('.html'))
  .sort((left, right) => left.localeCompare(right));

const tickets = [];
const typeCounts = {};

for (const [index, filePath] of sourceFiles.entries()) {
  const html = await readFile(filePath, 'utf8');
  const relativeSourcePath = path.relative(sourceDir, filePath).replaceAll(path.sep, '/');
  const pathParts = relativeSourcePath.split('/');
  const sourceFolder = pathParts.length > 1 ? pathParts[0] : 'Ticket Logs';
  const fileName = path.basename(filePath);
  const id = extractId(fileName) || `ticket-${String(index + 1).padStart(4, '0')}`;
  const safeName = `${String(index + 1).padStart(4, '0')}-${id}.html`;
  const targetPath = path.join(filesDir, safeName);
  await copyFile(filePath, targetPath);

  const preamble = extractPreamble(html);
  const channelLabel = preamble[1] || stripExtension(fileName);
  const channelName = channelLabel.includes('/') ? channelLabel.split('/').pop()?.trim() || channelLabel : channelLabel;
  const ticketType = inferTicketType(sourceFolder, channelName);
  const title = decodeHtml(matchText(html, /<title>([\s\S]*?)<\/title>/i) || channelName);
  const ticketNumber = matchText(channelName, /(closed-\d+)/i) || matchText(fileName, /(closed-\d+)/i) || '';
  const authors = extractAuthors(html);
  const mentionedUsers = extractMentions(html);
  const timestamps = extractTimestamps(html);
  const bodyText = normalizeWhitespace(decodeHtml(stripTags(stripNoise(html))));
  const messageCount = countMatches(html, /data-message-id=/g);
  const firstMessageAt = timestamps[0] || null;
  const lastMessageAt = timestamps[timestamps.length - 1] || null;
  const searchableText = normalizeWhitespace([
    title,
    sourceFolder,
    channelName,
    ticketType,
    ticketNumber,
    ...authors,
    ...mentionedUsers,
    bodyText
  ].join(' ')).slice(0, 80000);

  typeCounts[ticketType] = (typeCounts[ticketType] || 0) + 1;
  tickets.push({
    id,
    title,
    channelName,
    ticketNumber,
    ticketType,
    sourceFolder,
    sourcePath: relativeSourcePath,
    fileUrl: `/ticket-log-archive-data/files/${safeName}`,
    messageCount,
    firstMessageAt,
    lastMessageAt,
    authors,
    mentionedUsers,
    preview: bodyText.slice(0, 420),
    searchableText
  });
}

const generatedAt = new Date().toISOString();
const firstDates = tickets.map(ticket => ticket.firstMessageAt).filter(Boolean).sort();
const lastDates = tickets.map(ticket => ticket.lastMessageAt).filter(Boolean).sort();

await writeFile(
  indexPath,
  `${JSON.stringify({
    generatedAt,
    ticketCount: tickets.length,
    typeCounts,
    firstMessageAt: firstDates[0] || null,
    lastMessageAt: lastDates[lastDates.length - 1] || null,
    tickets
  }, null, 2)}\n`,
  'utf8'
);

console.log(`Indexed ${tickets.length} ticket logs into ${indexPath}`);

async function walk(directory) {
  const entries = await import('node:fs/promises').then(fs => fs.readdir(directory, { withFileTypes: true }));
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function extractId(fileName) {
  return matchText(fileName, /\[(\d+)\]/);
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

function inferTicketType(sourceFolder, channelName) {
  const value = `${sourceFolder} ${channelName}`.toLowerCase();
  if (value.includes('char')) return 'Character';
  if (value.includes('support')) return 'Support';
  return sourceFolder.replace(/\s*tickets?$/i, '').trim() || 'Ticket';
}

function extractPreamble(html) {
  return Array.from(html.matchAll(/<div class=preamble__entry[^>]*>([\s\S]*?)<\/div>/gi))
    .map(match => normalizeWhitespace(decodeHtml(stripTags(match[1]))))
    .filter(Boolean);
}

function extractAuthors(html) {
  const names = new Set();
  for (const match of html.matchAll(/<span class=chatlog__author\b([^>]*)>([\s\S]*?)<\/span>/gi)) {
    const title = matchText(match[1], /title="([^"]+)"/i);
    const visibleName = normalizeWhitespace(decodeHtml(stripTags(match[2])));
    if (visibleName) names.add(visibleName);
    if (title) names.add(title.split('#')[0]);
  }
  return Array.from(names).sort((left, right) => left.localeCompare(right));
}

function extractMentions(html) {
  const names = new Set();
  for (const match of html.matchAll(/<span class="chatlog__markdown-mention"([^>]*)>([\s\S]*?)<\/span>/gi)) {
    const title = matchText(match[1], /title="([^"]+)"/i);
    const visibleName = normalizeWhitespace(decodeHtml(stripTags(match[2]))).replace(/^@/, '');
    if (visibleName) names.add(visibleName);
    if (title) names.add(title);
  }
  return Array.from(names).sort((left, right) => left.localeCompare(right));
}

function extractTimestamps(html) {
  const values = [];
  for (const match of html.matchAll(/<span class=chatlog__timestamp\b[^>]*title="([^"]+)"/gi)) {
    const parsed = new Date(decodeHtml(match[1]));
    if (!Number.isNaN(parsed.getTime())) values.push(parsed.toISOString());
  }
  return values.sort();
}

function stripNoise(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function matchText(value, regex) {
  return value.match(regex)?.[1] || '';
}

function countMatches(value, regex) {
  return Array.from(value.matchAll(regex)).length;
}

function decodeHtml(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}
