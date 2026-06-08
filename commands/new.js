import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { execSync, spawn as cpSpawn, spawnSync } from 'child_process';
import fs from 'fs/promises';
import { validateProjectName, toSnakeCase } from '../lib/utils.js';
import { copyTemplate } from '../lib/copy.js';
import { renameProjectFiles } from '../lib/rename.js';
import { createSpinner } from '../lib/spinner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, '..', 'template');

function run(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf-8' });
}

function runAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = cpSpawn(cmd, args, { stdio: 'pipe', shell: true, ...opts });
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', (d) => { stdout += d; });
    if (child.stderr) child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(`Exit code ${code}`), { stdout, stderr }));
    });
    child.on('error', reject);
  });
}

function hasGhCli() {
  try {
    execSync('gh --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isGhAuthenticated() {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

function askVisible(label) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(label, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function askHidden(label) {
  return new Promise((resolve) => {
    process.stdout.write(label);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');

    let input = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write('\n');
        resolve(input);
      } else if (ch === '\u0003') {
        process.stdout.write('\n');
        process.exit(0);
      } else if (ch === '\u007f' || ch === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

async function promptUser(questions) {
  const answers = {};
  for (const q of questions) {
    const defaultHint = q.default ? ` (${q.default})` : '';
    const label = `  ${q.label}${defaultHint}: `;
    const answer = q.secret
      ? await askHidden(label)
      : await askVisible(label);
    answers[q.key] = answer.trim() || q.default || '';
  }
  return answers;
}

async function handleNew(projectName, options) {
  // Validate name
  const error = validateProjectName(projectName);
  if (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }

  // Resolve target directory
  const targetDir = path.resolve(options.target || `./${projectName}`);
  const snakeName = toSnakeCase(projectName);

  // Check target doesn't exist
  try {
    await fs.access(targetDir);
    console.error(`Error: Directory already exists: ${targetDir}`);
    process.exit(1);
  } catch {
    // Good — doesn't exist
  }

  // Check template exists
  try {
    await fs.access(TEMPLATE_DIR);
  } catch {
    console.error(`Error: Template directory not found: ${TEMPLATE_DIR}`);
    console.error('Make sure the template/ directory exists in the forge installation.');
    process.exit(1);
  }

  // Determine repo settings
  const repoName = options.repo || projectName;
  const org = options.org || null;
  const fullRepoName = org ? `${org}/${repoName}` : repoName;
  const visibility = options.public ? 'public' : 'private';
  const skipRepo = options.noRepo || false;
  const skipSetup = options.noSetup || false;

  console.log('');
  console.log('  Forging a new project...');
  console.log(`  Name:     ${projectName}`);
  console.log(`  Target:   ${targetDir}`);
  if (!skipRepo) {
    console.log(`  Repo:     ${fullRepoName} (${visibility})`);
  }
  console.log('');

  // Collect database credentials (unless --no-setup)
  let dbConfig = null;
  let pgSuperuser = null;
  if (!skipSetup) {
    console.log('  Database Configuration');
    console.log('  ─────────────────────');
    console.log('  The forge will create the PostgreSQL role and databases for you.');
    console.log('  It needs a superuser (usually "postgres") to do this.');
    console.log('');

    pgSuperuser = await promptUser([
      { key: 'superuser', label: 'PostgreSQL superuser', default: 'postgres' },
      { key: 'superPassword', label: 'Superuser password', default: '', secret: true },
    ]);

    const lowerName = projectName.toLowerCase();
    const defaultDbUser = `${snakeName}_user`;

    console.log('');
    console.log('  Project database settings:');

    dbConfig = await promptUser([
      { key: 'host', label: 'PostgreSQL host', default: 'localhost' },
      { key: 'port', label: 'PostgreSQL port', default: '5432' },
      { key: 'user', label: 'App DB user', default: defaultDbUser },
      { key: 'password', label: 'App DB password', default: '', secret: true },
      { key: 'dbName', label: 'Database name', default: snakeName },
    ]);
    console.log('');
  }

  // Step 1: Copy template
  let sp = createSpinner('Copying template');
  await copyTemplate(TEMPLATE_DIR, targetDir);
  sp.succeed('Template copied');

  // Step 2: Rename all references
  sp = createSpinner('Renaming project references');
  await renameProjectFiles(targetDir, projectName);
  sp.succeed('Project references renamed');

  // Step 3: Generate .env with real credentials
  if (!skipSetup && dbConfig) {
    sp = createSpinner('Generating server/.env');
    const dbUrl = `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.dbName}`;
    const testDbUrl = `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.dbName}_test`;
    const jwtSecret = generateSecret();
    const refreshSecret = generateSecret();

    const envContent = `# Server environment variables
# Generated by forge new

# App
NODE_ENV=development
PORT=3001

# Database (PostgreSQL connection string)
DATABASE_URL=${dbUrl}

# JWT Authentication
JWT_SECRET=${jwtSecret}
JWT_EXPIRY=15m
REFRESH_TOKEN_SECRET=${refreshSecret}
REFRESH_TOKEN_EXPIRY=7d

# CORS — comma-separated list of allowed origins
ALLOWED_ORIGINS=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=debug

# Optional: Email (disabled by default)
ENABLE_EMAIL=false
SENDGRID_API_KEY=
EMAIL_FROM=noreply@example.com

# Optional: File uploads (disabled by default)
ENABLE_UPLOADS=false
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_CONTAINER=uploads
`;

    const envTestContent = `# Test environment overrides
DATABASE_URL=${testDbUrl}
`;

    await fs.writeFile(path.join(targetDir, 'server', '.env'), envContent, 'utf-8');
    await fs.writeFile(path.join(targetDir, 'server', '.env.test'), envTestContent, 'utf-8');
    sp.succeed('Environment files generated');
  }

  // Step 4: Create PostgreSQL role and databases
  if (!skipSetup && dbConfig && pgSuperuser) {
    sp = createSpinner('Creating PostgreSQL role and databases');

    const hasPsql = (() => {
      try {
        execSync('psql --version', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    })();

    if (!hasPsql) {
      sp.fail('psql not found on PATH — skipping auto-creation');
      console.log('');
      console.log('  To add psql to your PATH:');
      console.log('    Windows: Add C:\\Program Files\\PostgreSQL\\<version>\\bin to your system PATH');
      console.log('    Mac:     brew install libpq && brew link --force libpq');
      console.log('    Linux:   sudo apt install postgresql-client');
      console.log('');
      console.log('  Or run this SQL manually as a superuser:');
      console.log(`    CREATE USER ${dbConfig.user} WITH PASSWORD '${dbConfig.password}' CREATEDB CREATEROLE;`);
      console.log(`    CREATE DATABASE ${dbConfig.dbName} OWNER ${dbConfig.user};`);
      console.log(`    CREATE DATABASE ${dbConfig.dbName}_test OWNER ${dbConfig.user};`);
      console.log('');
    } else {
      // Build psql connection args
      const psqlEnv = { ...process.env };
      if (pgSuperuser.superPassword) {
        psqlEnv.PGPASSWORD = pgSuperuser.superPassword;
      }
      const psqlArgs = `-h ${dbConfig.host} -p ${dbConfig.port} -U ${pgSuperuser.superuser}`;

      // Write all SQL to a temp file to avoid shell escaping issues on Windows
      const setupSql = [
        `DO $$ BEGIN`,
        `  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${dbConfig.user}') THEN`,
        `    CREATE USER "${dbConfig.user}" WITH PASSWORD '${dbConfig.password}' CREATEDB CREATEROLE;`,
        `    RAISE NOTICE 'Created role: ${dbConfig.user}';`,
        `  ELSE`,
        `    RAISE NOTICE 'Role ${dbConfig.user} already exists';`,
        `  END IF;`,
        `END $$;`,
        ``,
        `SELECT 'CREATE DATABASE ${dbConfig.dbName} OWNER "${dbConfig.user}"'`,
        `  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbConfig.dbName}')\\gexec`,
        ``,
        `SELECT 'CREATE DATABASE ${dbConfig.dbName}_test OWNER "${dbConfig.user}"'`,
        `  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbConfig.dbName}_test')\\gexec`,
        ``,
        `GRANT ALL PRIVILEGES ON DATABASE ${dbConfig.dbName} TO "${dbConfig.user}";`,
        `GRANT ALL PRIVILEGES ON DATABASE ${dbConfig.dbName}_test TO "${dbConfig.user}";`,
      ].join('\n');

      const tmpSqlFile = path.join(targetDir, '.forge-setup.sql');
      await fs.writeFile(tmpSqlFile, setupSql, 'utf-8');

      try {
        execSync(`psql ${psqlArgs} -d postgres -f "${tmpSqlFile}"`, {
          stdio: 'pipe',
          env: psqlEnv,
          timeout: 15000,
          shell: true,
        });
      } catch (err) {
        const errMsg = (err.stderr || err.message || '').toString().trim();
        if (errMsg && !errMsg.includes('already exists')) {
          console.log(`\n  Warning: DB setup had issues — ${errMsg}`);
        }
      }

      // Clean up temp file
      try { await fs.unlink(tmpSqlFile); } catch { /* ignore */ }

      sp.succeed('PostgreSQL role and databases ready');
    }
  }

  // Step 5: npm install
  if (!skipSetup) {
    sp = createSpinner('Installing dependencies');
    try {
      await runAsync('npm', ['install'], { cwd: targetDir, timeout: 300000 });
      sp.succeed('Dependencies installed');
    } catch (err) {
      sp.fail('npm install failed');
      console.log('  You can run it manually:');
      console.log(`    cd ${projectName} && npm install`);
    }
  }

  // Step 6: Prisma migrate + seed
  if (!skipSetup && dbConfig) {
    const serverDir = path.join(targetDir, 'server');
    const dbEnv = { ...process.env, DATABASE_URL: `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.dbName}` };

    sp = createSpinner('Running database migration');
    try {
      await runAsync('npx', ['prisma', 'migrate', 'dev', '--name', 'init', '--skip-generate'], {
        cwd: serverDir, timeout: 60000, env: dbEnv,
      });
      sp.update('Generating Prisma client');
      await runAsync('npx', ['prisma', 'generate'], { cwd: serverDir, timeout: 30000 });
      sp.succeed('Migration complete');
    } catch (err) {
      sp.fail('Migration failed');
      console.log('  The database may not be running or credentials may be wrong.');
      console.log('  You can run it manually:');
      console.log(`    cd ${projectName}/server && npx prisma migrate dev`);
    }

    sp = createSpinner('Seeding database');
    try {
      await runAsync('npx', ['prisma', 'db', 'seed'], {
        cwd: serverDir, timeout: 30000, env: dbEnv,
      });
      sp.succeed('Database seeded');
    } catch (err) {
      sp.fail('Seed failed');
      console.log('  You can run it manually:');
      console.log(`    cd ${projectName}/server && npx prisma db seed`);
    }
  }

  // Step 7: Initialize git
  sp = createSpinner('Initializing git');
  try {
    run('git init', targetDir);
    run('git add -A', targetDir);
    run('git commit -m "Initial commit from Forge"', targetDir);
    sp.succeed('Git initialized');
  } catch {
    sp.fail('Git init skipped — git may not be available');
  }

  // Step 8: Create GitHub repo and push
  if (!skipRepo) {
    if (!hasGhCli()) {
      console.log('  GitHub CLI (gh) not found — skipping repo creation.');
      console.log('  Install it: https://cli.github.com/');
      console.log('  Then run manually:');
      console.log(`    cd ${projectName}`);
      console.log(`    gh repo create ${fullRepoName} --${visibility} --source . --push`);
    } else if (!isGhAuthenticated()) {
      console.log('  GitHub CLI not authenticated — skipping repo creation.');
      console.log('  Run: gh auth login');
      console.log('  Then:');
      console.log(`    cd ${projectName}`);
      console.log(`    gh repo create ${fullRepoName} --${visibility} --source . --push`);
    } else {
      sp = createSpinner(`Creating GitHub repo: ${fullRepoName} (${visibility})`);
      try {
        const ghArgs = ['repo', 'create', fullRepoName, `--${visibility}`, '--source', '.', '--push'];
        if (options.description) {
          ghArgs.push('--description', options.description);
        }

        const result = await runAsync('gh', ghArgs, { cwd: targetDir });
        const repoUrl = (result.stdout || '').trim();
        sp.succeed(`Repo created: ${repoUrl}`);
        console.log('  Code pushed to main.');
      } catch (err) {
        sp.fail('Repo creation failed');
        const errMsg = (err.stderr || err.message || '').trim();
        if (errMsg) console.log(`  ${errMsg}`);
        console.log('  You can create it manually:');
        console.log(`    cd ${projectName}`);
        console.log(`    gh repo create ${fullRepoName} --${visibility} --source . --push`);
      }
    }
  }

  console.log('');
  console.log('  Project forged successfully!');
  console.log('');

  if (skipSetup) {
    console.log('  Next steps:');
    console.log(`    cd ${projectName}`);
    console.log('    npm install');
    console.log('    cp server/.env.example server/.env  # edit with your DB credentials');
    console.log('    npx prisma migrate dev              # in server/');
    console.log('    npx prisma db seed                  # in server/');
    console.log('    npm run dev');
  } else {
    console.log('  Ready to go:');
    console.log(`    cd ${projectName}`);
    console.log('    npm run dev');
    console.log('');
    console.log('  Default accounts:');
    console.log(`    admin@${projectName}.local / changeme123`);
    console.log(`    user@${projectName}.local  / changeme123`);
  }

  console.log('');
}

const sharedOptions = (cmd) =>
  cmd
    .option('-t, --target <dir>', 'Target directory (defaults to ./<project-name>)')
    .option('--repo <name>', 'GitHub repo name (defaults to project name)')
    .option('--org <name>', 'GitHub org or user to create repo under')
    .option('--public', 'Create a public repo (default: private)')
    .option('--description <text>', 'Repo description')
    .option('--no-repo', 'Skip GitHub repo creation')
    .option('--no-setup', 'Skip DB prompts, npm install, and migrations');

export function registerNewCommand(program) {
  sharedOptions(
    program
      .command('new <project-name>')
      .description('Create a new project from the ForgeCLI template')
  ).action(handleNew);

  sharedOptions(
    program
      .command('fireitup <project-name>')
      .description('Create a new project (alias for "forge new")')
  ).action(handleNew);
}
