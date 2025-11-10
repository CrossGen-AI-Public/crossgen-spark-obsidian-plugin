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

# Detect download tool (curl or wget) and save full path
if command -v curl &> /dev/null; then
    CURL_FULL_PATH=$(command -v curl)
    DOWNLOAD_CMD="$CURL_FULL_PATH -fsSL"
    DOWNLOAD_TOOL="curl"
elif command -v wget &> /dev/null; then
    WGET_FULL_PATH=$(command -v wget)
    DOWNLOAD_CMD="$WGET_FULL_PATH -qO-"
    DOWNLOAD_TOOL="wget"
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
    
    # Check if git is actually usable (not just the macOS Xcode stub)
    GIT_USABLE=false
    if command -v git &> /dev/null; then
        GIT_PATH=$(command -v git)
        
        # On macOS, /usr/bin/git is a stub that triggers Xcode popup
        # Check if Xcode Command Line Tools are actually installed
        if [[ "$OSTYPE" == "darwin"* ]] && [ "$GIT_PATH" = "/usr/bin/git" ]; then
            # Check if Xcode CLT is installed by checking for xcode-select path
            if xcode-select -p &> /dev/null; then
                GIT_USABLE=true
            else
                echo -e "${BLUE}ℹ  Git stub detected (would trigger Xcode popup), using tarball download${NC}"
            fi
        else
            # Not macOS stub, assume git works
            GIT_USABLE=true
        fi
    fi
    
    if [ "$GIT_USABLE" = true ]; then
        git clone --depth 1 "$REPO_URL.git"
    else
        # Git not available or would trigger Xcode popup, download as tarball
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
        
        # On macOS without Xcode CLT, nvm installer will exit if it finds /usr/bin/git
        # Work around this by downloading installer to temp file, then running with modified PATH
        NVM_NEEDS_WORKAROUND=false
        if [[ "$OSTYPE" == "darwin"* ]] && [ -f "/usr/bin/git" ] && ! xcode-select -p &> /dev/null; then
            NVM_NEEDS_WORKAROUND=true
            echo -e "${BLUE}  ℹ  Applying macOS workaround (no Xcode CLT detected)${NC}"
        fi
        
        if [ "$NVM_NEEDS_WORKAROUND" = true ]; then
            # Download nvm installer to temp file
            NVM_INSTALLER=$(mktemp)
            if [ "$DOWNLOAD_TOOL" = "curl" ]; then
                "$CURL_FULL_PATH" -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh > "$NVM_INSTALLER"
            else
                "$WGET_FULL_PATH" -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh > "$NVM_INSTALLER"
            fi
            
            # Create temp bin directory with a fake git that does nothing
            # This prevents nvm installer from detecting the git stub and exiting
            TEMP_BIN=$(mktemp -d)
            cat > "$TEMP_BIN/git" << 'EOF'
#!/bin/bash
# Fake git to prevent nvm installer from detecting Xcode CLT requirement
exit 0
EOF
            chmod +x "$TEMP_BIN/git"
            
            # Prepend temp bin to PATH so our fake git is found first
            ORIGINAL_PATH="$PATH"
            PATH="$TEMP_BIN:$PATH"
            export PATH
            
            METHOD=script bash "$NVM_INSTALLER"
            
            # Restore PATH and clean up
            PATH="$ORIGINAL_PATH"
            export PATH
            rm -rf "$TEMP_BIN"
            rm -f "$NVM_INSTALLER"
        else
            # Normal installation
            $DOWNLOAD_CMD https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | METHOD=script bash
        fi
        
        echo -e "${GREEN}  ✓ nvm installed${NC}"
    fi
    
    # Load nvm (nvm.sh may return non-zero exit code, but that's ok)
    export NVM_DIR="$HOME/.nvm"
    set +e
    \. "$NVM_DIR/nvm.sh" 2>/dev/null
    set -e
    
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

# Add npm global bin to PATH so spark command is immediately available
# Try multiple methods to find npm's global bin directory
if command -v npm &> /dev/null; then
    NPM_BIN=$(npm bin -g 2>/dev/null || true)
    if [ -z "$NPM_BIN" ] || [ ! -d "$NPM_BIN" ]; then
        # Fallback: use npm prefix
        NPM_PREFIX=$(npm prefix -g 2>/dev/null || true)
        if [ -n "$NPM_PREFIX" ]; then
            NPM_BIN="$NPM_PREFIX/bin"
        fi
    fi
    if [ -n "$NPM_BIN" ] && [ -d "$NPM_BIN" ]; then
        export PATH="$NPM_BIN:$PATH"
    fi
fi

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
    EXISTING_PLUGINS=$(grep -o '"[^"]*"' "$COMMUNITY_PLUGINS_FILE" 2>/dev/null | tr -d '"' | grep -v '^\[' | grep -v '^\]' || true)
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
PLUGIN_COUNT=${#PLUGINS[@]}

if [ $PLUGIN_COUNT -gt 0 ]; then
    CURRENT_INDEX=0
    for plugin in "${PLUGINS[@]}"; do
        if [ $CURRENT_INDEX -eq $((PLUGIN_COUNT - 1)) ]; then
            echo "  \"$plugin\"" >> "$COMMUNITY_PLUGINS_FILE"
        else
            echo "  \"$plugin\"," >> "$COMMUNITY_PLUGINS_FILE"
        fi
        CURRENT_INDEX=$((CURRENT_INDEX + 1))
    done
fi
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

# Initialize vault structure (.spark directory with config, agents, commands)
echo -e "${YELLOW}→ Initializing vault structure...${NC}"
# Start daemon briefly to trigger initialization, then stop it
spark start "$VAULT_PATH" > /dev/null 2>&1 &
INIT_PID=$!
sleep 3  # Give it time to initialize

# Stop the initialization daemon
if ps -p $INIT_PID > /dev/null 2>&1; then
    kill $INIT_PID 2>/dev/null || true
    sleep 1
fi

# Verify initialization
if [ -f "$VAULT_PATH/.spark/config.yaml" ]; then
    echo -e "${GREEN}✓ Vault initialized${NC}"
else
    echo -e "${YELLOW}⚠ Vault initialization may be incomplete${NC}"
fi
echo ""

# Auto-start daemon if API key is set and AUTO_START is enabled
if [ "$AUTO_START" = "1" ]; then
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

