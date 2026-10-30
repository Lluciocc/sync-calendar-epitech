#!/usr/bin/env bash
# My -> Google · a small, local installer. No sudo. No Firefox profile edits.
set -Eeuo pipefail

REPO='Lluciocc/sync-calendar-epitech'
VERSION='latest'
OPEN_BROWSER=1
FORCE_DEV=0
INSTALL_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/sync-calendar-epitech"
WORK=''
SPIN_PID=''
COLOR=0
if [[ -t 1 && ${TERM:-dumb} != dumb && -z ${NO_COLOR:-} ]]; then COLOR=1; fi
RESET='' BOLD='' DIM='' BLUE='' GREEN='' PINK=''
if (( COLOR )); then
  RESET=$'\033[0m'; BOLD=$'\033[1m'; DIM=$'\033[2m'
  BLUE=$'\033[38;2;106;154;255m'; GREEN=$'\033[38;2;1;202;122m'; PINK=$'\033[38;2;255;135;183m'
fi

usage() {
  cat <<'HELP'
My Epitech → Google Calendar · Installation Firefox

  bash install.sh [options]

  --version v1.0.0    Choisir une release (par défaut : dernière stable)
  --dir CHEMIN       Dossier des fichiers installés
  --dev              Charger la version temporaire, même si un XPI signé existe
  --no-open          Préparer les fichiers sans ouvrir Firefox
  -h, --help         Afficher cette aide

Sans XPI signé, les fichiers sont préparés pour about:debugging.
Firefox demande toujours de confirmer l'installation d'un XPI signé.
Dépôt privé : installer gh et effectuer gh auth login au préalable.
HELP
}
cleanup() {
  if [[ -n $SPIN_PID ]]; then kill "$SPIN_PID" 2>/dev/null || true; fi
  if [[ -n $WORK && -d $WORK ]]; then rm -rf -- "$WORK"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fail() { printf '\n%s  ✕  %s%s\n\n' "$PINK" "$*" "$RESET" >&2; exit 1; }
trap 'fail "Opération interrompue à la ligne $LINENO. Aucun profil Firefox modifié."' ERR

while (( $# )); do
  case "$1" in
    --version) [[ $# -ge 2 ]] || fail 'Valeur manquante après --version.'; VERSION=$2; shift 2 ;;
    --dir) [[ $# -ge 2 && -n $2 ]] || fail 'Chemin manquant après --dir.'; INSTALL_ROOT=$2; shift 2 ;;
    --dev) FORCE_DEV=1; shift ;;
    --no-open) OPEN_BROWSER=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Option inconnue : $1" ;;
  esac
done
[[ $VERSION == latest || $VERSION =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Version attendue : v1.0.0.'
for tool in python3 mktemp; do command -v "$tool" >/dev/null || fail "Commande requise : $tool"; done

printf '\n%s  ◆  MY EPITECH%s\n' "$BLUE$BOLD" "$RESET"
printf '%s     Le planning suit le mouvement.%s\n' "$DIM" "$RESET"
printf '%s     My  →  Google Calendar  ·  Firefox%s\n\n' "$PINK" "$RESET"

INSTALL_ROOT=$(python3 - "$INSTALL_ROOT" <<'PYTHON'
from pathlib import Path
import sys
print(Path(sys.argv[1]).expanduser().resolve())
PYTHON
)
WORK=$(mktemp -d)
run() {
  local label=$1 result=0
  shift
  printf '  %s›%s  %-44s' "$BLUE" "$RESET" "$label"
  if (( COLOR )); then
    printf ' '
    (
      trap - EXIT ERR INT TERM
      frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
      i=0
      while :; do printf '\b%s%s%s' "$BLUE" "${frames[i % 10]}" "$RESET"; i=$((i+1)); sleep 0.09; done
    ) &
    SPIN_PID=$!
  fi
  "$@" >"$WORK/task.log" 2>&1 || result=$?
  if [[ -n $SPIN_PID ]]; then kill "$SPIN_PID" 2>/dev/null || true; wait "$SPIN_PID" 2>/dev/null || true; SPIN_PID=''; printf '\b'; fi
  if (( result )); then
    printf '%sÉCHEC%s\n' "$PINK" "$RESET"
    cat "$WORK/task.log" >&2
    fail "$label"
  fi
  printf '%s✓%s\n' "$GREEN" "$RESET"
}

USE_GH=0
if command -v gh >/dev/null && GH_HOST=github.com gh auth status >/dev/null 2>&1; then USE_GH=1; fi
if (( ! USE_GH )); then command -v curl >/dev/null || fail 'Installe curl, ou gh et connecte-toi avec gh auth login.'; fi
curl_get() { curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 2 --connect-timeout 15 --max-time 120 "$@"; }
metadata() {
  local endpoint="repos/$REPO/releases/latest"
  if [[ $VERSION != latest ]]; then endpoint="repos/$REPO/releases/tags/$VERSION"; fi
  if (( USE_GH )); then GH_HOST=github.com gh api "$endpoint" >"$WORK/release.json";
  else curl_get "https://api.github.com/$endpoint" -o "$WORK/release.json"; fi
}
printf '  %s01 / 04%s  Trouver la bonne version\n' "$BOLD" "$RESET"
if (( ! USE_GH )); then printf '  %sDépôt privé ? Utilise gh auth login pour autoriser le téléchargement.%s\n' "$DIM" "$RESET"; fi
run 'Lecture de la release GitHub' metadata

python3 - "$WORK/release.json" "$FORCE_DEV" >"$WORK/selection" <<'PY'
import json, re, sys
release = json.load(open(sys.argv[1]))
tag = release.get('tag_name', '')
if not re.fullmatch(r'v\d+\.\d+\.\d+', tag):
    raise SystemExit('Release invalide : tag vMAJOR.MINOR.PATCH attendu.')
version = tag[1:]
assets = {a['name']: a for a in release.get('assets', [])}
signed = f'sync-calendar-epitech-{version}.xpi'
name = signed if sys.argv[2] == '0' and signed in assets else f'sync-calendar-epitech-{version}.zip'
for required in (name, 'SHA256SUMS'):
    if required not in assets:
        raise SystemExit(f'Asset manquant : {required}. Publier une release avec le workflow CI.')
    expected = f'https://github.com/Lluciocc/sync-calendar-epitech/releases/download/{tag}/{required}'
    if assets[required].get('browser_download_url') != expected:
        raise SystemExit('Adresse de téléchargement inattendue.')
print(tag)
print(name)
print('signed' if name == signed else 'dev')
print(assets[name]['browser_download_url'])
print(assets['SHA256SUMS']['browser_download_url'])
PY
# readarray/mapfile is absent from Bash 3 on macOS.
{ IFS= read -r TAG; IFS= read -r ASSET; IFS= read -r MODE; IFS= read -r ASSET_URL; IFS= read -r SUM_URL; } <"$WORK/selection"

download() {
  local name=$1 url=$2
  if (( USE_GH )); then GH_HOST=github.com gh release download "$TAG" --repo "$REPO" --pattern "$name" --dir "$WORK";
  else curl_get "$url" -o "$WORK/$name"; fi
}
printf '\n  %s02 / 04%s  Télécharger · %s\n' "$BOLD" "$RESET" "$TAG"
run 'Récupération du paquet Firefox' download "$ASSET" "$ASSET_URL"
run 'Récupération des empreintes SHA-256' download 'SHA256SUMS' "$SUM_URL"

verify() {
  python3 - "$WORK" "$ASSET" "$TAG" "$MODE" <<'PY'
import hashlib, json, pathlib, re, stat, sys, zipfile
root, name, tag, mode = pathlib.Path(sys.argv[1]), *sys.argv[2:]
entries = {}
for line in (root/'SHA256SUMS').read_text().splitlines():
    match = re.fullmatch(r'([0-9a-f]{64})  ([A-Za-z0-9._-]+)', line)
    if match:
        digest, filename = match.groups()
        if filename in entries:
            raise SystemExit('Empreinte SHA-256 en double.')
        entries[filename] = digest
if hashlib.sha256((root/name).read_bytes()).hexdigest() != entries.get(name):
    raise SystemExit('Empreinte SHA-256 incorrecte. Aucun fichier installé.')
with zipfile.ZipFile(root/name) as package:
    if sum(info.file_size for info in package.infolist()) > 20_000_000:
        raise SystemExit('Archive trop volumineuse.')
    for info in package.infolist():
        path = pathlib.PurePosixPath(info.filename)
        if path.is_absolute() or '..' in path.parts or '\\' in info.filename or stat.S_ISLNK(info.external_attr >> 16):
            raise SystemExit('Chemin interdit dans l’archive.')
    manifest = json.loads(package.read('manifest.json'))
    if manifest.get('version') != tag[1:] or manifest.get('browser_specific_settings',{}).get('gecko',{}).get('id') != 'my-calendar-sync@lluciocc.local':
        raise SystemExit('Identité ou version de l’extension inattendue.')
    if mode == 'signed' and 'META-INF/mozilla.rsa' not in package.namelist():
        raise SystemExit('Signature Mozilla absente. Firefox vérifiera aussi sa validité.')
    if mode == 'dev':
        package.extractall(root/'extension')
PY
}
printf '\n  %s03 / 04%s  Vérifier et préparer\n' "$BOLD" "$RESET"
run 'Intégrité du paquet et du manifeste' verify

stage() {
  python3 - "$WORK" "$INSTALL_ROOT" "$TAG" "$ASSET" "$MODE" <<'PY'
import os, pathlib, shutil, sys, tempfile
work, root = (pathlib.Path(p).expanduser().resolve() for p in sys.argv[1:3])
tag, name, mode = sys.argv[3:]
root.mkdir(parents=True, exist_ok=True)
# Each run gets its own directory; existing files and Firefox settings remain intact.
install = pathlib.Path(tempfile.mkdtemp(prefix=tag+'-', dir=root))
if mode == 'dev': shutil.copytree(work/'extension', install/'extension')
else: shutil.copyfile(work/name, install/name)
link = root/('.current-'+install.name)
link.symlink_to(install.name, target_is_directory=True)
os.replace(link, root/'current')
print(install)
PY
}
run 'Préparation du dossier local' stage
CURRENT="$INSTALL_ROOT/current"

printf '\n  %s04 / 04%s  À toi de jouer\n' "$BOLD" "$RESET"
if [[ $MODE == signed ]]; then
  printf '\n  %s✓ Paquet signé prêt%s\n' "$GREEN$BOLD" "$RESET"
  printf "    Dans Firefox, accepte la demande d’installation.\n"
  printf "    Si elle ne s’ouvre pas : about:addons → roue dentée\n"
  printf '    → Installer un module depuis un fichier…\n'
  printf '    %s%s/%s%s\n' "$BLUE" "$CURRENT" "$ASSET" "$RESET"
  TARGET=$(python3 - "$CURRENT/$ASSET" <<'PY'
from pathlib import Path
import sys
print(Path(sys.argv[1]).expanduser().resolve().as_uri())
PY
)
else
  printf '\n  %s◆ Version de développement préparée%s\n' "$PINK$BOLD" "$RESET"
  printf '    Aucun XPI signé sélectionné : chargement temporaire.\n'
  printf '    about:debugging → Ce Firefox → Charger un module temporaire\n'
  printf '    Sélectionne : %s%s/extension/manifest.json%s\n' "$BLUE" "$CURRENT" "$RESET"
  TARGET='about:debugging#/runtime/this-firefox'
fi
printf '\n    %sEnsuite : connecte Google, puis ouvre My Epitech.%s\n\n' "$DIM" "$RESET"

if (( OPEN_BROWSER )); then
  if command -v firefox >/dev/null; then firefox "$TARGET" >"$WORK/firefox.log" 2>&1 &
  elif command -v flatpak >/dev/null && flatpak info org.mozilla.firefox >/dev/null 2>&1; then flatpak run org.mozilla.firefox "$TARGET" >"$WORK/firefox.log" 2>&1 &
  elif [[ $(uname -s) == Darwin ]] && command -v open >/dev/null; then open -a Firefox "$TARGET" >/dev/null 2>&1 || printf "  Ouvre Firefox pour terminer l’installation.\n";
  else printf '  Firefox non détecté. Ouvre-le pour terminer avec les étapes ci-dessus.\n'; fi
fi
