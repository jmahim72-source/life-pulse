
import { useSyncStatus } from '../sync/status';

const STATUS_CONFIG = {
  synced: { label: 'Synced', color: 'var(--color-habit)', icon: '✓' },
  syncing: { label: 'Syncing…', color: 'var(--color-journal)', icon: '↻' },
  offline: { label: 'Offline', color: 'var(--color-text-muted)', icon: '○' },
  error: { label: 'Sync error', color: 'var(--color-people)', icon: '⚠' },
};

export default function SyncIndicator() {
  const status = useSyncStatus();
  const config = STATUS_CONFIG[status];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        color: config.color,
        fontWeight: 500,
        padding: '4px 10px',
        borderRadius: '20px',
        backgroundColor: 'rgba(30, 41, 59, 0.5)',
      }}
    >
      <span style={{ fontSize: '10px' }}>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}
