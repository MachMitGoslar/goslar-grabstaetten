import express from 'express';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? '127.0.0.1';
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://grave:grave@db:5432/gravedb';
const analyticsAdminUser = process.env.ANALYTICS_ADMIN_USER ?? '';
const analyticsAdminPassword = process.env.ANALYTICS_ADMIN_PASSWORD ?? '';
const adminPermissionKeys = new Set(['statistics', 'grave_texts', 'grave_text_roles', 'data_import', 'profile_management']);
const bootstrapAdminPermissions = [...adminPermissionKeys];
const graveImportCwd = process.env.GRAVE_IMPORT_CWD ?? resolve(__dirname, '../grave-db');
const graveImportPython = process.env.GRAVE_IMPORT_PYTHON ?? '/opt/grave-import/bin/python';
let currentImport = null;
let lastImport = null;

const pool = new Pool({ connectionString: databaseUrl });
const startedAt = new Date();
let analyticsTablePromise;
const scrypt = promisify(scryptCallback);
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

app.use(express.json({ limit: '16kb' }));

const ensureAnalyticsTable = () => {
    analyticsTablePromise ??= pool.query(`
        CREATE TABLE IF NOT EXISTS click_events (
            id bigserial PRIMARY KEY,
            clicked_at timestamptz NOT NULL DEFAULT now(),
            path text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 512),
            button_key text CHECK (char_length(button_key) BETWEEN 1 AND 200),
            event_type text NOT NULL DEFAULT 'button_click',
            visitor_id text CHECK (char_length(visitor_id) BETWEEN 1 AND 80)
        );
        ALTER TABLE click_events ADD COLUMN IF NOT EXISTS button_key text;
        ALTER TABLE click_events ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'button_click';
        ALTER TABLE click_events ADD COLUMN IF NOT EXISTS visitor_id text CHECK (char_length(visitor_id) BETWEEN 1 AND 80);
        CREATE INDEX IF NOT EXISTS click_events_clicked_at_idx ON click_events (clicked_at);
        CREATE INDEX IF NOT EXISTS click_events_path_idx ON click_events (path);
        CREATE INDEX IF NOT EXISTS click_events_button_key_idx ON click_events (button_key);
        CREATE INDEX IF NOT EXISTS click_events_event_type_idx ON click_events (event_type);
        CREATE INDEX IF NOT EXISTS click_events_visitor_id_idx ON click_events (visitor_id);
        CREATE TABLE IF NOT EXISTS analytics_users (
            id bigserial PRIMARY KEY,
            username text NOT NULL UNIQUE,
            password_hash text NOT NULL,
            permissions text[] NOT NULL DEFAULT ARRAY['statistics']::text[],
            created_at timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE analytics_users ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT ARRAY['statistics']::text[];
        CREATE TABLE IF NOT EXISTS grave_texts (
            id bigserial PRIMARY KEY,
            burial_id bigint NOT NULL REFERENCES burials(id) ON DELETE CASCADE,
            text text NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 5000),
            role text NOT NULL CHECK (char_length(btrim(role)) BETWEEN 1 AND 120),
            text_date date NOT NULL DEFAULT CURRENT_DATE,
            created_by text NOT NULL CHECK (char_length(btrim(created_by)) BETWEEN 1 AND 120),
            updated_by text CHECK (char_length(btrim(updated_by)) BETWEEN 1 AND 120),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS grave_text_roles (
            id bigserial PRIMARY KEY,
            name text NOT NULL UNIQUE CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
            created_by text NOT NULL DEFAULT 'system' CHECK (char_length(btrim(created_by)) BETWEEN 1 AND 120),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );
        INSERT INTO grave_text_roles (name)
        VALUES ('Familie'), ('Freund'), ('Verein')
        ON CONFLICT (name) DO NOTHING;
        CREATE INDEX IF NOT EXISTS idx_grave_texts_burial_id ON grave_texts (burial_id, text_date DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_grave_texts_created_by ON grave_texts (created_by);
        CREATE INDEX IF NOT EXISTS idx_grave_text_roles_name ON grave_text_roles (name)
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
    const visitorId = typeof request.body?.visitorId === 'string' ? request.body.visitorId.trim() : '';
    const allowedEventTypes = new Set(['button_click', 'page_view', 'search_started']);

    if (
        !path.startsWith('/') || path.length > 512 || path.includes('?') || path.includes('#')
        || !allowedEventTypes.has(eventType) || buttonKey.length > 200
        || visitorId.length > 80
        || (eventType === 'button_click' && !buttonKey)
    ) {
        response.status(400).json({ error: 'Ungültige Klickdaten.' });
        return;
    }

    try {
        await ensureAnalyticsTable();
        await pool.query(
            'INSERT INTO click_events (path, button_key, event_type, visitor_id) VALUES ($1, $2, $3, $4)',
            [path, buttonKey || null, eventType, visitorId || null],
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

const hashPassword = async (password) => {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
};

const verifyPassword = async (password, storedHash) => {
    const [salt, expectedHex] = String(storedHash).split(':');
    if (!salt || !expectedHex) return false;
    const actual = await scrypt(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const normalizePermissions = (permissions) => {
    if (!Array.isArray(permissions)) {
        return [];
    }

    return [...new Set(permissions.filter((permission) => adminPermissionKeys.has(permission)))];
};

const requireAnalyticsAdmin = async (request, response, next) => {
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

    const isBootstrapAdmin = Boolean(
        analyticsAdminUser && analyticsAdminPassword
        && safeEqual(user, analyticsAdminUser)
        && safeEqual(password, analyticsAdminPassword),
    );
    let isDatabaseUser = false;
    let databasePermissions = [];

    if (!isBootstrapAdmin && user && password) {
        try {
            await ensureAnalyticsTable();
            const result = await pool.query(
                'SELECT password_hash, permissions FROM analytics_users WHERE username = $1',
                [user],
            );
            if (result.rowCount === 1 && await verifyPassword(password, result.rows[0].password_hash)) {
                isDatabaseUser = true;
                databasePermissions = normalizePermissions(result.rows[0].permissions);
            }
        } catch (error) {
            logError('Failed to authenticate analytics user', error, { user });
        }
    }

    if (!isBootstrapAdmin && !isDatabaseUser) {
        response.set('WWW-Authenticate', 'Basic realm="Analytics"');
        response.status(401).json({ error: 'Anmeldung erforderlich.' });
        return;
    }

    request.analyticsUser = user;
    request.analyticsCanManageUsers = isBootstrapAdmin;
    request.analyticsPermissions = isBootstrapAdmin ? bootstrapAdminPermissions : databasePermissions;
    next();
};

const requireAdminPermission = (permission, message = 'Keine Berechtigung für diese Funktion.') => (request, response, next) => {
    if (!request.analyticsPermissions?.includes(permission)) {
        response.status(403).json({ error: message });
        return;
    }
    next();
};

const requireAnyAdminPermission = (permissions, message = 'Keine Berechtigung für diese Funktion.') => (request, response, next) => {
    if (!permissions.some((permission) => request.analyticsPermissions?.includes(permission))) {
        response.status(403).json({ error: message });
        return;
    }
    next();
};

const requireAnalyticsUserManager = requireAdminPermission(
    'profile_management',
    'Keine Berechtigung zur Profilverwaltung.',
);

app.get('/api/analytics/users', requireAnalyticsAdmin, requireAnalyticsUserManager, async (_request, response) => {
    await ensureAnalyticsTable();
    const result = await pool.query('SELECT id, username, permissions, created_at FROM analytics_users ORDER BY username');
    response.json({
        users: result.rows,
        bootstrapUser: analyticsAdminUser,
        availablePermissions: bootstrapAdminPermissions,
    });
});

app.post('/api/analytics/users', requireAnalyticsAdmin, requireAnalyticsUserManager, async (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const permissions = normalizePermissions(request.body?.permissions);

    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username) || password.length < 12 || password.length > 256) {
        response.status(400).json({ error: 'Benutzername ungültig oder Passwort kürzer als 12 Zeichen.' });
        return;
    }
    if (permissions.length === 0) {
        response.status(400).json({ error: 'Bitte mindestens eine Berechtigung auswählen.' });
        return;
    }
    if (safeEqual(username, analyticsAdminUser)) {
        response.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
        return;
    }

    try {
        await ensureAnalyticsTable();
        const passwordHash = await hashPassword(password);
        const result = await pool.query(
            'INSERT INTO analytics_users (username, password_hash, permissions) VALUES ($1, $2, $3) RETURNING id, username, permissions, created_at',
            [username, passwordHash, permissions],
        );
        response.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            response.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
            return;
        }
        logError('Failed to create analytics user', error, { username });
        response.status(500).json({ error: 'Profil konnte nicht angelegt werden.' });
    }
});

app.delete('/api/analytics/users/:id', requireAnalyticsAdmin, requireAnalyticsUserManager, async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
        response.status(400).json({ error: 'Ungültige Profil-ID.' });
        return;
    }
    await ensureAnalyticsTable();
    const result = await pool.query('DELETE FROM analytics_users WHERE id = $1', [request.params.id]);
    response.status(result.rowCount ? 204 : 404).end();
});

app.get('/api/admin/me', requireAnalyticsAdmin, async (request, response) => {
    response.json({
        username: request.analyticsUser,
        permissions: request.analyticsPermissions ?? [],
        canManageUsers: request.analyticsPermissions?.includes('profile_management') ?? false,
    });
});

app.get('/api/analytics/summary', requireAnalyticsAdmin, requireAdminPermission('statistics', 'Keine Berechtigung für Statistiken.'), async (request, response) => {
    const requestedDays = Number(request.query.days ?? 30);
    const days = Number.isInteger(requestedDays) && requestedDays >= 1 && requestedDays <= 365
        ? requestedDays
        : 30;

    try {
        await ensureAnalyticsTable();
        const [overviewResult, dailyVisitorsResult, graveDetailsDailyResult, graveDetailsResult, stationsResult, qualityResult] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(DISTINCT visitor_id) FILTER (
                        WHERE event_type = 'page_view'
                          AND visitor_id IS NOT NULL
                    )::integer AS visitors,
                    COUNT(*) FILTER (
                        WHERE event_type = 'page_view'
                          AND path ~ '^/grabstellensuche/[^/]+$'
                    )::integer AS grave_detail_views,
                    COUNT(*) FILTER (
                        WHERE event_type = 'page_view'
                          AND path ~ '^/tour/station/[^/]+$'
                    )::integer AS station_views
                FROM click_events
                WHERE clicked_at >= now() - ($1::integer * interval '1 day')
            `, [days]),
            pool.query(`
                SELECT
                    clicked_at::date::text AS label,
                    COUNT(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL)::integer AS visitors,
                    COUNT(*) FILTER (WHERE visitor_id IS NULL)::integer AS legacyEvents
                FROM click_events
                WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                  AND event_type = 'page_view'
                GROUP BY clicked_at::date
                ORDER BY clicked_at::date
            `, [days]),
            pool.query(`
                SELECT clicked_at::date::text AS label, COUNT(*)::integer AS views
                FROM click_events
                WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                  AND event_type = 'page_view'
                  AND path ~ '^/grabstellensuche/[^/]+$'
                GROUP BY clicked_at::date
                ORDER BY clicked_at::date
            `, [days]),
            pool.query(`
                SELECT
                    b.id::text AS id,
                    CONCAT_WS(' ',
                        NULLIF(p.first_name, ''),
                        NULLIF(p.last_name, '')
                    ) AS person_name,
                    CONCAT_WS(' · ',
                        NULLIF(g.cemetery_code, ''),
                        CASE WHEN NULLIF(g.grave_field, '') IS NOT NULL THEN 'Grabfeld ' || g.grave_field END,
                        CASE WHEN NULLIF(g.grave_number, '') IS NOT NULL THEN 'Grab ' || g.grave_number END
                    ) AS grave_location,
                    COUNT(click_events.*)::integer AS views
                FROM click_events
                JOIN burials b ON ('/grabstellensuche/' || b.id::text) = click_events.path
                JOIN persons p ON p.id = b.person_id
                LEFT JOIN graves g ON g.id = b.grave_id
                WHERE click_events.clicked_at >= now() - ($1::integer * interval '1 day')
                  AND click_events.event_type = 'page_view'
                  AND click_events.path ~ '^/grabstellensuche/[^/]+$'
                GROUP BY b.id, p.first_name, p.last_name, g.cemetery_code, g.grave_field, g.grave_number
                ORDER BY views DESC, person_name, grave_location
                LIMIT 30
            `, [days]),
            pool.query(`
                SELECT regexp_replace(path, '^/tour/station/', 'Station ') AS label,
                       COUNT(*)::integer AS views
                FROM click_events
                WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                  AND event_type = 'page_view'
                  AND path ~ '^/tour/station/[^/]+$'
                GROUP BY path
                ORDER BY substring(path FROM '^/tour/station/(\\d+)$')::integer ASC NULLS LAST, path
            `, [days]),
            pool.query(`
                SELECT
                    MAX(clicked_at) AS last_event_at,
                    COUNT(*) FILTER (
                        WHERE clicked_at >= now() - ($1::integer * interval '1 day')
                          AND event_type = 'page_view'
                          AND visitor_id IS NULL
                    )::integer AS legacy_events
                FROM click_events
            `, [days]),
        ]);

        const overview = overviewResult.rows[0] ?? {};

        response.json({
            days,
            overview: {
                visitors: overview.visitors ?? 0,
                graveDetailViews: overview.grave_detail_views ?? 0,
                stationViews: overview.station_views ?? 0,
            },
            dailyVisitors: dailyVisitorsResult.rows,
            graveDetails: {
                daily: graveDetailsDailyResult.rows,
                items: graveDetailsResult.rows.map((row) => ({
                    label: [row.person_name, row.grave_location].filter(Boolean).join(' · ') || `Grabstelle ${row.id}`,
                    views: row.views,
                })),
            },
            stations: stationsResult.rows,
            quality: {
                lastEventAt: qualityResult.rows[0]?.last_event_at ?? null,
                legacyEvents: qualityResult.rows[0]?.legacy_events ?? 0,
            },
            canManageUsers: request.analyticsPermissions?.includes('profile_management') ?? false,
        });
    } catch (error) {
        logError('Failed to load analytics summary', error, { days });
        response.status(500).json({ error: 'Statistik konnte nicht geladen werden.' });
    }
});

