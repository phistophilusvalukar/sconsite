import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const sourceDir = path.resolve(process.argv[2] || 'public/ticket-log-archive-data/source');
const outputDir = path.resolve(process.argv[3] || 'public/ticket-log-archive-data');
const supportOutputDir = path.resolve(process.argv[4] || 'public/ticket-log-support-data');
const filesDir = path.join(outputDir, 'files');
const supportFilesDir = path.join(supportOutputDir, 'files');
const indexPath = path.join(outputDir, 'index.json');
const supportIndexPath = path.join(supportOutputDir, 'index.json');

if (!existsSync(sourceDir)) {
  throw new Error(`Ticket log source directory not found: ${sourceDir}`);
}

await rm(filesDir, { force: true, recursive: true });
await rm(supportFilesDir, { force: true, recursive: true });
await mkdir(filesDir, { recursive: true });
await mkdir(supportFilesDir, { recursive: true });

const sourceFiles = (await walk(sourceDir))
  .filter(filePath => filePath.toLowerCase().endsWith('.html'))
  .sort((left, right) => left.localeCompare(right));

const tickets = [];
const supportTickets = [];
const typeCounts = {};
const supportTypeCounts = {};

for (const [index, filePath] of sourceFiles.entries()) {
  const html = await readFile(filePath, 'utf8');
  const relativeSourcePath = path.relative(sourceDir, filePath).replaceAll(path.sep, '/');
  const pathParts = relativeSourcePath.split('/');
  const sourceFolder = pathParts.length > 1 ? pathParts[0] : 'Ticket Logs';
  const fileName = path.basename(filePath);
  const id = extractId(fileName) || `ticket-${String(index + 1).padStart(4, '0')}`;
  const safeName = `${String(index + 1).padStart(4, '0')}-${id}.html`;

  const preamble = extractPreamble(html);
  const channelLabel = preamble[1] || stripExtension(fileName);
  const channelName = channelLabel.includes('/') ? channelLabel.split('/').pop()?.trim() || channelLabel : channelLabel;
  const ticketType = inferTicketType(sourceFolder, channelName);
  const isSupportTicket = ticketType === 'Support';
  const targetPath = path.join(isSupportTicket ? supportFilesDir : filesDir, safeName);
  await copyFile(filePath, targetPath);
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

  const ticket = {
    id,
    title,
    channelName,
    ticketNumber,
    ticketType,
    sourceFolder,
    sourcePath: relativeSourcePath,
    fileUrl: `/${isSupportTicket ? 'ticket-log-support-data' : 'ticket-log-archive-data'}/files/${safeName}`,
    messageCount,
    firstMessageAt,
    lastMessageAt,
    authors,
    mentionedUsers,
    preview: bodyText.slice(0, 420),
    searchableText
  };

  if (isSupportTicket) {
    supportTypeCounts[ticketType] = (supportTypeCounts[ticketType] || 0) + 1;
    supportTickets.push(ticket);
  } else {
    typeCounts[ticketType] = (typeCounts[ticketType] || 0) + 1;
    tickets.push(ticket);
  }
}

const generatedAt = new Date().toISOString();

await writeIndex(indexPath, tickets, typeCounts, generatedAt);
await writeIndex(supportIndexPath, supportTickets, supportTypeCounts, generatedAt);

console.log(`Indexed ${tickets.length} public ticket logs into ${indexPath}`);
console.log(`Indexed ${supportTickets.length} support ticket logs into ${supportIndexPath}`);

async function writeIndex(targetPath, indexTickets, indexTypeCounts, indexGeneratedAt) {
  const indexFirstDates = indexTickets.map(ticket => ticket.firstMessageAt).filter(Boolean).sort();
  const indexLastDates = indexTickets.map(ticket => ticket.lastMessageAt).filter(Boolean).sort();

  await writeFile(
    targetPath,
    `${JSON.stringify({
      generatedAt: indexGeneratedAt,
      ticketCount: indexTickets.length,
      typeCounts: indexTypeCounts,
      firstMessageAt: indexFirstDates[0] || null,
      lastMessageAt: indexLastDates[indexLastDates.length - 1] || null,
      tickets: indexTickets
    }, null, 2)}\n`,
    'utf8'
  );
}

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
