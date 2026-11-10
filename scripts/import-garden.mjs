import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [gardenPath, scope, revision] = process.argv.slice(2);
if (!gardenPath || !['--local', '--remote'].includes(scope) || !/^[0-9a-f]{40}$/.test(revision || '')) {
  throw new Error('Usage: node scripts/import-garden.mjs <Garden checkout> <--local|--remote> <full verified Git revision>');
}

const source = resolve(gardenPath);
const site = execFileSync('git', ['-C', source, 'show', revision + ':index.html'], { encoding: 'utf8' });
const gallery = site.match(/const projectGalleryIds = \[([^\]]+)\]/)?.[1] || '';
const plantSection = site.split('const plantsData = [')[1]?.split('// --- معرض صور المشروع')[0] || '';
const galleryPhotos = [...gallery.matchAll(/assets\/images\/webp\/gallery\/\d+\.webp/g)]
  .map(([path], index) => ({ path, alt: 'صورة من مشروع ميدان النشاطات الطلابية ' + (index + 1) }));
const plantPhotos = [...plantSection.matchAll(/\bname:\s*'([^']+)'[\s\S]*?\bimg:\s*'(assets\/images\/webp\/plants\/\d+\.webp)'/g)]
  .map(([, alt, path]) => ({ path, alt }));
if (!galleryPhotos.length || !plantPhotos.length ||
    plantPhotos.length !== [...plantSection.matchAll(/assets\/images\/webp\/plants\/\d+\.webp/g)].length) {
  throw new Error('Garden gallery or plant index does not match the expected source format.');
}

const groups = [
  { slug: 'garden-project', title: 'ميدان النشاطات الطلابية', subtitle: 'ألبوم توثيق المشروع', photos: galleryPhotos },
  { slug: 'garden-plants', title: 'نباتات ميدان النشاطات', subtitle: 'دليل مصوّر من مشروع Garden', photos: plantPhotos }
];

const bucket = 'csit-anbar-memory-images';
const database = 'csit-anbar-memory';
const wrangler = process.env.WRANGLER_BIN || 'wrangler';
const sqlString = value => "'" + value.replaceAll("'", "''") + "'";
const files = [];
const sql = [
  "INSERT INTO batches (year, title, description, published) VALUES (2025, 'أرشيف النشاطات', 'مجلد إدارة ألبومات النشاطات', 0) ON CONFLICT(year) DO NOTHING;"
];
const temp = await mkdtemp(join(tmpdir(), 'archive-garden-'));
try {
  for (const [groupIndex, group] of groups.entries()) {
    const slug = sqlString(group.slug);
    sql.push(`INSERT INTO albums (batch_id, slug, title, subtitle, sort_order, published, is_activity)
      SELECT id, ${slug}, ${sqlString(group.title)}, ${sqlString(group.subtitle)}, ${groupIndex}, 1, 1
      FROM batches WHERE year = 2025 ON CONFLICT(batch_id, slug) DO NOTHING;`);
    for (const [index, photo] of group.photos.entries()) {
      const bytes = execFileSync('git', ['-C', source, 'show', revision + ':' + photo.path], { maxBuffer: 20 * 1024 * 1024 });
      if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
        throw new Error('Invalid WebP in Garden: ' + photo.path);
      }
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
      const filename = group.slug + '-' + (index + 1) + '-' + hash + '.webp';
      const key = 'activities/garden/' + filename;
      const file = join(temp, filename);
      await writeFile(file, bytes);
      files.push({ file, key });
      const quotedKey = sqlString(key);
      sql.push(`INSERT INTO photos (album_id, object_key, alt_text, sort_order, published)
        SELECT albums.id, ${quotedKey}, ${sqlString(photo.alt)}, ${index}, 1
        FROM albums JOIN batches ON batches.id = albums.batch_id
        WHERE batches.year = 2025 AND albums.slug = ${slug} AND albums.is_activity = 1
          AND NOT EXISTS (SELECT 1 FROM photos WHERE album_id = albums.id AND object_key = ${quotedKey});`);
    }
  }

  const concurrency = scope === '--remote' ? 6 : 1;
  for (let i = 0; i < files.length; i += concurrency) {
    await Promise.all(files.slice(i, i + concurrency).map(async ({ key, file }) => {
      await run(['r2', 'object', 'put', bucket + '/' + key, scope, '--file', file, '--content-type', 'image/webp']);
    }));
    if ((i + concurrency) % 24 === 0 || i + concurrency >= files.length) {
      console.log('Uploaded', Math.min(i + concurrency, files.length), '/', files.length, scope);
    }
  }

  const statements = join(temp, 'garden.sql');
  await writeFile(statements, sql.join('\n'));
  await run(['d1', 'execute', database, scope, '--file', statements, '--yes']);
  console.log('Garden import complete:', groups.map(group => group.slug + '=' + group.photos.length).join(', '), revision);
} finally {
  await rm(temp, { recursive: true, force: true });
}

function run(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(wrangler, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-3000); });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolveRun() : reject(new Error('Wrangler failed: ' + errors)));
  });
}
