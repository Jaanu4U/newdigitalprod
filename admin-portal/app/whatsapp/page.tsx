"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, QrCode, CheckCircle, XCircle, RefreshCw, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { withTenantHeaders } from "@/lib/tenant";
import { apiBase } from "@/lib/api";

export default function WhatsAppPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [newSessionId, setNewSessionId] = useState("");
  const [qrCodes, setQrCodes] = useState<Map<string, string>>(new Map());
  const [statuses, setStatuses] = useState<Map<string, any>>(new Map());
  
  const base = useMemo(() => apiBase(), []);

  useEffect(() => {
    fetchMe();
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchMe = async () => {
    const token = localStorage.getItem("dc_access");
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const res = await fetch(`${base}me`, withTenantHeaders({
        headers: { Authorization: `Bearer ${token}` }
      }));
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMe(data);
    } catch {
      router.push("/login");
    }
  };

  const fetchSessions = async () => {
    const token = localStorage.getItem("dc_access");
    if (!token) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${base}whatsapp/sessions`, withTenantHeaders({
        headers: { Authorization: `Bearer ${token}` }
      }));
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        
        // Fetch status for each session
        for (const session of (data.sessions || [])) {
          fetchSessionStatus(session.sessionId);
          if (session.status === 'qr_ready') {
            fetchQrCode(session.sessionId);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch sessions:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionStatus = async (sessionId: string) => {
    const token = localStorage.getItem("dc_access");
    if (!token) return;
    
    try {
      const res = await fetch(`${base}whatsapp/status/${sessionId}`, withTenantHeaders({
        headers: { Authorization: `Bearer ${token}` }
      }));
      if (res.ok) {
        const data = await res.json();
        setStatuses(prev => new Map(prev).set(sessionId, data));
      }
    } catch (e) {
      console.error(`Failed to fetch status for ${sessionId}:`, e);
    }
  };

  const fetchQrCode = async (sessionId: string) => {
    const token = localStorage.getItem("dc_access");
    if (!token) return;
    
    try {
      const res = await fetch(`${base}whatsapp/qr/${sessionId}`, withTenantHeaders({
        headers: { Authorization: `Bearer ${token}` }
      }));
      if (res.ok) {
        const data = await res.json();
        if (data.qr || data.qrCode) {
          setQrCodes(prev => new Map(prev).set(sessionId, data.qr || data.qrCode));
        }
      }
    } catch (e) {
      console.error(`Failed to fetch QR for ${sessionId}:`, e);
    }
  };

  const initSession = async () => {
    if (!newSessionId.trim()) {
      alert("Please enter a session ID");
      return;
    }

    const token = localStorage.getItem("dc_access");
    if (!token) return;

    try {
      const res = await fetch(`${base}whatsapp/init`, withTenantHeaders({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ session_id: newSessionId })
      }));

      if (res.ok) {
        setNewSessionId("");
        alert("Session initialized! QR code will appear below.");
        setTimeout(fetchSessions, 2000);
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to initialize session");
      }
    } catch (e) {
      alert("Error initializing session");
    }
  };

  const logoutSession = async (sessionId: string) => {
    // Validate session exists before logout
    const sessionExists = sessions.some(s => s.sessionId === sessionId);
    if (!sessionExists) {
      alert(`Session ${sessionId} not found. Please refresh the page.`);
      fetchSessions();
      return;
    }

    if (!confirm(`Are you sure you want to logout session ${sessionId}?`)) {
      return;
    }

    const token = localStorage.getItem("dc_access");
    if (!token) return;

    try {
      const res = await fetch(`${base}whatsapp/logout`, withTenantHeaders({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ session_id: sessionId })
      }));

      if (res.ok) {
        alert("Session logged out successfully");
        fetchSessions();
      } else if (res.status === 404) {
        const err = await res.json();
        alert(err.detail || "Session not found. Please refresh and try again.");
        fetchSessions();
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to logout session");
      }
    } catch (e) {
      alert("Error logging out session");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'text-green-600 bg-green-50';
      case 'authenticated': return 'text-blue-600 bg-blue-50';
      case 'qr_ready': return 'text-yellow-600 bg-yellow-50';
      case 'disconnected': return 'text-gray-600 bg-gray-50';
      case 'auth_failed': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready': return <CheckCircle size={16} />;
      case 'qr_ready': return <QrCode size={16} />;
      case 'auth_failed': return <XCircle size={16} />;
      default: return <RefreshCw size={16} className="animate-spin" />;
    }
  };

  if (!me) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-full bg-green-600 flex items-center justify-center">
                <MessageCircle size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">WhatsApp Sessions</h1>
                <p className="text-sm text-gray-600">Manage your WhatsApp Web connections</p>
              </div>
            </div>

            {/* Add Session */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Initialize New Session</h2>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newSessionId}
                  onChange={(e) => setNewSessionId(e.target.value)}
                  placeholder="Enter session ID (e.g., main-account)"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
                  onKeyDown={(e) => e.key === 'Enter' && initSession()}
                />
                <button
                  onClick={initSession}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                >
                  Initialize
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                After initialization, scan the QR code with WhatsApp mobile app (Linked Devices)
              </p>
            </div>

            {/* Sessions List */}
            {loading && sessions.length === 0 ? (
              <div className="text-center py-12">
                <RefreshCw size={32} className="animate-spin mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600">Loading sessions...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <MessageCircle size={48} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600 text-lg font-medium mb-2">No WhatsApp Sessions</p>
                <p className="text-gray-500 text-sm">Initialize a new session to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sessions.map((session) => {
                  const status = statuses.get(session.sessionId);
                  const qrCode = qrCodes.get(session.sessionId);
                  const sessionStatus = session.status || status?.status || 'unknown';

                  return (
                    <div key={session.sessionId} className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                      {/* Session Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg text-gray-900">{session.sessionId}</h3>
                          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mt-2 ${getStatusColor(sessionStatus)}`}>
                            {getStatusIcon(sessionStatus)}
                            <span className="capitalize">{sessionStatus.replace('_', ' ')}</span>
                          </div>
                        </div>
                        {sessionStatus !== 'qr_ready' && (
                          <button
                            onClick={() => logoutSession(session.sessionId)}
                            className="text-red-600 hover:text-red-800 p-2"
                            title="Logout"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>

                      {/* QR Code */}
                      {sessionStatus === 'qr_ready' && qrCode && (
                        <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                          <p className="text-sm font-medium text-green-800 mb-3 text-center">
                            Scan with WhatsApp Mobile
                          </p>
                          <img
                            src={qrCode}
                            alt="QR Code"
                            className="w-full max-w-[250px] mx-auto bg-white p-2 rounded"
                          />
                          <p className="text-xs text-green-700 mt-3 text-center">
                            Open WhatsApp → Settings → Linked Devices → Link a Device
                          </p>
                        </div>
                      )}

                      {/* Ready State Info */}
                      {sessionStatus === 'ready' && status && (
                        <div className="space-y-2 text-sm">
                          {status.phoneNumber && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Phone:</span>
                              <span className="font-medium">{status.phoneNumber}</span>
                            </div>
                          )}
                          {status.name && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Name:</span>
                              <span className="font-medium">{status.name}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-600">State:</span>
                            <span className="font-medium text-green-600">Connected</span>
                          </div>
                        </div>
                      )}

                      {/* Error State */}
                      {sessionStatus === 'auth_failed' && (
                        <div className="text-center py-4 text-red-600">
                          <p className="text-sm font-medium">Authentication Failed</p>
                          <p className="text-xs mt-1">Please reinitialize the session</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Instructions */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">How to Connect</h3>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Initialize a new session with a unique ID</li>
                <li>Wait for the QR code to appear</li>
                <li>Open WhatsApp on your phone → Settings → Linked Devices</li>
                <li>Tap "Link a Device" and scan the QR code</li>
                <li>Once connected, the session will show as "Ready"</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
  );
}
