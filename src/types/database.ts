export interface Device {
  id: string;
  mac_address: string;
  hostname: string;
  os_name: string;
  cpu_model: string;
  total_ram_gb: number;
  last_seen: string;
}

export interface TelemetryLog {
  id: string;
  device_id: string;
  cpu_usage_pct: number;
  ram_usage_pct: number;
  disk_usage_pct: number;
  cpu_temp_c: number;
  smart_failure_predicted: boolean;
  running_processes?: string[]; // <-- ADD THIS LINE
  recorded_at: string;
}

export interface ActivityLog {
  id: string;
  device_id: string;
  event_type: 'BSOD' | 'USB_INSERT' | 'SYSTEM_SHUTDOWN' | 'APP_INSTALL' | 'PROCESS_SPIKE' | 'DISK_WARNING' | string;
  details: string;
  recorded_at: string;
}

export interface MaintenanceTicket {
  id: string;
  device_id: string;
  issue_title: string;
  severity: 'Warning' | 'Critical';
  status: 'Open' | 'In Progress' | 'Resolved';
  created_at: string;
  devices?: Device;
}