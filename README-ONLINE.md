# TET Reel-Tool online

**Live-Adresse: https://tet-reel-tool.onrender.com** (Render, Workspace TET, Blueprint aus dem öffentlichen Spiegel-Repo `theescapetheory/tet-reel-tool-online`). Nach Änderungen an der Oberfläche: `bash cockpit/hosted/publish.sh`, dann in Render beim Blueprint „Manual sync".

## Einrichtung (erledigt am 16.09.2026)

Das Tool besteht aus zwei Teilen: der **Oberfläche** (diese App, läuft beim Hoster) und der **Engine**
(Transkript, Schnitt, CapCut-Projekte), die auf einem Rechner läuft und alle 60 Sekunden mit der
Oberfläche abgleicht. Nutzer sehen nur die Online-Adresse.

## 1a. Kostenfrei: Render (Anne)
1. https://render.com → „Get Started" → Login mit dem TET-GitHub (Organisation theescapetheory).
2. **New → Web Service** → Repo `theescapetheory/tet-reel-engine` verbinden.
3. Einstellungen: **Root Directory** `cockpit/hosted` · **Build Command** leer lassen (oder `npm install`) · **Start Command** `node server.js` · **Instance Type: Free**.
4. **Environment Variables**: `COCKPIT_PASS` = Inhalt von `~/tet-reel-work/_state/cockpit-pass.txt` · `SYNC_SECRET` = Feld `secret` aus `~/.config/tet-reel/hosted.json`. (Kein `DATA_DIR` nötig — der Rechner stellt Stand und Dateien nach jedem Neustart innerhalb einer Minute wieder her.)
5. **Create Web Service** → Adresse notieren (z. B. `tet-reel-tool.onrender.com`).

Grenzen des Gratis-Tarifs: Der Dienst schläft nach 15 Minuten ohne Aufruf ein; solange der Rechner mit der Engine läuft, hält der Abgleich ihn wach. Ist der Rechner aus, dauert der erste Aufruf danach etwa eine Minute.

## 1b. Alternativ: Railway (ab 5 $/Monat nach der Testphase)
1. https://railway.app → Login mit dem TET-GitHub (Organisation theescapetheory).
2. **New Project → Deploy from GitHub repo** → `theescapetheory/tet-reel-engine` wählen.
3. Im Service unter **Settings → Root Directory**: `cockpit/hosted` eintragen. Start-Befehl erkennt Railway selbst (`npm start`).
4. **Variables** anlegen:
   - `COCKPIT_PASS` = Inhalt von `~/tet-reel-work/_state/cockpit-pass.txt` (Login für alle Nutzer, Benutzername egal)
   - `SYNC_SECRET` = Inhalt von `~/.config/tet-reel/hosted.json` → Feld `secret`
   - `DATA_DIR` = `/data`
5. **Volume** hinzufügen (Service → Volume), Mount Path `/data`, 5 GB reichen.
6. **Settings → Networking → Generate Domain** → Adresse notieren (z. B. `tet-reel-tool.up.railway.app`).

## 2. Rechner verbinden (Claude oder Anne)
In `~/.config/tet-reel/hosted.json` die Adresse eintragen (`"url": "https://…up.railway.app"`), dann:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tet.reel-sync.plist
```

Ab dann läuft `tet-reel sync --loop 60` dauerhaft. Prüfen: `tail ~/tet-reel-work/_state/sync.log`.

## 3. Nutzung
- Alle öffnen die Railway-Adresse, Login = COCKPIT_PASS. Kein Tailscale nötig.
- Uploads laufen über die drei Dropbox-Knöpfe in der Übersicht (Team-Uploads-Ordner).
- Knöpfe wie „Bauen", „Kandidaten", „Einplanen" legen einen Auftrag an; der Rechner führt ihn beim nächsten Sync aus, das Lauf-Protokoll erscheint danach online.
- Ist der Rechner aus, zeigt das Tool den letzten Stand und sammelt Aufträge; sie laufen, sobald er wieder an ist.

## Alternative Hoster
Render (Web Service + Disk) oder Fly.io funktionieren mit denselben Variablen. Wichtig ist nur ein
beschreibbares Verzeichnis für `DATA_DIR`.
