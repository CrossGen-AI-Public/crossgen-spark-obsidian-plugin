#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse environment flags
SKIP_NODE="${SKIP_NODE:-0}"
SKIP_GH="${SKIP_GH:-0}"
AUTO_START="${AUTO_START:-1}"
DEV_MODE="${DEV_MODE:-0}"  # Set to 1 for development features (hot reload, gh CLI)

# Detect download tool (curl or wget)
if command -v curl &> /dev/null; then
    DOWNLOAD_CMD="curl -fsSL"
elif command -v wget &> /dev/null; then
    DOWNLOAD_CMD="wget -qO-"
else
    echo -e "${RED}✗ Neither curl nor wget found${NC}"
    echo "  Please install curl or wget to continue"
    exit 1
fi

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect if running via curl | bash (no .git directory)
if [ ! -d "$SCRIPT_DIR/.git" ]; then
    echo -e "${YELLOW}→ Running in curl mode - downloading repository...${NC}"
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf '$TEMP_DIR'" EXIT
    
    cd "$TEMP_DIR"
    
    # Use REPO_URL environment variable or default to main repo
    REPO_URL="${REPO_URL:-https://github.com/automazeio/crossgen-spark}"
    REPO_NAME=$(basename "$REPO_URL" .git)
    
    if command -v git &> /dev/null; then
        git clone --depth 1 "$REPO_URL.git"
    else
        # Git not available, download as tarball
        $DOWNLOAD_CMD "$REPO_URL/archive/refs/heads/main.tar.gz" | tar -xz
        mv "$REPO_NAME-main" "$REPO_NAME"
    fi
    
    cd "$REPO_NAME"
    SCRIPT_DIR="$(pwd)"
    echo -e "${GREEN}✓ Repository downloaded${NC}"
    echo ""
fi

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Spark Assistant Installation         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}→ Checking prerequisites...${NC}"

# Install Node.js via nvm if not present
if ! command -v node &> /dev/null; then
    if [ "$SKIP_NODE" = "1" ]; then
        echo -e "${RED}✗ Node.js is not installed (skipped by SKIP_NODE flag)${NC}"
        echo "  Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi
    
    echo -e "${YELLOW}→ Node.js not found, installing via nvm...${NC}"
    
    # Install nvm
    if [ ! -d "$HOME/.nvm" ]; then
        echo -e "${YELLOW}  Installing nvm...${NC}"
        $DOWNLOAD_CMD https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
        echo -e "${GREEN}  ✓ nvm installed${NC}"
    fi
    
    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Install Node.js LTS
    echo -e "${YELLOW}  Installing Node.js LTS...${NC}"
    nvm install --lts 2>&1 | grep -v "^Downloading" | grep -v "^Computing" || true
    nvm use --lts > /dev/null 2>&1
    
    # Ensure node is in PATH for current shell
    export PATH="$NVM_DIR/versions/node/$(nvm current)/bin:$PATH"
    echo -e "${GREEN}  ✓ Node.js $(node -v) installed${NC}"
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

# Install GitHub CLI (development only)
if ! command -v gh &> /dev/null; then
    if [ "$DEV_MODE" != "1" ]; then
        echo -e "${BLUE}ℹ GitHub CLI skipped (not needed for regular use)${NC}"
        echo -e "${BLUE}  For development, run with: DEV_MODE=1 ./install.sh${NC}"
    elif [ "$SKIP_GH" = "1" ]; then
        echo -e "${YELLOW}⚠ GitHub CLI not found (skipped by SKIP_GH flag)${NC}"
    else
        echo -e "${YELLOW}→ Installing GitHub CLI...${NC}"
        
        # Detect OS
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command -v brew &> /dev/null; then
                if brew install gh 2>/dev/null; then
                    echo -e "${GREEN}✓ GitHub CLI installed${NC}"
                else
                    echo -e "${YELLOW}⚠ Failed to install GitHub CLI (continuing anyway)${NC}"
                fi
            else
                echo -e "${YELLOW}⚠ Homebrew not found, skipping GitHub CLI install${NC}"
                echo -e "${YELLOW}  Install Homebrew from https://brew.sh/ and run: brew install gh${NC}"
            fi
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux - detect distro
            if [ -f /etc/debian_version ]; then
                # Debian/Ubuntu
                echo -e "${YELLOW}  Installing for Debian/Ubuntu...${NC}"
                if type sudo &> /dev/null; then
                    (
                        $DOWNLOAD_CMD https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
                        sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
                        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
                        sudo apt update 2>/dev/null
                        sudo apt install gh -y 2>/dev/null
                    ) && echo -e "${GREEN}✓ GitHub CLI installed${NC}" || echo -e "${YELLOW}⚠ Failed to install GitHub CLI (continuing anyway)${NC}"
                else
                    echo -e "${YELLOW}⚠ sudo not available, skipping GitHub CLI install${NC}"
                fi
            elif [ -f /etc/redhat-release ]; then
                # RHEL/Fedora
                echo -e "${YELLOW}  Installing for RHEL/Fedora...${NC}"
                if type sudo &> /dev/null; then
                    (
                        sudo dnf install 'dnf-command(config-manager)' -y 2>/dev/null
                        sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo 2>/dev/null
                        sudo dnf install gh -y 2>/dev/null
                    ) && echo -e "${GREEN}✓ GitHub CLI installed${NC}" || echo -e "${YELLOW}⚠ Failed to install GitHub CLI (continuing anyway)${NC}"
                else
                    echo -e "${YELLOW}⚠ sudo not available, skipping GitHub CLI install${NC}"
                fi
            else
                echo -e "${YELLOW}⚠ Unsupported Linux distribution, skipping GitHub CLI install${NC}"
            fi
        fi
    fi
