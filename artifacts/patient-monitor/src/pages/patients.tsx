import { useListPatients, useDeletePatient, getListPatientsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Plus, UserX, Activity } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PatientForm } from "@/components/patient-form";

export default function Patients() {
  const { data: patients, isLoading } = useListPatients();
  const deletePatient = useDeletePatient();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const filteredPatients = patients?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.ward.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to discharge this patient?")) {
      await deletePatient.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'stable': return 'bg-green-500 text-white';
      case 'observation': return 'bg-yellow-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search patients..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-patients"
          />
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="btn-add-patient">
              <Plus className="h-4 w-4 mr-2" />
              Admit Patient
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Admit New Patient</DialogTitle>
            </DialogHeader>
            <PatientForm onSuccess={() => setIsAddOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-lg">Admitted Patients</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name & ID</TableHead>
                <TableHead>Ward / Bed</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Diagnosis</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading patients...</TableCell>
                </TableRow>
              ) : filteredPatients?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No patients found.</TableCell>
                </TableRow>
              ) : (
                filteredPatients?.map(patient => (
                  <TableRow key={patient.id}>
                    <TableCell>
                      <div className="font-medium">{patient.name}</div>
                      <div className="text-xs text-muted-foreground">ID: {patient.id} • {patient.age}y • {patient.gender}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{patient.ward}</div>
                      <div className="text-xs text-muted-foreground">Bed {patient.bed}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getConditionColor(patient.condition)} variant="outline">
                        {patient.condition.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {patient.diagnosis || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/patients/${patient.id}`}>
                          <Button variant="outline" size="sm" data-testid={`btn-view-${patient.id}`}>
                            <Activity className="h-4 w-4 mr-2" />
                            Monitor
                          </Button>
                        </Link>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDelete(patient.id)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          data-testid={`btn-discharge-${patient.id}`}
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
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
