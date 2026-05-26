@echo off
setlocal EnableDelayedExpansion

set PROJECT=C:\Users\Knax\Desktop\WaveVapes-main
cd /d "%PROJECT%"

echo.
echo ============================================================
echo   WaveVapes - GitHub + Firebase leeren
echo ============================================================
echo.
echo   Alle Dateien werden von GitHub und Firebase geloescht.
echo   Dein lokaler Ordner bleibt KOMPLETT unveraendert!
echo.
echo   Remote: https://github.com/EmreKnax1234/WaveVapes.git
echo   Branch: main
echo.
echo ============================================================
echo.
set /p "CONFIRM=[SICHERHEIT] Wirklich GitHub + Firebase leeren? (ja/N): "
if /i not "!CONFIRM!"=="ja" (
    echo [ABBRUCH] Nichts geloescht.
    set /p "DUMMY="
    exit /b 0
)

echo.
echo [1/3] Pruefe Git-Repository...
for /f "delims=" %%g in ('git rev-parse --show-toplevel 2^>nul') do set GIT_ROOT=%%g
if "!GIT_ROOT!"=="" (
    echo [FEHLER] Kein Git-Repository gefunden.
    set /p "DUMMY="
    exit /b 1
)
echo [OK] Repo gefunden.
echo.

echo [2/3] GitHub leeren (lokale Dateien bleiben unangetastet)...

:: Aktuellen Branch merken
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set ORIG_BRANCH=%%b
if "!ORIG_BRANCH!"=="" set ORIG_BRANCH=main

:: Temporaeres Verzeichnis fuer leeres Repo
set TMPDIR=%TEMP%\wavevapes-empty-%RANDOM%
mkdir "!TMPDIR!"
cd /d "!TMPDIR!"

git init >nul 2>&1
git remote add origin https://github.com/EmreKnax1234/WaveVapes.git >nul 2>&1
git commit --allow-empty -m "Clear repository" >nul 2>&1
git push origin HEAD:main --force
set GITHUB_RC=!errorlevel!

:: Aufraumen
cd /d "%PROJECT%"
rmdir /s /q "!TMPDIR!" >nul 2>&1

if !GITHUB_RC! NEQ 0 (
    echo [FEHLER] GitHub Push fehlgeschlagen.
    set /p "DUMMY="
    exit /b 1
)
echo [OK] GitHub ist jetzt leer.
echo.

echo [3/3] Firebase Hosting leeren...
where firebase >nul 2>&1
if errorlevel 1 (
    echo [WARNUNG] Firebase CLI nicht gefunden - Firebase wird uebersprungen.
) else (
    :: Leeres temp-Verzeichnis mit minimaler firebase.json deployen
    set FBTMP=%TEMP%\wavevapes-fb-empty-%RANDOM%
    mkdir "!FBTMP!"
    mkdir "!FBTMP!\public"
    echo {} > "!FBTMP!\public\index.html"
    echo {"hosting":{"public":"public"}} > "!FBTMP!\firebase.json"
    cd /d "!FBTMP!"
    firebase deploy --only hosting --project wavevapes-22dce
    set FB_RC=!errorlevel!
    cd /d "%PROJECT%"
    rmdir /s /q "!FBTMP!" >nul 2>&1
    if !FB_RC! NEQ 0 (
        echo [WARNUNG] Firebase Deploy fehlgeschlagen.
    ) else (
        echo [OK] Firebase Hosting geleert.
    )
)
echo.

echo ============================================================
echo  Fertig! GitHub und Firebase sind leer.
echo  Dein lokaler Ordner ist unveraendert geblieben.
echo  Nutze push.bat um alles neu hochzuladen.
echo ============================================================
set /p "DUMMY="
endlocal
