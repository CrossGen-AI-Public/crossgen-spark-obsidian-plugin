# Spark Assistant Installation Script for Windows
# PowerShell version of install.sh

#Requires -Version 5.1

# Enable strict mode
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Parse environment flags
$SKIP_NODE = if ($env:SKIP_NODE -eq "1") { $true } else { $false }
$SKIP_GH = if ($env:SKIP_GH -eq "1") { $true } else { $false }
$AUTO_START = if ($env:AUTO_START -eq "0") { $false } else { $true }
$DEV_MODE = if ($env:DEV_MODE -eq "1") { $true } else { $false }

# Color functions
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Success { 
    param([string]$Message) 
    Write-ColorOutput "checkmark $Message" "Green" 
}

function Write-ErrorMsg { 
    param([string]$Message) 
    Write-ColorOutput "X $Message" "Red" 
}

function Write-WarningMsg { 
    param([string]$Message) 
    Write-ColorOutput "! $Message" "Yellow" 
}

function Write-Info { 
    param([string]$Message) 
    Write-ColorOutput "i $Message" "Cyan" 
}

function Write-ProgressMsg { 
    param([string]$Message) 
    Write-ColorOutput "-> $Message" "Yellow" 
}

# Script directory
$SCRIPT_DIR = $PSScriptRoot
if (-not $SCRIPT_DIR) {
    $SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
}

# Detect if running via downloaded script (no .git directory)
if (-not (Test-Path "$SCRIPT_DIR\.git")) {
    Write-ProgressMsg "Running in download mode - downloading repository..."
    
    $TEMP_DIR = Join-Path $env:TEMP "spark-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $TEMP_DIR -Force | Out-Null
    
    try {
        Set-Location $TEMP_DIR
        
        # Use REPO_URL environment variable or default to main repo
        $REPO_URL = if ($env:REPO_URL) { $env:REPO_URL } else { "https://github.com/CrossGen-AI-Public/crossgen-spark-obsidian-plugin" }
        $REPO_NAME = Split-Path $REPO_URL -Leaf
        $REPO_NAME = $REPO_NAME -replace '\.git$', ''
        
        # Check if git is available
        $GIT_AVAILABLE = $false
        try {
            $null = git --version 2>$null
            $GIT_AVAILABLE = $true
        } catch {
            Write-Info "Git not available, using ZIP download"
        }
        
        if ($GIT_AVAILABLE) {
            git clone --depth 1 "$REPO_URL.git" 2>&1 | Out-Null
        } else {
            # Download as ZIP
            $zipUrl = "$REPO_URL/archive/refs/heads/main.zip"
            $zipFile = Join-Path $TEMP_DIR "repo.zip"
            
            Write-ProgressMsg "Downloading repository..."
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing
            
            Write-ProgressMsg "Extracting..."
            Expand-Archive -Path $zipFile -DestinationPath $TEMP_DIR -Force
            
            # Move contents from extracted folder
            $extractedFolder = Join-Path $TEMP_DIR "$REPO_NAME-main"
            if (Test-Path $extractedFolder) {
                Move-Item $extractedFolder (Join-Path $TEMP_DIR $REPO_NAME) -Force
            }
            
            Remove-Item $zipFile -Force
        }
        
        Set-Location (Join-Path $TEMP_DIR $REPO_NAME)
        $SCRIPT_DIR = Get-Location
        Write-Success "Repository downloaded"
        Write-Host ""
    } catch {
        Write-ErrorMsg "Failed to download repository: $_"
        exit 1
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Spark Assistant Installation        " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-ProgressMsg "Checking prerequisites..."

# Check Node.js
$NODE_AVAILABLE = $false
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        $NODE_AVAILABLE = $true
        $versionNumber = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        
        if ($versionNumber -lt 18) {
            Write-ErrorMsg "Node.js version $versionNumber is too old"
            Write-Host "  Please upgrade to Node.js 18+ from https://nodejs.org/"
            exit 1
        }
        
        $msg = "Node.js $nodeVersion found"
        Write-Success $msg
    }
} catch {
    $NODE_AVAILABLE = $false
}

