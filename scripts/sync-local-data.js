import dotenv from 'dotenv';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdtemp, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import pg from 'pg';

dotenv.config({ path: resolve(process.cwd(), '.env.local'), quiet: true });

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_ENDPOINT_URL_S3,
  AWS_REGION
} = process.env;
const confirmationFlag = '--replace-local';
const remoteConnectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const localConnectionString = process.env.DATABASE_URL_LOCAL;
const tableOrder = [
  'courses', 'levels', 'users', 'groups_table', 'course_settings', 'level_course_prices',
  'students', 'enrollments', 'subjects', 'course_sessions', 'attendance', 'payments',
  'audit_logs', 'notifications', 'course_lectures', 'exams', 'exam_questions',
  'exam_attempts', 'exam_attempt_questions', 'exam_answers', 'exam_integrity_events',
  'certificates', 'exam_certificates', 'course_materials', 'system_wipe_requests'
];
const localOnlyTables = ['ai_chat_messages', 'ai_pending_actions'];
const identifier = value => `"${value.replaceAll('"', '""')}"`;
const isLoopback = hostname => ['localhost', '127.0.0.1', '::1'].includes(hostname.replace(/^\[|\]$/g, '').toLowerCase());
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = resolve('backups', `local-before-neon-sync-${timestamp}.json`);
const localLibraryDirectory = resolve('data/course-materials');
const libraryBucket = 'stc-course-library';

if (!process.argv.includes(confirmationFlag)) {
  throw new Error(`Refusing to replace local application data without ${confirmationFlag}.`);
}
if (!remoteConnectionString || !localConnectionString) {
  throw new Error('Set DATABASE_URL or DATABASE_URL_UNPOOLED and DATABASE_URL_LOCAL in .env.local.');
}
const remoteUrl = new URL(remoteConnectionString);
const localUrl = new URL(localConnectionString);
if (isLoopback(remoteUrl.hostname) || !isLoopback(localUrl.hostname)) {
  throw new Error('Database safety check failed: source must be remote and target must be loopback.');
}

const { Pool } = pg;
const remotePool = new Pool({ connectionString: remoteConnectionString, max: 1, connectionTimeoutMillis: 15000 });
const localPool = new Pool({ connectionString: localConnectionString, max: 1, connectionTimeoutMillis: 8000 });
let storage;
let stagingDirectory;
let previousLibraryDirectory;
let libraryMoved = false;
let stagingInstalled = false;

const downloadLibraryObjects = async materials => {
  if (!materials.length) return;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_ENDPOINT_URL_S3 || !AWS_REGION) {
    throw new Error('Course-library storage credentials are required to copy the remote files.');
  }
  storage = new S3Client({
    endpoint: AWS_ENDPOINT_URL_S3,
    region: AWS_REGION,
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    forcePathStyle: true
  });
  stagingDirectory = await mkdtemp(resolve('data', '.course-materials-import-'));
  for (const material of materials) {
    if (typeof material.storage_key !== 'string' ||
        !/^materials\/\d+\/\d+\/[0-9a-f-]{36}$/i.test(material.storage_key)) {
      throw new Error('A course-library record has an unsupported storage key; no local records were changed.');
    }
    const result = await storage.send(new GetObjectCommand({
      Bucket: libraryBucket,
      Key: material.storage_key
    }));
    const contents = Buffer.from(await result.Body.transformToByteArray());
    if (contents.length !== Number(material.file_size) || contents.length > 20 * 1024 * 1024) {
      throw new Error('A downloaded course-library file does not match its database record.');
    }
    if (material.content_type === 'application/pdf' && contents.subarray(0, 5).toString('ascii') !== '%PDF-' ||
        material.content_type === 'image/jpeg' &&
          !(contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff) ||
        material.content_type === 'image/png' &&
          !contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      throw new Error('A downloaded course-library file failed its content-signature check.');
    }
    const filePath = resolve(stagingDirectory, ...material.storage_key.split('/'));
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, { flag: 'wx', mode: 0o600 });
  }
};

