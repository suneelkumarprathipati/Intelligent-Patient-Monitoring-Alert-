import { useEffect, useRef, useState, useCallback } from 'react';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected';

export interface VitalMessage {
  type: 'vital';
  data: import('@workspace/api-client-react').VitalReading;
}

export interface AlertMessage {
  type: 'alert';
  data: import('@workspace/api-client-react').Alert;
}

export interface PingMessage {
  type: 'ping';
}

export type WebSocketMessage = VitalMessage | AlertMessage | PingMessage;

export function useWebSocket() {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  
  const subscribersRef = useRef<{
    vital: Set<(data: import('@workspace/api-client-react').VitalReading) => void>;
    alert: Set<(data: import('@workspace/api-client-react').Alert) => void>;
  }>({
    vital: new Set(),
    alert: new Set(),
  });

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setStatus('connected');
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        
        if (message.type === 'vital') {
          subscribersRef.current.vital.forEach(cb => cb(message.data));
        } else if (message.type === 'alert') {
          subscribersRef.current.alert.forEach(cb => cb(message.data));
        }
      } catch (err) {
        console.error('Failed to parse websocket message', err);
      }
    };
    
    ws.onclose = () => {
      setStatus('disconnected');
      // Exponential backoff reconnect
      reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
    };
    
    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      ws.close();
    };
    
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const onVital = useCallback((cb: (data: import('@workspace/api-client-react').VitalReading) => void) => {
    subscribersRef.current.vital.add(cb);
    return () => {
      subscribersRef.current.vital.delete(cb);
    };
  }, []);

  const onAlert = useCallback((cb: (data: import('@workspace/api-client-react').Alert) => void) => {
    subscribersRef.current.alert.add(cb);
    return () => {
      subscribersRef.current.alert.delete(cb);
    };
  }, []);

  return { status, onVital, onAlert };
}
