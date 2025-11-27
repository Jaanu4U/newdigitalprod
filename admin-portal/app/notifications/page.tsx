'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Trash2, Filter } from 'lucide-react';

interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  timestamp: Date;
  unread: boolean;
  type: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const nextIdRef = useRef(1);

  useEffect(() => {
    // Load notifications from localStorage
    try {
      const saved = localStorage.getItem('dc_notifications');
      if (saved) {
        const parsed = JSON.parse(saved);
        setNotifications(parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp)
        })));
        nextIdRef.current = Math.max(...parsed.map((n: any) => n.id), 0) + 1;
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
    setLoading(false);

    // Set up WebSocket for real-time notifications
    const token = localStorage.getItem('dc_access');
    if (!token) {
      router.push('/login');
      return;
    }

    const ws = new WebSocket(`wss://api.digitalchain.in/ws?token=${token}`);

    ws.onopen = () => {
      console.log('🔔 Notifications page WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('🔔 Notification received:', message);

        let title = '';
        let text = '';
        let type = message.type || 'info';

        // Create notification based on message type
        switch (message.type) {
          case 'pod_uploaded':
            title = 'POD Uploaded';
            text = `Proof of delivery uploaded for ${message.data.invoice_no}`;
            break;
          case 'delivery_completed':
            title = 'Delivery Completed';
            text = `Order ${message.data.invoice_no} has been delivered`;
            break;
          case 'order_status_update':
            title = 'Order Status Update';
            text = `Order ${message.data.invoice_no} is now ${message.data.status}`;
            if (message.data.rider_name) {
              text += ` by ${message.data.rider_name}`;
            }
            break;
          case 'payment_confirmed':
            title = 'Payment Confirmed';
            text = `Payment received for order ${message.data.order_id || message.data.invoice_no}`;
            break;
          case 'rider_location_update':
            // Don't show notification for location updates
            return;
          default:
            title = 'New Update';
            text = message.data?.message || 'You have a new notification';
        }

        // Add notification to list
        const newNotification: Notification = {
          id: nextIdRef.current++,
          title,
          message: text,
          time: 'Just now',
          timestamp: new Date(),
          unread: true,
          type
        };

        setNotifications(prev => {
          const updated = [newNotification, ...prev].slice(0, 100); // Keep last 100
          // Save to localStorage
          try {
            localStorage.setItem('dc_notifications', JSON.stringify(updated));
          } catch (err) {
            console.error('Failed to save notifications:', err);
          }
          return updated;
        });
      } catch (err) {
        console.error('Failed to process notification:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('🔔 Notifications WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('🔔 Notifications WebSocket disconnected');
    };

    wsRef.current = ws;

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [router]);

  const markAsRead = (id: number) => {
    setNotifications(prev => {
      const updated = prev.map(notif => 
        notif.id === id ? { ...notif, unread: false } : notif
      );
      try {
        localStorage.setItem('dc_notifications', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save:', err);
      }
      return updated;
    });
  };

  const markAllAsRead = () => {
    setNotifications(prev => {
      const updated = prev.map(notif => ({ ...notif, unread: false }));
      try {
        localStorage.setItem('dc_notifications', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save:', err);
      }
      return updated;
    });
  };

  const deleteNotification = (id: number) => {
    setNotifications(prev => {
      const updated = prev.filter(notif => notif.id !== id);
      try {
        localStorage.setItem('dc_notifications', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save:', err);
      }
      return updated;
    });
  };

  const clearAll = () => {
    if (confirm('Are you sure you want to clear all notifications?')) {
      setNotifications([]);
      try {
        localStorage.removeItem('dc_notifications');
      } catch (err) {
        console.error('Failed to clear:', err);
      }
    }
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filter === 'unread') return notif.unread;
    if (filter === 'read') return !notif.unread;
    return true;
  });

  const unreadCount = notifications.filter(n => n.unread).length;

  const formatTime = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toLocaleDateString();
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'pod_uploaded': return 'text-blue-600 bg-blue-50';
      case 'delivery_completed': return 'text-green-600 bg-green-50';
      case 'order_status_update': return 'text-purple-600 bg-purple-50';
      case 'payment_confirmed': return 'text-emerald-600 bg-emerald-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Bell className="h-8 w-8 text-blue-600" />
              Notifications
            </h1>
            <p className="text-gray-600 mt-1">
              {unreadCount > 0 
                ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
                : 'All caught up!'
              }
            </p>
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'unread'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Unread ({unreadCount})
          </button>
          <button
            onClick={() => setFilter('read')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'read'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Read ({notifications.length - unreadCount})
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-2">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {filter === 'unread' 
                ? 'No unread notifications'
                : filter === 'read'
                ? 'No read notifications'
                : 'No notifications yet'
              }
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              className={`bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow ${
                notif.unread ? 'border-l-4 border-l-blue-600' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTypeColor(notif.type)}`}>
                      {notif.type.replace('_', ' ')}
                    </span>
                    {notif.unread && (
                      <span className="h-2 w-2 bg-blue-600 rounded-full"></span>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{notif.title}</h3>
                  <p className="text-sm text-gray-600 mb-2">{notif.message}</p>
                  <p className="text-xs text-gray-400">{formatTime(notif.timestamp)}</p>
                </div>
                <div className="flex gap-2 ml-4">
                  {notif.unread && (
                    <button
                      onClick={() => markAsRead(notif.id)}
                      className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Mark as read"
                    >
                      <CheckCheck className="h-4 w-4 text-blue-600" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notif.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
