import express from 'express';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? '127.0.0.1';
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://grave:grave@localhost:5432/gravedb';

const pool = new Pool({ connectionString: databaseUrl });
const cemeteries = JSON.parse(
    await readFile(resolve(__dirname, '../src/data/cemeteries.json'), 'utf8'),
);

const cemeteryNames = {
    Hi: 'Hildesheimer Straße',
    Fe: 'Feldstraße',
    Hkl: 'Hahnenklee',
    JE: 'Jerstedt',
    Ok: 'Oker'
};

const cemeteryCodesByName = Object.entries(cemeteryNames).reduce((codesByName, [code, name]) => ({
    ...codesByName,
    [name]: [...(codesByName[name] ?? []), code],
}), {});

const getCemetery = (cemeteryCode) => {
    const cemeteryName = cemeteryNames[cemeteryCode] ?? cemeteryCode;

    return cemeteries.find((cemetery) => cemetery.name === cemeteryName);
};

const getCemeteryAddress = (cemetery) => {
    if (!cemetery) {
        return '';
    }

    return `${cemetery.street}, ${cemetery.zipCode} ${cemetery.city}`;
};

const toNumber = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : undefined;
};

const formatDate = (dateValue, precision) => {
    if (!dateValue) {
        return 'Unbekannt';
    }

    const [year, month, day] = dateValue instanceof Date
        ? [
            String(dateValue.getFullYear()),
            String(dateValue.getMonth() + 1).padStart(2, '0'),
            String(dateValue.getDate()).padStart(2, '0'),
        ]
        : String(dateValue).slice(0, 10).split('-');

    if (precision === 'year') {
        return year;
    }

    if (precision === 'month') {
        return `${month}.${year}`;
    }

    return `${day}.${month}.${year}`;
};

const getAge = (ageYears) => {
    if (ageYears === null || ageYears === undefined) {
        return 'Unbekannt';
    }

    return `${ageYears} Jahre`;
};

const mapRowToGrave = (row) => {
    const cemetery = getCemetery(row.cemetery_code);
    const cemeteryName = cemetery?.name ?? cemeteryNames[row.cemetery_code] ?? row.cemetery_code ?? 'Unbekannt';
    const cemeteryAddress = getCemeteryAddress(cemetery);
    const graveFieldLatitude = toNumber(row.grave_field_latitude ?? row.grave_field_location_latitude);
    const graveFieldLongitude = toNumber(row.grave_field_longitude ?? row.grave_field_location_longitude);
    const graveFieldLocationAddress = row.grave_field_location_address ?? '';
    const graveFieldLocationTitle = row.grave_field_location_title ?? '';
    const graveField = row.grave_field ?? '';
    const graveNumber = row.grave_number ?? '';
    const cemeteryLabel = [
        cemeteryName,
        graveField && `Grabfeld ${graveField}`,
        graveNumber && `Grab ${graveNumber}`,
    ]
        .filter(Boolean)
        .join(' · ');
    const displayLastName = row.birth_name
        ? `${row.last_name ?? 'Unbekannt'} geb. ${row.birth_name}`
        : row.last_name ?? 'Unbekannt';
    const birthDate = formatDate(row.birth_date, row.birth_date_precision);
    const deathDate = formatDate(row.death_date, row.death_date_precision);
    const burialDate = formatDate(row.burial_date, row.burial_date_precision);
    const searchText = [
        row.first_name,
        row.last_name,
        row.birth_name,
        birthDate,
        deathDate,
        burialDate,
        cemeteryLabel,
        row.occupation_or_status,
        row.note,
    ].filter(Boolean).join(' ').toLowerCase();

    return {
        id: String(row.burial_id),
        cemeteryCode: row.cemetery_code ?? '',
        graveNumber,
        displayLastName,
        lastName: row.last_name ?? 'Unbekannt',
        firstName: row.first_name ?? '',
        birthName: row.birth_name ?? '',
        birthDate,
        birthPlace: row.birth_place ?? 'Unbekannt',
        deathDate,
        burialDate,
        age: getAge(row.age_years),
        status: row.occupation_or_status ?? '',
        note: row.note ?? '',
        cemetery: cemeteryLabel,
        cemeteryName,
        cemeteryAddress,
        graveField,
        graveFieldLocationTitle,
        graveFieldLocationAddress,
        graveFieldLatitude,
        graveFieldLongitude,
        cemeteryImagePath: cemetery?.image ?? '',
        cemeteryUrl: cemetery?.url ?? '',
        cemeteryLatitude: cemetery?.latitude,
        cemeteryLongitude: cemetery?.longitude,
        navigationUrl: cemeteryAddress
            ? `https://maps.apple.com/?daddr=${encodeURIComponent(cemeteryAddress)}`
            : cemetery?.url ?? '',
        searchText,
    };
};