const formatIsoDate = (dateValue) => {
    if (!dateValue) {
        return '';
    }

    if (dateValue instanceof Date) {
        return dateValue.toISOString().slice(0, 10);
    }

    return String(dateValue).slice(0, 10);
};

const mapRowToGraveText = (row) => ({
    id: String(row.id),
    graveId: String(row.burial_id),
    text: row.text,
    role: row.role,
    date: formatIsoDate(row.text_date),
    createdBy: row.created_by,
    updatedBy: row.updated_by ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const normalizeGraveTextInput = (body) => {
    const graveId = typeof body?.graveId === 'string' || typeof body?.graveId === 'number'
        ? String(body.graveId).trim()
        : '';
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const role = typeof body?.role === 'string' ? body.role.trim() : '';
    const date = typeof body?.date === 'string' ? body.date.trim() : '';

    return { graveId, text, role, date };
};

const validateGraveTextInput = ({ graveId, text, role, date }, { requireGraveId }) => {
    if (requireGraveId && !/^\d+$/.test(graveId)) {
        return 'Ungültige Grab-ID.';
    }

    if (text.length < 1 || text.length > 5000) {
        return 'Der Text muss zwischen 1 und 5000 Zeichen lang sein.';
    }

    if (role.length < 1 || role.length > 120) {
        return 'Die Rolle muss zwischen 1 und 120 Zeichen lang sein.';
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return 'Das Datum muss im Format JJJJ-MM-TT angegeben werden.';
    }

    return '';
};

const mapRowToGraveTextRole = (row) => ({
    id: String(row.id),
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const normalizeRoleName = (body) => (typeof body?.name === 'string' ? body.name.trim() : '');

app.get('/api/admin/grave-text-roles', requireAnalyticsAdmin, requireAnyAdminPermission(['grave_texts', 'grave_text_roles']), async (_request, response) => {
    try {
        await ensureAnalyticsTable();
        const result = await pool.query(`
            SELECT id, name, created_by, created_at, updated_at
            FROM grave_text_roles
            ORDER BY name
        `);
        response.json({ items: result.rows.map(mapRowToGraveTextRole) });
    } catch (error) {
        logError('Failed to load grave text roles', error);
        response.status(500).json({ error: 'Rollen konnten nicht geladen werden.' });
    }
});

app.post('/api/admin/grave-text-roles', requireAnalyticsAdmin, requireAdminPermission('grave_text_roles', 'Keine Berechtigung zur Rollenverwaltung.'), async (request, response) => {
    const name = normalizeRoleName(request.body);

    if (name.length < 1 || name.length > 120) {
        response.status(400).json({ error: 'Die Rolle muss zwischen 1 und 120 Zeichen lang sein.' });
        return;
    }

    try {
        await ensureAnalyticsTable();
        const result = await pool.query(`
            INSERT INTO grave_text_roles (name, created_by)
            VALUES ($1, $2)
            RETURNING id, name, created_by, created_at, updated_at
        `, [name, request.analyticsUser]);
        response.status(201).json(mapRowToGraveTextRole(result.rows[0]));
    } catch (error) {
        if (error.code === '23505') {
            response.status(409).json({ error: 'Diese Rolle existiert bereits.' });
            return;
        }
        logError('Failed to create grave text role', error, { name });
        response.status(500).json({ error: 'Rolle konnte nicht angelegt werden.' });
    }
});

app.put('/api/admin/grave-text-roles/:id', requireAnalyticsAdmin, requireAdminPermission('grave_text_roles', 'Keine Berechtigung zur Rollenverwaltung.'), async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
        response.status(400).json({ error: 'Ungültige Rollen-ID.' });
        return;
    }

    const name = normalizeRoleName(request.body);

    if (name.length < 1 || name.length > 120) {
        response.status(400).json({ error: 'Die Rolle muss zwischen 1 und 120 Zeichen lang sein.' });
        return;
    }

    const client = await pool.connect();
    try {
        await ensureAnalyticsTable();
        await client.query('BEGIN');

        const existingResult = await client.query('SELECT name FROM grave_text_roles WHERE id = $1 FOR UPDATE', [request.params.id]);
        if (existingResult.rowCount === 0) {
            await client.query('ROLLBACK');
            response.status(404).json({ error: 'Rolle nicht gefunden.' });
            return;
        }

        const oldName = existingResult.rows[0].name;
        const result = await client.query(`
            UPDATE grave_text_roles
            SET name = $2,
                updated_at = now()
            WHERE id = $1
            RETURNING id, name, created_by, created_at, updated_at
        `, [request.params.id, name]);
        await client.query('UPDATE grave_texts SET role = $2, updated_at = now() WHERE role = $1', [oldName, name]);
        await client.query('COMMIT');

        response.json(mapRowToGraveTextRole(result.rows[0]));
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (error.code === '23505') {
            response.status(409).json({ error: 'Diese Rolle existiert bereits.' });
            return;
        }
        logError('Failed to update grave text role', error, { roleId: request.params.id, name });
        response.status(500).json({ error: 'Rolle konnte nicht gespeichert werden.' });
    } finally {
        client.release();
    }
});

app.delete('/api/admin/grave-text-roles/:id', requireAnalyticsAdmin, requireAdminPermission('grave_text_roles', 'Keine Berechtigung zur Rollenverwaltung.'), async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
        response.status(400).json({ error: 'Ungültige Rollen-ID.' });
        return;
    }

    try {
        await ensureAnalyticsTable();
        const result = await pool.query(`
            DELETE FROM grave_text_roles
            WHERE id = $1
              AND NOT EXISTS (
                  SELECT 1 FROM grave_texts WHERE grave_texts.role = grave_text_roles.name
              )
        `, [request.params.id]);

        if (result.rowCount) {
            response.status(204).end();
            return;
        }

        response.status(409).json({ error: 'Rolle wird noch von Texten verwendet.' });
    } catch (error) {
        logError('Failed to delete grave text role', error, { roleId: request.params.id });
        response.status(500).json({ error: 'Rolle konnte nicht gelöscht werden.' });
    }
});

