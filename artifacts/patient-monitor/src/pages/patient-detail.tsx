import { useParams } from "wouter";
import { 
  useGetPatient, 
  useGetVitalsHistory, 
  useGetLatestVitals,
  getGetVitalsHistoryQueryKey,
  getGetLatestVitalsQueryKey,
  VitalReading
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { useWebSocketContext } from "@/contexts/WebSocketContext";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VitalChart } from "@/components/ui/vital-chart";
import { Activity, Thermometer, Wind, Droplets, Heart } from "lucide-react";

export default function PatientDetail() {
  const { id } = useParams();
  const patientId = Number(id);
  const queryClient = useQueryClient();
  const { onVital } = useWebSocketContext();

  const { data: patient, isLoading: patientLoading } = useGetPatient(patientId);
  const { data: initialHistory, isLoading: historyLoading } = useGetVitalsHistory(patientId);
  const { data: latestVitals } = useGetLatestVitals(patientId);

  // Maintain local state for vitals history to append live data
  const [liveVitals, setLiveVitals] = useState<Record<string, any[]>>({
    heart_rate: [],
    spo2: [],
    systolic_bp: [],
    diastolic_bp: [],
    temperature: [],
    respiration_rate: []
  });

  // Initialize history when fetched
  useEffect(() => {
    if (initialHistory && initialHistory.length > 0) {
      const historyBySensor: Record<string, any[]> = {
        heart_rate: [], spo2: [], systolic_bp: [], diastolic_bp: [], temperature: [], respiration_rate: []
      };
      
      // Sort older first
      const sorted = [...initialHistory].sort((a, b) => 
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
      );

      sorted.forEach(reading => {
        if (historyBySensor[reading.sensorType]) {
          historyBySensor[reading.sensorType].push(reading);
        }
      });
      
      setLiveVitals(historyBySensor);
    }
  }, [initialHistory]);

  // Subscribe to live vitals
  useEffect(() => {
    const unsub = onVital((vital: VitalReading) => {
      if (vital.patientId === patientId) {
        // Update charts data
        setLiveVitals(prev => {
          const currentTypeHistory = prev[vital.sensorType] || [];
          const newHistory = [...currentTypeHistory, vital];
          // Keep last 60 points
          if (newHistory.length > 60) newHistory.shift();
          
          return {
            ...prev,
            [vital.sensorType]: newHistory
          };
        });

        // Also update latest vitals query cache softly
        queryClient.setQueryData(getGetLatestVitalsQueryKey(patientId), (old: VitalReading[] | undefined) => {
          if (!old) return [vital];
          const filtered = old.filter(v => v.sensorType !== vital.sensorType);
          return [...filtered, vital];
        });
      }
    });

    return unsub;
  }, [patientId, onVital, queryClient]);

  const latestByType = useMemo(() => {
    const map: Record<string, VitalReading> = {};
    if (latestVitals) {
      latestVitals.forEach(v => { map[v.sensorType] = v; });
    }
    return map;
  }, [latestVitals]);

  if (patientLoading) return <div className="p-8 text-center text-muted-foreground">Loading patient...</div>;
  if (!patient) return <div className="p-8 text-center text-destructive">Patient not found</div>;

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'stable': return 'bg-green-500 text-white';
      case 'observation': return 'bg-yellow-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getVitalColor = (sensorType: string) => {
    switch (sensorType) {
      case 'heart_rate': return 'hsl(var(--chart-4))'; // Red
      case 'spo2': return 'hsl(var(--chart-1))'; // Cyan
      case 'systolic_bp': return 'hsl(var(--chart-5))'; // Purple
      case 'diastolic_bp': return 'hsl(var(--chart-5))'; 
      case 'temperature': return 'hsl(var(--chart-3))'; // Yellow
      case 'respiration_rate': return 'hsl(var(--chart-2))'; // Teal
      default: return 'hsl(var(--primary))';
    }
  };

  const getStatusColorClass = (status: string) => {
    switch(status) {
      case 'critical': return 'text-destructive';
      case 'warning': return 'text-yellow-500';
      default: return 'text-green-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Patient Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-lg border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
            {patient.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold" data-testid="patient-name">{patient.name}</h1>
              <Badge className={getConditionColor(patient.condition)} variant="outline">
                {patient.condition.toUpperCase()}
              </Badge>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-background border border-border text-xs font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                LIVE
              </div>
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <span>ID: {patient.id}</span> • 
              <span>{patient.age}y</span> • 
              <span className="capitalize">{patient.gender}</span> •
              <span>Ward {patient.ward}, Bed {patient.bed}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-muted-foreground mb-1">Diagnosis</div>
          <div className="font-medium max-w-xs truncate" title={patient.diagnosis || "None"}>
            {patient.diagnosis || "No diagnosis recorded"}
          </div>
        </div>
      </div>

      {/* Snapshot Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { type: 'heart_rate', name: 'Heart Rate', icon: Heart, unit: 'bpm' },
          { type: 'spo2', name: 'SpO2', icon: Droplets, unit: '%' },
          { type: 'systolic_bp', name: 'Sys BP', icon: Activity, unit: 'mmHg' },
          { type: 'diastolic_bp', name: 'Dia BP', icon: Activity, unit: 'mmHg' },
          { type: 'temperature', name: 'Temp', icon: Thermometer, unit: '°C' },
          { type: 'respiration_rate', name: 'Resp', icon: Wind, unit: 'rpm' }
        ].map(vitalDef => {
          const reading = latestByType[vitalDef.type];
          const Icon = vitalDef.icon;
          return (
            <Card key={vitalDef.type} className="bg-card">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-xs font-medium text-muted-foreground">{vitalDef.name}</div>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex items-baseline gap-1">
                  {reading ? (
                    <>
                      <div className={`text-2xl font-bold ${getStatusColorClass(reading.status)}`}>
                        {reading.value}
                      </div>
                      <div className="text-xs font-medium text-muted-foreground">{reading.unit}</div>
                    </>
                  ) : (
                    <div className="text-xl font-bold text-muted-foreground">--</div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Grid */}
      <h2 className="text-lg font-semibold mt-8 mb-4">Vital Trends (Live)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="h-64">
          <VitalChart 
            title="Heart Rate" 
            data={liveVitals.heart_rate} 
            dataKey="value" 
            color={getVitalColor('heart_rate')} 
            unit="bpm"
            minValue={40} maxValue={160}
          />
        </div>
        <div className="h-64">
          <VitalChart 
            title="SpO2" 
            data={liveVitals.spo2} 
            dataKey="value" 
            color={getVitalColor('spo2')} 
            unit="%"
            minValue={85} maxValue={100}
          />
        </div>
        <div className="h-64">
          <VitalChart 
            title="Systolic BP" 
            data={liveVitals.systolic_bp} 
            dataKey="value" 
            color={getVitalColor('systolic_bp')} 
            unit="mmHg"
            minValue={70} maxValue={200}
          />
        </div>
        <div className="h-64">
          <VitalChart 
            title="Diastolic BP" 
            data={liveVitals.diastolic_bp} 
            dataKey="value" 
            color={getVitalColor('diastolic_bp')} 
            unit="mmHg"
            minValue={40} maxValue={120}
          />
        </div>
        <div className="h-64">
          <VitalChart 
            title="Temperature" 
            data={liveVitals.temperature} 
            dataKey="value" 
            color={getVitalColor('temperature')} 
            unit="°C"
            minValue={35} maxValue={41}
          />
        </div>
        <div className="h-64">
          <VitalChart 
            title="Respiration Rate" 
            data={liveVitals.respiration_rate} 
            dataKey="value" 
            color={getVitalColor('respiration_rate')} 
            unit="rpm"
            minValue={10} maxValue={40}
          />
        </div>
      </div>
    </div>
  );
}
