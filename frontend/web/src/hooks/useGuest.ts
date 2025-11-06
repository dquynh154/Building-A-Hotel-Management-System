'use client';
import { useEffect, useState, useCallback } from 'react';
import { gfetch, getToken, clearToken } from '@/lib/auth-guest';

export function useGuest() {
    const [guest, setGuest] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const token = getToken();
        if (!token) { setGuest(null); setLoading(false); return; }
        try {
            const me = await gfetch('/api/auth/guest/me');
            setGuest(me);
        } catch {
            clearToken();
            setGuest(null);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    return { guest, loading, refresh, logout: () => { clearToken(); setGuest(null); } };
}