app.get('/api/admin/grave-texts', requireAnalyticsAdmin, requireAdminPermission('grave_texts', 'Keine Berechtigung für Grabtexte.'), async (request, response) => {
    const graveId = String(request.query.graveId ?? '').trim();
    const searchQuery = String(request.query.q ?? '').trim();

    if (graveId && !/^\d+$/.test(graveId)) {
        response.status(400).json({ error: 'Ungültige Grab-ID.' });
        return;
    }

    try {
        await ensureAnalyticsTable();

        const params = [];
        const clauses = [];

        if (graveId) {
            params.push(graveId);
            clauses.push(`gt.burial_id = $${params.length}`);
        }

        if (searchQuery) {
            params.push(`%${searchQuery}%`);
            clauses.push(`(
                gt.text ILIKE $${params.length}
                OR gt.role ILIKE $${params.length}
                OR p.first_name ILIKE $${params.length}
                OR p.last_name ILIKE $${params.length}
                OR p.birth_name ILIKE $${params.length}
                OR gt.burial_id::text ILIKE $${params.length}
            )`);
        }

        params.push(100);
        const result = await pool.query(`
            SELECT
                gt.id,
                gt.burial_id,
                gt.text,
                gt.role,
                gt.text_date,
                gt.created_by,
                gt.updated_by,
                gt.created_at,
                gt.updated_at,
                p.first_name,
                p.last_name,
                p.birth_name,
                g.cemetery_code,
                g.grave_field,
                g.grave_number
            FROM grave_texts gt
            JOIN burials b ON b.id = gt.burial_id
            JOIN persons p ON p.id = b.person_id
            LEFT JOIN graves g ON g.id = b.grave_id
            ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
            ORDER BY gt.text_date DESC, gt.id DESC
            LIMIT $${params.length}
        `, params);

        response.json({
            items: result.rows.map((row) => ({
                ...mapRowToGraveText(row),
                graveLabel: [
                    [row.first_name, row.last_name].filter(Boolean).join(' '),
                    row.birth_name && `geb. ${row.birth_name}`,
                    row.cemetery_code,
                    row.grave_field && `Grabfeld ${row.grave_field}`,
                    row.grave_number && `Grab ${row.grave_number}`,
                ].filter(Boolean).join(' · '),
            })),
        });
    } catch (error) {
        logError('Failed to load grave texts', error, { graveId, searchQuery });
        response.status(500).json({ error: 'Grabtexte konnten nicht geladen werden.' });
    }
});

