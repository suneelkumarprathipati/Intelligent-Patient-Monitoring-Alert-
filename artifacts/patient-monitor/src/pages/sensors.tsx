import { useListSensors } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Radio, Activity, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

export default function Sensors() {
  const { data: sensors, isLoading } = useListSensors();

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading sensor registry...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Sensor Registry</h1>
        <Badge variant="secondary" className="px-3 py-1 text-sm font-medium">
          {sensors?.length || 0} Total Devices
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sensors?.map(sensor => {
          const lastPingDate = new Date(sensor.lastPing);
          const isStale = (new Date().getTime() - lastPingDate.getTime()) > 30000; // 30s stale
          
          return (
            <Card key={sensor.id} className={`bg-card ${!sensor.isActive ? 'opacity-60' : ''}`}>
              <CardHeader className="py-4 pb-2 border-b border-border flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-mono">{sensor.deviceId}</CardTitle>
                {sensor.isActive && !isStale ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                ) : (
                  <div className="h-2 w-2 rounded-full bg-destructive" />
                )}
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm font-medium">
                    <Activity className="h-4 w-4 mr-2 text-primary" />
                    <span className="capitalize">{sensor.sensorType.replace('_', ' ')}</span>
                  </div>
                  <Badge variant="outline" className={sensor.isActive ? "border-primary text-primary" : ""}>
                    {sensor.isActive ? 'Active' : 'Offline'}
                  </Badge>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center"><LinkIcon className="h-3 w-3 mr-1" /> Assignment</span>
                    {sensor.patientId ? (
                      <Link href={`/patients/${sensor.patientId}`}>
                        <span className="font-medium text-foreground hover:underline cursor-pointer transition-colors">
                          Patient #{sensor.patientId}
                        </span>
                      </Link>
                    ) : (
                      <span>Unassigned</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center"><Radio className="h-3 w-3 mr-1" /> Last Ping</span>
                    <span className={isStale ? "text-destructive font-medium flex items-center" : ""}>
                      {isStale && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {formatDistanceToNow(lastPingDate, { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
