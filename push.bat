@echo off
setlocal EnableDelayedExpansion

set PROJECT=C:\Users\Knax\Desktop\WaveVapes-main
cd /d "%PROJECT%"
git branch -M main 2>nul

echo.
echo ============================================================
echo   WaveVapes - Git Push + GitHub Verify
echo ============================================================
echo.
echo   [1] Normaler Push (nur Aenderungen)
echo   [2] ALLE Dateien neu pushen (force replace all)
echo.
set /p "MODE=[WAHL] Modus waehlen (1/2, Enter = 1): "
if "!MODE!"=="" set MODE=1
if "!MODE!"=="2" (
    echo.
    echo [INFO] Modus: ALLE Dateien werden neu gestaged und gepusht.
    echo [INFO] Der Git-Index wird zurueckgesetzt - alle Dateien gelten als neu.
    echo.
)
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Git nicht gefunden.
    pause & exit /b 1
)

:: ── Git-Root pruefen ───────────────────────────────────────────
for /f "delims=" %%g in ('git rev-parse --show-toplevel 2^>nul') do set GIT_ROOT=%%g
if "!GIT_ROOT!"=="" (
    echo [FEHLER] Kein Git-Repository gefunden.
    pause & exit /b 1
)

:: Normalize slashes fuer Vergleich
set GIT_ROOT_NORM=!GIT_ROOT:/=\!
set PROJECT_NORM=%PROJECT%

if /i not "!GIT_ROOT_NORM!"=="!PROJECT_NORM!" (
    echo [WARNUNG] Das .git-Verzeichnis liegt NICHT im Projektordner^^!
    echo           .git liegt in: !GIT_ROOT!
    echo           Projekt liegt in: %PROJECT%
    echo.
    echo           Das bedeutet: git wuerde DEINEN GESAMTEN
    echo           BENUTZERORDNER committen^^!
    echo.
    echo [LOESUNG] Initialisiere neues Git-Repo nur fuer dieses Projekt?
    set /p "INIT=[FRAGE] Neues Repo hier initialisieren? (j/N): "
    if /i "!INIT!"=="j" (
        git init "%PROJECT%"
        cd /d "%PROJECT%"
        git remote add origin https://github.com/EmreKnax1234/WaveVapes.git
        echo [OK] Neues Repo initialisiert.
    ) else (
        echo [ABBRUCH] Bitte das .git-Problem manuell beheben.
        pause & exit /b 1
    )
)

:: ── Branch und Remote ──────────────────────────────────────────
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set BRANCH=%%b
if "!BRANCH!"=="" set BRANCH=main
for /f "delims=" %%r in ('git remote get-url origin 2^>nul') do set REMOTE=%%r

echo [INFO] Branch : !BRANCH!
echo [INFO] Remote : !REMOTE!
echo [INFO] Scope  : %PROJECT%
echo.

:: ── .gitignore sicherstellen ───────────────────────────────────
if not exist "%PROJECT%\.gitignore" (
    echo [INFO] Keine .gitignore gefunden - erstelle eine...
    (
        echo node_modules/
        echo .env
        echo .env.local
        echo *.log
        echo .DS_Store
        echo Thumbs.db
        echo dist/
        echo build/
    ) > "%PROJECT%\.gitignore"
    echo [OK] .gitignore erstellt.
    echo.
)

:: ── Sitemap lastmod aktualisieren ───────────────────────────
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd'"`) do set TODAY=%%d
powershell -NoProfile -Command "(Get-Content '%PROJECT%\sitemap.xml') -replace '<lastmod>[0-9]{4}-[0-9]{2}-[0-9]{2}</lastmod>', '<lastmod>%TODAY%</lastmod>' | Set-Content '%PROJECT%\sitemap.xml' -Encoding UTF8"
echo [INFO] Sitemap lastmod aktualisiert auf %TODAY%
echo.

:: ── Status nur fuer diesen Ordner ─────────────────────────────
echo [1/5] Geaenderte Dateien in %PROJECT%:
echo ------------------------------------------------------------
git status --short -- .
echo ------------------------------------------------------------
echo.

