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
        if [[ "$OSTYPE" == "darwin"* ]] && [ "$GIT_PATH" = "/usr/bin/git" ]; then
            if xcode-select -p &> /dev/null; then
                GIT_USABLE=true
            else
                echo -e "${BLUE}ℹ  Git stub detected (would trigger Xcode popup), using tarball download${NC}"
            fi
        else
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
echo -e "${BLUE}║   Spark Daemon Installation            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}This script installs the Spark daemon only.${NC}"
echo -e "${BLUE}For the Obsidian plugin, install from Community Plugins.${NC}"
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
            
            # Create temp bin directory with a fake git
            TEMP_BIN=$(mktemp -d)
            cat > "$TEMP_BIN/git" << 'EOF'
#!/bin/bash
exit 0
EOF
            chmod +x "$TEMP_BIN/git"
            
            ORIGINAL_PATH="$PATH"
            PATH="$TEMP_BIN:$PATH"
            export PATH
            
            METHOD=script bash "$NVM_INSTALLER"
            
            PATH="$ORIGINAL_PATH"
            export PATH
            rm -rf "$TEMP_BIN"
            rm -f "$NVM_INSTALLER"
        else
            $DOWNLOAD_CMD https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | METHOD=script bash
        fi
        
        echo -e "${GREEN}  ✓ nvm installed${NC}"
    fi
    
    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    set +e
    \. "$NVM_DIR/nvm.sh" 2>/dev/null
    set -e
    
    # Install Node.js LTS
    echo -e "${YELLOW}  Installing Node.js LTS...${NC}"
    nvm install --lts 2>&1 | grep -v "^Downloading" | grep -v "^Computing" || true
    nvm use --lts > /dev/null 2>&1
    
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

echo -e "${YELLOW}→ Installing daemon globally...${NC}"

# Check if npm global directory is writable
NPM_PREFIX=$(npm prefix -g 2>/dev/null || echo "")
if [ -n "$NPM_PREFIX" ] && [ ! -w "$NPM_PREFIX" ]; then
    echo -e "${YELLOW}  npm global directory requires sudo, configuring user-level prefix...${NC}"
    NPM_PREFIX="$HOME/.npm-global"
    mkdir -p "$NPM_PREFIX"
    npm config set prefix "$NPM_PREFIX"
    echo -e "${GREEN}  ✓ Configured npm prefix: $NPM_PREFIX${NC}"
fi

# Use npm pack + install to ensure files are copied
TARBALL=$(npm pack --silent)
npm install -g "$TARBALL"
rm "$TARBALL"

# Add npm global bin to PATH
NPM_PREFIX=$(npm prefix -g 2>/dev/null || echo "")
if [ -n "$NPM_PREFIX" ] && [ -f "$NPM_PREFIX/bin/spark" ]; then
    export PATH="$NPM_PREFIX/bin:$PATH"
    echo -e "${GREEN}✓ Daemon installed globally${NC}"
    echo -e "${BLUE}  npm global bin: $NPM_PREFIX/bin${NC}"
    echo -e "${GREEN}✓ spark binary found at $NPM_PREFIX/bin/spark${NC}"
else
    NODE_BIN_DIR=$(dirname "$(which node 2>/dev/null)")
    if [ -n "$NODE_BIN_DIR" ]; then
        export PATH="$NODE_BIN_DIR:$PATH"
        echo -e "${GREEN}✓ Daemon installed globally${NC}"
        echo -e "${BLUE}  Node bin dir: $NODE_BIN_DIR${NC}"
        
        if [ -f "$NODE_BIN_DIR/spark" ]; then
            echo -e "${GREEN}✓ spark binary found at $NODE_BIN_DIR/spark${NC}"
        else
            echo -e "${YELLOW}⚠ spark not found in $NODE_BIN_DIR${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Could not detect node bin directory${NC}"
    fi
fi

# Verify spark command is available
SPARK_PATH=""
if command -v spark &> /dev/null; then
    SPARK_PATH=$(which spark)
    echo -e "${GREEN}✓ spark command is available: $SPARK_PATH${NC}"
else
    echo -e "${RED}✗ spark command not available${NC}"
    echo -e "${YELLOW}  Debug: PATH=$PATH${NC}"
fi

# Add to shell profile
SHELL_PROFILE=""
if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ] || [ "$SHELL" = "/usr/bin/zsh" ]; then
    SHELL_PROFILE="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ] || [ "$SHELL" = "/usr/bin/bash" ]; then
    SHELL_PROFILE="$HOME/.bashrc"
fi

if [ -n "$SHELL_PROFILE" ]; then
    # Check if nvm is already configured
    if grep -q "NVM_DIR" "$SHELL_PROFILE" 2>/dev/null; then
        echo -e "${GREEN}✓ nvm configured in $SHELL_PROFILE${NC}"
    else
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
fi
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Spark daemon installation complete!${NC}"
echo ""

echo -e "${YELLOW}⚠️  IMPORTANT: To use the 'spark' command${NC}"
echo ""
echo -e "${GREEN}Run this in your current terminal:${NC}"
if [ -n "$SHELL_PROFILE" ]; then
    echo -e "${BLUE}    source $SHELL_PROFILE${NC}"
else
    echo -e "${BLUE}    source ~/.bashrc  # or ~/.zshrc${NC}"
fi
echo ""
echo -e "Or open a new terminal window (spark will be available automatically)"
echo ""

echo -e "${YELLOW}Verify installation:${NC}"
echo "    spark --version"
echo ""

echo -e "${YELLOW}Start the daemon:${NC}"
echo "    spark start ~/YourVault              # Foreground"
echo "    spark start ~/YourVault &            # Background"
echo ""

echo -e "${YELLOW}Check daemon status:${NC}"
echo "    spark status ~/YourVault"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Note:${NC} The Spark Obsidian plugin is available in"
echo "      Community Plugins as 'Spark Assistant'"
echo ""

