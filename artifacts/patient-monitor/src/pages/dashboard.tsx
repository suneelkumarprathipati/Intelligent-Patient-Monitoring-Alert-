import { useGetDashboardStats, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useWebSocketContext } from "@/contexts/WebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, AlertTriangle, Radio } from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();
  const queryClient = useQueryClient();
  const { onAlert } = useWebSocketContext();

  useEffect(() => {
    const unsub = onAlert(() => {
      queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
    });
    return unsub;
  }, [onAlert, queryClient]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading dashboard...</div>;
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* KPI Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="kpi-total-patients">{stats.totalPatients}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-destructive font-medium">{stats.criticalPatients} critical</span> · {stats.stablePatients} stable
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive" data-testid="kpi-active-alerts">{stats.activeAlerts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.acknowledgedAlerts} acknowledged
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Sensors</CardTitle>
            <Radio className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary" data-testid="kpi-active-sensors">{stats.activeSensors}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Out of {stats.totalSensors} total devices
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">System Status</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">Operational</div>
            <p className="text-xs text-muted-foreground mt-1">
              All services healthy
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts Breakdown */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Alerts by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-destructive mr-2" />
                  <span className="text-sm font-medium">Critical</span>
                </div>
                <span className="text-sm text-muted-foreground">{stats.alertsBySeverity.critical || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-orange-500 mr-2" />
                  <span className="text-sm font-medium">High</span>
                </div>
                <span className="text-sm text-muted-foreground">{stats.alertsBySeverity.high || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2" />
                  <span className="text-sm font-medium">Medium</span>
                </div>
                <span className="text-sm text-muted-foreground">{stats.alertsBySeverity.medium || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-2" />
                  <span className="text-sm font-medium">Low</span>
                </div>
                <span className="text-sm text-muted-foreground">{stats.alertsBySeverity.low || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Patient Conditions */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Patient Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-destructive mr-2" />
                  <span className="text-sm font-medium">Critical</span>
                </div>
                <span className="text-sm text-muted-foreground">{stats.criticalPatients}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-green-500 mr-2" />
                  <span className="text-sm font-medium">Stable</span>
                </div>
                <span className="text-sm text-muted-foreground">{stats.stablePatients}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2" />
                  <span className="text-sm font-medium">Observation</span>
                </div>
                <span className="text-sm text-muted-foreground">{stats.observationPatients}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
