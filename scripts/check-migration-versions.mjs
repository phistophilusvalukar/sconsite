import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = resolve(scriptDirectory, '..', 'supabase', 'migrations');
const migrationPattern = /^(\d{14})_.+\.sql$/;
const versions = new Map();
const invalidFiles = [];

for (const fileName of readdirSync(migrationsDirectory).sort()) {
  if (!fileName.endsWith('.sql')) continue;

  const match = migrationPattern.exec(fileName);
  if (!match) {
    invalidFiles.push(fileName);
    continue;
  }

  const files = versions.get(match[1]) ?? [];
  files.push(fileName);
  versions.set(match[1], files);
}

const duplicates = [...versions.entries()].filter(([, files]) => files.length > 1);

if (invalidFiles.length > 0 || duplicates.length > 0) {
  if (invalidFiles.length > 0) {
    console.error(`Invalid migration filenames:\n  ${invalidFiles.join('\n  ')}`);
  }

  for (const [version, files] of duplicates) {
    console.error(`Duplicate migration version ${version}:\n  ${files.join('\n  ')}`);
  }

  process.exitCode = 1;
} else {
  console.log(`Validated ${versions.size} unique migration versions.`);
}
