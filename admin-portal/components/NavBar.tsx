"use client";
import { useEffect, useState, useRef } from "react";
import { Bell, Settings, LogOut, User } from "lucide-react";
import Link from "next/link";

interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  unread: boolean;
}

export default function NavBar() {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notificationList, setNotificationList] = useState<Notification[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const nextIdRef = useRef(1);

  useEffect(() => {
    try {
      setEmail(localStorage.getItem("dc_email"));
      setRole(localStorage.getItem("dc_role"));
      setOrgName(localStorage.getItem("dc_org"));
    } catch {}

    // Set up WebSocket for real-time notifications
    const token = localStorage.getItem('dc_access');
    if (!token) return;

    const ws = new WebSocket(`wss://api.digitalchain.in/ws?token=${token}`);

    ws.onopen = () => {
      console.log('🔔 Notification WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('🔔 Received notification:', message);

        let title = '';
        let text = '';

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
          unread: true
        };

        setNotificationList(prev => [newNotification, ...prev].slice(0, 20)); // Keep last 20
        setNotifications(prev => prev + 1);

        // Show browser notification if permission granted
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body: text, icon: '/favicon.ico' });
        }
      } catch (err) {
        console.error('Failed to process notification:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('🔔 Notification WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('🔔 Notification WebSocket disconnected');
    };

    wsRef.current = ws;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleLogout = () => {
    try {
      localStorage.removeItem("dc_access");
      localStorage.removeItem("dc_refresh");
      localStorage.removeItem("dc_email");
      localStorage.removeItem("dc_role");
      localStorage.removeItem("dc_org");
      window.location.href = "/login";
    } catch {}
  };

  const markAsRead = (id: number) => {
    setNotificationList(prev => 
      prev.map(notif => notif.id === id ? { ...notif, unread: false } : notif)
    );
    setNotifications(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotificationList(prev => prev.map(notif => ({ ...notif, unread: false })));
    setNotifications(0);
  };

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Logo/Brand */}
          <Link href="/" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">DC</span>
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent hidden sm:block">
              {orgName || "DigitalChain"}
            </span>
          </Link>

          {/* Right: Notifications & User Menu */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setShowUserMenu(false);
                }}
                className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Notifications"
              >
                <Bell className="h-6 w-6 text-gray-700" />
                {notifications > 0 && (
                  <span className="absolute top-0 right-0 h-5 w-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                    {notifications > 9 ? "9+" : notifications}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-50">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between">
                    <h3 className="text-white font-semibold">Notifications</h3>
                    {notifications > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-white hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notificationList.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        No notifications
                      </div>
                    ) : (
                      notificationList.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => markAsRead(notif.id)}
                          className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                            notif.unread ? "bg-blue-50" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-900">
                                {notif.title}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                {notif.message}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {notif.time}
                              </p>
                            </div>
                            {notif.unread && (
                              <div className="h-2 w-2 bg-blue-600 rounded-full mt-1 ml-2"></div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-2 bg-gray-50 border-t border-gray-200">
                    <Link
                      href="/notifications"
                      className="block text-center text-sm text-blue-600 hover:text-blue-700 font-medium py-2"
                    >
                      View all notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowUserMenu(!showUserMenu);
                  setShowNotifications(false);
                }}
                className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="User menu"
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold shadow-md">
                  {email?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="text-left hidden md:block">
                  <p className="text-sm font-medium text-gray-900 leading-none">
                    {email?.split("@")[0] || "User"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{role || "Member"}</p>
                </div>
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-50">
                  <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <p className="font-semibold text-gray-900">{email?.split("@")[0]}</p>
                    <p className="text-xs text-gray-600 mt-1">{email}</p>
                    <p className="text-xs text-blue-600 font-medium mt-1">{role}</p>
                  </div>
                  <div className="py-2">
                    <Link
                      href="/settings"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <User className="h-4 w-4 text-gray-600" />
                      <span className="text-sm text-gray-700">Profile</span>
                    </Link>
                    <Link
                      href="/settings"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <Settings className="h-4 w-4 text-gray-600" />
                      <span className="text-sm text-gray-700">Settings</span>
                    </Link>
                  </div>
                  <div className="border-t border-gray-100">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-red-50 transition-colors text-left"
                    >
                      <LogOut className="h-4 w-4 text-red-600" />
                      <span className="text-sm text-red-600 font-medium">Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close dropdowns */}
      {(showNotifications || showUserMenu) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowNotifications(false);
            setShowUserMenu(false);
          }}
        />
      )}
    </nav>
  );
}
