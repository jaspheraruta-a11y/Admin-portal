import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import type { Device, MaintenanceTicket, TelemetryLog, ActivityLog } from './types/database';
import { 
  Server, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Cpu, 
  HardDrive, 
  Clock, 
  Check, 
  Monitor,
  X,
  Usb,
  PowerOff,
  Activity,
  Layers,
  Thermometer,
  Package,
  Zap,
  Wifi,
  Bell,
  Lock,
  RotateCcw,
  Skull,
  Search,
  Building2
} from 'lucide-react';

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [activeTab, setActiveTab] = useState<'fleet' | 'tickets'>('fleet');
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Search & Classification Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLab, setSelectedLab] = useState<string>('ALL');

  // Modal State
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [modalTelemetry, setModalTelemetry] = useState<TelemetryLog | null>(null);
  const [modalActivities, setModalActivities] = useState<ActivityLog[]>([]);
  const [editingLab, setEditingLab] = useState<string>('');

  // Task Manager Modal State
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [selectedProcessToKill, setSelectedProcessToKill] = useState<string>('');
  const [processSearch, setProcessSearch] = useState('');

  const selectedDeviceRef = useRef<Device | null>(null);
  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  // Dispatch remote action to target PC
  const dispatchCommand = async (command: 'LOCK' | 'RESTART' | 'KILL_PROCESS', payload?: string) => {
    if (!selectedDevice) return;

    if (command === 'RESTART' && !confirm(`Are you sure you want to remotely RESTART ${selectedDevice.hostname}?`)) {
      return;
    }

    const { error } = await supabase
      .from('device_commands')
      .insert({
        device_id: selectedDevice.id,
        command,
        payload: payload || null,
        status: 'PENDING'
      });

    if (error) {
      alert(`Failed to send command: ${error.message}`);
    } else {
      alert(`Command '${command}' queued for ${selectedDevice.hostname}!`);
    }
  };

  // Manually update Lab classification for a device
  const updateDeviceLab = async (deviceId: string, newLab: string) => {
    if (!newLab.trim()) return;
    
    const { error } = await supabase
      .from('devices')
      .update({ lab_classification: newLab.trim() })
      .eq('id', deviceId);

    if (error) {
      alert(`Error updating lab: ${error.message}`);
    } else {
      setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, lab_classification: newLab.trim() } : d));
      if (selectedDevice) {
        setSelectedDevice({ ...selectedDevice, lab_classification: newLab.trim() });
      }
      alert(`Workstation reassigned to: ${newLab.trim()}`);
    }
  };

  const isOnline = (lastSeen: string) => {
    const diffInSeconds = (currentTime - new Date(lastSeen).getTime()) / 1000;
    return diffInSeconds < 25;
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 3000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: devicesData } = await supabase
        .from('devices')
        .select('*')
        .order('hostname', { ascending: true });

      const { data: ticketsData } = await supabase
        .from('maintenance_tickets')
        .select('*, devices(*)')
        .order('created_at', { ascending: false });

      if (devicesData) {
        const sortedDevices = [...devicesData].sort((a, b) => 
          a.hostname.localeCompare(b.hostname, undefined, { numeric: true, sensitivity: 'base' })
        );
        setDevices(sortedDevices);
      }

      if (ticketsData) setTickets(ticketsData);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('fleet-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_tickets' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'telemetry_logs' }, (payload) => {
        const currentSelected = selectedDeviceRef.current;
        if (
          currentSelected && 
          payload.new && 
          typeof payload.new === 'object' && 
          'device_id' in payload.new && 
          (payload.new as TelemetryLog).device_id === currentSelected.id
        ) {
          setModalTelemetry(payload.new as TelemetryLog);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, (payload) => {
        const currentSelected = selectedDeviceRef.current;
        if (
          currentSelected && 
          payload.new && 
          typeof payload.new === 'object' && 
          'device_id' in payload.new && 
          (payload.new as ActivityLog).device_id === currentSelected.id
        ) {
          setModalActivities((prev) => [payload.new as ActivityLog, ...prev]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const openDeviceModal = async (device: Device) => {
    setSelectedDevice(device);
    setEditingLab(device.lab_classification || 'Computer Laboratory 1');
    setIsProcessModalOpen(false);
    setSelectedProcessToKill('');
    setProcessSearch('');

    try {
      const { data: telemetryData } = await supabase
        .from('telemetry_logs')
        .select('*')
        .eq('device_id', device.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();

      const { data: activityData } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('device_id', device.id)
        .order('recorded_at', { ascending: false })
        .limit(15);

      if (telemetryData) setModalTelemetry(telemetryData);
      if (activityData) setModalActivities(activityData);
    } catch (err) {
      console.error('Error fetching device details:', err);
    }
  };

  const resolveTicket = async (ticketId: string) => {
    await supabase
      .from('maintenance_tickets')
      .update({ status: 'Resolved' })
      .eq('id', ticketId);
    fetchData();
  };

  const renderActivityIcon = (type: string) => {
    switch (type) {
      case 'REMOTE_ACTION':
        return <Lock className="w-4 h-4 text-cyan-400" />;
      case 'STOLEN_DRIVE_ALERT':
        return <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" />;
      case 'HARDWARE_TAMPER':
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case 'APP_INSTALL':
        return <Package className="w-4 h-4 text-emerald-400" />;
      case 'PROCESS_SPIKE':
        return <Zap className="w-4 h-4 text-orange-400" />;
      case 'DISK_WARNING':
        return <HardDrive className="w-4 h-4 text-purple-400" />;
      case 'USB_INSERT':
        return <Usb className="w-4 h-4 text-amber-400" />;
      case 'BSOD':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'SYSTEM_SHUTDOWN':
        return <PowerOff className="w-4 h-4 text-slate-400" />;
      default:
        return <Activity className="w-4 h-4 text-indigo-400" />;
    }
  };

  // Extract distinct list of all laboratories
  const availableLabs = Array.from(
    new Set(devices.map(d => d.lab_classification || 'Computer Laboratory 1'))
  );

  // Filtered devices based on search and lab tab
  const filteredDevices = devices.filter((device) => {
    const matchesSearch = 
      device.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.mac_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.os_name && device.os_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const currentDeviceLab = device.lab_classification || 'Computer Laboratory 1';
    const matchesLab = selectedLab === 'ALL' || currentDeviceLab === selectedLab;

    return matchesSearch && matchesLab;
  });

  // KPI Calculations
  const totalDevices = devices.length;
  const openTickets = tickets.filter(t => t.status === 'Open');
  const onlineDevicesCount = devices.filter(d => isOnline(d.last_seen)).length;
  const criticalCount = openTickets.filter(t => t.severity === 'Critical').length;
  const warningCount = openTickets.filter(t => t.severity === 'Warning').length;

  const healthyCount = Math.max(0, totalDevices - openTickets.length);
  const healthyPercent = totalDevices > 0 ? ((healthyCount / totalDevices) * 100).toFixed(1) : '100.0';
  const activePercent = totalDevices > 0 ? Math.round((onlineDevicesCount / totalDevices) * 100) : 0;

  const runningProcessesList = modalTelemetry?.running_processes || [];
  const filteredProcesses = runningProcessesList.filter(p => 
    p.toLowerCase().includes(processSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight text-white">SmartBench IT Fleet Admin</h1>
            <p className="text-xs text-slate-400">Endpoint Telemetry & Diagnostic Hub</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Supabase Live Realtime
          </div>
          <button 
            onClick={fetchData} 
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition border border-slate-700/50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* KPI METRIC SUMMARY CARDS */}
        <section aria-label="Fleet Performance KPIs" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* CARD 1: MONITORED FLEET */}
          <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 p-4 rounded-xl shadow-md shadow-black/20 transition-all duration-200 ease-out flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  MONITORED FLEET
                </span>
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Monitor className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span id="kpi-total-workstations" className="text-3xl font-bold font-mono tabular-nums text-white">
                  {totalDevices}
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  {activePercent}% Active
                </span>
              </div>
            </div>
            <div className="border-t border-slate-800/80 pt-2 mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>Hardware Health</span>
              <span className="text-slate-300 font-medium">Continuous Auditing</span>
            </div>
          </div>

          {/* CARD 2: HEALTHY SYSTEMS */}
          <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 p-4 rounded-xl shadow-md shadow-black/20 transition-all duration-200 ease-out flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                  HEALTHY SYSTEMS
                </span>
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span id="kpi-healthy-count" className="text-3xl font-bold font-mono tabular-nums text-emerald-400">
                  {healthyCount}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {healthyPercent}% Nominal
                </span>
              </div>
            </div>
            <div className="border-t border-slate-800/80 pt-2 mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>Threshold Status</span>
              <span className="text-emerald-300/90 font-medium">All Metrics Green</span>
            </div>
          </div>

          {/* CARD 3: SYSTEM WARNINGS */}
          <div className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/30 p-4 rounded-xl shadow-md shadow-black/20 transition-all duration-200 ease-out flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                  SYSTEM WARNINGS
                </span>
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span id="kpi-warning-count" className="text-3xl font-bold font-mono tabular-nums text-amber-400">
                  {warningCount}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-mono">
                  RAM &gt; 85% / CPU &gt; 75°C
                </span>
              </div>
            </div>
            <div className="border-t border-slate-800/80 pt-2 mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>Attention Needed</span>
              <span className="text-amber-300 font-medium">Elevated Thermal/Load</span>
            </div>
          </div>

          {/* CARD 4: CRITICAL INCIDENTS */}
          <div className="bg-slate-900/90 border border-slate-800 hover:border-rose-500/40 p-4 rounded-xl shadow-md shadow-black/20 transition-all duration-200 ease-out flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
                  CRITICAL INCIDENTS
                </span>
                <div className="relative">
                  <div className="h-8 w-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  {criticalCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-400" />
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span id="kpi-critical-count" className="text-3xl font-bold font-mono tabular-nums text-rose-400">
                  {criticalCount}
                </span>
                <span className="px-2.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/40 text-xs font-semibold flex items-center gap-1.5">
                  <Bell className={`w-3 h-3 text-rose-400 ${criticalCount > 0 ? 'animate-bounce' : ''}`} />
                  {criticalCount} Open {criticalCount === 1 ? 'Ticket' : 'Tickets'}
                </span>
              </div>
            </div>
            <div className="border-t border-slate-800/80 pt-2 mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>SMART / Hardware Fail</span>
              <span className="text-rose-400 font-semibold tracking-wide">Immediate Action</span>
            </div>
          </div>

        </section>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 gap-6">
          <button 
            onClick={() => setActiveTab('fleet')}
            className={`pb-3 text-sm font-medium transition relative ${activeTab === 'fleet' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Workstation Fleet ({devices.length})
            {activeTab === 'fleet' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
          </button>
          <button 
            onClick={() => setActiveTab('tickets')}
            className={`pb-3 text-sm font-medium transition relative flex items-center gap-2 ${activeTab === 'tickets' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Maintenance Tickets
            {openTickets.length > 0 && (
              <span className="px-2 py-0.5 text-xs bg-rose-500/20 text-rose-400 rounded-full border border-rose-500/30">
                {openTickets.length}
              </span>
            )}
            {activeTab === 'tickets' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
          </button>
        </div>

        {/* Tab View: Fleet Grid */}
        {activeTab === 'fleet' && (
          <div className="space-y-4">
            
            {/* Search & Lab Filter Toolbar */}
            <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl flex flex-col md:flex-row gap-3 items-center justify-between">
              
              {/* Search Box */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search PC by name, MAC, or OS..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-indigo-500/50 transition"
                />
              </div>

              {/* Lab Classification Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                <button
                  onClick={() => setSelectedLab('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
                    selectedLab === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  All ({devices.length})
                </button>
                {availableLabs.map((lab) => {
                  const labCount = devices.filter(d => (d.lab_classification || 'Computer Laboratory 1') === lab).length;
                  return (
                    <button
                      key={lab}
                      onClick={() => setSelectedLab(lab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 shrink-0 ${
                        selectedLab === lab
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      {lab} ({labCount})
                    </button>
                  );
                })}
              </div>

            </div>

            {/* Grid Cards */}
            {filteredDevices.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-2xl">
                <Monitor className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                <h3 className="text-lg font-medium text-slate-300">No Matching Workstations</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
                  Try adjusting your search query or switching lab filter tabs.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDevices.map((device) => {
                  const online = isOnline(device.last_seen);
                  return (
                    <div 
                      key={device.id} 
                      onClick={() => openDeviceModal(device)}
                      className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-5 cursor-pointer transition transform hover:-translate-y-1 shadow-lg group"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-base text-slate-200 group-hover:text-indigo-400 transition">
                            {device.hostname}
                          </h3>
                          <p className="text-xs text-slate-400">{device.os_name}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${
                          online 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                          {online ? 'ONLINE (ON)' : 'OFFLINE (OFF)'}
                        </span>
                      </div>

                      {/* Lab Location Badge */}
                      <div className="mb-4">
                        <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
                          <Building2 className="w-3 h-3 text-indigo-400" />
                          {device.lab_classification || 'Computer Laboratory 1'}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-slate-500" />
                          <span className="truncate">{device.cpu_model || 'Unknown CPU'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-slate-500" />
                          <span>Total RAM: {device.total_ram_gb || '--'} GB</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-500" />
                          <span>Last Heartbeat: {new Date(device.last_seen).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-indigo-400 font-medium">
                        <span>Click to view diagnostics</span>
                        <span>→</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab View: Tickets Table */}
        {activeTab === 'tickets' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {tickets.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500/40 mb-3" />
                <h3 className="text-lg font-medium text-slate-300">All Systems Clear</h3>
                <p className="text-sm text-slate-500">No active maintenance tickets found.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-medium">Issue</th>
                    <th className="px-4 py-3 font-medium">Device</th>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-medium text-slate-200">{t.issue_title}</td>
                      <td className="px-4 py-3 text-slate-400">{t.devices?.hostname || 'Unknown'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${t.severity === 'Critical' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                          {t.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${t.status === 'Open' ? 'bg-slate-800 text-slate-300' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        {t.status !== 'Resolved' && (
                          <button 
                            onClick={() => resolveTicket(t.id)} 
                            className="inline-flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1.5 rounded transition"
                          >
                            <Check className="w-3.5 h-3.5" /> Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {/* PC DETAILS & DIAGNOSTICS MODAL */}
      {selectedDevice && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                  <Monitor className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    {selectedDevice.hostname}
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      isOnline(selectedDevice.last_seen)
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {isOnline(selectedDevice.last_seen) ? '● ONLINE' : '○ OFFLINE'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">{selectedDevice.os_name} • MAC: {selectedDevice.mac_address}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedDevice(null)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto">

              {/* Lab Location Assignment Bar */}
              <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <div>
                    <p className="text-xs font-semibold text-slate-300">Assigned Laboratory / Location</p>
                    <p className="text-[11px] text-slate-500">Group this PC into a room classification</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="e.g. Computer Laboratory 1"
                    value={editingLab}
                    onChange={(e) => setEditingLab(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500 w-full sm:w-56"
                  />
                  <button
                    onClick={() => updateDeviceLab(selectedDevice.id, editingLab)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shrink-0"
                  >
                    Save Lab
                  </button>
                </div>
              </div>

              {/* Remote Actions Control Panel */}
              <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-400" /> Remote Administrative Actions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Action 1: Remote Lock */}
                  <button
                    onClick={() => dispatchCommand('LOCK')}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition"
                  >
                    <Lock className="w-4 h-4 text-amber-400" />
                    Lock Workstation
                  </button>

                  {/* Action 2: Remote Reboot */}
                  <button
                    onClick={() => dispatchCommand('RESTART')}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition"
                  >
                    <RotateCcw className="w-4 h-4 text-rose-400" />
                    Reboot System
                  </button>

                  {/* Action 3: Terminate Application */}
                  <button
                    onClick={() => {
                      setSelectedProcessToKill('');
                      setProcessSearch('');
                      setIsProcessModalOpen(true);
                    }}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-rose-500/40 text-xs font-semibold transition"
                  >
                    <Skull className="w-4 h-4 text-rose-400" />
                    Terminate Application
                  </button>

                </div>
              </div>
              
              {/* Section 1: Live Hardware Health Gauges */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" /> Live Hardware Telemetry
                </h3>
                {modalTelemetry ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                      <p className="text-xs text-slate-500">CPU Usage</p>
                      <p className="text-xl font-bold font-mono text-slate-200 mt-1">{modalTelemetry.cpu_usage_pct}%</p>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                      <p className="text-xs text-slate-500">Memory (RAM)</p>
                      <p className="text-xl font-bold font-mono text-slate-200 mt-1">{modalTelemetry.ram_usage_pct}%</p>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                      <p className="text-xs text-slate-500">Primary Disk</p>
                      <p className="text-xl font-bold font-mono text-slate-200 mt-1">{modalTelemetry.disk_usage_pct}%</p>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                      <p className="text-xs text-slate-500">CPU Temp</p>
                      <p className={`text-xl font-bold font-mono mt-1 ${modalTelemetry.cpu_temp_c >= 80 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {modalTelemetry.cpu_temp_c}°C
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No telemetry snapshots recorded yet.</p>
                )}
              </div>

              {/* Section 2: Hardware Components Inventory */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" /> Detected Hardware Components
                </h3>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl divide-y divide-slate-800/80 text-xs">
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-slate-400 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-400" /> Processor (CPU)
                    </span>
                    <span className="font-medium text-slate-200 text-right">{selectedDevice.cpu_model || 'Standard Multi-Core CPU'}</span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-slate-400 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" /> Installed System Memory
                    </span>
                    <span className="font-medium text-slate-200">{selectedDevice.total_ram_gb} GB RAM</span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-slate-400 flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-indigo-400" /> Storage Health (S.M.A.R.T.)
                    </span>
                    <span className={`font-medium ${modalTelemetry?.smart_failure_predicted ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {modalTelemetry?.smart_failure_predicted ? '❌ FAILING (Bad Sectors)' : '✓ HEALTHY (OK)'}
                    </span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-slate-400 flex items-center gap-2">
                      <Thermometer className="w-4 h-4 text-indigo-400" /> Network Interface Card
                    </span>
                    <span className="font-mono text-slate-300">{selectedDevice.mac_address}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Major Recent Activities Timeline */}
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" /> Major Recent Activities & Security Audits
                </h3>
                
                {modalActivities.length === 0 ? (
                  <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                    No critical events or incident logs detected for this device.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {modalActivities.map((act) => (
                      <div key={act.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-start gap-3">
                        <div className="p-1.5 rounded-lg bg-slate-800 shrink-0 mt-0.5">
                          {renderActivityIcon(act.event_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-200">{act.event_type}</span>
                          </div>
                          <p className="text-xs text-slate-400 break-words mt-0.5">{act.details}</p>
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {new Date(act.recorded_at).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-800/30 flex justify-end">
              <button 
                onClick={() => setSelectedDevice(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition"
              >
                Close Window
              </button>
            </div>

          </div>
        </div>
      )}

      {/* TASK MANAGER / TERMINATE APPLICATION MODAL */}
      {isProcessModalOpen && selectedDevice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20">
                  <Skull className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-100">Task Manager & Process Killer</h3>
                  <p className="text-xs text-slate-400">Target PC: {selectedDevice.hostname}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsProcessModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Filter Bar */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/40">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter running apps (e.g. chrome, notepad, discord)..."
                  value={processSearch}
                  onChange={(e) => setProcessSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 outline-none focus:border-rose-500/50 transition placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* Process List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-1.5 max-h-[350px]">
              {filteredProcesses.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  {runningProcessesList.length === 0 
                    ? "No active user processes reported yet. Ensure agent.py is running."
                    : "No matching running applications found."}
                </div>
              ) : (
                filteredProcesses.map((procName) => {
                  const isSelected = selectedProcessToKill === procName;
                  return (
                    <div
                      key={procName}
                      onClick={() => setSelectedProcessToKill(procName)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-mono cursor-pointer flex items-center justify-between transition ${
                        isSelected 
                          ? 'bg-rose-500/15 border-rose-500/50 text-rose-300 font-semibold shadow-sm' 
                          : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:bg-slate-800/50 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-rose-400 animate-pulse' : 'bg-slate-600'}`} />
                        <span className="truncate">{procName}</span>
                      </div>
                      {isSelected && (
                        <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded-full">
                          Selected
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer with Actions */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-800/40 flex items-center justify-between">
              <div className="text-xs text-slate-400 truncate max-w-[240px]">
                {selectedProcessToKill ? (
                  <span>Ready to kill: <span className="font-mono text-rose-400 font-bold">{selectedProcessToKill}</span></span>
                ) : (
                  <span>Click an application to select</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsProcessModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!selectedProcessToKill) return;
                    if (confirm(`Are you sure you want to terminate '${selectedProcessToKill}' on ${selectedDevice.hostname}?`)) {
                      dispatchCommand('KILL_PROCESS', selectedProcessToKill);
                      setIsProcessModalOpen(false);
                      setSelectedProcessToKill('');
                    }
                  }}
                  disabled={!selectedProcessToKill}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-xs font-semibold rounded-lg transition shadow-lg shadow-rose-900/20"
                >
                  <Skull className="w-3.5 h-3.5" />
                  Kill Application
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}