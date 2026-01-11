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
    REPO_URL="${REPO_URL:-https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin}"
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

# Install engine
echo -e "${YELLOW}→ Installing engine...${NC}"
cd "$SCRIPT_DIR/engine"
npm install
echo -e "${GREEN}✓ Engine dependencies installed${NC}"

echo -e "${YELLOW}→ Building engine...${NC}"
npm run build
echo -e "${GREEN}✓ Engine built successfully${NC}"

echo -e "${YELLOW}→ Making CLI executable...${NC}"
chmod +x dist/cli.js
echo -e "${GREEN}✓ CLI permissions set${NC}"

echo -e "${YELLOW}→ Installing engine globally...${NC}"

# Check if npm global directory is writable
NPM_PREFIX=$(npm prefix -g 2>/dev/null || echo "")
if [ -n "$NPM_PREFIX" ] && [ ! -w "$NPM_PREFIX" ]; then
    echo -e "${YELLOW}  npm global directory requires sudo, configuring user-level prefix...${NC}"
    # Configure npm to use user directory for global packages
    NPM_PREFIX="$HOME/.npm-global"
    mkdir -p "$NPM_PREFIX"
    npm config set prefix "$NPM_PREFIX"
    echo -e "${GREEN}  ✓ Configured npm prefix: $NPM_PREFIX${NC}"
fi

# If a legacy/broken global `spark` binary exists (usually from the old spark-daemon),
# remove it so `npm install -g` doesn't fail with EEXIST.
#
# Common failure case:
#   ~/.nvm/.../bin/spark -> ../lib/node_modules/spark-daemon/dist/cli.js (broken or stale)
#
# We only remove it when it clearly points to the daemon install, or is a broken symlink.
NPM_PREFIX=$(npm prefix -g 2>/dev/null || echo "")
EXISTING_GLOBAL_SPARK=""
if [ -n "$NPM_PREFIX" ]; then
    EXISTING_GLOBAL_SPARK="$NPM_PREFIX/bin/spark"
fi

if [ -n "$EXISTING_GLOBAL_SPARK" ] && [ -L "$EXISTING_GLOBAL_SPARK" ]; then
    EXISTING_TARGET=$(readlink "$EXISTING_GLOBAL_SPARK" 2>/dev/null || echo "")
    if [[ "$EXISTING_TARGET" == *"spark-daemon"* ]] || [[ "$EXISTING_TARGET" == *"/.spark/daemon/"* ]]; then
        rm -f "$EXISTING_GLOBAL_SPARK"
        echo -e "${GREEN}✓ Removed legacy global spark symlink (daemon) to allow engine install${NC}"
    else
        # Broken symlink (readlink ok but target missing) can also block install
        if [ ! -e "$EXISTING_GLOBAL_SPARK" ]; then
            rm -f "$EXISTING_GLOBAL_SPARK"
            echo -e "${GREEN}✓ Removed broken global spark symlink to allow engine install${NC}"
        fi
    fi
fi

# Use npm pack + install to ensure files are copied, not symlinked
TARBALL=$(npm pack --silent)
npm install -g "$TARBALL"
rm "$TARBALL"

# Add npm global bin to PATH so spark command is immediately available
# First check npm global prefix (where spark was installed)
NPM_PREFIX=$(npm prefix -g 2>/dev/null || echo "")
if [ -n "$NPM_PREFIX" ] && [ -f "$NPM_PREFIX/bin/spark" ]; then
    export PATH="$NPM_PREFIX/bin:$PATH"
    echo -e "${GREEN}✓ Engine installed globally${NC}"
    echo -e "${BLUE}  npm global bin: $NPM_PREFIX/bin${NC}"
    echo -e "${GREEN}✓ spark binary found at $NPM_PREFIX/bin/spark${NC}"
else
    # Fallback to node bin directory
    NODE_BIN_DIR=$(dirname "$(which node 2>/dev/null)")
    if [ -n "$NODE_BIN_DIR" ]; then
        export PATH="$NODE_BIN_DIR:$PATH"
        echo -e "${GREEN}✓ Engine installed globally${NC}"
        echo -e "${BLUE}  Node bin dir: $NODE_BIN_DIR${NC}"
        
        # Verify spark was installed
        if [ -f "$NODE_BIN_DIR/spark" ]; then
            echo -e "${GREEN}✓ spark binary found at $NODE_BIN_DIR/spark${NC}"
        else
            echo -e "${YELLOW}⚠ spark not found in $NODE_BIN_DIR${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Could not detect node bin directory${NC}"
    fi
fi

# Final verification
SPARK_PATH=""
if command -v spark &> /dev/null; then
    SPARK_PATH=$(which spark)
    echo -e "${GREEN}✓ spark command is available: $SPARK_PATH${NC}"
else
    echo -e "${RED}✗ spark command not available${NC}"
    echo -e "${YELLOW}  Debug: PATH=$PATH${NC}"
fi

