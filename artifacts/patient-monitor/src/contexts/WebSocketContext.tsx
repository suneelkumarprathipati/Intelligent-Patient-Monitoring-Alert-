import React, { createContext, useContext, useEffect } from 'react';
import { useWebSocket, WebSocketStatus } from '../hooks/useWebSocket';
import { toast } from 'sonner';

interface WebSocketContextType {
  status: WebSocketStatus;
  onVital: (cb: (data: import('@workspace/api-client-react').VitalReading) => void) => () => void;
  onAlert: (cb: (data: import('@workspace/api-client-react').Alert) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const ws = useWebSocket();

  useEffect(() => {
    const unsubscribeAlert = ws.onAlert((alert) => {
      const severityColor = 
        alert.severity === 'critical' ? 'text-destructive' :
        alert.severity === 'high' ? 'text-orange-500' :
        alert.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500';

      toast.error(`Alert: ${alert.patientName}`, {
        description: alert.message,
        className: 'border-l-4 border-l-destructive',
      });
    });

    return () => {
      unsubscribeAlert();
    };
  }, [ws]);

  return (
    <WebSocketContext.Provider value={ws}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
