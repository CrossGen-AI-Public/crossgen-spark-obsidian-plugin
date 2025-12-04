#!/bin/bash
set -e

# Build Release Script for Spark Plugin
# Creates individual files for Obsidian Community Plugin release

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PLUGIN_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get version from manifest.json (at repo root for Obsidian validation)
VERSION=$(node -p "require('../manifest.json').version")

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Building Spark Plugin Release        ║${NC}"
echo -e "${BLUE}║   Version: ${VERSION}                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Pre-flight checks
echo -e "${YELLOW}→ Running pre-flight checks...${NC}"

# Check for clean working directory
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}✗ Working directory is not clean. Commit or stash changes first.${NC}"
    exit 1
fi

# Check we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo -e "${RED}✗ Not on main branch (currently on: $CURRENT_BRANCH). Switch to main first.${NC}"
    exit 1
fi

# Check local is up-to-date with remote
git fetch origin main --quiet
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse origin/main)
if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
    echo -e "${RED}✗ Local main is not in sync with origin/main.${NC}"
    echo -e "${RED}  Local:  $LOCAL_SHA${NC}"
    echo -e "${RED}  Remote: $REMOTE_SHA${NC}"
    echo -e "${RED}  Run: git pull origin main${NC}"
    exit 1
fi

# Check if release already exists (no 'v' prefix for Obsidian!)
if command -v gh &> /dev/null; then
    if gh release view "${VERSION}" --repo CrossGen-AI-Public/crossgen-spark-obsidian-plugin &> /dev/null; then
        echo -e "${RED}✗ Release ${VERSION} already exists on GitHub.${NC}"
        echo -e "${RED}  Bump version in manifest.json first.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ All pre-flight checks passed${NC}"
echo ""

# Build plugin
echo -e "${YELLOW}→ Building plugin...${NC}"
npm run build

# Verify build output
echo -e "${YELLOW}→ Verifying build output...${NC}"
if [[ ! -f "dist/main.js" ]]; then
    echo -e "${RED}✗ dist/main.js not found${NC}"
    exit 1
fi
if [[ ! -f "dist/manifest.json" ]]; then
    echo -e "${RED}✗ dist/manifest.json not found${NC}"
    exit 1
fi
if [[ ! -f "dist/styles.css" ]]; then
    echo -e "${RED}✗ dist/styles.css not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Build successful${NC}"
echo ""

# Show file sizes
echo -e "${BLUE}Build artifacts:${NC}"
ls -lh dist/*.js dist/*.json dist/*.css 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
echo ""

# Upload to GitHub Releases
echo -e "${YELLOW}→ Upload to GitHub Releases?${NC}"
read -p "Create release ${VERSION} and upload files? [y/N] " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}✗ GitHub CLI (gh) not installed. Install with: brew install gh${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}→ Creating GitHub release ${VERSION}...${NC}"
    gh release create "${VERSION}" \
        dist/main.js \
        dist/manifest.json \
        dist/styles.css \
        --title "${VERSION}" \
        --notes "Spark Plugin v${VERSION}" \
        --repo CrossGen-AI-Public/crossgen-spark-obsidian-plugin
    
    echo -e "${GREEN}✓ Release ${VERSION} published to GitHub!${NC}"
    echo ""
    echo -e "${BLUE}Release URL:${NC}"
    echo "  https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/releases/tag/${VERSION}"
else
    echo -e "${BLUE}Skipped GitHub upload. To upload manually:${NC}"
    echo "  gh release create ${VERSION} dist/main.js dist/manifest.json dist/styles.css --title \"${VERSION}\""
fi

