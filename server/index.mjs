import express from 'express';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? '127.0.0.1';
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://grave:grave@db:5432/gravedb';
const analyticsAdminUser = process.env.ANALYTICS_ADMIN_USER ?? '';
const analyticsAdminPassword = process.env.ANALYTICS_ADMIN_PASSWORD ?? '';

const pool = new Pool({ connectionString: databaseUrl });
const startedAt = new Date();
let analyticsTablePromise;
const cemeteries = JSON.parse(
    await readFile(resolve(__dirname, '../src/data/cemeteries.json'), 'utf8'),
);

const redactDatabaseUrl = (value) => value.replace(/:\/\/([^:/?#]+):([^@/?#]+)@/, '://$1:***@');

const logInfo = (message, details = {}) => {
    console.log(JSON.stringify({
        level: 'info',
        message,
        timestamp: new Date().toISOString(),
        ...details,
    }));
};

const logError = (message, error, details = {}) => {
    console.error(JSON.stringify({
        level: 'error',
        message,
        timestamp: new Date().toISOString(),
        error: {
            message: error?.message,
            stack: error?.stack,
            code: error?.code,
            detail: error?.detail,
            hint: error?.hint,
        },
        ...details,
    }));
};

logInfo('Grave API booting', {
    host,
    port,
    databaseUrl: redactDatabaseUrl(databaseUrl),
    nodeEnv: process.env.NODE_ENV ?? 'unset',
});

pool.on('error', (error) => {
    logError('Unexpected PostgreSQL pool error', error);
});

app.use((request, response, next) => {
    const requestStartedAt = process.hrtime.bigint();

    response.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - requestStartedAt) / 1_000_000;

        logInfo('HTTP request completed', {
            method: request.method,
            path: request.path,
            statusCode: response.statusCode,
            durationMs: Math.round(durationMs),
        });
    });

    next();
});

app.use(express.json({ limit: '4kb' }));

const ensureAnalyticsTable = () => {
    analyticsTablePromise ??= pool.query(`
        CREATE TABLE IF NOT EXISTS click_events (
            id bigserial PRIMARY KEY,
            clicked_at timestamptz NOT NULL DEFAULT now(),
            path text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 512),
            button_key text CHECK (char_length(button_key) BETWEEN 1 AND 200),
            event_type text NOT NULL DEFAULT 'button_click'
        );
        ALTER TABLE click_events ADD COLUMN IF NOT EXISTS button_key text;
        ALTER TABLE click_events ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'button_click';
        CREATE INDEX IF NOT EXISTS click_events_clicked_at_idx ON click_events (clicked_at);
        CREATE INDEX IF NOT EXISTS click_events_path_idx ON click_events (path);
        CREATE INDEX IF NOT EXISTS click_events_button_key_idx ON click_events (button_key);
        CREATE INDEX IF NOT EXISTS click_events_event_type_idx ON click_events (event_type)
    `).catch((error) => {
        analyticsTablePromise = undefined;
        throw error;
    });

    return analyticsTablePromise;
};

app.post('/api/analytics/click', async (request, response) => {
    const path = typeof request.body?.path === 'string' ? request.body.path.trim() : '';
    const buttonKey = typeof request.body?.buttonKey === 'string' ? request.body.buttonKey.trim() : '';
    const eventType = typeof request.body?.eventType === 'string' ? request.body.eventType : 'button_click';
    const allowedEventTypes = new Set(['button_click', 'page_view', 'search_started']);

    if (
        !path.startsWith('/') || path.length > 512 || path.includes('?') || path.includes('#')
        || !allowedEventTypes.has(eventType) || buttonKey.length > 200
        || (eventType === 'button_click' && !buttonKey)
    ) {
        response.status(400).json({ error: 'Ungültige Klickdaten.' });
        return;
    }

    try {
        await ensureAnalyticsTable();
        await pool.query(
            'INSERT INTO click_events (path, button_key, event_type) VALUES ($1, $2, $3)',
            [path, buttonKey || null, eventType],
        );
        response.status(204).end();
    } catch (error) {
        logError('Failed to record analytics event', error, { path, buttonKey, eventType });
        response.status(500).json({ error: 'Klick konnte nicht erfasst werden.' });
    }
});

const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const requireAnalyticsAdmin = (request, response, next) => {
    const authorization = request.get('authorization') ?? '';
    const encodedCredentials = authorization.startsWith('Basic ') ? authorization.slice(6) : '';
    let credentials = '';

    try {
        credentials = Buffer.from(encodedCredentials, 'base64').toString('utf8');
    } catch {
        credentials = '';
    }

    const separatorIndex = credentials.indexOf(':');
    const user = separatorIndex >= 0 ? credentials.slice(0, separatorIndex) : '';
    const password = separatorIndex >= 0 ? credentials.slice(separatorIndex + 1) : '';

    if (
        !analyticsAdminUser || !analyticsAdminPassword
        || !safeEqual(user, analyticsAdminUser)
        || !safeEqual(password, analyticsAdminPassword)
    ) {
        response.set('WWW-Authenticate', 'Basic realm="Analytics"');
        response.status(401).json({ error: 'Anmeldung erforderlich.' });
        return;
    }

    next();
};

