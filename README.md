# Goslarer Gräber

Mobile-first React-Webapp mit Node/PostgreSQL-API für Grabstellensuche, Friedhofsübersicht und Geotour der Goslarer Friedhöfe.

## Funktionen

- Startseite mit Einstieg in `Grabstellensuche` und `Geotour`
- Friedhofskacheln aus `src/data/cemeteries.json`
- Grabstellensuche über PostgreSQL statt CSV-Import im Browser
- Serverseitige Freitextsuche nach Namen, Geburtsnamen, Datumsangaben, Friedhöfen, Grabnummern und Adressen
- Filtermodal für Geburtsdatum, Todesdatum, Friedhof, Vorname, Nachname und Geburtsname
- Kalenderfilter mit Jahr-, Monat- und Tagesauswahl, da historische Daten nicht immer taggenau vorliegen
- Detailansicht pro Grabstelle mit Friedhofsbild, Beschreibung, Lebensdaten und Navigationslink
- Leaflet/OpenStreetMap-Karte in der Detailansicht
- Geotour-Seite mit eingebetteter externer Website und Geolocation-Freigabe für das iframe
- Responsive Layout für Mobile, Tablet und Desktop

## Entwicklung

Voraussetzung: Node.js, npm und eine laufende PostgreSQL-Datenbank.

Dependencies installieren:

```bash
npm install
```

API starten:

```bash
npm run api
```

Frontend in einem zweiten Terminal starten:

```bash
npm run dev
```

Die Vite-App proxyt `/api` automatisch an `http://localhost:3001`.

## Docker/Plesk Deployment

Das Docker-Setup veröffentlicht im normalen Webbetrieb nur den Gateway-Container nach außen. Intern laufen React, Angular-Tour, API, PostgreSQL und optional der Mailserver getrennt. In Production veröffentlicht der Mailserver zusätzlich die SMTP-/Submission-/IMAPS-Ports.

Zielrouten:

```text
https://friedhof.goslar.de/       -> React-App
https://friedhof.goslar.de/tour/  -> Angular Cemetery Tour
https://friedhof.goslar.de/api/   -> Node/Express-API
mail.friedhof.goslar.de:25        -> Mailserver SMTP
mail.friedhof.goslar.de:587       -> Mailserver Submission
mail.friedhof.goslar.de:993       -> Mailserver IMAPS
```

Dateien:

```text
docker-compose.yml          Compose-Setup für Development: Gateway, React, Tour, API, DB und optional Mailserver
docker-compose.production.yml Compose-Setup für Production: veröffentlichte Images, DB und Mailserver
Dockerfile.web              Production-Build der React-App
Dockerfile.api              Production-Container für die Express-API
submodules/cemetery-tour/   Angular-Tour inkl. Dockerfile
submodules/grave-db/        PostgreSQL-Schema, Excel-Daten und Importer
docker/nginx/default.conf   Reverse Proxy für /, /tour/ und /api/
docker-data/dms/            Persistente Mailserver-Daten und docker-mailserver-Konfiguration, nicht im Git
```

Konfiguration vorbereiten:

```bash
git submodule update --init --recursive
cp .env.docker.example .env
```

Submodules aktualisieren:

```bash
git submodule update --remote --merge submodules/cemetery-tour submodules/grave-db
git add .gitmodules submodules/cemetery-tour submodules/grave-db
git commit -m "chore: update submodules"
```

Beide Submodules sind in `.gitmodules` auf `branch = main` verknüpft. Der Parent-Repo-Commit pinnt trotzdem immer konkrete Submodule-Commits, damit Deployments reproduzierbar bleiben.

Wichtige Werte in `.env`:

```text
HTTP_PORT=8080
POSTGRES_DB=gravedb
POSTGRES_USER=grave
POSTGRES_PASSWORD=...
GRAVE_DB_CONTEXT=./submodules/grave-db
GRAVE_DB_DOCKERFILE=Dockerfile
GRAVE_DB_IMPORTER_DOCKERFILE=Dockerfile.importer
CEMETERY_TOUR_CONTEXT=./submodules/cemetery-tour
CEMETERY_TOUR_DOCKERFILE=Dockerfile
CEMETERY_TOUR_BUILD_COMMAND=npm run build -- --base-href /tour/ --deploy-url /tour/
CEMETERY_TOUR_DIST_DIR=www
SMTP_HOST=mailserver
SMTP_PORT=25
SMTP_FROM=no-reply@friedhof.test
```

