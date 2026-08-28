export const analyticsApiBaseUrl = import.meta.env.VITE_API_URL ?? '';
export const analyticsCredentialsKey = 'analytics-admin-session';

export const getAnalyticsCredentials = () => sessionStorage.getItem(analyticsCredentialsKey) ?? '';
const getCookieValue = (name: string) => document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? '';

export const getAnalyticsAuthHeaders = (credentials = getAnalyticsCredentials()): Record<string, string> => {
    void credentials;
    const csrfToken = getCookieValue('admin_csrf');
    return csrfToken ? { 'X-CSRF-Token': decodeURIComponent(csrfToken) } : {};
};

export const markAnalyticsSession = () => sessionStorage.setItem(analyticsCredentialsKey, '1');
export const clearAnalyticsSession = () => sessionStorage.removeItem(analyticsCredentialsKey);

export const loginAdmin = async (user: string, password: string) => {
    const result = await fetch(`${analyticsApiBaseUrl}/api/admin/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password }),
    });
    const data = await result.json().catch(() => ({})) as { error?: string; message?: string };
    if (!result.ok) throw new Error(data.error ?? 'Anmeldung fehlgeschlagen.');
    markAnalyticsSession();
    return data.message ?? 'Anmeldung erfolgreich.';
};

export const logoutAdmin = async () => {
    await fetch(`${analyticsApiBaseUrl}/api/admin/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: getAnalyticsAuthHeaders(),
    }).catch(() => undefined);
    clearAnalyticsSession();
};

export const requestAdminPasswordCode = async (email: string, purpose: 'setup' | 'reset' = 'reset') => {
    const result = await fetch(`${analyticsApiBaseUrl}/api/admin/password-code/request`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
    });
    const data = await result.json().catch(() => ({})) as { error?: string; message?: string };
    if (!result.ok) throw new Error(data.error ?? 'Code konnte nicht angefordert werden.');
    return data.message ?? 'Wenn ein Profil zu dieser Mailadresse existiert, wurde ein Code versendet.';
};

export const verifyAdminSetupCode = async (setupToken: string, code: string) => {
    const result = await fetch(`${analyticsApiBaseUrl}/api/admin/password-code/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken, code }),
    });
    const data = await result.json().catch(() => ({})) as { error?: string; message?: string };
    if (!result.ok) throw new Error(data.error ?? 'Code konnte nicht geprüft werden.');
    return data.message ?? 'Code wurde bestätigt.';
};

export const completeAdminSetupPassword = async (setupToken: string, code: string, password: string) => {
    const result = await fetch(`${analyticsApiBaseUrl}/api/admin/password-code/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken, code, password }),
    });
    const data = await result.json().catch(() => ({})) as { error?: string; message?: string; email?: string };
    if (!result.ok) throw new Error(data.error ?? 'Passwort konnte nicht gesetzt werden.');
    markAnalyticsSession();
    return {
        message: data.message ?? 'Passwort wurde gesetzt.',
        email: data.email ?? '',
    };
};

export const completeAdminResetPassword = async (resetToken: string, code: string, password: string) => {
    const result = await fetch(`${analyticsApiBaseUrl}/api/admin/password-code/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken: resetToken, code, password, purpose: 'reset' }),
    });
    const data = await result.json().catch(() => ({})) as { error?: string; message?: string; email?: string };
    if (!result.ok) throw new Error(data.error ?? 'Passwort konnte nicht gesetzt werden.');
    markAnalyticsSession();
    return {
        message: data.message ?? 'Passwort wurde gesetzt.',
        email: data.email ?? '',
    };
};

export const verifyAdminResetCode = async (resetToken: string, code: string) => {
    const result = await fetch(`${analyticsApiBaseUrl}/api/admin/password-code/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken: resetToken, code, purpose: 'reset' }),
    });
    const data = await result.json().catch(() => ({})) as { error?: string; message?: string };
    if (!result.ok) throw new Error(data.error ?? 'Code konnte nicht geprüft werden.');
    return data.message ?? 'Code wurde bestätigt.';
};

export const changeAdminPassword = async (_credentials: string, currentPassword: string, newPassword: string) => {
    const result = await fetch(`${analyticsApiBaseUrl}/api/admin/password`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            ...getAnalyticsAuthHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await result.json().catch(() => ({})) as { error?: string; message?: string; email?: string };
    if (!result.ok) throw new Error(data.error ?? 'Passwort konnte nicht geändert werden.');
    return {
        message: data.message ?? 'Passwort wurde geändert.',
    };
};