# If a legacy /usr/local/bin/spark symlink is shadowing the newly installed engine,
# replace it (only when it clearly points to the old daemon install).
#
# This happens when users previously installed Spark Daemon, which created:
#   /usr/local/bin/spark -> ~/.spark/daemon/dist/cli.js
# and /usr/local/bin appears earlier in PATH than npm's global bin.
ENGINE_SPARK_BIN=""
NPM_PREFIX=$(npm prefix -g 2>/dev/null || echo "")
if [ -n "$NPM_PREFIX" ] && [ -f "$NPM_PREFIX/bin/spark" ]; then
    ENGINE_SPARK_BIN="$NPM_PREFIX/bin/spark"
fi

LEGACY_SPARK_SYMLINK="/usr/local/bin/spark"
if [ -n "$ENGINE_SPARK_BIN" ] && [ -L "$LEGACY_SPARK_SYMLINK" ]; then
    LEGACY_TARGET=$(readlink "$LEGACY_SPARK_SYMLINK" 2>/dev/null || echo "")
    if [[ "$LEGACY_TARGET" == *"/.spark/daemon/"* ]]; then
        if [ -w "/usr/local/bin" ]; then
            ln -sf "$ENGINE_SPARK_BIN" "$LEGACY_SPARK_SYMLINK"
            echo -e "${GREEN}✓ Replaced legacy spark symlink with engine: $LEGACY_SPARK_SYMLINK -> $ENGINE_SPARK_BIN${NC}"
        else
            echo -e "${YELLOW}⚠ Detected legacy spark symlink pointing to daemon:${NC}"
            echo -e "${YELLOW}  $LEGACY_SPARK_SYMLINK -> $LEGACY_TARGET${NC}"
            echo -e "${YELLOW}  But /usr/local/bin is not writable; remove/replace it manually to use the engine.${NC}"
        fi
    fi
fi

# Add to shell profile so spark is available permanently
SHELL_PROFILE=""
if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ] || [ "$SHELL" = "/usr/bin/zsh" ]; then
    SHELL_PROFILE="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ] || [ "$SHELL" = "/usr/bin/bash" ]; then
    SHELL_PROFILE="$HOME/.bashrc"
fi

if [ -n "$SHELL_PROFILE" ]; then
    # Check if nvm is already configured (it should be from nvm installation)
    if grep -q "NVM_DIR" "$SHELL_PROFILE" 2>/dev/null; then
        echo -e "${GREEN}✓ nvm configured in $SHELL_PROFILE${NC}"
    else
        # nvm not found - add it manually
        echo -e "${YELLOW}→ Adding nvm to $SHELL_PROFILE...${NC}"
        cat >> "$SHELL_PROFILE" << 'EOF'

# nvm configuration (added by Spark installer)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
EOF
        echo -e "${GREEN}✓ nvm added to $SHELL_PROFILE${NC}"
    fi
    
    # Check if npm global bin needs to be added to PATH
    NPM_PREFIX=$(npm prefix -g 2>/dev/null || echo "")
    if [ -n "$NPM_PREFIX" ] && [ "$NPM_PREFIX" != "/usr/local" ] && [ "$NPM_PREFIX" != "/usr" ]; then
        # Custom npm prefix (not system default) - add to PATH
        if ! grep -q "npm-global" "$SHELL_PROFILE" 2>/dev/null; then
            echo -e "${YELLOW}→ Adding npm global bin to $SHELL_PROFILE...${NC}"
            cat >> "$SHELL_PROFILE" << EOF

# npm global bin (added by Spark installer)
export PATH="$NPM_PREFIX/bin:\$PATH"
EOF
            echo -e "${GREEN}✓ npm global bin added to PATH${NC}"
        fi
    fi
    
    echo -e "${GREEN}✓ spark command will be available in new shells${NC}"
    
    # Source the profile to make spark available immediately
    echo -e "${YELLOW}→ Loading shell configuration...${NC}"
    set +e
    if [ -f "$SHELL_PROFILE" ]; then
        . "$SHELL_PROFILE" 2>/dev/null || true
    fi
    set -e
    
    # Re-check if spark is now available
    if command -v spark &> /dev/null; then
        echo -e "${GREEN}✓ spark command is now available!${NC}"
    else
        echo -e "${YELLOW}⚠ spark not immediately available - open a new terminal${NC}"
    fi
fi
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

# Temporarily disable exit on error for this section
set +e

# Read existing plugins or start with empty list
EXISTING_PLUGINS=""
if [ -f "$COMMUNITY_PLUGINS_FILE" ]; then
    # Extract plugin names from JSON array (simple grep approach)
    EXISTING_PLUGINS=$(grep -o '"[^"]*"' "$COMMUNITY_PLUGINS_FILE" 2>/dev/null | tr -d '"' | grep -v '^\[' | grep -v '^\]')
fi

# Re-enable exit on error
set -e

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

