import cemeteries from './cemeteries.json';
import graveCsv from './data.CSV?raw';

export type GraveRecord = {
    id: string;
    cemeteryCode: string;
    graveNumber: string;
    displayLastName: string;
    lastName: string;
    firstName: string;
    birthName: string;
    birthDate: string;
    birthPlace: string;
    deathDate: string;
    burialDate: string;
    age: string;
    status: string;
    note: string;
    remark: string;
    cemetery: string;
    cemeteryName: string;
    cemeteryAddress: string;
    cemeteryImage: string;
    cemeteryUrl: string;
    cemeteryLatitude?: number;
    cemeteryLongitude?: number;
    navigationUrl: string;
    searchText: string;
};

type Cemetery = {
    name: string;
    street: string;
    city: string;
    zipCode: string;
    url: string;
    image: string;
    latitude?: number;
    longitude?: number;
};

const cemeteryImages = import.meta.glob('../assets/cemeteries/*', {
    eager: true,
    query: '?url',
    import: 'default',
}) as Record<string, string>;

const cemeteryNames: Record<string, string> = {
    Hi: 'Hildesheimer Straße',
    Fh: 'Feldstraße',
};

const getCemeteryImage = (imagePath: string) => {
    const fileName = imagePath.replace(/^\//, '');

    return cemeteryImages[`../assets/cemeteries/${fileName}`] ?? '';
};

const splitLastName = (name: string) => {
    const match = name.match(/^(.+?)\s+geb\.?\s+(.+)$/i);

    return {
        lastName: match?.[1]?.trim() || name,
        birthName: match?.[2]?.trim() ?? '',
    };
};

const getCemetery = (cemeteryCode: string) => {
    const cemeteryName = cemeteryNames[cemeteryCode] ?? cemeteryCode;

    return (cemeteries as Cemetery[]).find((cemetery) => cemetery.name === cemeteryName);
};

const getCemeteryAddress = (cemetery?: Cemetery) => {
    if (!cemetery) {
        return '';
    }

    return `${cemetery.street}, ${cemetery.zipCode} ${cemetery.city}`;
};

const getAge = (columns: string[]) => [
    columns[11],
    columns[12],
    columns[13],
    columns[14],
].filter(Boolean).join(' ');

export const normalizeDateValue = (value: string) => {
    const trimmedValue = value.trim();
    const isoDateMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const isoMonthMatch = trimmedValue.match(/^(\d{4})-(\d{2})$/);
    const isoYearMatch = trimmedValue.match(/^\d{4}$/);

    if (isoDateMatch) {
        return `${isoDateMatch[3]}${isoDateMatch[2]}${isoDateMatch[1]}`;
    }

    if (isoMonthMatch) {
        return `${isoMonthMatch[2]}${isoMonthMatch[1]}`;
    }

    if (isoYearMatch) {
        return isoYearMatch[0];
    }

    return trimmedValue.replace(/\D/g, '');
};

export const parseGraves = (csv: string): GraveRecord[] => {
    const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);

    return lines.slice(1).map((line) => {
        const columns = line.split(';');
        const id = columns[0] ?? '';
        const cemeteryCode = columns[1] ?? '';
        const graveNumber = columns[4] ?? '';
        const name = columns[8] || 'Unbekannt';
        const { lastName, birthName } = splitLastName(name);
        const firstName = columns[9] || '';
        const birthDate = columns[15] || columns[25] || 'Unbekannt';
        const deathDate = columns[19] || columns[26] || 'Unbekannt';
        const cemetery = getCemetery(cemeteryCode);
        const cemeteryName = cemetery?.name ?? cemeteryNames[cemeteryCode] ?? cemeteryCode;
        const cemeteryAddress = getCemeteryAddress(cemetery);
        const cemeteryLabel = [cemeteryName, graveNumber && `Grab ${graveNumber}`]
            .filter(Boolean)
            .join(' · ');
        const birthPlace = columns[16] || 'Unbekannt';
        const burialDate = columns[20] || 'Unbekannt';
        const age = getAge(columns) || 'Unbekannt';
        const status = columns[18] || '';
        const note = columns[21] || '';
        const remark = columns[22] || '';
        const searchText = [
            firstName,
            lastName,
            birthName,
            birthDate,
            deathDate,
            cemeteryLabel,
            status,
            note,
        ].join(' ').toLowerCase();

        return {
            id,
            cemeteryCode,
            graveNumber,
            displayLastName: name,
            lastName,
            firstName,
            birthName,
            birthDate,
            birthPlace,
            deathDate,
            burialDate,
            age,
            status,
            note,
            remark,
            cemetery: cemeteryLabel,
            cemeteryName,
            cemeteryAddress,
            cemeteryImage: cemetery ? getCemeteryImage(cemetery.image) : '',
            cemeteryUrl: cemetery?.url ?? '',
            cemeteryLatitude: cemetery?.latitude,
            cemeteryLongitude: cemetery?.longitude,
            navigationUrl: cemeteryAddress
                ? `https://maps.apple.com/?daddr=${encodeURIComponent(cemeteryAddress)}`
                : cemetery?.url ?? '',
            searchText,
        };
    });
};

export const graves = parseGraves(graveCsv);

export const cemeteryOptions = Array.from(
    new Set(graves.map((grave) => grave.cemeteryName).filter(Boolean)),
).sort((left, right) => left.localeCompare(right, 'de'));