set CHANGES=0
for /f %%c in ('git status --short -- . 2^>nul ^| find /c /v ""') do set CHANGES=%%c

if "!CHANGES!"=="0" (
    if "!MODE!"=="2" (
        echo [INFO] Keine lokalen Aenderungen - aber Modus 2 erzwingt neu-Stage.
        echo [INFO] Alle Dateien werden neu committed.
    ) else (
        echo [INFO] Keine Aenderungen - springe zu Verifikation.
        goto :verify
    )
)
echo [INFO] !CHANGES! Datei(en) geaendert.
echo.

:: ── Commit-Message ─────────────────────────────────────────────
set /p "MSG=[EINGABE] Commit-Message (Enter = Auto): "
if "!MSG!"=="" (
    for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"`) do set DT=%%d
    set MSG=Update !DT!
)
echo.

:: ── git add (NUR dieser Ordner) ────────────────────────────────
if "!MODE!"=="2" (
    echo [2/5] Index zuruecksetzen und ALLE Dateien neu stagen...
    git rm -r --cached . >nul 2>&1
    git add -A -- .
) else (
    echo [2/5] Stage Dateien in diesem Ordner...
    git add -- .
)
if errorlevel 1 ( echo [FEHLER] git add fehlgeschlagen. & pause & exit /b 1 )

echo [3/5] Commit: !MSG!
git commit -m "!MSG!"
echo.

:: ── Push ───────────────────────────────────────────────────────
echo [4/5] Push zu origin/!BRANCH!...
git push origin !BRANCH!
if errorlevel 1 (
    echo.
    echo [WARNUNG] Normaler Push fehlgeschlagen.
    set /p "FORCE=[FRAGE] Force-Push? (j/N): "
    if /i "!FORCE!"=="j" (
        git push --force origin !BRANCH!
        if errorlevel 1 ( echo [FEHLER] Force-Push fehlgeschlagen. & pause & exit /b 1 )
        echo [OK] Force-Push erfolgreich.
    ) else (
        echo [ABBRUCH] Push abgebrochen. & pause & exit /b 1
    )
) else (
    echo [OK] Push erfolgreich.
)
echo.

:: ── Verifikation ───────────────────────────────────────────────
:verify
echo [5/5] GitHub Verifikation...
echo.
for /f "delims=" %%h in ('git rev-parse HEAD 2^>nul') do set LOCAL_HASH=%%h
for /f "delims=" %%s in ('git rev-parse --short HEAD 2^>nul') do set LOCAL_SHORT=%%s
echo [INFO] Lokaler HEAD : !LOCAL_SHORT! (!LOCAL_HASH!)

for /f "tokens=1" %%h in ('git ls-remote origin refs/heads/!BRANCH! 2^>nul') do set REMOTE_HASH=%%h
if "!REMOTE_HASH!"=="" ( echo [WARNUNG] Remote-Hash nicht abrufbar. & goto :summary )

set REMOTE_SHORT=!REMOTE_HASH:~0,7!
echo [INFO] Remote HEAD  : !REMOTE_SHORT! (!REMOTE_HASH!)
echo.

if "!LOCAL_HASH!"=="!REMOTE_HASH!" (
    echo [OK] VERIFIZIERT - Lokal und Remote sind identisch.
) else (
    echo [DIFF] UNTERSCHIED - Lokal und Remote weichen ab.
    echo        Lokal  : !LOCAL_HASH!
    echo        Remote : !REMOTE_HASH!
)

:: ── Zusammenfassung ────────────────────────────────────────────
:summary
echo.
echo ============================================================
echo  Letzte 5 Commits:
echo ============================================================
git log --oneline -5
echo.
echo  Branch : !BRANCH!
echo  Remote : !REMOTE!
echo  Actions: https://github.com/EmreKnax1234/WaveVapes/actions
echo.
echo ============================================================
echo  Fertig! Druecke eine Taste zum Schliessen.
echo ============================================================
pause >nul
endlocal