app.get('/api/analytics/summary', requireAnalyticsAdmin, async (request, response) => {
    const requestedDays = Number(request.query.days ?? 30);
    const days = Number.isInteger(requestedDays) && requestedDays >= 1 && requestedDays <= 365
        ? requestedDays
        : 30;

    try {
        await ensureAnalyticsTable();
        const [totalResult, dailyResult, pagesResult, buttonsResult, insightsResult, stationsResult, qualityResult] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::integer AS clicks
                FROM click_events
                WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                  AND event_type = 'button_click'
            `, [days]),
            pool.query(`
                SELECT clicked_at::date::text AS label, COUNT(*)::integer AS clicks
                FROM click_events
                WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                  AND event_type = 'button_click'
                GROUP BY clicked_at::date
                ORDER BY clicked_at::date
            `, [days]),
            pool.query(`
                SELECT path AS label, COUNT(*)::integer AS clicks
                FROM click_events
                WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                  AND event_type = 'page_view'
                  AND path !~ '^/grabstellensuche/[^/]+$'
                  AND path !~ '^/tour/station/[^/]+$'
                GROUP BY path
                ORDER BY clicks DESC, path
                LIMIT 20
            `, [days]),
            pool.query(`
                SELECT path || ' · ' || button_key AS label, COUNT(*)::integer AS clicks
                FROM click_events
                WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                  AND button_key IS NOT NULL
                  AND event_type = 'button_click'
                GROUP BY path, button_key
                ORDER BY clicks DESC, path, button_key
                LIMIT 30
            `, [days]),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE clicked_at >= now() - ($1::integer * interval '1 day') AND event_type = 'page_view' AND path = '/')::integer AS home_views,
                    COUNT(*) FILTER (WHERE clicked_at < now() - ($1::integer * interval '1 day') AND event_type = 'page_view' AND path = '/')::integer AS previous_home_views,
                    COUNT(*) FILTER (WHERE clicked_at >= now() - ($1::integer * interval '1 day') AND event_type = 'page_view' AND path = '/grabstellensuche')::integer AS grave_search_views,
                    COUNT(*) FILTER (WHERE clicked_at < now() - ($1::integer * interval '1 day') AND event_type = 'page_view' AND path = '/grabstellensuche')::integer AS previous_grave_search_views,
                    COUNT(*) FILTER (WHERE clicked_at >= now() - ($1::integer * interval '1 day') AND event_type = 'search_started' AND path = '/grabstellensuche')::integer AS searches_started,
                    COUNT(*) FILTER (WHERE clicked_at < now() - ($1::integer * interval '1 day') AND event_type = 'search_started' AND path = '/grabstellensuche')::integer AS previous_searches_started,
                    COUNT(*) FILTER (WHERE clicked_at >= now() - ($1::integer * interval '1 day') AND event_type = 'page_view' AND path ~ '^/grabstellensuche/[^/]+$')::integer AS grave_detail_views,
                    COUNT(*) FILTER (WHERE clicked_at < now() - ($1::integer * interval '1 day') AND event_type = 'page_view' AND path ~ '^/grabstellensuche/[^/]+$')::integer AS previous_grave_detail_views,
                    COUNT(*) FILTER (
                        WHERE clicked_at >= now() - ($1::integer * interval '1 day') AND event_type = 'button_click' AND path = '/'
                          AND button_key = 'Friedhofstour Erinnerungskultur'
                    )::integer AS tour_clicks,
                    COUNT(*) FILTER (
                        WHERE clicked_at < now() - ($1::integer * interval '1 day') AND event_type = 'button_click' AND path = '/'
                          AND button_key = 'Friedhofstour Erinnerungskultur'
                    )::integer AS previous_tour_clicks,
                    COUNT(*) FILTER (WHERE clicked_at >= now() - ($1::integer * interval '1 day') AND event_type = 'page_view' AND path = '/tour/home')::integer AS onboarding_views,
                    COUNT(*) FILTER (WHERE clicked_at < now() - ($1::integer * interval '1 day') AND event_type = 'page_view' AND path = '/tour/home')::integer AS previous_onboarding_views,
                    COUNT(*) FILTER (WHERE clicked_at >= now() - ($1::integer * interval '1 day') AND event_type = 'page_view' AND path = '/tour/map')::integer AS map_views,
                    COUNT(*) FILTER (WHERE clicked_at < now() - ($1::integer * interval '1 day') AND event_type = 'page_view' AND path = '/tour/map')::integer AS previous_map_views
                FROM click_events
                WHERE clicked_at >= now() - ($1::integer * interval '2 days')
            `, [days]),
            pool.query(`
                SELECT regexp_replace(path, '^/tour/station/', 'Station ') AS label,
                       COUNT(*)::integer AS clicks
                FROM click_events
                WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                  AND event_type = 'page_view'
                  AND path ~ '^/tour/station/[^/]+$'
                GROUP BY path
                ORDER BY clicks DESC, path
            `, [days]),
            pool.query(`
                SELECT
                    MAX(clicked_at) AS last_event_at,
                    COUNT(*) FILTER (
                        WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                          AND event_type = 'button_click'
                          AND (button_key IS NULL OR button_key IN ('button', 'div'))
                    )::integer AS ambiguous_events,
                    COUNT(*) FILTER (
                        WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                          AND event_type = 'button_click' AND button_key IS NULL
                    )::integer AS legacy_events
                FROM click_events
            `, [days]),
        ]);

        const insights = insightsResult.rows[0];
        const tourClicks = insights?.tour_clicks ?? 0;
        const mapViews = insights?.map_views ?? 0;
        const toMetric = (name) => {
            const value = insights?.[name] ?? 0;
            const previous = insights?.[`previous_${name}`] ?? 0;

            return {
                value,
                previous,
                changePercent: previous > 0 ? Math.round(((value - previous) / previous) * 100) : null,
            };
        };

        response.json({
            days,
            totalClicks: totalResult.rows[0]?.clicks ?? 0,
            daily: dailyResult.rows,
            pages: pagesResult.rows,
            buttons: buttonsResult.rows,
            insights: {
                homeViews: toMetric('home_views'),
                graveSearchViews: toMetric('grave_search_views'),
                searchesStarted: toMetric('searches_started'),
                graveDetailViews: toMetric('grave_detail_views'),
                tourClicks: toMetric('tour_clicks'),
                onboardingViews: toMetric('onboarding_views'),
                mapViews: toMetric('map_views'),
                onboardingCompletionRate: tourClicks > 0 ? Math.round((mapViews / tourClicks) * 100) : 0,
            },
            stations: stationsResult.rows,
            quality: {
                lastEventAt: qualityResult.rows[0]?.last_event_at ?? null,
                ambiguousEvents: qualityResult.rows[0]?.ambiguous_events ?? 0,
                legacyEvents: qualityResult.rows[0]?.legacy_events ?? 0,
            },
        });
    } catch (error) {
        logError('Failed to load analytics summary', error, { days });
        response.status(500).json({ error: 'Statistik konnte nicht geladen werden.' });
    }
});

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
        response.json({
            ok: true,
            uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
        });
    } catch (error) {
        logError('Health check failed', error);
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

        logInfo('Loading graves', {
            limit,
            offset,
            queryKeys: Object.keys(request.query),
            hasSearchQuery: Boolean(String(request.query.q ?? '').trim()),
            cemeteryFilter: String(request.query.cemetery ?? '').trim() || undefined,
            birthDateFilter: String(request.query.birthDate ?? '').trim() || undefined,
            deathDateFilter: String(request.query.deathDate ?? '').trim() || undefined,
            whereSql,
            paramCount: params.length,
        });

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

        logInfo('Loaded graves', {
            limit,
            offset,
            returned: result.rows.length,
            total,
            nextOffset,
        });

        response.json({
            items: result.rows.map(mapRowToGrave),
            limit,
            nextOffset,
            offset,
            total,
        });
    } catch (error) {
        logError('Failed to load graves', error, {
            queryKeys: Object.keys(request.query),
        });
        response.status(500).json({ error: 'Grabstellen konnten nicht geladen werden.', details: error.message });
    }
});

app.get('/api/graves/:id', async (request, response) => {
    try {
        logInfo('Loading grave detail', { id: request.params.id });

        const result = await pool.query(`${baseQuery} WHERE b.id = $1 LIMIT 1`, [request.params.id]);

        if (result.rowCount === 0) {
            logInfo('Grave detail not found', { id: request.params.id });
            response.status(404).json({ error: 'Grabstelle nicht gefunden.' });
            return;
        }

        logInfo('Loaded grave detail', { id: request.params.id });
        response.json(mapRowToGrave(result.rows[0]));
    } catch (error) {
        logError('Failed to load grave detail', error, {
            id: request.params.id,
        });
        response.status(500).json({ error: 'Grabstelle konnte nicht geladen werden.', details: error.message });
    }
});

app.use((error, request, response, _next) => {
    logError('Unhandled API error', error, {
        method: request.method,
        path: request.path,
    });

    response.status(500).json({ error: 'Interner API-Fehler.' });
});

const server = app.listen(port, host, () => {
    logInfo('Grave API listening', { url: `http://${host}:${port}` });
});

server.on('error', (error) => {
    logError('Grave API failed to start', error);
    process.exitCode = 1;
});
