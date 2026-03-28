import {
  Server, Database, Globe, Network, HardDrive, Film, Tv2,
  Shield, Cpu, Container, Activity, Puzzle, Search, Download,
  Wifi, Lock, Eye, Radio, Gauge,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  server: Server,
  database: Database,
  globe: Globe,
  network: Network,
  'hard-drive': HardDrive,
  film: Film,
  tv2: Tv2,
  shield: Shield,
  cpu: Cpu,
  container: Container,
  activity: Activity,
  puzzle: Puzzle,
  search: Search,
  download: Download,
  wifi: Wifi,
  lock: Lock,
  eye: Eye,
  radio: Radio,
  gauge: Gauge,
}

export function PluginIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Puzzle
  return <Icon className={className} />
}