else
    echo -e "${GREEN}✓ GitHub CLI $(gh --version | head -n1) found${NC}"
fi
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
# cd "$SCRIPT_DIR"
# if [ -d "$SCRIPT_DIR/.githooks" ]; then
#     echo -e "${YELLOW}→ Setting up git hooks...${NC}"
#     git config core.hooksPath .githooks
#     echo -e "${GREEN}✓ Git hooks configured${NC}"
#     echo ""
# fi

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

# Development mode: Install Hot Reload plugin
if [ "$DEV_MODE" = "1" ]; then
    # Create .hotreload file for Hot Reload plugin
    touch "$PLUGIN_DIR/.hotreload"
    
    echo -e "${YELLOW}→ Installing Hot Reload plugin for development...${NC}"
    HOT_RELOAD_DIR="$VAULT_PATH/.obsidian/plugins/hot-reload"
    if [ -d "$HOT_RELOAD_DIR" ]; then
        echo -e "${BLUE}  ℹ Hot Reload already installed, updating...${NC}"
        cd "$HOT_RELOAD_DIR"
        git pull --quiet 2>/dev/null || echo -e "${YELLOW}  ⚠ Could not update (continuing)${NC}"
        cd "$SCRIPT_DIR"
    else
        if command -v git &> /dev/null; then
            git clone --quiet https://github.com/pjeby/hot-reload.git "$HOT_RELOAD_DIR" 2>/dev/null || echo -e "${YELLOW}  ⚠ Could not clone hot-reload (continuing)${NC}"
        else
            echo -e "${YELLOW}  ⚠ Git not available, skipping Hot Reload${NC}"
        fi
    fi
    echo -e "${GREEN}✓ Hot Reload plugin configured${NC}"
fi

echo -e "${GREEN}✓ Plugin installed to: $PLUGIN_DIR${NC}"

# Enable plugins in community-plugins.json
echo -e "${YELLOW}→ Enabling plugins in Obsidian config...${NC}"
COMMUNITY_PLUGINS_FILE="$VAULT_PATH/.obsidian/community-plugins.json"

# Read existing plugins or start with empty list
EXISTING_PLUGINS=""
if [ -f "$COMMUNITY_PLUGINS_FILE" ]; then
    # Extract plugin names from JSON array (simple grep approach)
    EXISTING_PLUGINS=$(grep -o '"[^"]*"' "$COMMUNITY_PLUGINS_FILE" | tr -d '"' | grep -v '^\[' | grep -v '^\]')
fi

# Build new plugin list
PLUGINS=()

# Add hot-reload first if dev mode
if [ "$DEV_MODE" = "1" ]; then
    PLUGINS+=("hot-reload")
fi

# Add existing plugins (excluding hot-reload and spark to avoid duplicates)
if [ -n "$EXISTING_PLUGINS" ]; then
    while IFS= read -r plugin; do
        if [ -n "$plugin" ] && [ "$plugin" != "hot-reload" ] && [ "$plugin" != "spark" ]; then
            PLUGINS+=("$plugin")
        fi
    done <<< "$EXISTING_PLUGINS"
fi

# Add spark
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

# Disable Cmd+K hotkey for insert-link (so Spark chat can use it)
echo -e "${YELLOW}→ Configuring hotkeys...${NC}"
HOTKEYS_FILE="$VAULT_PATH/.obsidian/hotkeys.json"