`GRAVE_DB_CONTEXT` zeigt standardmäßig auf das `grave-db`-Submodule. Der DB-Dockerfile basiert auf PostgreSQL und legt das Schema beim ersten Start eines leeren Volumes an. Der Importer-Dockerfile baut einen separaten Python-Container für den Excel-Import.

`CEMETERY_TOUR_CONTEXT` zeigt standardmäßig auf das Angular-Tour-Submodule. `CEMETERY_TOUR_DOCKERFILE` ist der Dockerfile im Tour-Repo. `CEMETERY_TOUR_DIST_DIR` muss auf den Ordner zeigen, der nach dem Angular-Build die `index.html` enthält.

Start:

```bash
docker compose up -d --build
```

Development startet den internen Mailserver zusammen mit der Plattform. Es werden keine Mail-Ports auf dem Host veröffentlicht; die API sendet intern über `mailserver:25`.

Nur den Development-Mailserver separat starten:

```bash
docker compose up -d mailserver
```

Development-SMTP:

```text
SMTP_HOST=mailserver
SMTP_PORT=25
SMTP_FROM=no-reply@friedhof.test
SMTP_SECURE=false
```

Development-Webmail:

```text
http://127.0.0.1:8081
```

Login erfolgt mit der vollständigen Mailadresse, z. B. `no-reply@friedhof.test` oder `test@friedhof.test`.

Das lokale Development-Postfach wird einmalig im Mailserver angelegt:

```bash
docker compose exec mailserver setup email add no-reply@friedhof.test '<passwort>'
docker compose exec mailserver setup email add test@friedhof.test '<passwort>'
docker compose restart mailserver
```

Production-Start mit GHCR-Images:

```bash
cp .env.production.example .env
# Danach in .env mindestens POSTGRES_PASSWORD, ANALYTICS_ADMIN_PASSWORD und IMAGE_TAG setzen.
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

Live-Konfiguration für `friedhof.goslar.de`:

```text
PUBLIC_BASE_URL=https://friedhof.goslar.de
FORCE_SECURE_COOKIES=true
MAILSERVER_HOSTNAME=mail.friedhof.goslar.de
MAILSERVER_DOMAINNAME=friedhof.goslar.de
SMTP_FROM=no-reply@friedhof.goslar.de
SMTP_HOST=mailserver
SMTP_PORT=25
SMTP_SECURE=false
```

Für den Live-Betrieb müssen `POSTGRES_PASSWORD` und `ANALYTICS_ADMIN_PASSWORD` starke, zufällige Werte sein. `IMAGE_TAG=latest` ist für schnelle Tests möglich; für nachvollziehbare Deployments sollte ein Release-Tag oder `sha-...`-Tag verwendet werden.

Production-Mailserver:

```text
MAILSERVER_HOSTNAME=mail.friedhof.goslar.de
MAILSERVER_DOMAINNAME=friedhof.goslar.de
SMTP_HOST=mailserver
SMTP_PORT=25
SMTP_FROM=no-reply@friedhof.goslar.de
LETSENCRYPT_PATH=/etc/letsencrypt
```

Alle Plattform-Mails, z. B. Admin-Ersteinrichtung und Passwort-zurücksetzen, laufen über den internen Mailserver. Die API nutzt dafür `mailserver:25` innerhalb des Docker-Netzwerks und setzt als Absender die konfigurierte `SMTP_FROM`-Adresse, z. B. `no-reply@friedhof.goslar.de`.

Der Production-Mailserver nutzt `ghcr.io/docker-mailserver/docker-mailserver:latest`, persistiert Daten unter `./docker-data/dms/` und bindet nach außen standardmäßig:

- `25` SMTP
- `587` Submission
- `993` IMAPS

SpamAssassin und ClamAV sind standardmäßig deaktiviert, um RAM zu sparen. Fail2ban ist in Production aktiviert.

DNS-/Betriebsanforderungen für Production:

- `A`/`AAAA` Record für `friedhof.goslar.de` auf den Webserver
- `A`/`AAAA` Record für `mail.friedhof.goslar.de` auf den Mailserver
- `MX` Record für `friedhof.goslar.de` auf `mail.friedhof.goslar.de`
- gültiges Let's-Encrypt-Zertifikat unter `${LETSENCRYPT_PATH}` für den Mail-Host
- SPF, DKIM und DMARC für zuverlässige Zustellung
- Mailboxen/Accounts in `docker-data/dms/config/`

Das `no-reply`-Postfach muss vor bzw. direkt nach dem ersten Start angelegt werden, sonst beendet docker-mailserver Dovecot wieder:

```bash
docker compose -f docker-compose.production.yml exec mailserver setup email add no-reply@friedhof.goslar.de '<starkes-passwort>'
docker compose -f docker-compose.production.yml restart mailserver
```

Die Production-Datei nutzt veröffentlichte Images aus der GitHub Container Registry:

```text
ghcr.io/machmitgoslar/goslar-grabstaetten-web
ghcr.io/machmitgoslar/goslar-grabstaetten-api
ghcr.io/machmitgoslar/goslar-grabstaetten-tour
ghcr.io/machmitgoslar/goslar-grabstaetten-db
ghcr.io/machmitgoslar/goslar-grabstaetten-db-import
```

`IMAGE_TAG` steuert die Version. Für reproduzierbare Deployments sollte ein `sha-...`-Tag oder Release-Tag statt `latest` genutzt werden.

DB-Verbindung im Production-Compose:

```text
POSTGRES_DB=gravedb
POSTGRES_USER=grave
POSTGRES_PASSWORD=...
POSTGRES_HOST=db
```

`POSTGRES_HOST=db` funktioniert nur, wenn `api` und `db` im selben Compose-Projekt bzw. Docker-Netzwerk laufen. Falls Plesk die Datenbank separat startet, muss `POSTGRES_HOST` auf den tatsächlichen Container-/Service-Namen gesetzt werden oder `DATABASE_URL` vollständig überschrieben werden:

```text
DATABASE_URL=postgresql://grave:...@<db-host>:5432/gravedb
```

Plesk:

- Domain `friedhof.goslar.de` auf den Server zeigen lassen.
- In Plesk den Docker-/Proxy-Endpunkt auf `http://127.0.0.1:8080` bzw. den gesetzten `HTTP_PORT` routen.
- TLS/Let's Encrypt in Plesk für `friedhof.goslar.de` aktivieren.

Datenbank:

- PostgreSQL läuft als Service `db` mit persistentem Volume `postgres_data`.
- Das Schema kommt aus `GRAVE_DB_CONTEXT/sql/schema.sql` und wird beim ersten Start eines leeren Volumes importiert.
- Die Excel-Daten aus dem DB-Repo werden beim ersten Start eines leeren Volumes automatisch importiert.
- Der automatische Import läuft nicht bei jedem Containerstart erneut, sondern nur bei der PostgreSQL-Initialisierung eines neuen Volumes.
- Gezielter Reimport in ein bestehendes Volume:

```bash
docker compose --profile import run --rm db-import
```

- Vollständiger Reset mit anschließendem Import:

```bash
docker compose --profile import run --rm db-import python scripts/import_excel.py --init-schema --reset
```

Lint:

```bash
npm run lint
```

Build:

```bash
npm run build
```

Preview des Production-Builds:

```bash
npm run preview
```

## Datenbank

Standard-Verbindung:

```text
postgresql://grave:grave@localhost:5432/gravedb
```