app.post('/api/admin/grave-texts', requireAnalyticsAdmin, requireAdminPermission('grave_texts', 'Keine Berechtigung für Grabtexte.'), async (request, response) => {
    const input = normalizeGraveTextInput(request.body);
    const validationError = validateGraveTextInput(input, { requireGraveId: true });

    if (validationError) {
        response.status(400).json({ error: validationError });
        return;
    }

    try {
        await ensureAnalyticsTable();

        const result = await pool.query(`
            INSERT INTO grave_texts (burial_id, text, role, text_date, created_by)
            SELECT b.id, $2, $3, $4::date, $5
            FROM burials b
            WHERE b.id = $1
            RETURNING id, burial_id, text, role, text_date, created_by, updated_by, created_at, updated_at
        `, [input.graveId, input.text, input.role, input.date, request.analyticsUser]);

        if (result.rowCount === 0) {
            response.status(404).json({ error: 'Grabstelle nicht gefunden.' });
            return;
        }

        response.status(201).json(mapRowToGraveText(result.rows[0]));
    } catch (error) {
        logError('Failed to create grave text', error, { graveId: input.graveId });
        response.status(500).json({ error: 'Grabtext konnte nicht angelegt werden.' });
    }
});

app.put('/api/admin/grave-texts/:id', requireAnalyticsAdmin, requireAdminPermission('grave_texts', 'Keine Berechtigung für Grabtexte.'), async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
        response.status(400).json({ error: 'Ungültige Text-ID.' });
        return;
    }

    const input = normalizeGraveTextInput(request.body);
    const validationError = validateGraveTextInput(input, { requireGraveId: false });

    if (validationError) {
        response.status(400).json({ error: validationError });
        return;
    }

    try {
        await ensureAnalyticsTable();

        const result = await pool.query(`
            UPDATE grave_texts
            SET text = $2,
                role = $3,
                text_date = $4::date,
                updated_by = $5,
                updated_at = now()
            WHERE id = $1
            RETURNING id, burial_id, text, role, text_date, created_by, updated_by, created_at, updated_at
        `, [request.params.id, input.text, input.role, input.date, request.analyticsUser]);

        if (result.rowCount === 0) {
            response.status(404).json({ error: 'Grabtext nicht gefunden.' });
            return;
        }

        response.json(mapRowToGraveText(result.rows[0]));
    } catch (error) {
        logError('Failed to update grave text', error, { textId: request.params.id });
        response.status(500).json({ error: 'Grabtext konnte nicht gespeichert werden.' });
    }
});

