import { spawnSync } from 'child_process';
import { checkImproveAge } from './improve.js';

function gh(args, projectDir) {
  const result = spawnSync('gh', args, {
    cwd: projectDir,
    encoding: 'utf-8',
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result;
}

function checkGhCli(projectDir) {
  const result = gh(['--version'], projectDir);
  if (result.status !== 0) {
    console.error('  Error: GitHub CLI (gh) is not installed or not in PATH.');
    console.error('  Install it: https://cli.github.com/');
    process.exit(1);
  }

  const authResult = gh(['auth', 'status'], projectDir);
  if (authResult.status !== 0) {
    console.error('  Error: Not authenticated with GitHub CLI.');
    console.error('  Run: gh auth login');
    process.exit(1);
  }
}

function getDefaultBranch(projectDir) {
  const result = gh(
    ['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'],
    projectDir
  );
  return (result.stdout || '').trim() || 'main';
}

function triggerWorkflow(projectDir, workflowFile, branch) {
  console.log(`  Triggering ${workflowFile} on ${branch}...`);
  const result = gh(['workflow', 'run', workflowFile, '--ref', branch], projectDir);
  if (result.status !== 0) {
    const err = (result.stderr || '').trim();
    console.error(`  Failed to trigger ${workflowFile}: ${err}`);
    return false;
  }
  console.log(`  Triggered ${workflowFile}`);
  return true;
}

function waitForRun(projectDir, workflowFile) {
  console.log(`  Waiting for ${workflowFile} to complete...`);

  // Give GitHub a moment to register the run
  spawnSync('sleep', ['3'], { shell: true });

  // Get the latest run ID for this workflow
  const listResult = gh(
    ['run', 'list', '--workflow', workflowFile, '--limit', '1', '--json', 'databaseId,status', '--jq', '.[0].databaseId'],
    projectDir
  );
  const runId = (listResult.stdout || '').trim();
  if (!runId) {
    console.error(`  Could not find run for ${workflowFile}`);
    return false;
  }

  // Watch the run
  const watchResult = spawnSync('gh', ['run', 'watch', runId, '--exit-status'], {
    cwd: projectDir,
    stdio: 'inherit',
    shell: true,
  });

  return watchResult.status === 0;
}

async function handleDeploy(options) {
  const projectDir = process.cwd();
  const branch = options.branch || 'main';

  await checkImproveAge(projectDir);
  checkGhCli(projectDir);

  const workflows = [];

  if (options.frontend) {
    workflows.push('deploy-frontend.yml');
  } else if (options.backend) {
    workflows.push('deploy-backend.yml');
  } else {
    // Deploy both by default
    workflows.push('deploy-backend.yml', 'deploy-frontend.yml');
  }

  console.log('');
  console.log('  Deploying via GitHub Actions...');
  console.log(`  Branch:    ${branch}`);
  console.log(`  Workflows: ${workflows.join(', ')}`);
  console.log('');

  const results = [];

  for (const wf of workflows) {
    const triggered = triggerWorkflow(projectDir, wf, branch);
    if (!triggered) {
      results.push({ workflow: wf, status: 'TRIGGER_FAILED' });
      continue;
    }

    if (options.wait) {
      const success = waitForRun(projectDir, wf);
      results.push({ workflow: wf, status: success ? 'OK' : 'FAILED' });
    } else {
      results.push({ workflow: wf, status: 'TRIGGERED' });
    }
  }

  console.log('');
  console.log('  Deploy Summary:');
  for (const r of results) {
    const icon = r.status === 'OK' || r.status === 'TRIGGERED' ? '+' : 'X';
    console.log(`    [${icon}] ${r.workflow} — ${r.status}`);
  }

  if (!options.wait) {
    console.log('');
    console.log('  Runs triggered. Check status:');
    console.log('    gh run list --limit 2');
    console.log('  Or wait for completion:');
    console.log('    forge deploy --wait');
  }

  console.log('');

  const failed = results.some((r) => r.status === 'FAILED' || r.status === 'TRIGGER_FAILED');
  if (failed) process.exit(1);
}

export function registerDeployCommand(program) {
  program
    .command('deploy')
    .description('Deploy via GitHub Actions workflows')
    .option('--frontend', 'Deploy frontend only')
    .option('--backend', 'Deploy backend only')
    .option('--branch <branch>', 'Branch to deploy (default: main)', 'main')
    .option('--wait', 'Wait for deployment to complete and report status')
    .action(handleDeploy);
}
