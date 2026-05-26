import { useListAlerts, useAcknowledgeAlert, useResolveAlert, getListAlertsQueryKey, AlertStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useWebSocketContext } from "@/contexts/WebSocketContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, ShieldAlert } from "lucide-react";

export default function Alerts() {
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "all">("active");
  const queryClient = useQueryClient();
  const { onAlert } = useWebSocketContext();

  const params = statusFilter === "all" ? {} : { status: statusFilter };
  const { data: alerts, isLoading } = useListAlerts(params);
  
  const acknowledgeAlert = useAcknowledgeAlert();
  const resolveAlert = useResolveAlert();

  useEffect(() => {
    const unsub = onAlert(() => {
      queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey(params) });
    });
    return unsub;
  }, [onAlert, queryClient, params]);

  const handleAcknowledge = async (id: number) => {
    await acknowledgeAlert.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey(params) });
  };

  const handleResolve = async (id: number) => {
    await resolveAlert.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey(params) });
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge className="bg-destructive text-destructive-foreground font-bold animate-pulse-fast">CRITICAL</Badge>;
      case 'high': return <Badge className="bg-orange-500 text-white font-bold">HIGH</Badge>;
      case 'medium': return <Badge className="bg-yellow-500 text-white font-bold">MEDIUM</Badge>;
      case 'low': return <Badge className="bg-blue-500 text-white font-bold">LOW</Badge>;
      default: return <Badge>{severity}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Alert Center</h1>
        <div className="w-48">
          <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All Alerts</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-lg">System Alerts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading alerts...</TableCell>
                </TableRow>
              ) : alerts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No alerts found.</TableCell>
                </TableRow>
              ) : (
                alerts?.map(alert => (
                  <TableRow key={alert.id} className={alert.status === 'active' && alert.severity === 'critical' ? 'bg-destructive/10' : ''}>
                    <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                    <TableCell className="font-medium">{alert.patientName}</TableCell>
                    <TableCell className="max-w-md">{alert.message}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(alert.triggeredAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{alert.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {alert.status === 'active' && (
                          <Button size="sm" variant="secondary" onClick={() => handleAcknowledge(alert.id)} data-testid={`btn-ack-${alert.id}`}>
                            <ShieldAlert className="h-4 w-4 mr-1" /> Ack
                          </Button>
                        )}
                        {(alert.status === 'active' || alert.status === 'acknowledged') && (
                          <Button size="sm" onClick={() => handleResolve(alert.id)} data-testid={`btn-resolve-${alert.id}`}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Resolve
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