if (-not $NODE_AVAILABLE) {
    if ($SKIP_NODE) {
        Write-ErrorMsg "Node.js is not installed (skipped by SKIP_NODE flag)"
        Write-Host "  Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    }
    
    Write-ProgressMsg "Node.js not found, installing..."
    
    # Download Node.js installer
    $NODE_VERSION = "20.11.1"
    $NODE_INSTALLER = "node-v$NODE_VERSION-x64.msi"
    $NODE_URL = "https://nodejs.org/dist/v$NODE_VERSION/$NODE_INSTALLER"
    $INSTALLER_PATH = Join-Path $env:TEMP $NODE_INSTALLER
    
    try {
        Write-Host "  [LOG] Checking if installer already exists..." -ForegroundColor Gray
        if (Test-Path $INSTALLER_PATH) {
            Write-Host "  [LOG] Found existing installer, removing..." -ForegroundColor Gray
            Remove-Item $INSTALLER_PATH -Force
        }
        
        Write-ProgressMsg "Downloading Node.js v$NODE_VERSION..."
        Write-Host "  [LOG] Download URL: $NODE_URL" -ForegroundColor Gray
        Write-Host "  [LOG] Download destination: $INSTALLER_PATH" -ForegroundColor Gray
        
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $NODE_URL -OutFile $INSTALLER_PATH -UseBasicParsing
        
        Write-Host "  [LOG] Download complete. File size: $((Get-Item $INSTALLER_PATH).Length) bytes" -ForegroundColor Gray
        
        if (-not (Test-Path $INSTALLER_PATH)) {
            throw "Installer download failed - file not found"
        }
        
        Write-ProgressMsg "Installing Node.js (this may take 1-2 minutes)..."
        Write-Host "  [LOG] Running: msiexec.exe /i `"$INSTALLER_PATH`" /quiet /norestart /log `"$env:TEMP\nodejs-install.log`"" -ForegroundColor Gray
        
        # Run installer with logging
        $installArgs = @(
            "/i",
            "`"$INSTALLER_PATH`"",
            "/quiet",
            "/norestart",
            "/log",
            "`"$env:TEMP\nodejs-install.log`""
        )
        
        $process = Start-Process msiexec.exe -Wait -ArgumentList $installArgs -PassThru
        $exitCode = $process.ExitCode
        
        Write-Host "  [LOG] MSI installer exit code: $exitCode" -ForegroundColor Gray
        
        if ($exitCode -ne 0 -and $exitCode -ne 3010) {
            Write-Host "  [LOG] Installation may have failed. Checking log..." -ForegroundColor Gray
            if (Test-Path "$env:TEMP\nodejs-install.log") {
                $logContent = Get-Content "$env:TEMP\nodejs-install.log" -Tail 20
                Write-Host "  [LOG] Last 20 lines of install log:" -ForegroundColor Gray
                $logContent | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
            }
        }
        
        Write-Host "  [LOG] Cleaning up installer..." -ForegroundColor Gray
        Remove-Item $INSTALLER_PATH -Force -ErrorAction SilentlyContinue
        
        Write-Host "  [LOG] Waiting for installation to complete..." -ForegroundColor Gray
        Start-Sleep -Seconds 3
        
        # Refresh environment variables - get the updated PATH
        Write-Host "  [LOG] Refreshing environment variables..." -ForegroundColor Gray
        $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        Write-Host "  [LOG] Machine PATH length: $($machinePath.Length) chars" -ForegroundColor Gray
        Write-Host "  [LOG] User PATH length: $($userPath.Length) chars" -ForegroundColor Gray
        
        $env:Path = $machinePath + ";" + $userPath
        
        # Node.js typically installs to Program Files, add common paths
        $nodePaths = @(
            "$env:ProgramFiles\nodejs",
            "${env:ProgramFiles(x86)}\nodejs",
            "$env:APPDATA\npm"
        )
        
        Write-Host "  [LOG] Checking for Node.js in common locations..." -ForegroundColor Gray
        foreach ($path in $nodePaths) {
            $exists = Test-Path $path
            Write-Host "  [LOG]   $path : $exists" -ForegroundColor Gray
            if ($exists -and ($env:Path -notlike "*$path*")) {
                $env:Path = "$path;$env:Path"
                Write-Host "  [LOG]   Added to PATH" -ForegroundColor Gray
            }
        }
        
        # Verify installation - try multiple methods
        Write-Host "  [LOG] Verifying Node.js installation..." -ForegroundColor Gray
        $nodeVersion = $null
        
        # Method 1: Try to find node in PATH
        $nodeExe = Get-Command node -ErrorAction SilentlyContinue
        if ($nodeExe) {
            Write-Host "  [LOG] Method 1: Found node in PATH at $($nodeExe.Source)" -ForegroundColor Gray
            $nodeVersion = & $nodeExe --version 2>$null
        }
        
        # Method 2: Try direct path
        if (-not $nodeVersion) {
            Write-Host "  [LOG] Method 1 failed, trying direct path..." -ForegroundColor Gray
            $directPath = "$env:ProgramFiles\nodejs\node.exe"
            if (Test-Path $directPath) {
                Write-Host "  [LOG] Method 2: Found node at $directPath" -ForegroundColor Gray
                $env:Path = "$env:ProgramFiles\nodejs;$env:Path"
                $nodeVersion = & $directPath --version 2>$null
            }
        }
        
        # Method 3: Search common install locations
        if (-not $nodeVersion) {
            Write-Host "  [LOG] Method 2 failed, searching install locations..." -ForegroundColor Gray
            $searchPaths = @(
                "$env:ProgramFiles\nodejs\node.exe",
                "${env:ProgramFiles(x86)}\nodejs\node.exe",
                "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
            )
            
            foreach ($searchPath in $searchPaths) {
                if (Test-Path $searchPath) {
                    Write-Host "  [LOG] Method 3: Found node at $searchPath" -ForegroundColor Gray
                    $nodeDir = Split-Path $searchPath -Parent
                    $env:Path = "$nodeDir;$env:Path"
                    $nodeVersion = & $searchPath --version 2>$null
                    if ($nodeVersion) {
                        break
                    }
                }
            }
        }
        
        if ($nodeVersion) {
            $msg = "Node.js $nodeVersion installed successfully"
            Write-Success $msg
            Write-Host "  [LOG] Node.js is now available in this session" -ForegroundColor Gray
        } else {
            Write-Host "  [LOG] Could not verify Node.js installation" -ForegroundColor Gray
            Write-Host "  [LOG] Checking Windows Registry for Node.js..." -ForegroundColor Gray
            
            # Check registry
            $regPath = "HKLM:\SOFTWARE\Node.js"
            if (Test-Path $regPath) {
                $installPath = (Get-ItemProperty -Path $regPath -Name InstallPath -ErrorAction SilentlyContinue).InstallPath
                Write-Host "  [LOG] Registry shows install path: $installPath" -ForegroundColor Gray
                
                if ($installPath -and (Test-Path "$installPath\node.exe")) {
                    Write-Host "  [LOG] Found node.exe at registry path" -ForegroundColor Gray
                    $env:Path = "$installPath;$env:Path"
                    $nodeVersion = & "$installPath\node.exe" --version 2>$null
                }
            }
            
            if ($nodeVersion) {
                $msg = "Node.js $nodeVersion installed successfully"
                Write-Success $msg
            } else {
                Write-ErrorMsg "Node.js installation completed but node.exe cannot be found"
                Write-Host ""
                Write-Host "  This can happen if:" -ForegroundColor Yellow
                Write-Host "    1. The installation was blocked by antivirus" -ForegroundColor Yellow
                Write-Host "    2. The installation requires administrator privileges" -ForegroundColor Yellow
                Write-Host "    3. The installer failed silently" -ForegroundColor Yellow
                Write-Host ""
                Write-Host "  Please try:" -ForegroundColor Yellow
                Write-Host "    1. Run PowerShell as Administrator" -ForegroundColor Yellow
                Write-Host "    2. Run this script again: .\install.ps1" -ForegroundColor Yellow
                Write-Host ""
                Write-Host "  Or install Node.js manually from: https://nodejs.org/" -ForegroundColor Yellow
                Write-Host "  Install log location: $env:TEMP\nodejs-install.log" -ForegroundColor Yellow
                exit 1
            }
        }
    } catch {
        Write-ErrorMsg "Failed to install Node.js: $_"
        Write-Host "  Error details: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  Stack trace: $($_.ScriptStackTrace)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  Please try:" -ForegroundColor Yellow
        Write-Host "    1. Run PowerShell as Administrator" -ForegroundColor Yellow
        Write-Host "    2. Install Node.js manually from https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }
}

# Check npm
try {
    $npmVersion = npm --version 2>$null
    $msg = "npm $npmVersion found"
    Write-Success $msg
} catch {
    Write-ErrorMsg "npm is not installed"
    exit 1
}

# Install GitHub CLI (development only)
$GH_AVAILABLE = $false
try {
    $null = gh --version 2>$null
    $GH_AVAILABLE = $true
    $ghVersion = (gh --version 2>$null | Select-Object -First 1)
    Write-Success "GitHub CLI $ghVersion found"
} catch {
    $GH_AVAILABLE = $false
}

if (-not $GH_AVAILABLE) {
    if (-not $DEV_MODE) {
        Write-Info "GitHub CLI skipped (not needed for regular use)"
        Write-Info "  For development, run with: `$env:DEV_MODE=1; .\install.ps1"
    } elseif ($SKIP_GH) {
        Write-WarningMsg "GitHub CLI not found (skipped by SKIP_GH flag)"
    } else {
        Write-ProgressMsg "Installing GitHub CLI..."
        
        try {
            # Use winget if available
            $WINGET_AVAILABLE = $false
            try {
                $null = winget --version 2>$null
                $WINGET_AVAILABLE = $true
            } catch {
                $WINGET_AVAILABLE = $false
            }
            
            if ($WINGET_AVAILABLE) {
                Write-ProgressMsg "Installing via winget..."
                winget install --id GitHub.cli --silent --accept-source-agreements --accept-package-agreements
                
                # Refresh PATH
                $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
                $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
                $env:Path = $machinePath + ";" + $userPath
                
                Write-Success "GitHub CLI installed"
            } else {
                # Download and install MSI
                $GH_VERSION = "2.43.1"
                $GH_INSTALLER = "gh_${GH_VERSION}_windows_amd64.msi"
                $GH_URL = "https://github.com/cli/cli/releases/download/v$GH_VERSION/$GH_INSTALLER"
                $GH_INSTALLER_PATH = Join-Path $env:TEMP $GH_INSTALLER
                
                Write-ProgressMsg "Downloading GitHub CLI..."
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri $GH_URL -OutFile $GH_INSTALLER_PATH -UseBasicParsing
                
                Write-ProgressMsg "Installing GitHub CLI..."
                Start-Process msiexec.exe -Wait -ArgumentList "/i `"$GH_INSTALLER_PATH`" /quiet /norestart"
                
                Remove-Item $GH_INSTALLER_PATH -Force
                
                # Refresh PATH
                $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
                $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
                $env:Path = $machinePath + ";" + $userPath
                
                Write-Success "GitHub CLI installed"
            }
        } catch {
            Write-WarningMsg "Failed to install GitHub CLI (continuing anyway)"
        }
    }
}
Write-Host ""

# Install engine
Write-ProgressMsg "Installing engine..."
Set-Location "$SCRIPT_DIR\engine"
npm install
Write-Success "Engine dependencies installed"

Write-ProgressMsg "Building engine..."
npm run build
Write-Success "Engine built successfully"

Write-ProgressMsg "Installing engine globally..."

# Check if npm global directory is writable
$NPM_PREFIX = npm prefix -g 2>$null
if ($NPM_PREFIX -and -not (Test-Path $NPM_PREFIX -PathType Container)) {
    New-Item -ItemType Directory -Path $NPM_PREFIX -Force | Out-Null
}

# Remove legacy global spark binary if it exists
if ($NPM_PREFIX) {
    $EXISTING_GLOBAL_SPARK = Join-Path $NPM_PREFIX "spark.cmd"
    if (Test-Path $EXISTING_GLOBAL_SPARK) {
        $linkTarget = Get-Content $EXISTING_GLOBAL_SPARK -Raw -ErrorAction SilentlyContinue
        if ($linkTarget -match "spark-daemon" -or $linkTarget -match "\.spark\\daemon") {
            Remove-Item $EXISTING_GLOBAL_SPARK -Force -ErrorAction SilentlyContinue
            Write-Success "Removed legacy global spark command (daemon) to allow engine install"
        }
    }
}

# Use npm pack + install to ensure files are copied
$TARBALL = (npm pack --silent)
npm install -g $TARBALL
Remove-Item $TARBALL -Force

Write-Success "Engine installed globally"

# Verify spark command
$SPARK_PATH = $null
try {
    $SPARK_PATH = (Get-Command spark -ErrorAction SilentlyContinue).Source
    if ($SPARK_PATH) {
        $msg = "spark command is available: $SPARK_PATH"
        Write-Success $msg
    }
} catch {
    Write-WarningMsg "spark command not immediately available"
    Write-Info "  May need to restart terminal or refresh PATH"
}

# Replace legacy symlink if needed
$LEGACY_SPARK_CMD = "C:\Program Files\nodejs\spark.cmd"
if (Test-Path $LEGACY_SPARK_CMD) {
    $linkContent = Get-Content $LEGACY_SPARK_CMD -Raw -ErrorAction SilentlyContinue
    if ($linkContent -match "\.spark\\daemon") {
        Write-WarningMsg "Detected legacy spark command pointing to daemon"
        Write-Info "  Remove manually or reinstall to use the engine"
    }
}

Write-Host ""

# Install plugin
Write-ProgressMsg "Installing plugin..."
Set-Location "$SCRIPT_DIR\plugin"
npm install --legacy-peer-deps
Write-Success "Plugin dependencies installed"

Write-ProgressMsg "Building plugin..."
npm run build
Write-Success "Plugin built successfully"
Write-Host ""

# Check if vault path is provided, default to example-vault
$VAULT_PATH = $null
if ($args.Count -gt 0) {
    $VAULT_PATH = $args[0]
}

if (-not $VAULT_PATH) {
    $VAULT_PATH = Join-Path $SCRIPT_DIR "example-vault"
    Write-Info "No vault path specified, using example-vault for development"
    Write-Host ""
}

# Expand environment variables in path
$VAULT_PATH = [System.Environment]::ExpandEnvironmentVariables($VAULT_PATH)

# Convert to absolute path
if (-not [System.IO.Path]::IsPathRooted($VAULT_PATH)) {
    $VAULT_PATH = Join-Path (Get-Location) $VAULT_PATH
}

if (-not (Test-Path $VAULT_PATH)) {
    Write-ErrorMsg "Vault path does not exist: $VAULT_PATH"
    exit 1
}

Write-ProgressMsg "Installing plugin to vault..."
$PLUGIN_DIR = Join-Path $VAULT_PATH ".obsidian\plugins\spark"
New-Item -ItemType Directory -Path $PLUGIN_DIR -Force | Out-Null
Copy-Item -Path "$SCRIPT_DIR\plugin\dist\*" -Destination $PLUGIN_DIR -Recurse -Force

# Development mode: Install Hot Reload plugin
if ($DEV_MODE) {
    # Create .hotreload file for Hot Reload plugin
    New-Item -ItemType File -Path (Join-Path $PLUGIN_DIR ".hotreload") -Force | Out-Null
    
    Write-ProgressMsg "Installing Hot Reload plugin for development..."
    $HOT_RELOAD_DIR = Join-Path $VAULT_PATH ".obsidian\plugins\hot-reload"
    
    if (Test-Path $HOT_RELOAD_DIR) {
        Write-Info "  Hot Reload already installed, updating..."
        try {
            Set-Location $HOT_RELOAD_DIR
            git pull --quiet 2>$null
        } catch {
            Write-WarningMsg "  Could not update (continuing)"
        }
        Set-Location $SCRIPT_DIR
    } else {
        try {
            $null = git --version 2>$null
            git clone --quiet https://github.com/pjeby/hot-reload.git $HOT_RELOAD_DIR 2>$null
        } catch {
            Write-WarningMsg "  Git not available, skipping Hot Reload"
        }
    }
    Write-Success "Hot Reload plugin configured"
}

Write-Success "Plugin installed to: $PLUGIN_DIR"

# Disable safe mode so community plugins are allowed to run
Write-ProgressMsg "Disabling safe mode..."
$APP_JSON_FILE = Join-Path $VAULT_PATH ".obsidian\app.json"
$appJson = @{}
if (Test-Path $APP_JSON_FILE) {
    try {
        $appJson = Get-Content $APP_JSON_FILE -Raw | ConvertFrom-Json -AsHashtable
    } catch {
        $appJson = @{}
    }
}
$appJson["safe-mode"] = $false
$appJson | ConvertTo-Json | Set-Content $APP_JSON_FILE -Encoding UTF8
Write-Success "Safe mode disabled"

# Enable plugins in community-plugins.json
Write-ProgressMsg "Enabling plugins in Obsidian config..."
$COMMUNITY_PLUGINS_FILE = Join-Path $VAULT_PATH ".obsidian\community-plugins.json"

# Read existing plugins or start with empty list
$EXISTING_PLUGINS = @()
if (Test-Path $COMMUNITY_PLUGINS_FILE) {
    try {
        $EXISTING_PLUGINS = Get-Content $COMMUNITY_PLUGINS_FILE -Raw | ConvertFrom-Json
        if (-not $EXISTING_PLUGINS) {
            $EXISTING_PLUGINS = @()
        }
    } catch {
        $EXISTING_PLUGINS = @()
    }
}

# Build new plugin list
$PLUGINS = @()

# Add hot-reload first if dev mode
if ($DEV_MODE) {
    $PLUGINS += "hot-reload"
}

# Add existing plugins (excluding hot-reload and spark to avoid duplicates)
foreach ($plugin in $EXISTING_PLUGINS) {
    if ($plugin -and $plugin -ne "hot-reload" -and $plugin -ne "spark") {
        $PLUGINS += $plugin
    }
}

# Add spark
$PLUGINS += "spark"

# Write JSON file (force array even with single item)
$jsonArray = "[" + (($PLUGINS | ForEach-Object { "`"$_`"" }) -join ",") + "]"
$jsonArray | Set-Content $COMMUNITY_PLUGINS_FILE -Encoding UTF8

Write-Success "Plugins enabled in config"

# Disable Cmd+K hotkey for insert-link (so Spark chat can use it)
Write-ProgressMsg "Configuring hotkeys..."
$HOTKEYS_FILE = Join-Path $VAULT_PATH ".obsidian\hotkeys.json"

# Create or update hotkeys.json using PowerShell
try {
    $hotkeys = @{}
    
    # Read existing hotkeys if file exists
    if (Test-Path $HOTKEYS_FILE) {
        try {
            $hotkeyContent = Get-Content $HOTKEYS_FILE -Raw
            $hotkeys = $hotkeyContent | ConvertFrom-Json -AsHashtable
        } catch {
            $hotkeys = @{}
        }
    }
    
    # Find and remove Cmd+K from any commands that use it
    $resolvedConflicts = @()
    $commandsToUpdate = @($hotkeys.Keys)
    
    foreach ($command in $commandsToUpdate) {
        $bindings = $hotkeys[$command]
        if ($bindings) {
            $filteredBindings = @()
            foreach ($binding in $bindings) {
                $skip = $false
                
                # Handle string format
                if ($binding -is [string]) {
                    if ($binding -eq 'Mod+K' -or $binding -eq 'Cmd+K') {
                        $resolvedConflicts += $command
                        $skip = $true
                    }
                }
                # Handle object format
                elseif ($binding -is [hashtable] -or $binding -is [PSCustomObject]) {
                    $mods = if ($binding.modifiers) { $binding.modifiers } else { @() }
                    $key = if ($binding.key) { $binding.key } else { '' }
                    if (($mods -contains 'Mod' -or $mods -contains 'Cmd') -and $key -eq 'K') {
                        $resolvedConflicts += $command
                        $skip = $true
                    }
                }
                
                if (-not $skip) {
                    $filteredBindings += $binding
                }
            }
            $hotkeys[$command] = $filteredBindings
        }
    }
    
    # Disable editor:insert-link to free up Cmd+K
    if (-not $hotkeys.ContainsKey('editor:insert-link')) {
        $hotkeys['editor:insert-link'] = @()
    }
    
    # Ensure spark:toggle-chat has Cmd+K if the entry exists
    if ($hotkeys.ContainsKey('spark:toggle-chat')) {
        $hotkeys['spark:toggle-chat'] = @(
            @{
                modifiers = @('Mod')
                key = 'K'
            }
        )
    }
    
    # Write updated hotkeys
    $hotkeys | ConvertTo-Json -Depth 10 | Set-Content $HOTKEYS_FILE -Encoding UTF8
    
    # Output results
    if ($resolvedConflicts.Count -gt 0) {
        Write-Success "Cmd+K configured for Spark chat"
        $conflictsList = $resolvedConflicts -join ', '
        Write-WarningMsg "  Resolved conflicts: $conflictsList"
    } else {
        Write-Success "Cmd+K configured for Spark chat"
    }
} catch {
    Write-WarningMsg "Failed to configure hotkeys: $_"
    Write-Info "  You can manually configure Cmd+K later in Obsidian settings"
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Success "Installation complete!"
Write-Host ""

# Initialize vault structure
Write-ProgressMsg "Initializing vault structure..."

# Find spark binary and build correct start command
$SPARK_BIN = $null
$SPARK_CMD = $null

try {
    $sparkCmd = Get-Command spark -ErrorAction SilentlyContinue
    if ($sparkCmd) {
        $SPARK_BIN = $sparkCmd.Source
    }
} catch {}

# Fallback to common npm locations
if (-not $SPARK_BIN) {
    $npmPrefix = npm prefix -g 2>$null
    if ($npmPrefix) {
        $candidates = @(
            Join-Path $npmPrefix "spark.cmd",
            Join-Path $npmPrefix "spark.ps1",
            Join-Path $npmPrefix "spark"
        )
        foreach ($c in $candidates) {
            if (Test-Path $c) {
                $SPARK_BIN = $c
                break
            }
        }
    }
}

# Build the correct command based on file extension
function Invoke-Spark {
    param([string]$Arguments)
    
    if (-not $SPARK_BIN) {
        throw "spark binary not found"
    }
    
    $ext = [System.IO.Path]::GetExtension($SPARK_BIN).ToLower()
    
    if ($ext -eq ".ps1") {
        return Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$SPARK_BIN`" $Arguments" `
            -WindowStyle Hidden -PassThru
    } elseif ($ext -eq ".cmd" -or $ext -eq ".bat") {
        return Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c `"$SPARK_BIN`" $Arguments" `
            -WindowStyle Hidden -PassThru
    } else {
        return Start-Process -FilePath $SPARK_BIN `
            -ArgumentList $Arguments `
            -WindowStyle Hidden -PassThru
    }
}

if ($SPARK_BIN) {
    Write-Host "  [LOG] Found spark at: $SPARK_BIN" -ForegroundColor Gray
    try {
        # Start engine briefly to trigger initialization, then stop it
        $initProcess = Invoke-Spark "start `"$VAULT_PATH`""
        Start-Sleep -Seconds 3
        
        # Stop the initialization engine
        if (-not $initProcess.HasExited) {
            Stop-Process -Id $initProcess.Id -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    } catch {
        # Initialization failed, but continue
        Write-Host "  [LOG] Init process error: $_" -ForegroundColor Gray
    }
}

# Verify initialization
$configPath = Join-Path $VAULT_PATH ".spark\config.yaml"
if (Test-Path $configPath) {
    Write-Success "Vault initialized"
} else {
    Write-WarningMsg "Vault initialization may be incomplete"
    Write-Host "  Vault will be initialized when engine starts for the first time"
}
Write-Host ""

# Auto-start engine if enabled
if ($AUTO_START) {
    if (-not $SPARK_BIN) {
        Write-WarningMsg "spark command not found, skipping auto-start"
        Write-Host "  Restart your terminal and run:"
        Write-Host "  spark start `"$VAULT_PATH`""
        Write-Host ""
    } else {
        Write-ProgressMsg "Starting engine in background..."
        
        try {
            $engineProcess = Invoke-Spark "start `"$VAULT_PATH`""
            Start-Sleep -Seconds 3

            # Always check spark status - most reliable method
            $isRunning = $false
            try {
                $statusOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$SPARK_BIN" status "$VAULT_PATH" 2>$null
                if ($statusOutput -match "running") {
                    $isRunning = $true
                }
            } catch {
                if (-not $engineProcess.HasExited) {
                    $isRunning = $true
                }
            }

            if ($isRunning) {
                Write-Success "Engine is running"
                Write-Host ""
                Write-Host "Spark is running!" -ForegroundColor Green
                Write-Host ""
                Write-Host "Next steps:" -ForegroundColor Yellow
                Write-Host "  1. Open Obsidian and open your vault"
                Write-Host "  2. Enable Spark: Settings -> Community plugins -> Spark"
                Write-Host "  3. Add API key: Settings -> Spark -> Anthropic API key"
                Write-Host "  4. Press Ctrl+K to open chat"
                Write-Host ""
                Write-Host "Check engine status:" -ForegroundColor Yellow
                Write-Host "     spark status `"$VAULT_PATH`""
                Write-Host ""
            } else {
                Write-WarningMsg "Engine failed to start"
                Write-Host "  Start manually with: spark start `"$VAULT_PATH`""
                Write-Host ""
            }
        } catch {
            Write-WarningMsg "Failed to start engine: $_"
            Write-Host "  Start manually with: spark start `"$VAULT_PATH`""
            Write-Host ""
        }
    }
} else {
    if ($DEV_MODE) {
        Write-Host "Hot Reload is configured and ready to use!" -ForegroundColor Green
        Write-Host ""
    }
    
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Restart Obsidian to load the plugin"
    Write-Host "  2. Configure API key in plugin settings (Settings -> Spark)"
    Write-Host "  3. Restart your terminal (or refresh PATH)"
    Write-Host "  4. Start the engine:"
    Write-Host "     spark start `"$VAULT_PATH`""
    Write-Host ""
    
    if ($env:ANTHROPIC_API_KEY) {
        Write-Info "Tip: ANTHROPIC_API_KEY detected in environment"
        Write-Host "   The engine can use this, or configure in plugin settings"
        Write-Host ""
    }
}

if ($DEV_MODE) {
    Write-Host "For development:" -ForegroundColor Yellow
    Write-Host "  - Run 'cd plugin; npm run dev' for live plugin editing"
    Write-Host "  - Changes will auto-reload in Obsidian (Hot Reload enabled)"
    Write-Host "  - Use 'spark start `"$VAULT_PATH`"' for engine debug mode"
    Write-Host ""
}
Write-Host ""
Write-Host "Tip:" -ForegroundColor Cyan
Write-Host " To install to a different vault, run:"
Write-Host "     .\install.ps1 C:\Path\To\YourVault"
Write-Host ""
Write-Host "Environment flags:" -ForegroundColor Cyan
Write-Host "     `$env:DEV_MODE='1'; .\install.ps1            # Enable development features"
Write-Host "     `$env:SKIP_NODE='1'; .\install.ps1           # Skip Node.js installation"
Write-Host "     `$env:SKIP_GH='1'; .\install.ps1             # Skip GitHub CLI"
Write-Host "     `$env:AUTO_START='0'; .\install.ps1          # Skip engine auto-start"

Write-Host "========================================" -ForegroundColor Cyan