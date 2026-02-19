// Run: node tools/run_migration.js add_workout_activities.sql
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node tools/run_migration.js <migration_file.sql>');
  process.exit(1);
}

const filePath = path.join(__dirname, '..', 'migrations', migrationFile);
const sql = fs.readFileSync(filePath, 'utf8');

// Split by ; to handle multiple statements
const statements = sql.split(';').filter(s => s.trim());

async function run() {
  console.log(`Running migration: ${migrationFile}`);
  
  for (const stmt of statements) {
    if (!stmt.trim()) continue;
    try {
      await pool.promise().query(stmt);
      console.log('✓', stmt.substring(0, 60).replace(/\n/g, ' ') + '...');
    } catch (e) {
      // Ignorujemy błędy typu "already exists"
      if (e.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('⊘ Table already exists, skipping');
      } else if (e.code === 'ER_DUP_KEYNAME') {
        console.log('⊘ Index already exists, skipping');
      } else if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('⊘ Column already exists, skipping');
      } else if (e.code === 'ER_CANT_DROP_FIELD_OR_KEY' || e.code === 'ER_KEY_DOES_NOT_EXITS') {
        console.log('⊘ Column/Key does not exist, skipping');
      } else if (e.code === 'ER_BAD_TABLE_ERROR') {
        console.log('⊘ Table does not exist, skipping');
      } else {
        console.error('✗ Error:', e.code, '-', e.message);
      }
    }
  }
  
  console.log('Done!');
  process.exit(0);
}

run().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
