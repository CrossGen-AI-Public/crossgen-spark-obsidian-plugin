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

echo -e "${YELLOW}→ Making CLI executable...${NC}"
chmod +x dist/cli.js
echo -e "${GREEN}✓ CLI permissions set${NC}"

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

# Set up git hooks
cd "$SCRIPT_DIR"
if [ -d "$SCRIPT_DIR/.githooks" ]; then
    echo -e "${YELLOW}→ Setting up git hooks...${NC}"
    git config core.hooksPath .githooks
    echo -e "${GREEN}✓ Git hooks configured${NC}"
    echo ""
fi

# Check if vault path is provided, default to example-vault
if [ -n "$1" ]; then
    VAULT_PATH="$1"
    # Expand ~ to home directory
    VAULT_PATH="${VAULT_PATH/#\~/$HOME}"
else
    # Default to example-vault for development
    VAULT_PATH="$SCRIPT_DIR/example-vault"
    echo -e "${BLUE}ℹ  No vault path specified, using example-vault for development${NC}"
    echo ""
fi

if [ ! -d "$VAULT_PATH" ]; then
    echo -e "${RED}✗ Vault path does not exist: $VAULT_PATH${NC}"
    exit 1
fi

echo -e "${YELLOW}→ Installing plugin to vault...${NC}"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/spark"
mkdir -p "$PLUGIN_DIR"
cp -r "$SCRIPT_DIR/plugin/dist/"* "$PLUGIN_DIR/"

# Create .hotreload file for Hot Reload plugin
touch "$PLUGIN_DIR/.hotreload"

echo -e "${GREEN}✓ Plugin installed to: $PLUGIN_DIR${NC}"

# Install Hot Reload plugin for development
echo -e "${YELLOW}→ Installing Hot Reload plugin for development...${NC}"
HOT_RELOAD_DIR="$VAULT_PATH/.obsidian/plugins/hot-reload"
if [ -d "$HOT_RELOAD_DIR" ]; then
    echo -e "${BLUE}  ℹ Hot Reload already installed, updating...${NC}"
    cd "$HOT_RELOAD_DIR"
    git pull --quiet
    cd "$SCRIPT_DIR"
else
    git clone --quiet https://github.com/pjeby/hot-reload.git "$HOT_RELOAD_DIR"
fi
echo -e "${GREEN}✓ Hot Reload plugin installed${NC}"

# Enable plugins in community-plugins.json
echo -e "${YELLOW}→ Enabling plugins in Obsidian config...${NC}"
COMMUNITY_PLUGINS_FILE="$VAULT_PATH/.obsidian/community-plugins.json"

# Read existing plugins or start with empty list
EXISTING_PLUGINS=""
if [ -f "$COMMUNITY_PLUGINS_FILE" ]; then
    # Extract plugin names from JSON array (simple grep approach)
    EXISTING_PLUGINS=$(grep -o '"[^"]*"' "$COMMUNITY_PLUGINS_FILE" | tr -d '"' | grep -v '^\[' | grep -v '^\]')
fi

# Build new plugin list (hot-reload first, then existing, then spark if not present)
PLUGINS=()
PLUGINS+=("hot-reload")

# Add existing plugins (excluding hot-reload and spark to avoid duplicates)
if [ -n "$EXISTING_PLUGINS" ]; then
    while IFS= read -r plugin; do
        if [ -n "$plugin" ] && [ "$plugin" != "hot-reload" ] && [ "$plugin" != "spark" ]; then
            PLUGINS+=("$plugin")
        fi
    done <<< "$EXISTING_PLUGINS"
fi

PLUGINS+=("spark")

# Write JSON file (using compatible array syntax)
echo "[" > "$COMMUNITY_PLUGINS_FILE"
PLUGIN_COUNT=0
for plugin in "${PLUGINS[@]}"; do
    PLUGIN_COUNT=$((PLUGIN_COUNT + 1))
done

CURRENT_INDEX=0
for plugin in "${PLUGINS[@]}"; do
    if [ $CURRENT_INDEX -eq $((PLUGIN_COUNT - 1)) ]; then
        echo "  \"$plugin\"" >> "$COMMUNITY_PLUGINS_FILE"
    else
        echo "  \"$plugin\"," >> "$COMMUNITY_PLUGINS_FILE"
    fi
    CURRENT_INDEX=$((CURRENT_INDEX + 1))
done
echo "]" >> "$COMMUNITY_PLUGINS_FILE"

echo -e "${GREEN}✓ Plugins enabled in config${NC}"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Installation complete!${NC}"
echo ""
echo -e "${GREEN}Hot Reload is configured and ready to use! 🔥${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Restart Obsidian to load both plugins"
echo ""
echo "  2. Set your API key:"
echo "     export ANTHROPIC_API_KEY=your_key_here"
echo ""
echo "  3. Start the daemon:"
echo "     spark start $VAULT_PATH              # Foreground"
echo "     spark start $VAULT_PATH &            # Background"
echo ""
echo -e "${YELLOW}For development:${NC}"
echo "  • Run 'cd plugin && npm run dev' for live plugin editing"
echo "  • Changes will auto-reload in Obsidian (Hot Reload enabled)"
echo "  • Use 'spark start $VAULT_PATH --debug &' for daemon debug mode"
echo ""
echo -e "${BLUE}Tip:${NC} To install to a different vault, run:"
echo "     ./install.sh ~/Documents/YourVault"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