const readSchema = async client => {
  const rows = (await client.query(`SELECT table_name,column_name,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
  return new Map([...new Set(rows.map(row => row.table_name))].map(table => [
    table,
    rows.filter(row => row.table_name === table)
  ]));
};

const backupLocalData = async client => {
  const tables = (await client.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).rows.map(row => row.table_name);
  const data = {};
  for (const table of tables) {
    data[table] = (await client.query(`SELECT * FROM ${identifier(table)}`)).rows;
  }
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, JSON.stringify({
    format: 'course-local-pre-neon-sync-backup',
    created_at: new Date().toISOString(),
    data
  }), { flag: 'wx', mode: 0o600 });
  return tables;
};

let localClient;
let transactionOpen = false;
try {
  const remoteClient = await remotePool.connect();
  let rowsByTable;
  let materials;
  let sourceSchema;
  try {
    await remoteClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    sourceSchema = await readSchema(remoteClient);
    rowsByTable = new Map();
    for (const table of tableOrder) {
      const result = await remoteClient.query(`SELECT * FROM ${identifier(table)}`);
      rowsByTable.set(table, result.rows);
    }
    materials = rowsByTable.get('course_materials');
    await remoteClient.query('COMMIT');
  } catch (error) {
    await remoteClient.query('ROLLBACK');
    throw error;
  } finally {
    remoteClient.release();
  }

  localClient = await localPool.connect();
  const targetSchema = await readSchema(localClient);
  for (const table of tableOrder) {
    const sourceRows = rowsByTable.get(table);
    const targetColumns = targetSchema.get(table);
    const sourceColumns = sourceSchema.get(table);
    if (!targetColumns || !sourceColumns) throw new Error(`A database is missing required table ${table}.`);
    const targetByName = new Map(targetColumns.map(column => [column.column_name, column]));
    const sourceColumnNames = new Set(sourceColumns.map(column => column.column_name));
    const unsupported = [...sourceColumnNames].filter(column => !targetByName.has(column));
    const missingRequired = targetColumns.filter(column =>
      column.is_nullable === 'NO' &&
      column.column_default === null &&
      !sourceColumnNames.has(column.column_name)
    );
    if (unsupported.length || missingRequired.length) {
      throw new Error(`Schema mismatch for ${table}; no local records were changed.`);
    }
  }
  for (const table of localOnlyTables) {
    if (!targetSchema.has(table)) throw new Error(`The local database is missing its ${table} table.`);
  }

  await downloadLibraryObjects(materials);
  const backupTables = await backupLocalData(localClient);
  console.log(`Saved a local-only recovery backup (${backupTables.length} tables) to ${basename(backupPath)}.`);

  await localClient.query('BEGIN');
  transactionOpen = true;
  const truncatedTables = [...tableOrder, 'auth_sessions', ...localOnlyTables];
  await localClient.query(
    `TRUNCATE TABLE ${truncatedTables.map(identifier).join(', ')} RESTART IDENTITY CASCADE`
  );

  const importedCounts = new Map();
  for (const table of tableOrder) {
    const targetNames = new Set(targetSchema.get(table).map(column => column.column_name));
    const rows = rowsByTable.get(table);
    for (const row of rows) {
      const columns = Object.keys(row).filter(column => targetNames.has(column));
      if (!columns.length) continue;
      await localClient.query(
        `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(', ')})
         VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
        columns.map(column => row[column])
      );
    }
    importedCounts.set(table, rows.length);
  }

  for (const table of tableOrder) {
    const columns = targetSchema.get(table);
    if (!columns.some(column => column.column_name === 'id')) continue;
    const sequence = await localClient.query(
      `SELECT pg_get_serial_sequence($1, 'id') AS name`, [`public.${table}`]
    );
    if (sequence.rows[0]?.name) {
      await localClient.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'),
          COALESCE((SELECT MAX(id) FROM ${identifier(table)}), 1),
          EXISTS(SELECT 1 FROM ${identifier(table)}))`,
        [`public.${table}`]
      );
    }
  }

  await mkdir(resolve('backups'), { recursive: true });
  try {
    await stat(localLibraryDirectory);
    previousLibraryDirectory = resolve('backups', `course-materials-before-neon-sync-${timestamp}`);
    await rename(localLibraryDirectory, previousLibraryDirectory);
    libraryMoved = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await rename(stagingDirectory, localLibraryDirectory);
  stagingInstalled = true;
  await localClient.query('COMMIT');
  transactionOpen = false;

  console.log('Imported remote application data into the loopback-only local database:');
  for (const [table, count] of importedCounts) console.log(`${table}: ${count}`);
  console.log('Remote login sessions were deliberately not copied.');
  console.log('Course-library files are now stored locally in data/course-materials.');
  if (libraryMoved) console.log(`Previous local library files were retained in ${previousLibraryDirectory}.`);
} catch (error) {
  if (transactionOpen) {
    try {
      await localClient.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back the local database transaction:', rollbackError);
    }
  }
  if (stagingInstalled) await rm(localLibraryDirectory, { recursive: true, force: true });
  if (libraryMoved) {
    await rename(previousLibraryDirectory, localLibraryDirectory);
  }
  throw error;
} finally {
  if (stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true });
  storage?.destroy();
  localClient?.release();
  await remotePool.end();
  await localPool.end();
}
