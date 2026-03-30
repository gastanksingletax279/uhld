import { useEffect, useState, useCallback } from 'react'
import {
  api,
  K8sNode, K8sPod, K8sNamespace,
  K8sDeployment, K8sStatefulSet, K8sDaemonSet, K8sJob, K8sCronJob,
  K8sService, K8sIngress,
  K8sPV, K8sPVC, K8sConfigMap, K8sSecret,
} from '../../api/client'
import { RefreshCw, Loader2, AlertCircle, Server, Filter } from 'lucide-react'

// ── Tab/Group types ────────────────────────────────────────────────────────

type Group = 'cluster' | 'workloads' | 'networking' | 'storage'
type ClusterTab = 'nodes' | 'namespaces'
type WorkloadsTab = 'pods' | 'deployments' | 'statefulsets' | 'daemonsets' | 'jobs' | 'cronjobs'
type NetworkingTab = 'services' | 'ingresses'
type StorageTab = 'pvs' | 'pvcs' | 'configmaps' | 'secrets'
type Tab = ClusterTab | WorkloadsTab | NetworkingTab | StorageTab

const GROUP_TABS: Record<Group, { id: Tab; label: string }[]> = {
  cluster:    [{ id: 'nodes', label: 'Nodes' }, { id: 'namespaces', label: 'Namespaces' }],
  workloads:  [
    { id: 'pods',         label: 'Pods' },
    { id: 'deployments',  label: 'Deployments' },
    { id: 'statefulsets', label: 'StatefulSets' },
    { id: 'daemonsets',   label: 'DaemonSets' },
    { id: 'jobs',         label: 'Jobs' },
    { id: 'cronjobs',     label: 'CronJobs' },
  ],
  networking: [{ id: 'services', label: 'Services' }, { id: 'ingresses', label: 'Ingresses' }],
  storage:    [
    { id: 'pvs',        label: 'PersistentVolumes' },
    { id: 'pvcs',       label: 'PVCs' },
    { id: 'configmaps', label: 'ConfigMaps' },
    { id: 'secrets',    label: 'Secrets' },
  ],
}

const TAB_GROUP: Record<Tab, Group> = Object.entries(GROUP_TABS).flatMap(
  ([g, tabs]) => tabs.map((t) => [t.id, g as Group])
).reduce((acc, [tab, group]) => ({ ...acc, [tab as Tab]: group }), {} as Record<Tab, Group>)

// ── Namespace-scoped tabs (all except nodes, namespaces, pvs) ──────────────
const NS_TABS = new Set<Tab>(['pods','deployments','statefulsets','daemonsets','jobs','cronjobs','services','ingresses','pvcs','configmaps','secrets'])

// ── Generic lazy tab data store ────────────────────────────────────────────
type TabState<T> = { data: T[]; loading: boolean; loaded: boolean; error: string | null }
function emptyTab<T>(): TabState<T> { return { data: [], loading: false, loaded: false, error: null } }

// ── Component ──────────────────────────────────────────────────────────────

