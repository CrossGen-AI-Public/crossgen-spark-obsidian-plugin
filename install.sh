#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Spark Assistant Installation         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}→ Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "  Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js version $NODE_VERSION is too old${NC}"
    echo "  Please upgrade to Node.js 18+ from https://nodejs.org/"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) found${NC}"
echo -e "${GREEN}✓ npm $(npm -v) found${NC}"
echo ""

# Install daemon
echo -e "${YELLOW}→ Installing daemon...${NC}"
cd "$SCRIPT_DIR/daemon"
npm install
echo -e "${GREEN}✓ Daemon dependencies installed${NC}"

echo -e "${YELLOW}→ Building daemon...${NC}"
npm run build
echo -e "${GREEN}✓ Daemon built successfully${NC}"

echo -e "${YELLOW}→ Linking daemon globally...${NC}"
npm link
echo -e "${GREEN}✓ Daemon linked globally (spark command available)${NC}"
echo ""

# Install plugin
echo -e "${YELLOW}→ Installing plugin...${NC}"
cd "$SCRIPT_DIR/plugin"
npm install --legacy-peer-deps
echo -e "${GREEN}✓ Plugin dependencies installed${NC}"

echo -e "${YELLOW}→ Building plugin...${NC}"
npm run build
echo -e "${GREEN}✓ Plugin built successfully${NC}"
echo ""

# Check if vault path is provided
if [ -n "$1" ]; then
    VAULT_PATH="$1"
    
    # Expand ~ to home directory
    VAULT_PATH="${VAULT_PATH/#\~/$HOME}"
    
    if [ ! -d "$VAULT_PATH" ]; then
        echo -e "${RED}✗ Vault path does not exist: $VAULT_PATH${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}→ Installing plugin to vault...${NC}"
    PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/spark"
    mkdir -p "$PLUGIN_DIR"
    cp -r "$SCRIPT_DIR/plugin/dist/"* "$PLUGIN_DIR/"
    echo -e "${GREEN}✓ Plugin installed to: $PLUGIN_DIR${NC}"
    echo ""
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ Installation complete!${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Set your API key:"
    echo "     export ANTHROPIC_API_KEY=your_key_here"
    echo ""
    echo "  2. Enable plugin in Obsidian:"
    echo "     Settings → Community plugins → Enable 'Spark'"
    echo ""
    echo "  3. Start the daemon:"
    echo "     spark start $VAULT_PATH              # Foreground"
    echo "     spark start $VAULT_PATH &            # Background"
    echo ""
    echo "  4. Test with debug mode:"
    echo "     spark start $VAULT_PATH --debug &"
else
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ Build complete!${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Set your API key:"
    echo "     export ANTHROPIC_API_KEY=your_key_here"
    echo ""
    echo "  2. Install plugin to your vault:"
    echo "     mkdir -p ~/Documents/YourVault/.obsidian/plugins/spark"
    echo "     cp -r $SCRIPT_DIR/plugin/dist/* ~/Documents/YourVault/.obsidian/plugins/spark/"
    echo ""
    echo "  3. Enable plugin in Obsidian:"
    echo "     Settings → Community plugins → Enable 'Spark'"
    echo ""
    echo "  4. Start the daemon:"
    echo "     spark start ~/Documents/YourVault              # Foreground"
    echo "     spark start ~/Documents/YourVault &            # Background"
    echo ""
    echo -e "${BLUE}Tip:${NC} Run this script with your vault path to auto-install:"
    echo "     ./install.sh ~/Documents/YourVault"
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

