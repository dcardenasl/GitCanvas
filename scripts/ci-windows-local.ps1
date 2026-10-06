$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

function Invoke-Gate {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

$requiredCommands = @("git", "node", "npm", "python", "rustup", "cargo", "bash")
foreach ($name in $requiredCommands) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Missing prerequisite '$name'. Install Git for Windows, Node.js 22, Python 3.13, and Rustup, then reopen PowerShell."
    }
}

$nodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -ne 22) {
    throw "Node.js 22 is required to match CI; found $(node --version)."
}

$pythonVersion = python --version
if ($pythonVersion -notmatch "^Python 3\.13\.") {
    throw "Python 3.13 is required; found $pythonVersion."
}

Invoke-Gate "Install the pinned Rust toolchain" { python scripts/install-rust-toolchain.py }
Invoke-Gate "Install JavaScript dependencies" { npm ci }

Invoke-Gate "TypeScript checks" { npm run typecheck }
Invoke-Gate "E2E TypeScript check" { npm run typecheck:e2e }
Invoke-Gate "Node TypeScript check" { npm run typecheck:node }
Invoke-Gate "ESLint" { npm run lint }
Invoke-Gate "Prettier" { npm run format:check }
Invoke-Gate "Frontend tests and coverage" { npm run test:coverage }

Invoke-Gate "Rust formatting" { cargo fmt --all --check }
Invoke-Gate "Rust Clippy" { cargo clippy --all-targets --all-features -- -D warnings }
Invoke-Gate "Rust workspace tests" { cargo test --workspace }

Invoke-Gate "Generated bindings check" { git diff --exit-code -- src/bindings.ts }
Invoke-Gate "Production dependency audit" { npm audit --omit=dev --audit-level=high }
Invoke-Gate "Windows application bundle" { npm run tauri build -- --ci }
Invoke-Gate "Windows end-to-end tests" { npm run test:e2e:run }

$tree = cargo tree -p gitcanvas -e normal
if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect the release dependency tree."
}
if ($tree | Select-String -Quiet "wdio-webdriver") {
    throw "The release dependency tree unexpectedly includes WebDriver."
}

Write-Host "`nAll local Windows CI gates passed." -ForegroundColor Green