export function KubernetesView({ instanceId = 'default' }: { instanceId?: string }) {
  const k8s = api.kubernetes(instanceId)

  const [group, setGroup]   = useState<Group>('cluster')
  const [tab, setTab]       = useState<Tab>('nodes')
  const [nsFilter, setNsFilter] = useState('')

  // Per-tab data
  const [nodes,       setNodes]       = useState<TabState<K8sNode>>(emptyTab())
  const [namespaces,  setNamespaces]  = useState<TabState<K8sNamespace>>(emptyTab())
  const [pods,        setPods]        = useState<TabState<K8sPod>>(emptyTab())
  const [deployments, setDeployments] = useState<TabState<K8sDeployment>>(emptyTab())
  const [statefulsets,setStatefulsets]= useState<TabState<K8sStatefulSet>>(emptyTab())
  const [daemonsets,  setDaemonsets]  = useState<TabState<K8sDaemonSet>>(emptyTab())
  const [jobs,        setJobs]        = useState<TabState<K8sJob>>(emptyTab())
  const [cronjobs,    setCronjobs]    = useState<TabState<K8sCronJob>>(emptyTab())
  const [services,    setServices]    = useState<TabState<K8sService>>(emptyTab())
  const [ingresses,   setIngresses]   = useState<TabState<K8sIngress>>(emptyTab())
  const [pvs,         setPvs]         = useState<TabState<K8sPV>>(emptyTab())
  const [pvcs,        setPvcs]        = useState<TabState<K8sPVC>>(emptyTab())
  const [configmaps,  setConfigmaps]  = useState<TabState<K8sConfigMap>>(emptyTab())
  const [secrets,     setSecrets]     = useState<TabState<K8sSecret>>(emptyTab())

  // ── Loaders ──────────────────────────────────────────────────────────────

  async function load<T>(
    setter: React.Dispatch<React.SetStateAction<TabState<T>>>,
    fetcher: () => Promise<unknown>,
    key: string,
    ns?: string,
  ) {
    setter((s) => ({ ...s, loading: true, error: null }))
    try {
      const resp = await fetcher() as Record<string, T[]>
      setter({ data: resp[key] ?? [], loading: false, loaded: true, error: null })
    } catch (e: unknown) {
      setter((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : `Failed to load ${key}` }))
    }
  }

  const loadTab = useCallback((t: Tab, ns = nsFilter, force = false) => {
    switch (t) {
      case 'nodes':        if (force || !nodes.loaded)        load(setNodes,       () => k8s.nodes(), 'nodes'); break
      case 'namespaces':   if (force || !namespaces.loaded)   load(setNamespaces,  () => k8s.namespaces(), 'namespaces'); break
      case 'pods':         load(setPods,        () => k8s.pods(ns), 'pods'); break
      case 'deployments':  load(setDeployments, () => k8s.deployments(ns), 'deployments'); break
      case 'statefulsets': load(setStatefulsets,() => k8s.statefulsets(ns), 'statefulsets'); break
      case 'daemonsets':   load(setDaemonsets,  () => k8s.daemonsets(ns), 'daemonsets'); break
      case 'jobs':         load(setJobs,        () => k8s.jobs(ns), 'jobs'); break
      case 'cronjobs':     load(setCronjobs,    () => k8s.cronjobs(ns), 'cronjobs'); break
      case 'services':     load(setServices,    () => k8s.services(ns), 'services'); break
      case 'ingresses':    load(setIngresses,   () => k8s.ingresses(ns), 'ingresses'); break
      case 'pvs':          if (force || !pvs.loaded)          load(setPvs, () => k8s.persistentvolumes(), 'pvs'); break
      case 'pvcs':         load(setPvcs,        () => k8s.pvcs(ns), 'pvcs'); break
      case 'configmaps':   load(setConfigmaps,  () => k8s.configmaps(ns), 'configmaps'); break
      case 'secrets':      load(setSecrets,     () => k8s.secrets(ns), 'secrets'); break
    }
  }, [nsFilter])  // eslint-disable-line react-hooks/exhaustive-deps

  // Load initial tab on mount
  useEffect(() => { loadTab('nodes') }, [])

  // Load when tab changes (if not yet loaded / namespace-scoped always reloads with filter)
  useEffect(() => {
    const s = getTabState(tab)
    if (!s.loaded && !s.loading) loadTab(tab)
  }, [tab])

  // Reload namespace-scoped tabs when nsFilter changes
  function applyNsFilter(ns: string) {
    setNsFilter(ns)
    if (NS_TABS.has(tab)) loadTab(tab, ns)
  }

  function refresh() {
    loadTab(tab, nsFilter, true)
  }

  // Helper to get current tab state for loading indicator
  function getTabState(t: Tab): TabState<unknown> {
    switch (t) {
      case 'nodes':        return nodes as TabState<unknown>
      case 'namespaces':   return namespaces as TabState<unknown>
      case 'pods':         return pods as TabState<unknown>
      case 'deployments':  return deployments as TabState<unknown>
      case 'statefulsets': return statefulsets as TabState<unknown>
      case 'daemonsets':   return daemonsets as TabState<unknown>
      case 'jobs':         return jobs as TabState<unknown>
      case 'cronjobs':     return cronjobs as TabState<unknown>
      case 'services':     return services as TabState<unknown>
      case 'ingresses':    return ingresses as TabState<unknown>
      case 'pvs':          return pvs as TabState<unknown>
      case 'pvcs':         return pvcs as TabState<unknown>
      case 'configmaps':   return configmaps as TabState<unknown>
      case 'secrets':      return secrets as TabState<unknown>
    }
  }

  const current = getTabState(tab)
  const isLoading = current.loading

  const nodesReady = nodes.data.filter((n) => n.status === 'Ready').length

  // Build namespace list from pods (loaded lazily as first namespace-scoped resource)
  const allNs = [...new Set([
    ...pods.data.map((p) => p.namespace),
    ...deployments.data.map((d) => d.namespace),
    ...services.data.map((s) => s.namespace),
  ])].sort()

  function switchGroup(g: Group) {
    setGroup(g)
    const firstTab = GROUP_TABS[g][0].id
    setTab(firstTab)
    const s = getTabState(firstTab)
    if (!s.loaded && !s.loading) loadTab(firstTab)
  }

  function switchTab(t: Tab) {
    setTab(t)
    const s = getTabState(t)
    // NS-scoped tabs always reload on switch to respect current filter
    if (NS_TABS.has(t)) loadTab(t, nsFilter)
    else if (!s.loaded && !s.loading) loadTab(t)
  }

  const GROUPS: { id: Group; label: string }[] = [
    { id: 'cluster',    label: 'Cluster' },
    { id: 'workloads',  label: 'Workloads' },
    { id: 'networking', label: 'Networking' },
    { id: 'storage',    label: 'Storage' },
  ]

  return (
    <div className="space-y-3 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">Kubernetes</h2>
          {!nodes.loading && tab === 'nodes' && nodes.loaded && (
            <span className="text-xs text-muted">
              <span className={`font-semibold ${nodesReady === nodes.data.length ? 'text-green-400' : 'text-warning'}`}>{nodesReady}</span>
              <span className="mx-1">/</span>
              <span>{nodes.data.length}</span>
              <span className="ml-1">ready</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {NS_TABS.has(tab) && (
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-muted" />
              <select
                className="input text-xs py-1 px-2 h-auto"
                value={nsFilter}
                onChange={(e) => applyNsFilter(e.target.value)}
              >
                <option value="">All namespaces</option>
                {allNs.map((ns) => <option key={ns} value={ns}>{ns}</option>)}
              </select>
            </div>
          )}
          <button onClick={refresh} disabled={isLoading} className="btn-ghost text-xs gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Group selector */}
      <div className="flex gap-1.5">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            onClick={() => switchGroup(g.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              group === g.id
                ? 'bg-accent text-white'
                : 'bg-surface-3 text-muted hover:text-gray-300 hover:bg-surface-4'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-surface-4 overflow-x-auto">
        {GROUP_TABS[group].map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`flex-shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <TabContent
        tab={tab}
        nodes={nodes} namespaces={namespaces}
        pods={pods} deployments={deployments} statefulsets={statefulsets}
        daemonsets={daemonsets} jobs={jobs} cronjobs={cronjobs}
        services={services} ingresses={ingresses}
        pvs={pvs} pvcs={pvcs} configmaps={configmaps} secrets={secrets}
        nsFilter={nsFilter}
      />
    </div>
  )
}

// ── Tab content dispatcher ─────────────────────────────────────────────────

function TabContent(props: {
  tab: Tab
  nodes: TabState<K8sNode>; namespaces: TabState<K8sNamespace>
  pods: TabState<K8sPod>; deployments: TabState<K8sDeployment>
  statefulsets: TabState<K8sStatefulSet>; daemonsets: TabState<K8sDaemonSet>
  jobs: TabState<K8sJob>; cronjobs: TabState<K8sCronJob>
  services: TabState<K8sService>; ingresses: TabState<K8sIngress>
  pvs: TabState<K8sPV>; pvcs: TabState<K8sPVC>
  configmaps: TabState<K8sConfigMap>; secrets: TabState<K8sSecret>
  nsFilter: string
}) {
  const { tab } = props

  if (tab === 'nodes') return <NodesTable state={props.nodes} />
  if (tab === 'namespaces') return <NamespacesTable state={props.namespaces} />
  if (tab === 'pods') return <PodsTable state={props.pods} />
  if (tab === 'deployments') return <DeploymentsTable state={props.deployments} />
  if (tab === 'statefulsets') return <StatefulSetsTable state={props.statefulsets} />
  if (tab === 'daemonsets') return <DaemonSetsTable state={props.daemonsets} />
  if (tab === 'jobs') return <JobsTable state={props.jobs} />
  if (tab === 'cronjobs') return <CronJobsTable state={props.cronjobs} />
  if (tab === 'services') return <ServicesTable state={props.services} />
  if (tab === 'ingresses') return <IngressesTable state={props.ingresses} />
  if (tab === 'pvs') return <PVsTable state={props.pvs} />
  if (tab === 'pvcs') return <PVCsTable state={props.pvcs} />
  if (tab === 'configmaps') return <ConfigMapsTable state={props.configmaps} />
  if (tab === 'secrets') return <SecretsTable state={props.secrets} />
  return null
}

// ── Table components ───────────────────────────────────────────────────────

function NodesTable({ state }: { state: TabState<K8sNode> }) {
  return (
    <DataTable state={state} emptyMsg="No nodes found." cols={['Name','Status','Roles','Version','IP','OS','Age']}>
      {state.data.map((n) => (
        <tr key={n.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{n.name}</td>
          <td className="px-3 py-2">
            {n.status === 'Ready' ? <span className="badge-ok">Ready</span> : <span className="badge-error">NotReady</span>}
          </td>
          <td className="px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {n.roles.map((r) => <span key={r} className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300">{r}</span>)}
            </div>
          </td>
          <td className="px-3 py-2 font-mono text-muted">{n.version}</td>
          <td className="px-3 py-2 font-mono text-muted">{n.internal_ip || '—'}</td>
          <td className="px-3 py-2 text-muted truncate max-w-[160px]" title={n.os_image}>{n.os_image || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(n.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function NamespacesTable({ state }: { state: TabState<K8sNamespace> }) {
  return (
    <DataTable state={state} emptyMsg="No namespaces found." cols={['Name','Status','Age']}>
      {state.data.map((ns) => (
        <tr key={ns.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{ns.name}</td>
          <td className="px-3 py-2">
            {ns.status === 'Active' ? <span className="badge-ok">Active</span> : <span className="badge-muted">{ns.status}</span>}
          </td>
          <td className="px-3 py-2 text-muted">{fmtAge(ns.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function PodsTable({ state }: { state: TabState<K8sPod> }) {
  return (
    <DataTable state={state} emptyMsg="No pods found." cols={['Name','Namespace','Ready','Status','Restarts','Node','IP','Age']}>
      {state.data.map((p) => (
        <tr key={`${p.namespace}/${p.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200 max-w-[200px] truncate" title={p.name}>{p.name}</td>
          <td className="px-3 py-2"><NsBadge ns={p.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted">{p.ready}</td>
          <td className="px-3 py-2"><PodStatusBadge status={p.status} /></td>
          <td className="px-3 py-2 text-right font-mono">
            <span className={p.restarts > 0 ? 'text-warning' : 'text-muted'}>{p.restarts}</span>
          </td>
          <td className="px-3 py-2 text-muted max-w-[140px] truncate" title={p.node}>{p.node || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted">{p.ip || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(p.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function DeploymentsTable({ state }: { state: TabState<K8sDeployment> }) {
  return (
    <DataTable state={state} emptyMsg="No deployments found." cols={['Name','Namespace','Ready','Up-to-date','Available','Age']}>
      {state.data.map((d) => {
        const [ready, total] = d.ready.split('/').map(Number)
        const ok = ready === total && total > 0
        return (
          <tr key={`${d.namespace}/${d.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
            <td className="px-3 py-2 font-medium text-gray-200">{d.name}</td>
            <td className="px-3 py-2"><NsBadge ns={d.namespace} /></td>
            <td className="px-3 py-2 font-mono">
              <span className={ok ? 'text-green-400' : 'text-warning'}>{d.ready}</span>
            </td>
            <td className="px-3 py-2 font-mono text-muted text-center">{d.up_to_date}</td>
            <td className="px-3 py-2 font-mono text-muted text-center">{d.available}</td>
            <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(d.created)}</td>
          </tr>
        )
      })}
    </DataTable>
  )
}

function StatefulSetsTable({ state }: { state: TabState<K8sStatefulSet> }) {
  return (
    <DataTable state={state} emptyMsg="No StatefulSets found." cols={['Name','Namespace','Ready','Revision','Age']}>
      {state.data.map((s) => {
        const [ready, total] = s.ready.split('/').map(Number)
        const ok = ready === total && total > 0
        return (
          <tr key={`${s.namespace}/${s.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
            <td className="px-3 py-2 font-medium text-gray-200">{s.name}</td>
            <td className="px-3 py-2"><NsBadge ns={s.namespace} /></td>
            <td className="px-3 py-2 font-mono">
              <span className={ok ? 'text-green-400' : 'text-warning'}>{s.ready}</span>
            </td>
            <td className="px-3 py-2 font-mono text-muted">{s.current_revision || '—'}</td>
            <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(s.created)}</td>
          </tr>
        )
      })}
    </DataTable>
  )
}

function DaemonSetsTable({ state }: { state: TabState<K8sDaemonSet> }) {
  return (
    <DataTable state={state} emptyMsg="No DaemonSets found." cols={['Name','Namespace','Desired','Current','Ready','Up-to-date','Available','Age']}>
      {state.data.map((d) => (
        <tr key={`${d.namespace}/${d.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{d.name}</td>
          <td className="px-3 py-2"><NsBadge ns={d.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-center">{d.desired}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{d.current}</td>
          <td className="px-3 py-2 font-mono text-center">
            <span className={d.ready === d.desired ? 'text-green-400' : 'text-warning'}>{d.ready}</span>
          </td>
          <td className="px-3 py-2 font-mono text-muted text-center">{d.up_to_date}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{d.available}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(d.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function JobsTable({ state }: { state: TabState<K8sJob> }) {
  return (
    <DataTable state={state} emptyMsg="No jobs found." cols={['Name','Namespace','Status','Completions','Failed','Duration','Age']}>
      {state.data.map((j) => (
        <tr key={`${j.namespace}/${j.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{j.name}</td>
          <td className="px-3 py-2"><NsBadge ns={j.namespace} /></td>
          <td className="px-3 py-2">
            <JobStatusBadge status={j.status} />
          </td>
          <td className="px-3 py-2 font-mono text-muted">{j.completions}</td>
          <td className="px-3 py-2 font-mono text-center">
            {j.failed > 0 ? <span className="text-danger">{j.failed}</span> : <span className="text-muted">0</span>}
          </td>
          <td className="px-3 py-2 font-mono text-muted">{j.duration || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(j.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function CronJobsTable({ state }: { state: TabState<K8sCronJob> }) {
  return (
    <DataTable state={state} emptyMsg="No CronJobs found." cols={['Name','Namespace','Schedule','Last Schedule','Active','Suspended','Age']}>
      {state.data.map((cj) => (
        <tr key={`${cj.namespace}/${cj.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{cj.name}</td>
          <td className="px-3 py-2"><NsBadge ns={cj.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{cj.schedule}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{cj.last_schedule ? fmtAge(cj.last_schedule) + ' ago' : '—'}</td>
          <td className="px-3 py-2 font-mono text-center">
            {cj.active > 0 ? <span className="text-green-400">{cj.active}</span> : <span className="text-muted">0</span>}
          </td>
          <td className="px-3 py-2 text-center">
            {cj.suspended
              ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/20 text-yellow-300">Suspended</span>
              : <span className="badge-ok">Active</span>}
          </td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(cj.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function ServicesTable({ state }: { state: TabState<K8sService> }) {
  return (
    <DataTable state={state} emptyMsg="No services found." cols={['Name','Namespace','Type','Cluster IP','External IP','Ports','Age']}>
      {state.data.map((svc) => (
        <tr key={`${svc.namespace}/${svc.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{svc.name}</td>
          <td className="px-3 py-2"><NsBadge ns={svc.namespace} /></td>
          <td className="px-3 py-2"><SvcTypeBadge type={svc.type} /></td>
          <td className="px-3 py-2 font-mono text-muted">{svc.cluster_ip || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted">{svc.external_ips.join(', ') || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{svc.ports.join(', ') || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(svc.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function IngressesTable({ state }: { state: TabState<K8sIngress> }) {
  return (
    <DataTable state={state} emptyMsg="No ingresses found." cols={['Name','Namespace','Class','Hosts','Address','Age']}>
      {state.data.map((ing) => (
        <tr key={`${ing.namespace}/${ing.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{ing.name}</td>
          <td className="px-3 py-2"><NsBadge ns={ing.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{ing.class || '—'}</td>
          <td className="px-3 py-2 text-xs text-muted max-w-[200px]">
            {ing.hosts.length ? ing.hosts.map((h) => (
              <div key={h} className="font-mono">{h}</div>
            )) : '—'}
          </td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{ing.address.join(', ') || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(ing.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function PVsTable({ state }: { state: TabState<K8sPV> }) {
  return (
    <DataTable state={state} emptyMsg="No PersistentVolumes found." cols={['Name','Capacity','Access Modes','Reclaim','Status','Claim','Storage Class','Age']}>
      {state.data.map((pv) => (
        <tr key={pv.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{pv.name}</td>
          <td className="px-3 py-2 font-mono text-muted">{pv.capacity || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{pv.access_modes.join(', ') || '—'}</td>
          <td className="px-3 py-2 text-muted text-xs">{pv.reclaim_policy || '—'}</td>
          <td className="px-3 py-2"><PVStatusBadge status={pv.status} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs max-w-[180px] truncate" title={pv.claim}>{pv.claim || '—'}</td>
          <td className="px-3 py-2 text-muted text-xs">{pv.storage_class || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(pv.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function PVCsTable({ state }: { state: TabState<K8sPVC> }) {
  return (
    <DataTable state={state} emptyMsg="No PersistentVolumeClaims found." cols={['Name','Namespace','Status','Volume','Capacity','Access Modes','Storage Class','Age']}>
      {state.data.map((pvc) => (
        <tr key={`${pvc.namespace}/${pvc.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{pvc.name}</td>
          <td className="px-3 py-2"><NsBadge ns={pvc.namespace} /></td>
          <td className="px-3 py-2"><PVStatusBadge status={pvc.status} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs max-w-[140px] truncate" title={pvc.volume}>{pvc.volume || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted">{pvc.capacity || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{pvc.access_modes.join(', ') || '—'}</td>
          <td className="px-3 py-2 text-muted text-xs">{pvc.storage_class || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(pvc.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function ConfigMapsTable({ state }: { state: TabState<K8sConfigMap> }) {
  return (
    <DataTable state={state} emptyMsg="No ConfigMaps found." cols={['Name','Namespace','Data','Age']}>
      {state.data.map((cm) => (
        <tr key={`${cm.namespace}/${cm.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{cm.name}</td>
          <td className="px-3 py-2"><NsBadge ns={cm.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-center">{cm.data_count}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(cm.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function SecretsTable({ state }: { state: TabState<K8sSecret> }) {
  return (
    <DataTable state={state} emptyMsg="No secrets found." cols={['Name','Namespace','Type','Data','Age']}>
      {state.data.map((sec) => (
        <tr key={`${sec.namespace}/${sec.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{sec.name}</td>
          <td className="px-3 py-2"><NsBadge ns={sec.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{sec.type || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{sec.data_count}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(sec.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── Shared table wrapper ───────────────────────────────────────────────────

function DataTable<T>({ state, cols, emptyMsg, children }: {
  state: TabState<T>
  cols: string[]
  emptyMsg: string
  children: React.ReactNode
}) {
  if (state.error) return <ErrorBanner msg={state.error} />
  if (state.loading && !state.loaded) return <LoadingSpinner />
  if (!state.loading && state.loaded && state.data.length === 0) {
    return <div className="text-sm text-muted text-center py-12">{emptyMsg}</div>
  }
  if (!state.loaded) return null
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-4 text-muted">
            {cols.map((c) => <th key={c} className="px-3 py-2 text-left font-medium whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

// ── Badge helpers ──────────────────────────────────────────────────────────

function NsBadge({ ns }: { ns: string }) {
  return <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-3 text-muted">{ns}</span>
}

function PodStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Running'   ? 'badge-ok' :
    status === 'Succeeded' ? 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium' :
    status === 'Pending'   ? 'bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded text-[10px] font-medium' :
    status === 'Failed'    ? 'badge-error' : 'badge-muted'
  return <span className={cls}>{status}</span>
}

function JobStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Complete' ? 'badge-ok' :
    status === 'Failed'   ? 'badge-error' :
    'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium'
  return <span className={cls}>{status}</span>
}

function SvcTypeBadge({ type }: { type: string }) {
  const cls =
    type === 'LoadBalancer' ? 'bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-medium' :
    type === 'NodePort'     ? 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium' :
    type === 'ExternalName' ? 'bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded text-[10px] font-medium' :
    'badge-muted'
  return <span className={cls}>{type}</span>
}

function PVStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Bound'     ? 'badge-ok' :
    status === 'Available' ? 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium' :
    status === 'Released'  ? 'bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded text-[10px] font-medium' :
    status === 'Failed'    ? 'badge-error' : 'badge-muted'
  return <span className={cls}>{status}</span>
}

// ── Shared UI ──────────────────────────────────────────────────────────────

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded bg-danger/10 border border-danger/30 text-danger text-sm">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />{msg}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12 text-muted gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Loading…</span>
    </div>
  )
}

function fmtAge(iso: string): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d`
  return `${Math.floor(diff / (86400 * 30))}mo`
}
