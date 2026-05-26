import { Link, useLocation } from "wouter";
import { Activity, Users, AlertCircle, Radio, HeartPulse, Bell, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: 'Dashboard', href: '/', icon: Activity },
  { name: 'Patients', href: '/patients', icon: Users },
  { name: 'Alerts', href: '/alerts', icon: AlertCircle },
  { name: 'Sensors', href: '/sensors', icon: Radio },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border shrink-0">
          <HeartPulse className="h-6 w-6 text-primary mr-3" />
          <span className="font-bold text-lg text-sidebar-foreground tracking-tight">IPMAS</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href}>
                <div 
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                  data-testid={`nav-${item.name.toLowerCase()}`}
                >
                  <item.icon className={cn("mr-3 h-5 w-5 flex-shrink-0", isActive ? "text-primary" : "text-sidebar-foreground/50")} />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-sidebar-border space-y-2">
          <div className="flex items-center px-3 py-2 text-sm font-medium text-sidebar-foreground/70 rounded-md hover:bg-sidebar-accent/50 hover:text-sidebar-foreground cursor-pointer transition-colors">
            <Settings className="mr-3 h-5 w-5 text-sidebar-foreground/50" />
            Settings
          </div>
          <div className="flex items-center px-3 py-2 text-sm font-medium text-sidebar-foreground/70 rounded-md hover:bg-sidebar-accent/50 hover:text-sidebar-foreground cursor-pointer transition-colors">
            <LogOut className="mr-3 h-5 w-5 text-sidebar-foreground/50" />
            Sign Out
          </div>
          
          <div className="pt-4 mt-2 border-t border-sidebar-border flex items-center">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              SK
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-sidebar-foreground">Suneel Kumar</p>
              <p className="text-[10px] text-sidebar-foreground/50">Lead Engineer</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-background border-b border-border flex items-center justify-between px-6 shrink-0">
          <h1 className="text-lg font-semibold capitalize">
            {location === '/' ? 'System Dashboard' : location.split('/')[1].replace('-', ' ')}
          </h1>
          
          <div className="flex items-center space-x-4">
            <div className="relative cursor-pointer">
              <Bell className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
              <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-destructive ring-2 ring-background animate-pulse-fast" />
            </div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span>System Online</span>
            </div>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
