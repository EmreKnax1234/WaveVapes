@echo off
setlocal EnableDelayedExpansion

set PROJECT=C:\Users\Knax\Desktop\WaveVapes-main
cd /d "%PROJECT%"

echo.
echo ============================================================
echo   WaveVapes - ALLE Dateien aus GitHub entfernen
echo ============================================================
echo.
echo   [WARNUNG] Diese Aktion entfernt ALLE Dateien aus dem
echo   GitHub-Repository. Das lokale Verzeichnis bleibt
echo   unveraendert - nur das Remote-Repo wird geleert.
echo.
echo ============================================================
echo.

:: ── Sicherheitsabfrage 1 ───────────────────────────────────────
set /p "CONFIRM1=[FRAGE] Wirklich ALLE Dateien aus GitHub loeschen? (ja/N): "
if /i not "!CONFIRM1!"=="ja" (
    echo [ABBRUCH] Vorgang abgebrochen.
    pause & exit /b 0
)

:: ── Sicherheitsabfrage 2 ───────────────────────────────────────
echo.
echo   Letzte Chance! Alle Dateien auf GitHub werden geloescht.
echo.
set /p "CONFIRM2=[FRAGE] Bist du sicher? Tippe "LOESCHEN" zum Bestaetigen: "
if /i not "!CONFIRM2!"=="LOESCHEN" (
    echo [ABBRUCH] Bestaetigung falsch - Vorgang abgebrochen.
    pause & exit /b 0
)
echo.

:: ── Git pruefen ────────────────────────────────────────────────
where git >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Git nicht gefunden. Bitte Git installieren.
    pause & exit /b 1
)

:: ── Branch und Remote ermitteln ────────────────────────────────
git branch -M main 2>nul
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set BRANCH=%%b
if "!BRANCH!"=="" set BRANCH=main
for /f "delims=" %%r in ('git remote get-url origin 2^>nul') do set REMOTE=%%r

echo [INFO] Branch : !BRANCH!
echo [INFO] Remote : !REMOTE!
echo.

:: ── Aktuellen Status zeigen ────────────────────────────────────
echo [INFO] Dateien die aus GitHub entfernt werden:
echo ------------------------------------------------------------
git ls-files
echo ------------------------------------------------------------
echo.

for /f %%c in ('git ls-files 2^>nul ^| find /c /v ""') do set FILECOUNT=%%c
echo [INFO] !FILECOUNT! Datei(en) werden aus GitHub entfernt.
echo.

:: ── Commit-Message ─────────────────────────────────────────────
set /p "MSG=[EINGABE] Commit-Message (Enter = Auto): "
if "!MSG!"=="" (
    for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"`) do set DT=%%d
    set MSG=chore: remove all files !DT!
)
echo.

:: ── Alle Dateien aus Git-Index entfernen ───────────────────────
echo [1/4] Entferne alle Dateien aus dem Git-Index (lokal bleiben erhalten)...
git rm -r --cached .
if errorlevel 1 (
    echo [FEHLER] git rm fehlgeschlagen.
    pause & exit /b 1
)
echo [OK] Alle Dateien aus Index entfernt.
echo.

:: ── .gitkeep erstellen damit Repo nicht komplett leer ist ──────
echo [2/4] Erstelle leeren Commit...
git commit --allow-empty -m "!MSG!"
if errorlevel 1 (
    echo [FEHLER] Commit fehlgeschlagen.
    pause & exit /b 1
)
echo [OK] Commit erstellt.
echo.

:: ── Force-Push ─────────────────────────────────────────────────
echo [3/4] Force-Push zu origin/!BRANCH!...
echo.
echo   [LETZTE WARNUNG] Nach diesem Schritt sind alle Dateien
echo   auf GitHub unwiderruflich geloescht!
echo.
set /p "PUSHOK=[FRAGE] Jetzt pushen? (ja/N): "
if /i not "!PUSHOK!"=="ja" (
    echo [ABBRUCH] Push abgebrochen. Git-Index wurde bereits geleert.
    echo [HINWEIS] Mache die Aenderungen rueckgaengig mit:
    echo           git reset HEAD~1 --soft
    echo           git checkout -- .
    pause & exit /b 0
)

git push --force origin !BRANCH!
if errorlevel 1 (
    echo [FEHLER] Force-Push fehlgeschlagen.
    echo [HINWEIS] Versuche: git push --force-with-lease origin !BRANCH!
    pause & exit /b 1
)
echo [OK] Force-Push erfolgreich.
echo.

:: ── Verifikation ───────────────────────────────────────────────
echo [4/4] Verifikation...
echo.
for /f "delims=" %%h in ('git rev-parse --short HEAD 2^>nul') do set LOCAL_SHORT=%%h
for /f "tokens=1" %%h in ('git ls-remote origin refs/heads/!BRANCH! 2^>nul') do set REMOTE_HASH=%%h
set REMOTE_SHORT=!REMOTE_HASH:~0,7!

echo [INFO] Lokaler HEAD : !LOCAL_SHORT!
echo [INFO] Remote HEAD  : !REMOTE_SHORT!
echo.
for /f %%c in ('git ls-remote --heads origin 2^>nul ^| find /c /v ""') do set RBRANCHES=%%c
echo [INFO] Remote-Branches: !RBRANCHES!
echo.

:: ── Zusammenfassung ────────────────────────────────────────────
echo ============================================================
echo  FERTIG - Alle Dateien wurden aus GitHub entfernt!
echo ============================================================
echo.
echo  Branch  : !BRANCH!
echo  Remote  : !REMOTE!
echo  Dateien : !FILECOUNT! Dateien entfernt
echo.
echo  GitHub  : https://github.com/EmreKnax1234/WaveVapes
echo  Actions : https://github.com/EmreKnax1234/WaveVapes/actions
echo.
echo  [HINWEIS] Lokale Dateien sind noch vorhanden.
echo  Um wieder hochzuladen: push.bat ausfuehren.
echo.
echo ============================================================
pause >nul
endlocal
