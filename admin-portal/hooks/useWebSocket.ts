import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  data: any;
}

export function useWebSocket(onMessage: (message: WebSocketMessage) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const onMessageRef = useRef(onMessage);
  const isCleanupRef = useRef(false);

  // Keep the callback ref up to date
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const token = localStorage.getItem('dc_access');
    if (!token) {
      console.log('⚠️ No access token found');
      return;
    }

    console.log('🔧 useWebSocket effect running');
    isCleanupRef.current = false;
    
    const connect = () => {
      // Don't create new connection if already connected
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('✅ WebSocket already connected');
        return;
      }

      // Close existing connection if any (but not CONNECTING)
      if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
        console.log('⏳ WebSocket already connecting, skipping');
        return;
      }

      if (wsRef.current) {
        console.log('🔌 Closing stale WebSocket');
        wsRef.current.close();
      }

      const wsUrl = `wss://api.digitalchain.in/ws?token=${token}`;
      console.log('🔌 Creating new WebSocket connection');
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('🔌 WebSocket connected');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 WebSocket message received:', message);
          onMessageRef.current(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected', { code: event.code, reason: event.reason, wasClean: event.wasClean });
        setIsConnected(false);
        
        // Only reconnect if not a clean closure and not during cleanup
        if (event.code !== 1000 && !isCleanupRef.current) {
          // Reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Reconnecting WebSocket...');
            connect();
          }, 5000);
        }
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      console.log('🧹 useWebSocket cleanup');
      isCleanupRef.current = true;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, []); // Empty dependency array - only connect once

  return { isConnected };
}
