import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, Tabs } from '../../ui'
import { useStore } from '../../core/store'
import { fmtDateShort, fmtTime, relativeDay, today } from '../../core/format'
import type { Notification } from '../../core/types'
import './notifications.css'

export default function NotificationsPage() {
  const nav = useNavigate()
  const all = useStore((s) => s.notifications)
  const markRead = useStore((s) => s.markNotificationRead)
  const markAll = useStore((s) => s.markAllNotificationsRead)
  const [tab, setTab] = useState<'all' | 'unread'>('all')

  const mine = useMemo(
    () => all.filter((n) => n.audience === 'MANAGER').sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [all],
  )
  const unread = mine.filter((n) => !n.read).length
  const shown = tab === 'unread' ? mine.filter((n) => !n.read) : mine

  const t = today()
  const groups = [
    { label: 'Today', items: shown.filter((n) => n.timestamp.slice(0, 10) === t) },
    { label: 'Earlier', items: shown.filter((n) => n.timestamp.slice(0, 10) !== t) },
  ].filter((g) => g.items.length > 0)

  const open = (n: Notification) => {
    if (!n.read) markRead(n.id)
    if (n.link) nav(n.link)
  }

  return (
    <div className="page ntf-page">
      <PageHeader
        title="Notifications"
        sub={unread ? `${unread} unread` : 'You are all caught up'}
        actions={<Button icon={<CheckCheck />} disabled={!unread} onClick={() => markAll('MANAGER')}>Mark all as read</Button>}
      />
      <Tabs
        tabs={[{ id: 'all', label: `All (${mine.length})` }, { id: 'unread', label: `Unread (${unread})` }]}
        value={tab}
        onChange={setTab}
      />

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bell />}
            title={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            text={tab === 'unread' ? 'Everything has been read.' : 'New grower registrations, storage requests, arrivals and dispatch requests will appear here.'}
            action={tab === 'unread' && mine.length > 0 ? <Button size="sm" onClick={() => setTab('all')}>View all</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="stack ntf-groups">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="ntf-group">{g.label}</h2>
              <div className="card ntf-list">
                {g.items.map((n) => (
                  <div key={n.id} className={`ntf-item ${n.read ? '' : 'unread'} ${n.link ? 'link' : ''}`}>
                    <button className="ntf-main" onClick={() => open(n)}>
                      <span className="ntf-dot" aria-label={n.read ? 'Read' : 'Unread'} />
                      <span className="ntf-body">
                        <span className="ntf-title">{n.title}</span>
                        <span className="ntf-text">{n.body}</span>
                      </span>
                      <span className="ntf-time muted">
                        {g.label === 'Today' ? fmtTime(n.timestamp) : `${relativeDay(n.timestamp) === 'Yesterday' ? 'Yesterday' : fmtDateShort(n.timestamp)}, ${fmtTime(n.timestamp)}`}
                      </span>
                      {n.link && <ChevronRight className="ntf-go" />}
                    </button>
                    {!n.read && <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