const baseQuery = `
    SELECT
        b.id AS burial_id,
        b.burial_register,
        b.death_register,
        b.burial_date,
        b.burial_date_precision,
        p.last_name,
        p.first_name,
        p.birth_name,
        p.age_years,
        p.birth_date,
        p.birth_date_precision,
        p.birth_place,
        p.occupation_or_status,
        p.death_date,
        p.death_date_precision,
        p.note,
        g.cemetery_code,
        g.grave_field,
        g.grave_number,
        g.grave_type,
        g.form,
        g.grave_field_location_id,
        g.grave_field_latitude,
        g.grave_field_longitude,
        l.title AS grave_field_location_title,
        l.address AS grave_field_location_address,
        l.latitude AS grave_field_location_latitude,
        l.longitude AS grave_field_location_longitude
    FROM burials b
    JOIN persons p ON p.id = b.person_id
    LEFT JOIN graves g ON g.id = b.grave_id
    LEFT JOIN grave_field_locations l ON l.id = g.grave_field_location_id
`;

app.get('/api/health', async (_request, response) => {
    try {
        await pool.query('SELECT 1');
        response.json({ ok: true });
    } catch (error) {
        response.status(500).json({ ok: false, error: error.message });
    }
});

const parsePageNumber = (value, fallback, maximum) => {
    const parsedValue = Number(value);

    if (!Number.isInteger(parsedValue) || parsedValue < 0) {
        return fallback;
    }

    return Math.min(parsedValue, maximum);
};

const isEnabled = (value) => value !== 'false';

const findCemeteryCodes = (value) => {
    const normalizedValue = String(value ?? '').trim().toLowerCase();

    if (!normalizedValue) {
        return [];
    }

    return Object.entries(cemeteryNames)
        .filter(([code, name]) => (
            code.toLowerCase().includes(normalizedValue) ||
            name.toLowerCase().includes(normalizedValue)
        ))
        .map(([code]) => code);
};

const addDateFilter = (clauses, params, column, value) => {
    const normalizedValue = String(value ?? '').trim();
    const yearMatch = normalizedValue.match(/^(\d{4})$/);
    const monthMatch = normalizedValue.match(/^(\d{4})-(\d{2})$/);
    const dateMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateMatch) {
        params.push(normalizedValue);
        clauses.push(`${column} = $${params.length}`);
        return;
    }

    if (monthMatch) {
        params.push(Number(monthMatch[1]), Number(monthMatch[2]));
        clauses.push(`EXTRACT(YEAR FROM ${column}) = $${params.length - 1} AND EXTRACT(MONTH FROM ${column}) = $${params.length}`);
        return;
    }

    if (yearMatch) {
        params.push(Number(yearMatch[1]));
        clauses.push(`EXTRACT(YEAR FROM ${column}) = $${params.length}`);
    }
};

