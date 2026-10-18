import React, { useState } from 'react';
import { Text } from 'react-native';
import { Screen, PageScroll, BrandHeader, PageTitle, Card, OutlineButton, EmptyState, StatusPill } from '../../components/NakedUI';
import type { DriverScreen } from '../../navigation/routes';
import { useDriverRuntime } from '../../state/DriverRuntime';
import { useRideXLocale } from '../../../shared/localization';
import ScreenStateNotice from '../../components/ScreenStateNotice';

export default function HistoryScreen({go}:{go:(s:DriverScreen)=>void}) {
  const { t } = useRideXLocale();
  const { history, refreshDriver, driverId } = useDriverRuntime();
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const refresh = async () => { if (refreshing) return; setRefreshing(true); setNotice(''); try { const result = await refreshDriver(driverId); if (!result?.history) setNotice('Ride history could not be confirmed by the backend. Check your connection and retry.'); } catch { setNotice('Could not refresh ride history. Check your connection and retry.'); } finally { setRefreshing(false); } };
  const statusLabel = (value: unknown) => {
    const status = String(value || 'UNKNOWN').toUpperCase();
    const keys: Record<string, string> = {
      COMPLETED: 'driverHistory.statusCompleted', CANCELLED: 'driverHistory.statusCancelled',
      DRIVER_ASSIGNED: 'driverHistory.statusAssigned', IN_PROGRESS: 'driverHistory.statusInProgress', UNKNOWN: 'driverHistory.statusUnknown',
    };
    return keys[status] ? t(keys[status], status) : status.replaceAll('_', ' ');
  };
  return <Screen><PageScroll>
    <BrandHeader title={t('driverHistory.title', 'Ride History')} onBack={() => go('home')} />
    <PageTitle title={t('driverHistory.pageTitle', 'Past rides')} subtitle={t('driverHistory.subtitle', 'Backend-returned completed and cancelled ride records.')} />
    {notice ? <ScreenStateNotice kind="failure" message={notice} /> : null}
    <OutlineButton title={refreshing ? t('driverHistory.refreshing', 'Refreshing…') : t('driverHistory.refresh', 'Refresh history')} disabled={refreshing} onPress={() => void refresh()} />
    {history.length === 0 ? <EmptyState title={t('driverHistory.noHistory', 'No history')} body={t('driverHistory.emptyHelp', 'No history rows were returned by the backend.')} /> : history.map((r: any, i: number) => <Card key={String(r.id || r.bookingId || i)}>
      <StatusPill label={statusLabel(r.status)} />
      <Text style={{ marginTop: 7, fontWeight: '900' }}>{String(r.booking?.rideType || r.rideType || t('driverHistory.rideFallback', 'Ride'))}</Text>
      <Text style={{ marginTop: 4, color: '#667085' }}>{String(r.booking?.pickupAddress || r.pickupAddress || t('driverHistory.pickupUnavailable', 'Pickup unavailable'))} → {String(r.booking?.dropAddress || r.dropAddress || t('driverHistory.destinationUnavailable', 'Destination unavailable'))}</Text>
    </Card>)}
  </PageScroll></Screen>;
}
