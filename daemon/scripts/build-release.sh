#!/bin/bash
set -e

# Build Release Script for Spark Daemon
# Creates a tarball suitable for GitHub Releases

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON_DIR="$(dirname "$SCRIPT_DIR")"
cd "$DAEMON_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
RELEASE_NAME="spark-daemon-v${VERSION}"
RELEASE_DIR="$DAEMON_DIR/release"
TARBALL="${RELEASE_NAME}.tar.gz"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Building Spark Daemon Release        ║${NC}"
echo -e "${BLUE}║   Version: ${VERSION}                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Clean previous release
echo -e "${YELLOW}→ Cleaning previous release...${NC}"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/$RELEASE_NAME"

# Install production dependencies only
echo -e "${YELLOW}→ Installing production dependencies...${NC}"
rm -rf node_modules
npm ci --omit=dev

# Build TypeScript
echo -e "${YELLOW}→ Building TypeScript...${NC}"
npm run build

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
echo -e "${YELLOW}To upload to GitHub Releases:${NC}"
echo "  1. Create a new release at https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin/releases/new"
echo "  2. Tag: v${VERSION}"
echo "  3. Upload: $RELEASE_DIR/$TARBALL"
echo ""

# Restore dev dependencies for development
echo -e "${YELLOW}→ Restoring dev dependencies...${NC}"
cd "$DAEMON_DIR"
npm install
echo -e "${GREEN}✓ Dev dependencies restored${NC}"

