# Goslarer Gräber

Mobile-first React-Webapp für die Grabstellensuche und die Übersicht der Goslarer Friedhöfe.

## Funktionen

- Startseite mit Einstieg in `Grabstellensuche` und `Geotour`
- Friedhofskacheln aus `src/assets/data/cemeteries.json`
- Grabstellensuche auf Basis von `src/assets/data/data.CSV`
- Geotour-Seite mit eingebetteter externer Website
- Live-Suche nach Namen
- Filtermodal für Geburtsdatum, Todesdatum, Friedhof, Vorname, Nachname und Geburtsname
- Eigener Kalenderfilter mit Jahr-, Monat- und Tagesauswahl
- Responsive Layout für Mobile, Tablet und Desktop

## Entwicklung

Voraussetzung: Node.js und npm.

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Preview des Production-Builds:

```bash
npm run preview
```

## Routen

- `/` Startseite
- `/grabstellensuche` Suchseite für Grabstellen
- `/geotour` Seite mit externer Geotour-Ansicht

## Konfiguration

Die eingebettete Geotour-Website kann über eine Vite-Umgebungsvariable gesetzt werden:

```bash
VITE_GEOTOUR_URL=https://example.com npm run dev
```

Ohne Variable nutzt die App aktuell `https://www.goslar.de/` als Fallback.

## Daten

### Friedhöfe

Datei: `src/assets/data/cemeteries.json`

Die Bilder liegen in `src/assets/cemeteries`. Der Wert `image` in der JSON muss zum Dateinamen passen, zum Beispiel:

```json
{
  "name": "Feldstraße",
  "street": "Feldstraße 52",
  "city": "Goslar",
  "zipCode": "38640",
  "url": "https://www.goslar.de/...",
  "image": "/feldstraße.jpg"
}
```

### Grabstellen

Datei: `src/assets/data/data.CSV`

Empfohlenes Format:

- Encoding: `UTF-8 with BOM`
- Trennzeichen: Semikolon `;`
- Umlaute direkt als UTF-8 speichern
- Keine kaputten Ersatzzeichen wie `�`

Die Suchseite liest die CSV direkt per Vite Raw-Import. Namen mit `geb.` werden für die Anzeige vollständig behalten, aber beim Filtern getrennt ausgewertet:

- Anzeige: `Schäfer geb. Stafforst, Johanne`
- Nachname-Filter: `Schäfer`
- Geburtsname-Filter: `Stafforst`

## Projektstruktur

```text
src/
  assets/
    cemeteries/          Friedhofsbilder
    data/                JSON- und CSV-Daten
  components/            Wiederverwendbare UI-Komponenten
  pages/                 Seiten und Page-Styles
  theme/                 Farb- und Schriftvariablen
```

## Hinweise

Die Anwendung ist bewusst mobile-first gestaltet. Auf Tablet und Desktop nutzen die Kacheln die verfügbare Breite mit größeren Seitenabständen.
