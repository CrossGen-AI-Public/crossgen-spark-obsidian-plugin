#!/bin/bash
set -e

# Build Release Script for Spark Engine
# Creates a tarball suitable for GitHub Releases

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ENGINE_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
RELEASE_NAME="spark-engine-v${VERSION}"
RELEASE_DIR="$ENGINE_DIR/release"
TARBALL="${RELEASE_NAME}.tar.gz"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Building Spark Engine Release        ║${NC}"
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

# Check if release already exists
if command -v gh &> /dev/null; then
    if gh release view "engine-${VERSION}" --repo CrossGen-AI-Public/crossgen-spark-obsidian-plugin &> /dev/null; then
        echo -e "${RED}✗ Release engine-${VERSION} already exists on GitHub.${NC}"
        echo -e "${RED}  Bump version in package.json first.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ All pre-flight checks passed${NC}"
echo ""

# Clean previous release
echo -e "${YELLOW}→ Cleaning previous release...${NC}"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/$RELEASE_NAME"

# Install all dependencies (need devDeps for build)
echo -e "${YELLOW}→ Installing dependencies...${NC}"
rm -rf node_modules
npm ci

# Build TypeScript
echo -e "${YELLOW}→ Building TypeScript...${NC}"
npm run build

# Reinstall production dependencies only (for release)
echo -e "${YELLOW}→ Stripping dev dependencies...${NC}"
rm -rf node_modules
npm ci --omit=dev

# Copy files to release directory
echo -e "${YELLOW}→ Copying files to release directory...${NC}"
cp -r dist "$RELEASE_DIR/$RELEASE_NAME/"
cp package.json "$RELEASE_DIR/$RELEASE_NAME/"
cp -r node_modules "$RELEASE_DIR/$RELEASE_NAME/"

# Create tarball
echo -e "${YELLOW}→ Creating tarball...${NC}"
cd "$RELEASE_DIR"
tar -czf "$TARBALL" "$RELEASE_NAME"

# Calculate size
SIZE=$(du -h "$TARBALL" | cut -f1)

echo ""
echo -e "${GREEN}✓ Release built successfully!${NC}"
echo ""
echo -e "${BLUE}Release tarball:${NC} $RELEASE_DIR/$TARBALL"
echo -e "${BLUE}Size:${NC} $SIZE"
echo ""

# Restore dev dependencies for development
echo -e "${YELLOW}→ Restoring dev dependencies...${NC}"
cd "$ENGINE_DIR"
npm install
echo -e "${GREEN}✓ Dev dependencies restored${NC}"
echo ""

# Create and push git tag
TAG_NAME="engine-${VERSION}"
echo -e "${YELLOW}→ Creating git tag ${TAG_NAME}...${NC}"
if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    echo -e "${RED}✗ Tag ${TAG_NAME} already exists locally.${NC}"
    exit 1
fi
git tag "$TAG_NAME"
echo -e "${GREEN}✓ Tag ${TAG_NAME} created${NC}"

echo -e "${YELLOW}→ Pushing tag to origin...${NC}"
git push origin "$TAG_NAME"
echo -e "${GREEN}✓ Tag pushed to origin${NC}"
echo ""

# Upload to GitHub Releases
echo -e "${YELLOW}→ Upload to GitHub Releases?${NC}"
read -p "Create release engine-${VERSION} and upload tarball? [y/N] " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}✗ GitHub CLI (gh) not installed. Install with: brew install gh${NC}"
        exit 1
    fi

    echo -e "${YELLOW}→ Creating GitHub release engine-${VERSION}...${NC}"
    gh release create "engine-${VERSION}" \
        "$RELEASE_DIR/$TARBALL" \
        --title "Engine ${VERSION}" \
        --notes "Spark Engine v${VERSION}" \
        --repo CrossGen-AI-Public/crossgen-spark-obsidian-plugin

    echo -e "${GREEN}✓ Release engine-${VERSION} published to GitHub!${NC}"
else
    echo -e "${BLUE}Skipped GitHub upload. To upload manually:${NC}"
    echo "  gh release create engine-${VERSION} $RELEASE_DIR/$TARBALL --title \"Engine ${VERSION}\""
fi

