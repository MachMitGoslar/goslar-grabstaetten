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
    cemetery: string;
    cemeteryName: string;
    cemeteryAddress: string;
    graveField: string;
    graveFieldLocationTitle: string;
    graveFieldLocationAddress: string;
    graveFieldLatitude?: number;
    graveFieldLongitude?: number;
    cemeteryImage: string;
    cemeteryImagePath: string;
    cemeteryUrl: string;
    cemeteryLatitude?: number;
    cemeteryLongitude?: number;
    navigationUrl: string;
    searchText: string;
};

export type GravesPage = {
    items: GraveRecord[];
    limit: number;
    nextOffset: number | null;
    offset: number;
    total: number;
};

export type GraveSearchParams = {
    birthDate?: string;
    cemetery?: string;
    deathDate?: string;
    query?: string;
    searchBirthName?: boolean;
    searchFirstName?: boolean;
    searchLastName?: boolean;
};

type GravesPageResponse = GravesPage | GraveRecord[];

const apiBaseUrl = import.meta.env.VITE_API_URL ?? '';
const gravesPageSize = 80;

const cemeteryImages = import.meta.glob('../assets/cemeteries/*', {
    eager: true,
    query: '?url',
    import: 'default',
}) as Record<string, string>;

const getCemeteryImage = (imagePath: string) => {
    const fileName = imagePath.replace(/^\//, '');

    return cemeteryImages[`../assets/cemeteries/${fileName}`] ?? '';
};

const enrichGrave = (grave: GraveRecord): GraveRecord => ({
    ...grave,
    cemeteryImage: grave.cemeteryImage || getCemeteryImage(grave.cemeteryImagePath),
});

const fetchJson = async <Data>(path: string, signal?: AbortSignal): Promise<Data> => {
    const response = await fetch(`${apiBaseUrl}${path}`, { signal });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
    }

    return response.json() as Promise<Data>;
};

const appendSearchParams = (params: URLSearchParams, searchParams: GraveSearchParams) => {
    if (searchParams.query) {
        params.set('q', searchParams.query);
    }

    if (searchParams.birthDate) {
        params.set('birthDate', searchParams.birthDate);
    }

    if (searchParams.deathDate) {
        params.set('deathDate', searchParams.deathDate);
    }

    if (searchParams.cemetery) {
        params.set('cemetery', searchParams.cemetery);
    }

    if (searchParams.searchFirstName !== undefined) {
        params.set('searchFirstName', String(searchParams.searchFirstName));
    }

    if (searchParams.searchLastName !== undefined) {
        params.set('searchLastName', String(searchParams.searchLastName));
    }

    if (searchParams.searchBirthName !== undefined) {
        params.set('searchBirthName', String(searchParams.searchBirthName));
    }
};

export const fetchGravesPage = async (
    offset = 0,
    limit = gravesPageSize,
    searchParams: GraveSearchParams = {},
    signal?: AbortSignal,
) => {
    const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
    });
    appendSearchParams(params, searchParams);

    const response = await fetchJson<GravesPageResponse>(`/api/graves?${params.toString()}`, signal);

    if (Array.isArray(response)) {
        return {
            items: response.map(enrichGrave),
            limit: response.length,
            nextOffset: null,
            offset: 0,
            total: response.length,
        };
    }

    return {
        ...response,
        items: response.items.map(enrichGrave),
    };
};

export const fetchGrave = async (graveId: string) => {
    const grave = await fetchJson<GraveRecord>(`/api/graves/${encodeURIComponent(graveId)}`);

    return enrichGrave(grave);
};

export const normalizeDateValue = (value: string) => {
    const trimmedValue = value.trim();
    const isoDateMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const germanDateMatch = trimmedValue.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const germanMonthMatch = trimmedValue.match(/^(\d{2})\.(\d{4})$/);
    const isoMonthMatch = trimmedValue.match(/^(\d{4})-(\d{2})$/);
    const isoYearMatch = trimmedValue.match(/^\d{4}$/);

    if (isoDateMatch) {
        return `${isoDateMatch[3]}${isoDateMatch[2]}${isoDateMatch[1]}`;
    }

    if (germanDateMatch) {
        return `${germanDateMatch[1]}${germanDateMatch[2]}${germanDateMatch[3]}`;
    }

    if (germanMonthMatch) {
        return `${germanMonthMatch[1]}${germanMonthMatch[2]}`;
    }

    if (isoMonthMatch) {
        return `${isoMonthMatch[2]}${isoMonthMatch[1]}`;
    }

    if (isoYearMatch) {
        return isoYearMatch[0];
    }

    return trimmedValue.replace(/\D/g, '');
};