app.delete('/api/admin/grave-texts/:id', requireAnalyticsAdmin, requireAdminPermission('grave_texts', 'Keine Berechtigung für Grabtexte.'), async (request, response) => {
    if (!/^\d+$/.test(request.params.id)) {
        response.status(400).json({ error: 'Ungültige Text-ID.' });
        return;
    }

    try {
        await ensureAnalyticsTable();
        const result = await pool.query('DELETE FROM grave_texts WHERE id = $1', [request.params.id]);
        response.status(result.rowCount ? 204 : 404).end();
    } catch (error) {
        logError('Failed to delete grave text', error, { textId: request.params.id });
        response.status(500).json({ error: 'Grabtext konnte nicht gelöscht werden.' });
    }
});

const serializeImportStatus = () => {
    const activeImport = currentImport ?? lastImport;

    if (!activeImport) {
        return { running: false, lastRun: null };
    }

    return {
        running: currentImport !== null,
        lastRun: {
            id: activeImport.id,
            startedAt: activeImport.startedAt,
            finishedAt: activeImport.finishedAt,
            status: activeImport.status,
            exitCode: activeImport.exitCode,
            startedBy: activeImport.startedBy,
            output: activeImport.output.slice(-12000),
        },
    };
};

app.get('/api/admin/data-import', requireAnalyticsAdmin, requireAdminPermission('data_import', 'Keine Berechtigung für Datenimporte.'), async (_request, response) => {
    response.json(serializeImportStatus());
});

