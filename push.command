#!/usr/bin/env bash
set -euo pipefail

PROJECT="$HOME/Desktop/WaveVapes-main"
cd "$PROJECT"
git branch -M main 2>/dev/null || true

echo ""
echo "============================================================"
echo "  WaveVapes - Git Push + GitHub Verify"
echo "============================================================"
echo ""
echo "  [1] Normaler Push (nur Aenderungen)"
echo "  [2] ALLE Dateien neu pushen (force replace all)"
echo ""
read -rp "[WAHL] Modus waehlen (1/2, Enter = 1): " MODE
MODE="${MODE:-1}"

if [[ "$MODE" == "2" ]]; then
    echo ""
    echo "[INFO] Modus: ALLE Dateien werden neu gestaged und gepusht."
    echo "[INFO] Der Git-Index wird zurueckgesetzt - alle Dateien gelten als neu."
    echo ""
fi
echo ""

if ! command -v git &>/dev/null; then
    echo "[FEHLER] Git nicht gefunden."
    exit 1
fi

# ── Git-Root pruefen ───────────────────────────────────────────
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ -z "$GIT_ROOT" ]]; then
    echo "[FEHLER] Kein Git-Repository gefunden."
    exit 1
fi

# Normalize for comparison (resolve symlinks/trailing slashes)
GIT_ROOT_NORM=$(realpath "$GIT_ROOT")
PROJECT_NORM=$(realpath "$PROJECT")

if [[ "$GIT_ROOT_NORM" != "$PROJECT_NORM" ]]; then
    echo "[WARNUNG] Das .git-Verzeichnis liegt NICHT im Projektordner!"
    echo "          .git liegt in: $GIT_ROOT"
    echo "          Projekt liegt in: $PROJECT"
    echo ""
    echo "          Das bedeutet: git wuerde DEINEN GESAMTEN"
    echo "          BENUTZERORDNER committen!"
    echo ""
    echo "[LOESUNG] Initialisiere neues Git-Repo nur fuer dieses Projekt?"
    read -rp "[FRAGE] Neues Repo hier initialisieren? (j/N): " INIT
    if [[ "${INIT,,}" == "j" ]]; then
        git init "$PROJECT"
        cd "$PROJECT"
        git remote add origin https://github.com/EmreKnax1234/WaveVapes.git
        echo "[OK] Neues Repo initialisiert."
    else
        echo "[ABBRUCH] Bitte das .git-Problem manuell beheben."
        exit 1
    fi
fi

# ── Branch und Remote ──────────────────────────────────────────
BRANCH=$(git branch --show-current 2>/dev/null || true)
BRANCH="${BRANCH:-main}"
REMOTE=$(git remote get-url origin 2>/dev/null || true)

echo "[INFO] Branch : $BRANCH"
echo "[INFO] Remote : $REMOTE"
echo "[INFO] Scope  : $PROJECT"
echo ""

# ── .gitignore sicherstellen ───────────────────────────────────
if [[ ! -f "$PROJECT/.gitignore" ]]; then
    echo "[INFO] Keine .gitignore gefunden - erstelle eine..."
    cat > "$PROJECT/.gitignore" <<'EOF'
node_modules/
.env
.env.local
*.log
.DS_Store
Thumbs.db
dist/
build/
EOF
    echo "[OK] .gitignore erstellt."
    echo ""
fi

# ── Sitemap lastmod aktualisieren ──────────────────────────────
TODAY=$(date +%Y-%m-%d)
if [[ -f "$PROJECT/sitemap.xml" ]]; then
    sed -i.bak -E "s|<lastmod>[0-9]{4}-[0-9]{2}-[0-9]{2}</lastmod>|<lastmod>$TODAY</lastmod>|g" "$PROJECT/sitemap.xml"
    rm -f "$PROJECT/sitemap.xml.bak"
    echo "[INFO] Sitemap lastmod aktualisiert auf $TODAY"
    echo ""
fi

# ── Status nur fuer diesen Ordner ─────────────────────────────
echo "[1/5] Geaenderte Dateien in $PROJECT:"
echo "------------------------------------------------------------"
git status --short -- .
echo "------------------------------------------------------------"
echo ""

CHANGES=$(git status --short -- . 2>/dev/null | wc -l | tr -d ' ')