Alternativ kann die Verbindung über `DATABASE_URL` gesetzt werden:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/db npm run api
```

Der API-Port kann über `API_PORT` geändert werden. Standard ist `3001`.

```bash
API_PORT=3002 npm run api
```

Genutzte Tabellen:

- `burials`
- `persons`
- `graves`
- optional referenziert über vorhandene Import-/Staging-Tabellen

Die API liest Grabstellen über Joins aus `burials`, `persons` und `graves`. Friedhofs-Metadaten wie Name, Adresse, Bild und Koordinaten werden zusätzlich aus `src/data/cemeteries.json` ergänzt.

## API

- `GET /api/health` prüft die PostgreSQL-Verbindung
- `GET /api/graves` liefert eine serverseitig gefilterte und paginierte Grabstellenliste
- `GET /api/graves/:id` liefert eine einzelne Grabstelle für die Detailansicht

Paging-Parameter:

```text
GET /api/graves?limit=80&offset=0&q=schmidt
```

Antwortformat:

```json
{
  "items": [],
  "limit": 80,
  "nextOffset": 80,
  "offset": 0,
  "total": 12345
}
```

Das Frontend lädt initial nur die erste Seite und lädt weitere Treffer erst nach Klick auf `Weitere laden`. Dadurch bleiben Suche, Eingabe und Navigation auch bei großen Datenmengen reaktionsfähig.

Unterstützte Query-Parameter:

- `q`
- `limit`
- `offset`
- `birthDate`
- `deathDate`
- `cemetery`
- `searchFirstName`
- `searchLastName`
- `searchBirthName`

## Routen

- `/` Startseite
- `/grabstellensuche` Suchseite für Grabstellen
- `/grabstellensuche/:graveId` Detailansicht einer Grabstelle
- `/geotour` Seite mit externer Geotour-Ansicht

## Konfiguration

Die eingebettete Geotour-Website kann über eine Vite-Umgebungsvariable gesetzt werden:

```bash
VITE_GEOTOUR_URL=https://example.com npm run dev
```

Ohne Variable nutzt die App aktuell `http://localhost:4200` als Fallback.

Falls die API nicht über den Vite-Proxy erreichbar sein soll, kann im Frontend eine API-Basis-URL gesetzt werden:

```bash
VITE_API_URL=http://localhost:3001 npm run dev
```

## Friedhöfe

Datei: `src/data/cemeteries.json`

Die Friedhofsbilder liegen in `src/assets/cemeteries`. Der Wert `image` in der JSON muss zum Dateinamen passen. Für die Leaflet-Karte werden zusätzlich `latitude` und `longitude` genutzt.

```json
{
  "name": "Feldstraße",
  "street": "Feldstraße 52",
  "city": "Goslar",
  "zipCode": "38640",
  "url": "https://www.goslar.de/...",
  "image": "/feldstraße.jpg",
  "latitude": 51.91773,
  "longitude": 10.43667
}
```

## Suche und Datumswerte

Namen mit `geb.` werden für die Anzeige vollständig behalten, aber beim Suchen und Filtern getrennt ausgewertet:

- Anzeige: `Schäfer geb. Stafforst, Johanne`
- Nachname-Suche: `Schäfer`
- Geburtsname-Suche: `Stafforst`

Datumswerte können vollständig, monatsgenau oder nur als Jahr gesucht und gefiltert werden, zum Beispiel:

- `12.04.1889`
- `04.1889`
- `1889`

Die Genauigkeit kommt aus den Spalten `birth_date_precision`, `death_date_precision` und `burial_date_precision`.

## Karten

Die Detailansicht nutzt Leaflet mit einem hellen CARTO-Basemaps-Layer:

```text
https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png
```

Die Kartendaten stammen aus OpenStreetMap. Attribution wird in der Karte angezeigt. Der Navigationslink öffnet je nach Gerät Android Maps, Apple Maps oder einen Web-Fallback.

## Projektstruktur

```text
server/
  index.mjs              Node/Express-API für PostgreSQL
src/
  assets/
    cemeteries/          Friedhofsbilder
  components/            Wiederverwendbare UI-Komponenten
  data/                  API-Client, Typen und Friedhofs-Metadaten
  pages/                 Seiten und Page-Styles
  theme/                 Farb- und Schriftvariablen
```

## Hinweise

Die Anwendung ist bewusst mobile-first gestaltet. Auf Tablet und Desktop nutzen Inhalte und Kacheln die verfügbare Breite mit größeren Seitenabständen.