app.post('/api/admin/data-import', requireAnalyticsAdmin, requireAdminPermission('data_import', 'Keine Berechtigung für Datenimporte.'), async (request, response) => {
    if (currentImport) {
        response.status(409).json({ error: 'Es läuft bereits ein Import.', status: serializeImportStatus() });
        return;
    }

    const importRun = {
        id: randomBytes(8).toString('hex'),
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: 'running',
        exitCode: null,
        startedBy: request.analyticsUser,
        output: '',
    };
    currentImport = importRun;
    lastImport = importRun;

    const child = spawn(graveImportPython, [
        'scripts/import_excel.py',
        '--data-dir',
        'data',
        '--schema',
        'sql/schema.sql',
        '--init-schema',
    ], {
        cwd: graveImportCwd,
        env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    const appendOutput = (chunk) => {
        importRun.output = `${importRun.output}${chunk.toString()}`.slice(-20000);
    };

    child.stdout.on('data', appendOutput);
    child.stderr.on('data', appendOutput);
    child.on('error', (error) => {
        importRun.status = 'failed';
        importRun.finishedAt = new Date().toISOString();
        importRun.output = `${importRun.output}\n${error.message}`.slice(-20000);
        currentImport = null;
        logError('Data import failed to start', error, { importId: importRun.id });
    });
    child.on('close', (exitCode) => {
        importRun.status = exitCode === 0 ? 'succeeded' : 'failed';
        importRun.exitCode = exitCode;
        importRun.finishedAt = new Date().toISOString();
        currentImport = null;
        logInfo('Data import finished', { importId: importRun.id, exitCode });
    });

    logInfo('Data import started', { importId: importRun.id, startedBy: request.analyticsUser });
    response.status(202).json(serializeImportStatus());
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
        graveTexts: [],
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
        await ensureAnalyticsTable();

        const result = await pool.query(`${baseQuery} WHERE b.id = $1 LIMIT 1`, [request.params.id]);

        if (result.rowCount === 0) {
            logInfo('Grave detail not found', { id: request.params.id });
            response.status(404).json({ error: 'Grabstelle nicht gefunden.' });
            return;
        }

        const graveTextResult = await pool.query(`
            SELECT id, burial_id, text, role, text_date, created_by, updated_by, created_at, updated_at
            FROM grave_texts
            WHERE burial_id = $1
            ORDER BY text_date DESC, id DESC
        `, [request.params.id]);
        const grave = {
            ...mapRowToGrave(result.rows[0]),
            graveTexts: graveTextResult.rows.map(mapRowToGraveText),
        };

        logInfo('Loaded grave detail', { id: request.params.id, graveTexts: grave.graveTexts.length });
        response.json(grave);
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
