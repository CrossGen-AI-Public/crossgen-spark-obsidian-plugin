# CI/CD Setup Guide

This guide will help you set up continuous integration, testing, and coverage badges for Spark.

## Quick Setup (2 minutes)

### 1. Update Workflow Files

In `.github/workflows/daemon-ci.yml` and `.github/workflows/plugin-ci.yml`, no changes needed - they work out of the box!

### 2. Update Badges (Optional)

In `README.md`, replace `YOUR_USERNAME` with your GitHub username if you want the badge links to work:

```markdown
[![Daemon Tests](https://img.shields.io/badge/daemon%20tests-264%20passing-brightgreen)](https://github.com/YOUR_USERNAME/crossgen-spark/actions/workflows/daemon-ci.yml)
```

### 3. Enable GitHub Actions

Actions should be enabled by default. Verify:
1. Go to your repository on GitHub
2. Click the "Actions" tab
3. You should see workflows ready to run

### 4. Test It!

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
- ✅ Code formatting (Prettier)
- ✅ Linting (ESLint)
- ✅ Type checking (TypeScript)
- ✅ 264 unit tests
- ✅ 79% coverage threshold
- ✅ Build validation

**Plugin (Node 18.x & 20.x):**
- ✅ Code formatting (Prettier)
- ✅ Linting (ESLint)
- ✅ Type checking (TypeScript)
- ✅ Build validation
- ✅ Manifest validation

## Understanding the Badges

You'll see three static badges in your README:

### 1. Daemon Tests Badge
```markdown
[![Daemon Tests](https://img.shields.io/badge/daemon%20tests-264%20passing-brightgreen)]
```
- 🟢 **Green**: Shows total passing tests
- Click to go to GitHub Actions workflow runs

### 2. Plugin Build Badge
```markdown
[![Plugin Build](https://img.shields.io/badge/plugin-build%20passing-brightgreen)]
```
- 🟢 **Green**: Plugin builds successfully
- Click to go to GitHub Actions workflow runs

### 3. Coverage Badge
```markdown
![Coverage](https://img.shields.io/badge/coverage-79%25-brightgreen)
```
- 🟢 **Green**: Shows test coverage percentage
- Update manually when coverage changes
- Coverage details available in CI logs and local `coverage/` folder

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

### Coverage number is outdated
- Badges are static - update manually when coverage changes
- Run `npm run test:coverage` locally to see current coverage
- Check CI logs for "Coverage Summary" output

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