# Provide clear instructions for making spark available
echo -e "${YELLOW}⚠️  IMPORTANT: To use the 'spark' command${NC}"
echo ""
echo -e "${GREEN}Run this in your current terminal:${NC}"
echo -e "${BLUE}    source ~/.zshrc${NC}"
echo ""
echo -e "Or open a new terminal window (spark will be available automatically)"
echo ""

# Initialize vault structure (.spark directory with config, agents, commands)
echo -e "${YELLOW}→ Initializing vault structure...${NC}"

# Use full path to spark binary since PATH might not be updated in this shell
SPARK_BIN=""
if command -v spark &> /dev/null; then
    SPARK_BIN="spark"
elif [ -n "$NODE_BIN_DIR" ] && [ -f "$NODE_BIN_DIR/spark" ]; then
    SPARK_BIN="$NODE_BIN_DIR/spark"
fi

if [ -n "$SPARK_BIN" ]; then
    # Start engine briefly to trigger initialization, then stop it
    "$SPARK_BIN" start "$VAULT_PATH" > /dev/null 2>&1 &
    INIT_PID=$!
    sleep 3  # Give it time to initialize
    
    # Stop the initialization engine
    if ps -p $INIT_PID > /dev/null 2>&1; then
        kill $INIT_PID 2>/dev/null || true
        sleep 1
    fi
fi

# Verify initialization
if [ -f "$VAULT_PATH/.spark/config.yaml" ]; then
    echo -e "${GREEN}✓ Vault initialized${NC}"
else
    echo -e "${YELLOW}⚠ Vault initialization may be incomplete${NC}"
    echo "  Vault will be initialized when engine starts for the first time"
fi
echo ""

# Auto-start engine if API key is set and AUTO_START is enabled
if [ "$AUTO_START" = "1" ]; then
    # Use the spark binary we found earlier (either in PATH or full path)
    if [ -z "$SPARK_BIN" ]; then
        echo -e "${YELLOW}⚠ spark command not found, skipping auto-start${NC}"
        echo "  Run: source ~/.zshrc"
        echo "  Then: spark start $VAULT_PATH &"
        echo ""
    else
        echo -e "${YELLOW}→ Starting engine in background...${NC}"
        
        # Try to start engine and capture any errors
        ENGINE_LOG=$(mktemp)
        "$SPARK_BIN" start "$VAULT_PATH" > "$ENGINE_LOG" 2>&1 &
        ENGINE_PID=$!
        sleep 2
        
        if ps -p $ENGINE_PID > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Engine started (PID: $ENGINE_PID)${NC}"
            rm -f "$ENGINE_LOG"
            echo ""
            echo -e "${GREEN}🚀 Spark is running!${NC}"
            echo ""
            echo -e "${YELLOW}Next steps:${NC}"
            echo "  1. Restart Obsidian to load the plugin"
            echo "  2. Configure API key in plugin settings (Settings → Spark)"
            echo "  3. Try typing '@' or '/' in any note"
            echo "  4. Press Cmd+K to open chat"
            echo ""
            echo -e "${YELLOW}Check engine status:${NC}"
            echo "     spark status $VAULT_PATH"
            echo ""
            echo -e "${YELLOW}View engine logs:${NC}"
            echo "     spark start $VAULT_PATH --debug"
        else
            echo -e "${YELLOW}⚠ Engine failed to start${NC}"
            echo ""
            if [ -s "$ENGINE_LOG" ]; then
                echo -e "${YELLOW}Error output:${NC}"
                cat "$ENGINE_LOG"
                echo ""
            fi
            rm -f "$ENGINE_LOG"
            echo "  After running: source ~/.zshrc"
            echo "  Start manually with: spark start $VAULT_PATH"
            echo ""
        fi
    fi
else
    if [ "$DEV_MODE" = "1" ]; then
        echo -e "${GREEN}Hot Reload is configured and ready to use! 🔥${NC}"
        echo ""
    fi
    
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Restart Obsidian to load the plugin"
    echo "  2. Configure API key in plugin settings (Settings → Spark)"
    echo "  3. In your current terminal, run: source ~/.zshrc"
    echo "  4. Start the engine:"
    echo "     spark start $VAULT_PATH              # Foreground"
    echo "     spark start $VAULT_PATH &            # Background"
    echo ""
    
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        echo -e "${BLUE}💡 Tip:${NC} ANTHROPIC_API_KEY detected in environment"
        echo "   The engine can use this, or configure in plugin settings"
        echo ""
    fi
fi

if [ "$DEV_MODE" = "1" ]; then
    echo -e "${YELLOW}For development:${NC}"
    echo "  • Run 'cd plugin && npm run dev' for live plugin editing"
    echo "  • Changes will auto-reload in Obsidian (Hot Reload enabled)"
    echo "  • Use 'spark start $VAULT_PATH --debug &' for engine debug mode"
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
echo "     AUTO_START=0 ./install.sh          # Skip engine auto-start"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

