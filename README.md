# ForgeCLI

A CLI for scaffolding full-stack JavaScript projects and driving an agentic build / test / improve loop with Claude Code.

## Install

```bash
npm install
npm link
```

This puts the `forge` command on your PATH.

## Commands

### `forge new <project-name>` (alias: `forge fireitup`)

Scaffold a new project from the bundled template:

```bash
forge new my-app
forge fireitup my-app
```

Copies the reference implementation, renames all project references (database, package name, titles), generates environment files and secrets, optionally provisions a PostgreSQL role and databases, installs dependencies, runs migrations, and initializes git. Use `--no-setup` to skip the database/install steps and `--no-repo` to skip GitHub repo creation.

### `forge build`

Run prompt files sequentially via Claude Code headless mode:

```bash
forge build --prompts ./forge/prompts/
forge build --prompts ./forge/prompts/ --verify
forge build --prompts ./forge/prompts/ --phase 1
forge build --prompts ./forge/prompts/ --resume --from 03-frontend-pages
```

Includes a prompt review stage that flags conflicts between your prompts and the template's built-in capabilities; you decide per conflict which approach wins. After review, the build runs autonomously.

### `forge test` / `forge improve` / `forge fix`

The agentic loop on an existing project: run the test suite, iterate on failures, and apply fixes via Claude Code.

### `forge deploy`

Deployment helper (work in progress).

## Project Structure

```
commands/   # forge subcommands (new, build, test, improve, fix, prepare, setup, deploy)
lib/        # shared helpers (template copy, rename, claude runner, review, ...)
template/   # reference implementation copied by `forge new`
pipeline/   # agentic CI files installed into new projects
```

## License

MIT — see [LICENSE](LICENSE).
