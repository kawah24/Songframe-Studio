# Builds the studio UI, then packages it with the Python shell into one
# Songframe.exe. Run from anywhere:  .\build_exe.ps1
param([switch]$SkipUi)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
Set-Location $here

$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    Write-Host 'Creating the virtual environment with Python 3.12...'
    py -3.12 -m venv (Join-Path $root '.venv')
}
$python = Join-Path $root '.venv\Scripts\python.exe'

if (-not $SkipUi) {
    Write-Host 'Building the UI...'
    Push-Location $root
    npm run build
    node tools/pack-desktop.mjs
    Pop-Location
}

Write-Host 'Installing Python dependencies...'
& $python -m pip install --quiet --upgrade pip
& $python -m pip install --quiet --upgrade -r (Join-Path $here 'requirements.txt') pyinstaller

Write-Host 'Packaging Songframe.exe...'
& $python -m PyInstaller `
    --noconfirm --clean --windowed --onefile `
    --name Songframe `
    --icon (Join-Path $here 'songframe.ico') `
    --add-data "ui;ui" `
    (Join-Path $here 'songframe.py')

$exe = Join-Path $here 'dist\Songframe.exe'
if (Test-Path $exe) {
    $size = [math]::Round((Get-Item $exe).Length / 1MB, 1)
    Write-Host ''
    Write-Host "Built $exe ($size MB)"
    Write-Host 'Copy it anywhere - it runs without Python installed.'
} else {
    throw 'PyInstaller did not produce dist\Songframe.exe'
}
