export const analyticsApiBaseUrl = import.meta.env.VITE_API_URL ?? '';
export const analyticsCredentialsKey = 'analytics-admin-credentials';

export const getAnalyticsCredentials = () => sessionStorage.getItem(analyticsCredentialsKey) ?? '';
export const getAnalyticsAuthHeaders = (credentials = getAnalyticsCredentials()) => ({
    Authorization: `Basic ${credentials}`,
});
