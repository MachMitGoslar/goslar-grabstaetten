import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recordAnalyticsEvent } from './clickTracking.ts';

export const PageViewTracker = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        recordAnalyticsEvent('page_view');
    }, [pathname]);

    return null;
};
