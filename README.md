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
- Leaflet/OpenStreetMap-Karte in der Detailansicht mit hellem CARTO-Kartenstil
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
