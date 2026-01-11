# CI/CD Workflows

This directory contains GitHub Actions workflows for continuous integration and testing.

## Workflows

### Engine CI (`engine-ci.yml`)

Runs on:
- Push to `main` branch (engine changes)
- Pull requests to `main` (engine changes)

**Jobs:**
1. **Test** (Node 18.x, 20.x)
   - Format check
   - Linting
   - Type checking
   - Unit tests (264 tests)
   - Coverage report (shown in logs)
   - Build verification

2. **Integration** (Node 20.x)
   - Build engine
   - Test start/stop lifecycle
   - Verify engine can run with real vault

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

### 2. First Run

The workflows will run automatically on your next push to `main` or when you create a PR.

## Badges

Dynamic workflow badges in the main README:

```markdown
[![Engine CI](https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/actions/workflows/engine-ci.yml/badge.svg)](...)
[![Plugin CI](https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/actions/workflows/plugin-ci.yml/badge.svg)](...)
```

Benefits:
- ✅ **Auto-update**: Show real-time pass/fail status
- ✅ **Clickable**: Link to latest workflow run
- ✅ **Private repo friendly**: Work without external services
- ✅ **Fork friendly**: Work automatically when forked

Click any badge → See workflow run → Check "Summary" tab for detailed results (test counts, coverage, build artifacts).

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
# Engine checks
cd engine
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

