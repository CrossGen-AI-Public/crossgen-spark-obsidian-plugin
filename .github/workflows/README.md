# CI/CD Workflows

This directory contains GitHub Actions workflows for continuous integration and testing.

## Workflows

### Daemon CI (`daemon-ci.yml`)

Runs on:
- Push to `main` branch (daemon changes)
- Pull requests to `main` (daemon changes)

**Jobs:**
1. **Test** (Node 18.x, 20.x)
   - Format check
   - Linting
   - Type checking
   - Unit tests (264 tests)
   - Coverage report (shown in logs)
   - Build verification

2. **Integration** (Node 20.x)
   - Build daemon
   - Test start/stop lifecycle
   - Verify daemon can run with real vault

**Artifacts:**
- Coverage summary shown in CI logs
- Build artifacts validated

### Plugin CI (`plugin-ci.yml`)

Runs on:
- Push to `main` branch (plugin changes)
- Pull requests to `main` (plugin changes)

**Jobs:**
1. **Lint & Type Check** (Node 18.x, 20.x)
   - Format check
   - Linting
   - Type checking
   - Build verification
   - Manifest validation

**Artifacts:**
- Plugin build artifacts (main.js, manifest.json)

## Setup Instructions

### 1. Enable GitHub Actions

GitHub Actions should be enabled by default for your repository. If not:
1. Go to repository Settings
2. Click "Actions" → "General"
3. Enable "Allow all actions and reusable workflows"

### 2. Update Badge URLs (Optional)

In `README.md`, replace `YOUR_USERNAME` with your GitHub username if you want badge links to work:

```markdown
[![Daemon Tests](https://img.shields.io/badge/daemon%20tests-264%20passing-brightgreen)](https://github.com/YOUR_USERNAME/crossgen-spark/...)
```

### 3. First Run

The workflows will run automatically on your next push to `main` or when you create a PR.

## Badges

Static badges in the main README show:
- ✅ **Daemon Tests**: 264 passing tests
- ✅ **Plugin Build**: Build status
- 📊 **Coverage**: Current test coverage (79%)

Update these manually when numbers change.

## Troubleshooting

### Workflow fails on first run
- Check that all dependencies are in `package-lock.json`
- Run `npm install` and commit the lock file

### Coverage not showing in logs
- Check that `npm run test:coverage` works locally
- Look for "Coverage Summary" step in workflow logs

### Node version issues
- Workflows test on Node 18.x and 20.x
- Ensure your code is compatible with both versions

## Local Testing

Test workflows locally before pushing:

```bash
# Daemon checks
cd daemon
npm run check

# Plugin checks
cd plugin
npm run check
```

## Adding New Checks

To add new checks to the workflows:

1. Edit the appropriate `.yml` file
2. Add your step in the relevant job
3. Test locally first
4. Commit and push to see it run in CI

## Status Checks for PRs

These workflows are configured to:
- Run on every PR
- Block merging if checks fail
- Ensure code quality before merge

To require status checks:
1. Go to Settings → Branches
2. Add branch protection rule for `main`
3. Require status checks: "test", "lint-and-typecheck", "integration"