if [[ "$CHANGES" == "0" ]]; then
    if [[ "$MODE" == "2" ]]; then
        echo "[INFO] Keine lokalen Aenderungen - aber Modus 2 erzwingt neu-Stage."
        echo "[INFO] Alle Dateien werden neu committed."
    else
        echo "[INFO] Keine Aenderungen - springe zu Verifikation."
        SKIP_COMMIT=1
    fi
fi

if [[ -z "${SKIP_COMMIT:-}" ]]; then
    echo "[INFO] $CHANGES Datei(en) geaendert."
    echo ""

    # ── Commit-Message ─────────────────────────────────────────────
    read -rp "[EINGABE] Commit-Message (Enter = Auto): " MSG
    if [[ -z "$MSG" ]]; then
        DT=$(date +"%Y-%m-%d %H:%M")
        MSG="Update $DT"
    fi
    echo ""

    # ── git add ────────────────────────────────────────────────────
    if [[ "$MODE" == "2" ]]; then
        echo "[2/5] Index zuruecksetzen und ALLE Dateien neu stagen..."
        git rm -r --cached . >/dev/null 2>&1 || true
        git add -A -- .
    else
        echo "[2/5] Stage Dateien in diesem Ordner..."
        git add -- .
    fi

    echo "[3/5] Commit: $MSG"
    git commit -m "$MSG"
    echo ""

    # ── Push ───────────────────────────────────────────────────────
    echo "[4/5] Push zu origin/$BRANCH..."
    if ! git push origin "$BRANCH"; then
        echo ""
        echo "[WARNUNG] Normaler Push fehlgeschlagen."
        read -rp "[FRAGE] Force-Push? (j/N): " FORCE
        if [[ "${FORCE,,}" == "j" ]]; then
            git push --force origin "$BRANCH"
            echo "[OK] Force-Push erfolgreich."
        else
            echo "[ABBRUCH] Push abgebrochen."
            exit 1
        fi
    else
        echo "[OK] Push erfolgreich."
    fi
    echo ""

    # ── Firebase Deploy ────────────────────────────────────────────
    echo "[4b/5] Firebase Deploy..."
    if ! command -v firebase &>/dev/null; then
        echo "[WARNUNG] Firebase CLI nicht gefunden - Deploy uebersprungen."
        echo "          Installieren mit: npm install -g firebase-tools"
    else
        if ! firebase deploy --only hosting --project wavevapes-22dce; then
            echo "[FEHLER] Firebase Deploy fehlgeschlagen."
            read -rp "[FRAGE] Trotzdem weitermachen? (j/N): " CONT
            if [[ "${CONT,,}" != "j" ]]; then
                exit 1
            fi
        else
            echo "[OK] Firebase Deploy erfolgreich."
        fi
    fi
    echo ""
fi

# ── Verifikation ───────────────────────────────────────────────
echo "[5/5] GitHub Verifikation..."
echo ""
LOCAL_HASH=$(git rev-parse HEAD 2>/dev/null || true)
LOCAL_SHORT=$(git rev-parse --short HEAD 2>/dev/null || true)
echo "[INFO] Lokaler HEAD : $LOCAL_SHORT ($LOCAL_HASH)"

REMOTE_HASH=$(git ls-remote origin "refs/heads/$BRANCH" 2>/dev/null | awk '{print $1}' || true)
if [[ -z "$REMOTE_HASH" ]]; then
    echo "[WARNUNG] Remote-Hash nicht abrufbar."
else
    REMOTE_SHORT="${REMOTE_HASH:0:7}"
    echo "[INFO] Remote HEAD  : $REMOTE_SHORT ($REMOTE_HASH)"
    echo ""
    if [[ "$LOCAL_HASH" == "$REMOTE_HASH" ]]; then
        echo "[OK] VERIFIZIERT - Lokal und Remote sind identisch."
    else
        echo "[DIFF] UNTERSCHIED - Lokal und Remote weichen ab."
        echo "       Lokal  : $LOCAL_HASH"
        echo "       Remote : $REMOTE_HASH"
    fi
fi

# ── Zusammenfassung ────────────────────────────────────────────
echo ""
echo "============================================================"
echo " Letzte 5 Commits:"
echo "============================================================"
git log --oneline -5
echo ""
echo " Branch : $BRANCH"
echo " Remote : $REMOTE"
echo " Actions: https://github.com/EmreKnax1234/WaveVapes/actions"
echo ""
echo "============================================================"
echo " Fertig!"
echo "============================================================"