const buildGravesWhere = (query) => {
    const clauses = [];
    const params = [];
    const searchQuery = String(query.q ?? '').trim();
    const cemeteryFilter = String(query.cemetery ?? '').trim();

    if (searchQuery) {
        const searchClauses = [];
        const searchValue = `%${searchQuery}%`;
        const searchTokens = searchQuery.split(/[\s,]+/).filter(Boolean);
        const nameColumns = [];

        if (isEnabled(query.searchFirstName)) {
            nameColumns.push('p.first_name');
            params.push(searchValue);
            searchClauses.push(`p.first_name ILIKE $${params.length}`);
        }

        if (isEnabled(query.searchLastName)) {
            nameColumns.push('p.last_name');
            params.push(searchValue);
            searchClauses.push(`p.last_name ILIKE $${params.length}`);
        }

        if (isEnabled(query.searchBirthName)) {
            nameColumns.push('p.birth_name');
            params.push(searchValue);
            searchClauses.push(`p.birth_name ILIKE $${params.length}`);
        }

        if (searchTokens.length > 1 && nameColumns.length > 0) {
            const tokenClauses = searchTokens.map((token) => {
                params.push(`%${token}%`);
                const tokenParam = `$${params.length}`;

                return `(${nameColumns.map((column) => `${column} ILIKE ${tokenParam}`).join(' OR ')})`;
            });

            searchClauses.push(`(${tokenClauses.join(' AND ')})`);
        }

        params.push(searchValue);
        searchClauses.push(`g.cemetery_code ILIKE $${params.length}`);

        [
            'p.birth_date',
            'p.death_date',
        ].forEach((column) => {
            params.push(searchValue, searchValue, searchValue);
            searchClauses.push(`(
                to_char(${column}, 'DD.MM.YYYY') ILIKE $${params.length - 2} OR
                to_char(${column}, 'MM.YYYY') ILIKE $${params.length - 1} OR
                to_char(${column}, 'YYYY') ILIKE $${params.length}
            )`);
        });

        const matchingCemeteryCodes = findCemeteryCodes(searchQuery);

        if (matchingCemeteryCodes.length > 0) {
            params.push(matchingCemeteryCodes);
            searchClauses.push(`g.cemetery_code = ANY($${params.length})`);
        }

        clauses.push(`(${searchClauses.join(' OR ')})`);
    }

    if (cemeteryFilter) {
        const cemeteryCodes = cemeteryCodesByName[cemeteryFilter] ?? findCemeteryCodes(cemeteryFilter);

        if (cemeteryCodes.length > 0) {
            params.push(cemeteryCodes);
            clauses.push(`g.cemetery_code = ANY($${params.length})`);
        } else {
            params.push(cemeteryFilter);
            clauses.push(`g.cemetery_code = $${params.length}`);
        }
    }

    addDateFilter(clauses, params, 'p.birth_date', query.birthDate);
    addDateFilter(clauses, params, 'p.death_date', query.deathDate);

    return {
        params,
        whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    };
};

app.get('/api/graves', async (request, response) => {
    try {
        const limit = parsePageNumber(request.query.limit, 80, 200);
        const offset = parsePageNumber(request.query.offset, 0, Number.MAX_SAFE_INTEGER);
        const { params, whereSql } = buildGravesWhere(request.query);
        const [countResult, result] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::integer AS total
                FROM burials b
                JOIN persons p ON p.id = b.person_id
                LEFT JOIN graves g ON g.id = b.grave_id
                ${whereSql}
            `, params),
            pool.query(
                `${baseQuery} ${whereSql}
                ORDER BY
                    CASE
                        WHEN COALESCE(p.last_name, '') ~ '^[[:alpha:]ÄÖÜäöüß]' THEN 0
                        ELSE 1
                    END,
                    p.last_name NULLS LAST,
                    p.first_name NULLS LAST,
                    b.id
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset],
            ),
        ]);
        const total = countResult.rows[0]?.total ?? 0;
        const nextOffset = offset + result.rows.length < total
            ? offset + result.rows.length
            : null;

        response.json({
            items: result.rows.map(mapRowToGrave),
            limit,
            nextOffset,
            offset,
            total,
        });
    } catch (error) {
        response.status(500).json({ error: 'Grabstellen konnten nicht geladen werden.', details: error.message });
    }
});

app.get('/api/graves/:id', async (request, response) => {
    try {
        const result = await pool.query(`${baseQuery} WHERE b.id = $1 LIMIT 1`, [request.params.id]);

        if (result.rowCount === 0) {
            response.status(404).json({ error: 'Grabstelle nicht gefunden.' });
            return;
        }

        response.json(mapRowToGrave(result.rows[0]));
    } catch (error) {
        response.status(500).json({ error: 'Grabstelle konnte nicht geladen werden.', details: error.message });
    }
});

const server = app.listen(port, host, () => {
    console.log(`Grave API listening on http://${host}:${port}`);
});

server.on('error', (error) => {
    console.error('Grave API failed to start:', error);
    process.exitCode = 1;
});
