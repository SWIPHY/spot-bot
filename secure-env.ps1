<# 
  secure-env.ps1 — Harden ton projet Node (.env & Git)
  A lancer depuis la racine du projet (là où il y a package.json).
  Params:
    -Encrypt:$true|$false     -> Chiffrer .env via EFS (Windows)
    -DotenvSafe:$true|$false  -> Installer dotenv-safe + config
#>

param(
  [bool]$Encrypt = $false,
  [bool]$DotenvSafe = $false
)

$ErrorActionPreference = "Stop"

function Assert-ProjectRoot {
  if (-not (Test-Path ".\package.json")) {
    throw "❌ package.json introuvable. Lance le script depuis la racine du projet (ex: C:\spot-bot)."
  }
}

function Write-File($path, $content) {
  $dir = Split-Path $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  Set-Content -Path $path -Value $content -Encoding UTF8 -NoNewline
}

function Append-FileLine($path, $line) {
  if (-not (Test-Path $path)) { New-Item $path -ItemType File | Out-Null }
  $lines = Get-Content $path -ErrorAction SilentlyContinue
  if ($lines -notcontains $line) { Add-Content $path $line }
}

function Is-PackageInstalled($name, $dev=$false) {
  $json = Get-Content package.json -Raw | ConvertFrom-Json
  if ($dev) { return $json.devDependencies.$name -ne $null }
  else { return $json.dependencies.$name -ne $null }
}

function Ensure-DevDep($name, $version="") {
  if (-not (Is-PackageInstalled $name $true)) {
    Write-Host "➡️  npm i -D $name $version"
    npm i -D $name $version | Out-Null
  }
}

function Ensure-Dep($name, $version="") {
  if (-not (Is-PackageInstalled $name $false)) {
    Write-Host "➡️  npm i $name $version"
    npm i $name $version | Out-Null
  }
}

Assert-ProjectRoot

# 1) .gitignore costaud
$gitIgnore = @"
# secrets
.env
.env.*
*.pem
*.pfx

# node
node_modules/
npm-debug.log*
yarn.lock
pnpm-lock.yaml

# os / editors
.DS_Store
Thumbs.db
.vscode/
"@
Write-File ".\.gitignore" $gitIgnore
Write-Host "✅ .gitignore écrit"

# 2) .env.example (modèle public)
$envExample = @"
# -------- Discord --------
DISCORD_TOKEN=changeme
CLIENT_ID=changeme
GUILD_ID=

# -------- Admin / Rôles (optionnel) --------
OWNER_ID=
DJ_ROLE_ID=

# -------- Spotify --------
SPOTIFY_CLIENT_ID=changeme
SPOTIFY_CLIENT_SECRET=changeme
SPOTIFY_REDIRECT_URI=http://localhost:3000/callback

# -------- Playlist partagée (optionnel) --------
SPOTIFY_SHARED_PLAYLIST_ID=
"@
if (-not (Test-Path ".\.env.example")) {
  Write-File ".\.env.example" $envExample
  Write-Host "✅ .env.example créé"
} else {
  Write-Host "ℹ️  .env.example existe déjà (laisse tel quel ou mets à jour à la main)"
}

# 3) Verrouiller .env (droits NTFS + option chiffrement)
if (Test-Path ".\.env") {
  Write-Host "🔒 Restriction NTFS sur .env"
  icacls .\.env /inheritance:r | Out-Null
  icacls .\.env /grant:r "$env:USERNAME:(R,W)" | Out-Null
  icacls .\.env | Out-Null

  if ($Encrypt) {
    Write-Host "🛡️  Chiffrement EFS de .env"
    cipher /e .\.env | Out-Null
  }
} else {
  Write-Host "⚠️  .env introuvable, skip NTFS/chiffrement (tu pourras relancer après l’avoir créé)"
}

# 4) Husky + hook pre-commit anti-leak
Ensure-DevDep "husky"
# init husky (si dossier non présent)
if (-not (Test-Path ".\.husky")) {
  npx husky init | Out-Null
}

$hookPath = ".\.husky\pre-commit"
$hookContent = @"
#!/bin/sh
. "\$(dirname "\$0")/_/husky.sh"

# Bloque commit si .env (ou variantes) est staged
if git diff --cached --name-only | grep -E '\.env($|\.|/)'; then
  echo "❌ Refus: tu tentes de committer un .env"; exit 1;
fi

# Bloque commit si un secret ressemble à ces clés
if git diff --cached | grep -E 'DISCORD_TOKEN|SPOTIFY_CLIENT_SECRET|CLIENT_SECRET|SPOTIFY_CLIENT_ID'; then
  echo "❌ Refus: potentielle fuite de secret"; exit 1;
fi
"@
Write-File $hookPath $hookContent
# sous Windows, s'assure que LF
(Get-Content $hookPath) | Set-Content -NoNewline -Encoding UTF8 $hookPath
Write-Host "✅ Hook pre-commit installé (anti leak)"

# 5) Option: dotenv-safe (vérifie que les vars existent)
if ($DotenvSafe) {
  Ensure-DevDep "dotenv-safe"
  # Injecter un import au top de src/index.js si possible
  if (Test-Path ".\src\index.js") {
    $idx = Get-Content ".\src\index.js" -Raw
    if ($idx -notmatch "dotenv-safe") {
      $injected = "import { config as dotenvSafe } from 'dotenv-safe';`r`ndotenvSafe({ allowEmptyValues: true });`r`n" + $idx
      Set-Content ".\src\index.js" $injected -Encoding UTF8
      Write-Host "✅ dotenv-safe activé dans src/index.js"
    } else {
      Write-Host "ℹ️  dotenv-safe déjà référencé dans src/index.js"
    }
  } else {
    Write-Host "ℹ️  src/index.js introuvable — ajoute manuellement: import { config as dotenvSafe } from 'dotenv-safe'; dotenvSafe({ allowEmptyValues: true });"
  }
} else {
  Write-Host "ℹ️  dotenv-safe non activé (passe -DotenvSafe:`$true` pour l’installer)"
}

# 6) Si .env a déjà été committé par erreur
if (Test-Path ".\.git" -and (git ls-files --error-unmatch .env 2>$null)) {
  Write-Host "🚑 .env est tracké par Git — on le 'oublie' côté index"
  git rm --cached .env | Out-Null
  git update-index --assume-unchanged .env | Out-Null
}

Write-Host "`n🎉 Secure setup terminé."
Write-Host "— .gitignore & .env.example OK"
Write-Host "— .env protégé (NTFS$([string]::IsNullOrEmpty($Encrypt) -or $Encrypt -eq $false ? '' : ' + EFS'))"
Write-Host "— Husky pre-commit actif (anti secrets)"
if ($DotenvSafe) { Write-Host "— dotenv-safe activé (vérif de variables au démarrage)" }
