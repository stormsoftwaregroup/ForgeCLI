#!/usr/bin/env node
import { Command } from 'commander';
import { registerNewCommand } from './commands/new.js';
import { registerBuildCommand } from './commands/build.js';
import { registerDeployCommand } from './commands/deploy.js';
import { registerTestCommand } from './commands/test.js';
import { registerImproveCommand } from './commands/improve.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerFixCommand } from './commands/fix.js';
import { registerPrepareCommand } from './commands/prepare.js';

const program = new Command();

program
  .name('forge')
  .description('ForgeCLI: scaffold projects and run an agentic build/test/improve loop')
  .version('0.1.0');

registerNewCommand(program);
registerBuildCommand(program);
registerDeployCommand(program);
registerTestCommand(program);
registerImproveCommand(program);
registerSetupCommand(program);
registerFixCommand(program);
registerPrepareCommand(program);

program.parse();
