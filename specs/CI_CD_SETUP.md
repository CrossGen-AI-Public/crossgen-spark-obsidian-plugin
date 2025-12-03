# CI/CD Setup Guide

This guide will help you set up continuous integration, testing, and coverage badges for Spark.

## Quick Setup (2 minutes)

### 1. Enable GitHub Actions

Actions should be enabled by default. Verify:
1. Go to your repository on GitHub
2. Click the "Actions" tab
3. You should see workflows ready to run

### 2. Test It!

Push to main or create a PR:

```bash
git add .
git commit -m "ci: add GitHub Actions workflows"
git push origin main
```

Watch the Actions tab to see your workflows run!

## What Gets Tested

### On Every PR and Push to Main

**Daemon (Node 18.x & 20.x):**
- ✅ Code formatting (Biome)
- ✅ Linting (Biome)
- ✅ Type checking (TypeScript)
- ✅ 590+ unit tests
- ✅ Coverage threshold
- ✅ Build validation

**Plugin (Node 18.x & 20.x):**
- ✅ Code formatting (Biome)
- ✅ Linting (Biome)
- ✅ Type checking (TypeScript)
- ✅ Build validation
- ✅ Manifest validation

## Understanding the Badges

The README uses **dynamic GitHub Actions workflow badges**:

### 1. Daemon CI Badge
```markdown
[![Daemon CI](https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/actions/workflows/daemon-ci.yml/badge.svg)](...)
```
- ✅ **Auto-updates**: Shows real-time pass/fail status
- **Clickable**: Links to latest workflow run
- **Summary shows**: Test count (264 tests), coverage (79%), full logs

### 2. Plugin CI Badge
```markdown
[![Plugin CI](https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/actions/workflows/plugin-ci.yml/badge.svg)](...)
```
- ✅ **Auto-updates**: Shows build pass/fail status
- **Clickable**: Links to latest build
- **Summary shows**: Build artifacts and file sizes

### Why Workflow Badges?

For **private repositories**, GitHub Actions badges are the best solution:
- ✅ Work on private repos (unlike Codecov, Coveralls)
- ✅ Work on forks automatically
- ✅ Zero maintenance - no manual updates needed
- ✅ Built into GitHub - no external services

### Viewing Test Counts & Coverage

1. Click any badge in README
2. Go to workflow run page
3. Check **"Summary"** tab at the top
4. See: Test count, coverage %, build details

### For Forks

Badges automatically work when you fork! If needed, update the org name in `README.md`:

```markdown
<!-- Replace 'CrossGen-AI-Public' with your org/username -->
[![Daemon CI](https://github.com/YOUR_ORG/crossgen-spark/actions/workflows/daemon-ci.yml/badge.svg)](...)
```

## Enforcing Quality (Recommended)

### Require Checks Before Merging

1. Go to Settings → Branches
2. Click "Add branch protection rule"
3. Branch name pattern: `main`
4. Enable: "Require status checks to pass before merging"
5. Select: `test`, `lint-and-typecheck`, `integration`
6. Save

Now PRs must pass all checks before merging! 🎉

## Troubleshooting

### "Workflow file not found"
- Ensure `.github/workflows/daemon-ci.yml` exists
- Push the workflow files to your repository

### Tests fail in CI but pass locally
- Check Node version: CI uses 18.x and 20.x
- Run `npm ci` (not `npm install`) to match CI environment
- Check that `package-lock.json` is committed

### Workflow doesn't trigger
- Workflows only run on pushes/PRs that affect relevant files
- Check that you've pushed the `.github/workflows/` files
- Look in the "Actions" tab for any errors

### Workflows run twice (on PR merge)
- This is **expected behavior** ✅
- When you merge a PR, it triggers twice:
  1. Once for the PR (`pull_request` event)
  2. Once for `main` (`push` event after merge)
- Both runs are useful:
  - PR run: Validates the changes before merge
  - Main run: Validates the merged state
- To see only main runs: Filter by branch in Actions tab

## Local Preview

Test what CI will do, locally:

```bash
# Daemon
cd daemon
npm run check    # Runs: format, lint, type-check, tests

# Plugin  
cd plugin
npm run check    # Runs: format, lint, type-check
```

If these pass locally, they'll pass in CI!

## Next Steps

Once CI/CD is set up:

1. **Make it required**: Add branch protection rules
2. **Customize workflows**: Edit `.github/workflows/*.yml` as needed
3. **Add more checks**: Security scanning, deployment, etc.
4. **Monitor**: Check badge status regularly

## Need Help?

- Check `.github/workflows/README.md` for detailed workflow documentation
- View workflow runs in the "Actions" tab
- See [GitHub Actions docs](https://docs.github.com/en/actions)
- Coverage reports: Run `npm run test:coverage` locally and open `coverage/index.html`

---

**That's it! Your CI/CD is now set up.** 🚀

Every push and PR will be automatically tested. Coverage reports are available in CI logs and locally.

