#!/bin/bash
set -e

# Spark Daemon Installer
# Downloads pre-built daemon from GitHub Releases

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin"
VERSION="${SPARK_VERSION:-latest}"
INSTALL_DIR="$HOME/.spark/daemon"

# Detect download tool
if command -v curl &> /dev/null; then
    DOWNLOAD_CMD="curl -fsSL"
    DOWNLOAD_TOOL="curl"
elif command -v wget &> /dev/null; then
    DOWNLOAD_CMD="wget -qO-"
    DOWNLOAD_TOOL="wget"
else
    echo -e "${RED}✗ Neither curl nor wget found${NC}"
    echo "  Please install curl or wget to continue"
    exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Spark Daemon Installation            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}This script installs the Spark daemon only.${NC}"
echo -e "${BLUE}For the Obsidian plugin, install from Community Plugins.${NC}"
echo ""

# Check Node.js
echo -e "${YELLOW}→ Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo ""
    echo "Please install Node.js 18+ first:"
    echo "  • macOS: brew install node"
    echo "  • Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs"
    echo "  • Or download from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js version $NODE_VERSION is too old${NC}"
    echo "  Please upgrade to Node.js 18+ from https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) found${NC}"
echo ""

# Determine version to download
if [ "$VERSION" = "latest" ]; then
    echo -e "${YELLOW}→ Fetching latest version...${NC}"
    RELEASE_URL="$REPO_URL/releases/latest"
    # Get the redirect location to determine version
    if [ "$DOWNLOAD_TOOL" = "curl" ]; then
        LATEST_URL=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$RELEASE_URL")
    else
        LATEST_URL=$(wget --spider -S "$RELEASE_URL" 2>&1 | grep -i "Location:" | tail -1 | awk '{print $2}')
    fi
    VERSION=$(basename "$LATEST_URL" | sed 's/^v//')
    echo -e "${GREEN}✓ Latest version: ${VERSION}${NC}"
fi

TARBALL_NAME="spark-daemon-v${VERSION}.tar.gz"
DOWNLOAD_URL="$REPO_URL/releases/download/v${VERSION}/${TARBALL_NAME}"

# Download and extract
echo -e "${YELLOW}→ Downloading Spark daemon v${VERSION}...${NC}"
echo -e "${BLUE}  URL: ${DOWNLOAD_URL}${NC}"

# Clean previous installation
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Download and extract in one step
if ! $DOWNLOAD_CMD "$DOWNLOAD_URL" | tar -xz -C "$INSTALL_DIR" --strip-components=1; then
    echo -e "${RED}✗ Failed to download daemon${NC}"
    echo ""
    echo "Possible causes:"
    echo "  • Version v${VERSION} may not exist"
    echo "  • Network connectivity issues"
    echo "  • GitHub rate limiting"
    echo ""
    echo "Try:"
    echo "  • Check available releases: $REPO_URL/releases"
    echo "  • Specify a version: SPARK_VERSION=0.2.4 bash install-daemon.sh"
    exit 1
fi

echo -e "${GREEN}✓ Downloaded and extracted to $INSTALL_DIR${NC}"

# Make CLI executable
chmod +x "$INSTALL_DIR/dist/cli.js"

# Create symlink
echo -e "${YELLOW}→ Creating spark command...${NC}"

# Determine bin directory
BIN_DIR=""
if [ -w "/usr/local/bin" ]; then
    BIN_DIR="/usr/local/bin"
elif [ -d "$HOME/.local/bin" ]; then
    BIN_DIR="$HOME/.local/bin"
else
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"
fi

# Create symlink
ln -sf "$INSTALL_DIR/dist/cli.js" "$BIN_DIR/spark"
echo -e "${GREEN}✓ Created symlink: $BIN_DIR/spark${NC}"

# Add to PATH if needed
SHELL_PROFILE=""
if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ] || [ "$SHELL" = "/usr/bin/zsh" ]; then
    SHELL_PROFILE="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ] || [ "$SHELL" = "/usr/bin/bash" ]; then
    SHELL_PROFILE="$HOME/.bashrc"
fi

# Check if BIN_DIR is in PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    if [ -n "$SHELL_PROFILE" ]; then
        if ! grep -q "$BIN_DIR" "$SHELL_PROFILE" 2>/dev/null; then
            echo -e "${YELLOW}→ Adding $BIN_DIR to PATH in $SHELL_PROFILE...${NC}"
            echo "" >> "$SHELL_PROFILE"
            echo "# Spark daemon (added by installer)" >> "$SHELL_PROFILE"
            echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_PROFILE"
            echo -e "${GREEN}✓ Added to PATH${NC}"
        fi
    fi
    # Add to current session
    export PATH="$BIN_DIR:$PATH"
fi

# Verify installation
echo ""
if command -v spark &> /dev/null || [ -x "$BIN_DIR/spark" ]; then
    SPARK_PATH=$(command -v spark 2>/dev/null || echo "$BIN_DIR/spark")
    echo -e "${GREEN}✓ spark command available at: $SPARK_PATH${NC}"
else
    echo -e "${YELLOW}⚠ spark command may not be in PATH yet${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Spark daemon installation complete!${NC}"
echo ""

if [ -n "$SHELL_PROFILE" ] && [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo -e "${YELLOW}⚠️  To use the 'spark' command, run:${NC}"
    echo -e "${BLUE}    source $SHELL_PROFILE${NC}"
    echo ""
    echo -e "Or open a new terminal window."
    echo ""
fi

echo -e "${YELLOW}Verify installation:${NC}"
echo "    spark --version"
echo ""

echo -e "${YELLOW}Start the daemon:${NC}"
echo "    spark start ~/YourVault"
echo ""

echo -e "${YELLOW}Check daemon status:${NC}"
echo "    spark status ~/YourVault"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Note:${NC} The Spark Obsidian plugin is available in"
echo "      Community Plugins as 'Spark Assistant'"
echo ""