# Create or update hotkeys.json - ensure Cmd+K is available for Spark
HOTKEY_RESULT=$(node -e "
const fs = require('fs');
const path = '$HOTKEYS_FILE';
let hotkeys = {};

// Read existing hotkeys if file exists
if (fs.existsSync(path)) {
  try {
    hotkeys = JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch (e) {
    // Ignore parse errors, will create new file
  }
}

// Find and remove Cmd+K from any commands that use it
const resolvedConflicts = [];
for (const [command, bindings] of Object.entries(hotkeys)) {
  if (Array.isArray(bindings)) {
    const filteredBindings = bindings.filter(binding => {
      // Handle string format: 'Mod+K' or 'Cmd+K'
      if (typeof binding === 'string') {
        if (binding === 'Mod+K' || binding === 'Cmd+K') {
          resolvedConflicts.push(command);
          return false; // Remove this binding
        }
      }
      // Handle object format: {modifiers: ['Mod'], key: 'K'}
      else if (typeof binding === 'object' && binding !== null) {
        const mods = binding.modifiers || [];
        const key = binding.key || '';
        if ((mods.includes('Mod') || mods.includes('Cmd')) && key === 'K') {
          resolvedConflicts.push(command);
          return false; // Remove this binding
        }
      }
      return true; // Keep other bindings
    });
    hotkeys[command] = filteredBindings;
  }
}

// Disable editor:insert-link to free up Cmd+K
if (!hotkeys['editor:insert-link']) {
  hotkeys['editor:insert-link'] = [];
}

// Ensure spark:toggle-chat has Cmd+K if the entry exists
if (hotkeys.hasOwnProperty('spark:toggle-chat')) {
  hotkeys['spark:toggle-chat'] = [
    {
      modifiers: ['Mod'],
      key: 'K'
    }
  ];
}

// Write updated hotkeys
fs.writeFileSync(path, JSON.stringify(hotkeys, null, 2) + '\n');

// Output results
if (resolvedConflicts.length > 0) {
  console.log('resolved:' + resolvedConflicts.join(','));
} else {
  console.log('ok');
}
")

if echo "$HOTKEY_RESULT" | grep -q "^resolved:"; then
  CONFLICTS=$(echo "$HOTKEY_RESULT" | sed 's/^resolved://')
  echo -e "${GREEN}✓ Cmd+K configured for Spark chat${NC}"
  echo -e "${YELLOW}  → Resolved conflicts: $CONFLICTS${NC}"
else
  echo -e "${GREEN}✓ Cmd+K configured for Spark chat${NC}"
fi
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Installation complete!${NC}"
echo ""

# Auto-start daemon if API key is set and AUTO_START is enabled
if [ "$AUTO_START" = "1" ] && [ -n "$ANTHROPIC_API_KEY" ]; then
    echo -e "${YELLOW}→ Starting daemon in background...${NC}"
    spark start "$VAULT_PATH" > /dev/null 2>&1 &
    DAEMON_PID=$!
    sleep 2
    
    if ps -p $DAEMON_PID > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Daemon started (PID: $DAEMON_PID)${NC}"
        echo ""
        echo -e "${GREEN}🚀 Spark is running!${NC}"
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "  1. Restart Obsidian to load the plugin"
        echo "  2. Configure API key in plugin settings (Settings → Spark)"
        echo "  3. Try typing '@' or '/' in any note"
        echo "  4. Press Cmd+K to open chat"
        echo ""
        echo -e "${YELLOW}Check daemon status:${NC}"
        echo "     spark status $VAULT_PATH"
        echo ""
        echo -e "${YELLOW}View daemon logs:${NC}"
        echo "     spark start $VAULT_PATH --debug"
    else
        echo -e "${YELLOW}⚠ Daemon failed to start${NC}"
        echo "  Start manually with: spark start $VAULT_PATH"
        echo ""
    fi
else
    if [ "$DEV_MODE" = "1" ]; then
        echo -e "${GREEN}Hot Reload is configured and ready to use! 🔥${NC}"
        echo ""
    fi
    
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Restart Obsidian to load the plugin"
    echo "  2. Configure API key in plugin settings (Settings → Spark)"
    echo "  3. Start the daemon:"
    echo "     spark start $VAULT_PATH              # Foreground"
    echo "     spark start $VAULT_PATH &            # Background"
    echo ""
    
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        echo -e "${BLUE}💡 Tip:${NC} ANTHROPIC_API_KEY detected in environment"
        echo "   The daemon can use this, or configure in plugin settings"
        echo ""
    fi
fi

if [ "$DEV_MODE" = "1" ]; then
    echo -e "${YELLOW}For development:${NC}"
    echo "  • Run 'cd plugin && npm run dev' for live plugin editing"
    echo "  • Changes will auto-reload in Obsidian (Hot Reload enabled)"
    echo "  • Use 'spark start $VAULT_PATH --debug &' for daemon debug mode"
    echo ""
fi
echo ""
echo -e "${BLUE}Tip:${NC} To install to a different vault, run:"
echo "     ./install.sh ~/Documents/YourVault"
echo ""
echo -e "${BLUE}Environment flags:${NC}"
echo "     DEV_MODE=1 ./install.sh            # Enable development features (hot reload, gh CLI)"
echo "     SKIP_NODE=1 ./install.sh           # Skip Node.js installation"
echo "     SKIP_GH=1 ./install.sh             # Skip GitHub CLI (only with DEV_MODE=1)"
echo "     AUTO_START=0 ./install.sh          # Skip daemon auto-start"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

