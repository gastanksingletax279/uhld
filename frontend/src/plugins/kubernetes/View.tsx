import { useEffect, useState, useCallback, useRef } from 'react'
import {
  api,
  K8sNode, K8sPod, K8sNamespace,
  K8sDeployment, K8sStatefulSet, K8sDaemonSet, K8sJob, K8sCronJob,
  K8sReplicaSet, K8sHPA,
  K8sService, K8sIngress, K8sHTTPRoute, K8sIngressClass, K8sEndpoints, K8sNetworkPolicy,
  K8sPV, K8sPVC, K8sConfigMap, K8sSecret, K8sStorageClass,
  K8sLonghornVolume, K8sLonghornNode,
  K8sCertificate, K8sEvent, K8sOverview,
  K8sServiceAccount, K8sRole, K8sClusterRole, K8sRoleBinding, K8sClusterRoleBinding,
  K8sHelmRelease,
  K8sCRD, K8sResourceQuota, K8sLimitRange, K8sPriorityClass, K8sPDB,
} from '../../api/client'
import { getViewState, setViewState } from '../../store/viewStateStore'
import {
  RefreshCw, Loader2, AlertCircle, Server, Filter,
  RotateCcw, ScrollText, X, ChevronUp, ChevronDown, ChevronsUpDown,
  Plus, Minus, Terminal, FileCode, Check, ShieldCheck, Eye, EyeOff,
  LayoutDashboard, Trash2, Package, UserCog,
} from 'lucide-react'

// ── Tab/Group types ────────────────────────────────────────────────────────

type Group = 'cluster' | 'workloads' | 'networking' | 'storage' | 'config' | 'access' | 'helm'
type ClusterTab    = 'overview' | 'nodes' | 'namespaces' | 'crds'
type WorkloadsTab  = 'pods' | 'deployments' | 'statefulsets' | 'daemonsets' | 'jobs' | 'cronjobs' | 'replicasets' | 'hpas'
type NetworkingTab = 'services' | 'ingresses' | 'ingressclasses' | 'httproutes' | 'endpoints' | 'networkpolicies'
type StorageTab    = 'pvs' | 'pvcs' | 'configmaps' | 'secrets' | 'certificates' | 'longhorn' | 'storageclasses'
type ConfigTab     = 'resourcequotas' | 'limitranges' | 'priorityclasses' | 'pdbs'
type AccessTab     = 'serviceaccounts' | 'roles' | 'clusterroles' | 'rolebindings' | 'clusterrolebindings'
type HelmTab       = 'helmreleases'
type Tab = ClusterTab | WorkloadsTab | NetworkingTab | StorageTab | ConfigTab | AccessTab | HelmTab

const GROUP_TABS: Record<Group, { id: Tab; label: string }[]> = {
  cluster:    [
    { id: 'overview', label: 'Overview' }, { id: 'nodes', label: 'Nodes' },
    { id: 'namespaces', label: 'Namespaces' }, { id: 'crds', label: 'CRDs' },
  ],
  workloads:  [
    { id: 'pods', label: 'Pods' }, { id: 'deployments', label: 'Deployments' },
    { id: 'statefulsets', label: 'StatefulSets' }, { id: 'daemonsets', label: 'DaemonSets' },
    { id: 'jobs', label: 'Jobs' }, { id: 'cronjobs', label: 'CronJobs' },
    { id: 'replicasets', label: 'ReplicaSets' }, { id: 'hpas', label: 'HPAs' },
  ],
  networking: [
    { id: 'services', label: 'Services' }, { id: 'ingresses', label: 'Ingresses' },
    { id: 'ingressclasses', label: 'IngressClasses' }, { id: 'httproutes', label: 'HTTPRoutes' },
    { id: 'endpoints', label: 'Endpoints' }, { id: 'networkpolicies', label: 'NetworkPolicies' },
  ],
  storage:    [
    { id: 'pvs', label: 'PersistentVolumes' }, { id: 'pvcs', label: 'PVCs' },
    { id: 'configmaps', label: 'ConfigMaps' }, { id: 'secrets', label: 'Secrets' },
    { id: 'certificates', label: 'Certificates' }, { id: 'longhorn', label: 'Longhorn' },
    { id: 'storageclasses', label: 'StorageClasses' },
  ],
  config:     [
    { id: 'resourcequotas', label: 'ResourceQuotas' }, { id: 'limitranges', label: 'LimitRanges' },
    { id: 'priorityclasses', label: 'PriorityClasses' }, { id: 'pdbs', label: 'PodDisruptionBudgets' },
  ],
  access:     [
    { id: 'serviceaccounts', label: 'Service Accounts' }, { id: 'roles', label: 'Roles' },
    { id: 'clusterroles', label: 'ClusterRoles' }, { id: 'rolebindings', label: 'RoleBindings' },
    { id: 'clusterrolebindings', label: 'ClusterRoleBindings' },
  ],
  helm:       [{ id: 'helmreleases', label: 'Releases' }],
}

const NS_TABS = new Set<Tab>(['pods','deployments','statefulsets','daemonsets','jobs','cronjobs','replicasets','hpas','services','ingresses','httproutes','endpoints','networkpolicies','pvcs','configmaps','secrets','certificates','serviceaccounts','roles','rolebindings','resourcequotas','limitranges','pdbs'])

// ── Generic lazy tab data store ────────────────────────────────────────────
type TabState<T> = { data: T[]; loading: boolean; loaded: boolean; error: string | null }
function emptyTab<T>(): TabState<T> { return { data: [], loading: false, loaded: false, error: null } }

type OverviewState = { data: K8sOverview | null; loading: boolean; loaded: boolean; error: string | null }
const emptyOverview = (): OverviewState => ({ data: null, loading: false, loaded: false, error: null })

// ── Sort state ─────────────────────────────────────────────────────────────
type SortDir = 'asc' | 'desc'
type SortState = { col: string; dir: SortDir } | null

function useSort(): [SortState, (col: string) => void] {
  const [sort, setSort] = useState<SortState>(null)
  const toggle = useCallback((col: string) => {
    setSort((s) => s?.col === col ? (s.dir === 'asc' ? { col, dir: 'desc' } : null) : { col, dir: 'asc' })
  }, [])
  return [sort, toggle]
}

function sorted<T>(data: T[], sort: SortState): T[] {
  if (!sort) return data
  const col = sort.col as keyof T
  return [...data].sort((a, b) => {
    const cmp = String(a[col] ?? '').localeCompare(String(b[col] ?? ''), undefined, { numeric: true })
    return sort.dir === 'asc' ? cmp : -cmp
  })
}

// ── Confirm modal ──────────────────────────────────────────────────────────
type ConfirmModal = { title: string; message: string; items?: string[]; confirmLabel?: string; confirmClass?: string; onConfirm: () => void }

// ── Secret data modal ──────────────────────────────────────────────────────
type SecretDataModal = {
  namespace: string; name: string; type: string
  data: Record<string, string>; loading: boolean; error: string | null
}

// ── Modal types ────────────────────────────────────────────────────────────
type LogsModal = {
  namespace: string; pod: string
  containers: string[]; container: string
  logs: string; loading: boolean; error: string | null
}
type ShellModal = { namespace: string; pod: string; containers: string[]; container: string }
type YamlModal = {
  kind: string; name: string; namespace: string
  yaml: string; loading: boolean; saving: boolean
  error: string | null; saved: boolean
}

// ── Component ──────────────────────────────────────────────────────────────
export function KubernetesView({ instanceId = 'default' }: { instanceId?: string }) {
  const k8s = api.kubernetes(instanceId)
  const _key = `kubernetes:${instanceId}`

  const [group, setGroupRaw]    = useState<Group>(getViewState(`${_key}:group`, 'cluster') as Group)
  const [tab, setTabRaw]        = useState<Tab>(getViewState(`${_key}:tab`, 'overview') as Tab)
  const [nsFilter, setNsFilter] = useState('')

  function setGroup(g: Group) { setViewState(`${_key}:group`, g); setGroupRaw(g) }
  function setTab(t: Tab)     { setViewState(`${_key}:tab`, t);   setTabRaw(t) }

  const [nodes,         setNodes]         = useState<TabState<K8sNode>>(emptyTab())
  const [namespaces,    setNamespaces]    = useState<TabState<K8sNamespace>>(emptyTab())
  const [pods,          setPods]          = useState<TabState<K8sPod>>(emptyTab())
  const [deployments,   setDeployments]   = useState<TabState<K8sDeployment>>(emptyTab())
  const [statefulsets,  setStatefulsets]  = useState<TabState<K8sStatefulSet>>(emptyTab())
  const [daemonsets,    setDaemonsets]    = useState<TabState<K8sDaemonSet>>(emptyTab())
  const [jobs,          setJobs]          = useState<TabState<K8sJob>>(emptyTab())
  const [cronjobs,      setCronjobs]      = useState<TabState<K8sCronJob>>(emptyTab())
  const [services,      setServices]      = useState<TabState<K8sService>>(emptyTab())
  const [ingresses,     setIngresses]     = useState<TabState<K8sIngress>>(emptyTab())
  const [ingressclasses,setIngressclasses]= useState<TabState<K8sIngressClass>>(emptyTab())
  const [httproutes,    setHttproutes]    = useState<TabState<K8sHTTPRoute>>(emptyTab())
  const [pvs,           setPvs]           = useState<TabState<K8sPV>>(emptyTab())
  const [pvcs,          setPvcs]          = useState<TabState<K8sPVC>>(emptyTab())
  const [configmaps,    setConfigmaps]    = useState<TabState<K8sConfigMap>>(emptyTab())
  const [secrets,       setSecrets]       = useState<TabState<K8sSecret>>(emptyTab())
  const [lhVolumes,     setLhVolumes]     = useState<TabState<K8sLonghornVolume>>(emptyTab())
  const [lhNodes,       setLhNodes]       = useState<TabState<K8sLonghornNode>>(emptyTab())
  const [lhSubTab,      setLhSubTab]      = useState<'volumes'|'nodes'>('volumes')
  const [overview,      setOverview]      = useState<OverviewState>(emptyOverview())
  const [certificates,  setCertificates]  = useState<TabState<K8sCertificate>>(emptyTab())
  const [svcAccounts,   setSvcAccounts]   = useState<TabState<K8sServiceAccount>>(emptyTab())
  const [roles,         setRoles]         = useState<TabState<K8sRole>>(emptyTab())
  const [clusterRoles,  setClusterRoles]  = useState<TabState<K8sClusterRole>>(emptyTab())
  const [roleBindings,  setRoleBindings]  = useState<TabState<K8sRoleBinding>>(emptyTab())
  const [crBindings,    setCrBindings]    = useState<TabState<K8sClusterRoleBinding>>(emptyTab())
  const [helmReleases,  setHelmReleases]  = useState<TabState<K8sHelmRelease>>(emptyTab())
  const [replicaSets,   setReplicaSets]   = useState<TabState<K8sReplicaSet>>(emptyTab())
  const [hpas,          setHpas]          = useState<TabState<K8sHPA>>(emptyTab())
  const [endpoints,     setEndpoints]     = useState<TabState<K8sEndpoints>>(emptyTab())
  const [netPolicies,   setNetPolicies]   = useState<TabState<K8sNetworkPolicy>>(emptyTab())
  const [storageClasses,setStorageClasses]= useState<TabState<K8sStorageClass>>(emptyTab())
  const [crds,          setCrds]          = useState<TabState<K8sCRD>>(emptyTab())
  const [resourceQuotas,setResourceQuotas]= useState<TabState<K8sResourceQuota>>(emptyTab())
  const [limitRanges,   setLimitRanges]   = useState<TabState<K8sLimitRange>>(emptyTab())
  const [priorityClasses,setPriorityClasses]= useState<TabState<K8sPriorityClass>>(emptyTab())
  const [pdbs,          setPdbs]          = useState<TabState<K8sPDB>>(emptyTab())
  const [selectedPods,  setSelectedPods]  = useState<Set<string>>(new Set())

  const [actionLoading,   setActionLoading]   = useState<string | null>(null)
  const [actionError,     setActionError]     = useState<string | null>(null)
  const [logsModal,       setLogsModal]       = useState<LogsModal | null>(null)
  const [logsTail,        setLogsTail]        = useState(false)
  const logsWsRef       = useRef<WebSocket | null>(null)
  const logsPreRef      = useRef<HTMLPreElement>(null)
  const podsWsRef       = useRef<WebSocket | null>(null)
  const podsWsRetryRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [shellModal,      setShellModal]      = useState<ShellModal | null>(null)
  const [yamlModal,       setYamlModal]       = useState<YamlModal | null>(null)
  const [secretDataModal, setSecretDataModal] = useState<SecretDataModal | null>(null)
  const [confirmModal,    setConfirmModal]    = useState<ConfirmModal | null>(null)

  // ── Loaders ──────────────────────────────────────────────────────────────
  async function load<T>(setter: React.Dispatch<React.SetStateAction<TabState<T>>>, fetcher: () => Promise<unknown>, key: string) {
    setter((s) => ({ ...s, loading: true, error: null }))
    try {
      const resp = await fetcher() as Record<string, T[]>
      setter({ data: resp[key] ?? [], loading: false, loaded: true, error: null })
    } catch (e: unknown) {
      setter((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : `Failed to load ${key}` }))
    }
  }

  const loadTab = useCallback((t: Tab, ns = nsFilter, force = false) => {
    const skip = (s: TabState<unknown> | OverviewState) => !force && s.loaded
    switch (t) {
      case 'overview':
        if (!skip(overview)) {
          setOverview((s) => ({ ...s, loading: true, error: null }))
          k8s.overview().then((data) => setOverview({ data, loading: false, loaded: true, error: null }))
            .catch((e: unknown) => setOverview((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Failed' })))
        }
        break
      case 'nodes':         if (!skip(nodes))         load(setNodes,        () => k8s.nodes(), 'nodes'); break
      case 'namespaces':    if (!skip(namespaces))    load(setNamespaces,   () => k8s.namespaces(), 'namespaces'); break
      case 'pods':          load(setPods,        () => k8s.pods(ns), 'pods'); break
      case 'deployments':   load(setDeployments, () => k8s.deployments(ns), 'deployments'); break
      case 'statefulsets':  load(setStatefulsets,() => k8s.statefulsets(ns), 'statefulsets'); break
      case 'daemonsets':    load(setDaemonsets,  () => k8s.daemonsets(ns), 'daemonsets'); break
      case 'jobs':          load(setJobs,        () => k8s.jobs(ns), 'jobs'); break
      case 'cronjobs':      load(setCronjobs,    () => k8s.cronjobs(ns), 'cronjobs'); break
      case 'replicasets':   load(setReplicaSets, () => k8s.replicaSets(ns), 'replicasets'); break
      case 'hpas':          load(setHpas,        () => k8s.hpas(ns), 'hpas'); break
      case 'services':      load(setServices,    () => k8s.services(ns), 'services'); break
      case 'ingresses':     load(setIngresses,   () => k8s.ingresses(ns), 'ingresses'); break
      case 'ingressclasses':if (!skip(ingressclasses)) load(setIngressclasses, () => k8s.ingressclasses(), 'ingressclasses'); break
      case 'httproutes':    load(setHttproutes,  () => k8s.httproutes(ns), 'httproutes'); break
      case 'endpoints':     load(setEndpoints,   () => k8s.endpoints(ns), 'endpoints'); break
      case 'networkpolicies':load(setNetPolicies,() => k8s.networkpolicies(ns), 'networkpolicies'); break
      case 'pvs':           if (!skip(pvs))           load(setPvs,          () => k8s.persistentvolumes(), 'pvs'); break
      case 'pvcs':          load(setPvcs,        () => k8s.pvcs(ns), 'pvcs'); break
      case 'configmaps':    load(setConfigmaps,  () => k8s.configmaps(ns), 'configmaps'); break
      case 'secrets':       load(setSecrets,       () => k8s.secrets(ns), 'secrets'); break
      case 'certificates':  load(setCertificates,  () => k8s.certificates(ns), 'certificates'); break
      case 'storageclasses':if (!skip(storageClasses)) load(setStorageClasses, () => k8s.storageclasses(), 'storageclasses'); break
      case 'longhorn':
        if (!skip(lhVolumes)) load(setLhVolumes, () => k8s.longhornVolumes(), 'volumes')
        if (!skip(lhNodes))   load(setLhNodes,   () => k8s.longhornNodes(), 'nodes')
        break
      case 'serviceaccounts':       load(setSvcAccounts,  () => k8s.serviceaccounts(ns), 'serviceaccounts'); break
      case 'roles':                 load(setRoles,        () => k8s.roles(ns), 'roles'); break
      case 'clusterroles':          if (!skip(clusterRoles))  load(setClusterRoles, () => k8s.clusterroles(), 'clusterroles'); break
      case 'rolebindings':          load(setRoleBindings, () => k8s.rolebindings(ns), 'rolebindings'); break
      case 'clusterrolebindings':   if (!skip(crBindings))    load(setCrBindings, () => k8s.clusterrolebindings(), 'clusterrolebindings'); break
      case 'helmreleases':          load(setHelmReleases, () => k8s.helmReleases(ns), 'releases'); break
      case 'crds':                  if (!skip(crds))           load(setCrds, () => k8s.crds(), 'crds'); break
      case 'resourcequotas':        load(setResourceQuotas, () => k8s.resourcequotas(ns), 'resourcequotas'); break
      case 'limitranges':           load(setLimitRanges,    () => k8s.limitranges(ns), 'limitranges'); break
      case 'priorityclasses':       if (!skip(priorityClasses)) load(setPriorityClasses, () => k8s.priorityclasses(), 'priorityclasses'); break
      case 'pdbs':                  load(setPdbs,           () => k8s.pdbs(ns), 'pdbs'); break
    }
  }, [nsFilter])  // eslint-disable-line react-hooks/exhaustive-deps

  // Reset all cached data when the cluster instance changes
  useEffect(() => {
    setOverview(emptyOverview())
    setNodes(emptyTab()); setNamespaces(emptyTab())
    setPods(emptyTab()); setDeployments(emptyTab()); setStatefulsets(emptyTab())
    setDaemonsets(emptyTab()); setJobs(emptyTab()); setCronjobs(emptyTab())
    setServices(emptyTab()); setIngresses(emptyTab()); setIngressclasses(emptyTab())
    setHttproutes(emptyTab()); setPvs(emptyTab()); setPvcs(emptyTab())
    setConfigmaps(emptyTab()); setSecrets(emptyTab()); setCertificates(emptyTab())
    setLhVolumes(emptyTab()); setLhNodes(emptyTab())
    setSvcAccounts(emptyTab()); setRoles(emptyTab()); setClusterRoles(emptyTab())
    setRoleBindings(emptyTab()); setCrBindings(emptyTab()); setHelmReleases(emptyTab())
    setReplicaSets(emptyTab()); setHpas(emptyTab()); setEndpoints(emptyTab())
    setNetPolicies(emptyTab()); setStorageClasses(emptyTab()); setCrds(emptyTab())
    setResourceQuotas(emptyTab()); setLimitRanges(emptyTab())
    setPriorityClasses(emptyTab()); setPdbs(emptyTab())
    setSelectedPods(new Set())
    loadTab(tab)
  }, [instanceId])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = getTabState(tab)
    if (!s.loaded && !s.loading) loadTab(tab)
  }, [tab])

  // ── Realtime log streaming ────────────────────────────────────────────────
  useEffect(() => {
    if (logsWsRef.current) { logsWsRef.current.close(); logsWsRef.current = null }
    if (!logsTail || !logsModal) return
    const ws = new WebSocket(k8s.podLogsStreamWsUrl(logsModal.namespace, logsModal.pod, logsModal.container))
    logsWsRef.current = ws
    ws.onmessage = (e) => {
      setLogsModal((m) => m ? { ...m, logs: m.logs + (e.data as string) } : null)
      requestAnimationFrame(() => {
        if (logsPreRef.current) logsPreRef.current.scrollTop = logsPreRef.current.scrollHeight
      })
    }
    ws.onerror = () => setLogsModal((m) => m ? { ...m, error: 'Log stream disconnected' } : null)
    return () => { ws.close(); logsWsRef.current = null }
  }, [logsTail, logsModal?.namespace, logsModal?.pod, logsModal?.container])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time pod watch via WebSocket ─────────────────────────────────────
  useEffect(() => {
    if (tab !== 'pods' || !pods.loaded) return

    let retryDelay = 2000
    let cancelled = false

    function connect() {
      if (cancelled) return
      const ws = new WebSocket(k8s.podsWatchUrl(nsFilter))
      podsWsRef.current = ws

      ws.onmessage = (ev) => {
        try {
          const { type, pod } = JSON.parse(ev.data) as { type: string; pod: K8sPod }
          setPods((prev) => {
            if (type === 'DELETED') {
              return { ...prev, data: prev.data.filter((p) => !(p.name === pod.name && p.namespace === pod.namespace)) }
            }
            // ADDED or MODIFIED — upsert
            const idx = prev.data.findIndex((p) => p.name === pod.name && p.namespace === pod.namespace)
            const next = [...prev.data]
            if (idx >= 0) next[idx] = pod
            else next.push(pod)
            return { ...prev, data: next }
          })
          retryDelay = 2000  // reset backoff on successful message
        } catch { /* ignore parse errors */ }
      }

      ws.onclose = () => {
        podsWsRef.current = null
        if (!cancelled) {
          podsWsRetryRef.current = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30_000)
            connect()
          }, retryDelay)
        }
      }

      ws.onerror = () => ws.close()
    }

    connect()

    // Fallback poll every 30 s in case watch stream is unreliable
    const fallbackId = setInterval(() => {
      if (!podsWsRef.current || podsWsRef.current.readyState !== WebSocket.OPEN) {
        loadTab('pods', nsFilter, true)
      }
    }, 30_000)

    return () => {
      cancelled = true
      if (podsWsRetryRef.current) clearTimeout(podsWsRetryRef.current)
      podsWsRef.current?.close()
      podsWsRef.current = null
      clearInterval(fallbackId)
    }
  }, [tab, pods.loaded, nsFilter])  // eslint-disable-line react-hooks/exhaustive-deps

  function applyNsFilter(ns: string) {
    setNsFilter(ns)
    if (NS_TABS.has(tab)) loadTab(tab, ns)
  }
  function refresh() { loadTab(tab, nsFilter, true) }

  function getTabState(t: Tab): TabState<unknown> | OverviewState {
    const map: Record<Tab, TabState<unknown> | OverviewState> = {
      overview: overview,
      nodes: nodes as TabState<unknown>, namespaces: namespaces as TabState<unknown>,
      pods: pods as TabState<unknown>, deployments: deployments as TabState<unknown>,
      statefulsets: statefulsets as TabState<unknown>, daemonsets: daemonsets as TabState<unknown>,
      jobs: jobs as TabState<unknown>, cronjobs: cronjobs as TabState<unknown>,
      replicasets: replicaSets as TabState<unknown>, hpas: hpas as TabState<unknown>,
      services: services as TabState<unknown>, ingresses: ingresses as TabState<unknown>,
      ingressclasses: ingressclasses as TabState<unknown>, httproutes: httproutes as TabState<unknown>,
      endpoints: endpoints as TabState<unknown>, networkpolicies: netPolicies as TabState<unknown>,
      pvs: pvs as TabState<unknown>, pvcs: pvcs as TabState<unknown>,
      configmaps: configmaps as TabState<unknown>, secrets: secrets as TabState<unknown>,
      certificates: certificates as TabState<unknown>, longhorn: lhVolumes as TabState<unknown>,
      storageclasses: storageClasses as TabState<unknown>,
      crds: crds as TabState<unknown>,
      resourcequotas: resourceQuotas as TabState<unknown>, limitranges: limitRanges as TabState<unknown>,
      priorityclasses: priorityClasses as TabState<unknown>, pdbs: pdbs as TabState<unknown>,
      serviceaccounts: svcAccounts as TabState<unknown>, roles: roles as TabState<unknown>,
      clusterroles: clusterRoles as TabState<unknown>, rolebindings: roleBindings as TabState<unknown>,
      clusterrolebindings: crBindings as TabState<unknown>, helmreleases: helmReleases as TabState<unknown>,
    }
    return map[t]
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function restartWorkload(kind: string, namespace: string, name: string) {
    const key = `restart-workload:${namespace}/${name}`
    setActionLoading(key); setActionError(null)
    try {
      await k8s.restartWorkload(kind, namespace, name)
      const tabMap: Record<string, Tab> = { deployment: 'deployments', statefulset: 'statefulsets', daemonset: 'daemonsets' }
      const t = tabMap[kind.toLowerCase()]
      if (t) setTimeout(() => loadTab(t, nsFilter, true), 1500)
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Restart failed')
    } finally { setActionLoading(null) }
  }

  async function restartPod(namespace: string, pod: string) {
    const key = `restart:${namespace}/${pod}`
    setActionLoading(key); setActionError(null)
    try {
      await k8s.restartPod(namespace, pod)
      setTimeout(() => loadTab('pods', nsFilter, true), 1500)
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Restart failed')
    } finally { setActionLoading(null) }
  }

  async function scaleDeployment(namespace: string, name: string, current: number, delta: number) {
    const key = `scale:${namespace}/${name}`
    setActionLoading(key); setActionError(null)
    try {
      await k8s.scaleDeployment(namespace, name, Math.max(0, current + delta))
      loadTab('deployments', nsFilter, true)
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Scale failed')
    } finally { setActionLoading(null) }
  }

  async function openLogs(namespace: string, pod: string) {
    setLogsTail(false)
    logsWsRef.current?.close()
    setLogsModal({ namespace, pod, containers: [], container: '', logs: '', loading: true, error: null })
    try {
      const { containers } = await k8s.podContainers(namespace, pod)
      const container = containers[0] ?? ''
      const { logs } = await k8s.podLogs(namespace, pod, container)
      setLogsModal({ namespace, pod, containers, container, logs, loading: false, error: null })
    } catch (e: unknown) {
      setLogsModal((m) => m ? { ...m, loading: false, error: e instanceof Error ? e.message : 'Failed' } : null)
    }
  }

  async function switchLogContainer(container: string) {
    if (!logsModal) return
    setLogsTail(false)
    logsWsRef.current?.close()
    setLogsModal((m) => m ? { ...m, container, logs: '', loading: true, error: null } : null)
    try {
      const { logs } = await k8s.podLogs(logsModal.namespace, logsModal.pod, container)
      setLogsModal((m) => m ? { ...m, logs, loading: false } : null)
    } catch (e: unknown) {
      setLogsModal((m) => m ? { ...m, loading: false, error: e instanceof Error ? e.message : 'Failed' } : null)
    }
  }

  function bulkRestartPods(podList: K8sPod[]) {
    setConfirmModal({
      title: `Restart ${podList.length} pod${podList.length > 1 ? 's' : ''}?`,
      message: 'The following pods will be deleted and rescheduled by their controller:',
      items: podList.map((p) => `${p.namespace}/${p.name}`),
      confirmLabel: 'Restart',
      confirmClass: 'bg-yellow-600 hover:bg-yellow-500',
      onConfirm: async () => {
        setConfirmModal(null)
        await doBulkRestart(podList)
      },
    })
  }

  async function doBulkRestart(podList: K8sPod[]) {
    setActionLoading('bulk-restart'); setActionError(null)
    try {
      await Promise.all(podList.map((p) => k8s.restartPod(p.namespace, p.name)))
      setSelectedPods(new Set())
      setTimeout(() => loadTab('pods', nsFilter, true), 1500)
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Bulk restart failed')
    } finally { setActionLoading(null) }
  }

  function promptDeleteNamespace(name: string) {
    setConfirmModal({
      title: `Delete namespace "${name}"?`,
      message: `This will delete the namespace and ALL resources inside it (pods, services, deployments, etc.). This action cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirmModal(null)
        setActionLoading(`delete-ns:${name}`); setActionError(null)
        try {
          await k8s.deleteNamespace(name)
          loadTab('namespaces', '', true)
        } catch (e: unknown) {
          setActionError(e instanceof Error ? e.message : 'Delete failed')
        } finally { setActionLoading(null) }
      },
    })
  }

  async function openShell(namespace: string, pod: string) {
    try {
      const { containers } = await k8s.podContainers(namespace, pod)
      setShellModal({ namespace, pod, containers, container: containers[0] ?? '' })
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to open shell')
    }
  }

  async function openSecretData(namespace: string, name: string) {
    setSecretDataModal({ namespace, name, type: '', data: {}, loading: true, error: null })
    try {
      const res = await k8s.secretData(namespace, name)
      setSecretDataModal((m) => m ? { ...m, type: res.type, data: res.data, loading: false } : null)
    } catch (e: unknown) {
      setSecretDataModal((m) => m ? { ...m, loading: false, error: e instanceof Error ? e.message : 'Failed' } : null)
    }
  }

  async function openYaml(kind: string, name: string, namespace: string) {
    setYamlModal({ kind, name, namespace, yaml: '', loading: true, saving: false, error: null, saved: false })
    try {
      const { yaml } = await k8s.getYaml(kind, name, namespace)
      setYamlModal((m) => m ? { ...m, yaml, loading: false } : null)
    } catch (e: unknown) {
      setYamlModal((m) => m ? { ...m, loading: false, error: e instanceof Error ? e.message : 'Failed to load YAML' } : null)
    }
  }

  async function applyYaml() {
    if (!yamlModal) return
    setYamlModal((m) => m ? { ...m, saving: true, error: null, saved: false } : null)
    try {
      await k8s.applyYaml(yamlModal.yaml)
      setYamlModal((m) => m ? { ...m, saving: false, saved: true } : null)
    } catch (e: unknown) {
      setYamlModal((m) => m ? { ...m, saving: false, error: e instanceof Error ? e.message : 'Apply failed' } : null)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const current = getTabState(tab)
  const isLoading = current.loading
  const allNs = [...new Set([
    ...pods.data.map((p) => p.namespace),
    ...deployments.data.map((d) => d.namespace),
    ...services.data.map((s) => s.namespace),
  ])].sort()

  function switchGroup(g: Group) {
    setGroup(g)
    const first = GROUP_TABS[g][0].id
    setTab(first)
    const s = getTabState(first)
    if (!s.loaded && !s.loading) loadTab(first)
  }

  function switchTab(t: Tab) {
    setTab(t)
    if (NS_TABS.has(t)) loadTab(t, nsFilter)
    else { const s = getTabState(t); if (!s.loaded && !s.loading) loadTab(t) }
  }

  const GROUPS: { id: Group; label: string }[] = [
    { id: 'cluster', label: 'Cluster' }, { id: 'workloads', label: 'Workloads' },
    { id: 'networking', label: 'Networking' }, { id: 'storage', label: 'Storage' },
    { id: 'config', label: 'Config' }, { id: 'access', label: 'Access Control' },
    { id: 'helm', label: 'Helm' },
  ]

  return (
    <div className="space-y-3 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">Kubernetes</h2>
        </div>
        <div className="flex items-center gap-2">
          {NS_TABS.has(tab) && (
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-muted" />
              <select className="input text-xs py-1 px-2 h-auto" value={nsFilter} onChange={(e) => applyNsFilter(e.target.value)}>
                <option value="">All namespaces</option>
                {allNs.map((ns) => <option key={ns} value={ns}>{ns}</option>)}
              </select>
            </div>
          )}
          <button onClick={refresh} disabled={isLoading} className="btn-ghost text-xs gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* Group selector */}
      <div className="flex gap-1.5">
        {GROUPS.map((g) => (
          <button key={g.id} onClick={() => switchGroup(g.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${group === g.id ? 'bg-accent text-white' : 'bg-surface-3 text-muted hover:text-gray-300 hover:bg-surface-4'}`}>
            {g.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-surface-4 overflow-x-auto">
        {GROUP_TABS[group].map((t) => (
          <button key={t.id} onClick={() => switchTab(t.id)}
            className={`flex-shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {actionError && <ErrorBanner msg={actionError} />}

      {/* Content */}
      {tab === 'overview'      && <OverviewPanel      state={overview} onRefresh={() => { setOverview(emptyOverview()); loadTab('overview', '', true) }} />}
      {tab === 'nodes'         && <NodesTable         state={nodes}         onYaml={(n) => openYaml('namespace', n.name, '')} />}
      {tab === 'namespaces'    && <NamespacesTable    state={namespaces}    actionLoading={actionLoading} onDelete={promptDeleteNamespace} />}
      {tab === 'crds'          && <CRDsTable          state={crds} />}
      {tab === 'pods'          && <PodsTable          state={pods}          actionLoading={actionLoading} onRestart={restartPod} onLogs={openLogs} onShell={openShell} onYaml={(p) => openYaml('pod', p.name, p.namespace)} selected={selectedPods} onSelect={setSelectedPods} onBulkRestart={bulkRestartPods} />}
      {tab === 'deployments'   && <DeploymentsTable   state={deployments}   actionLoading={actionLoading} onScale={scaleDeployment} onRestart={(d) => restartWorkload('deployment', d.namespace, d.name)} onYaml={(d) => openYaml('deployment', d.name, d.namespace)} />}
      {tab === 'statefulsets'  && <StatefulSetsTable  state={statefulsets}  actionLoading={actionLoading} onRestart={(s) => restartWorkload('statefulset', s.namespace, s.name)} onYaml={(s) => openYaml('statefulset', s.name, s.namespace)} />}
      {tab === 'daemonsets'    && <DaemonSetsTable    state={daemonsets}    actionLoading={actionLoading} onRestart={(d) => restartWorkload('daemonset', d.namespace, d.name)} onYaml={(d) => openYaml('daemonset', d.name, d.namespace)} />}
      {tab === 'jobs'          && <JobsTable          state={jobs}          />}
      {tab === 'cronjobs'      && <CronJobsTable      state={cronjobs}      />}
      {tab === 'replicasets'   && <ReplicaSetsTable   state={replicaSets}   />}
      {tab === 'hpas'          && <HPAsTable          state={hpas}          />}
      {tab === 'services'      && <ServicesTable      state={services}      onYaml={(s) => openYaml('service', s.name, s.namespace)} />}
      {tab === 'ingresses'     && <IngressesTable     state={ingresses}     onYaml={(i) => openYaml('ingress', i.name, i.namespace)} />}
      {tab === 'ingressclasses'&& <IngressClassesTable state={ingressclasses} />}
      {tab === 'httproutes'    && <HTTPRoutesTable    state={httproutes}    />}
      {tab === 'endpoints'     && <EndpointsTable     state={endpoints}     />}
      {tab === 'networkpolicies'&& <NetworkPoliciesTable state={netPolicies} />}
      {tab === 'pvs'           && <PVsTable           state={pvs}           onYaml={(v) => openYaml('persistentvolume', v.name, '')} />}
      {tab === 'pvcs'          && <PVCsTable          state={pvcs}          onYaml={(v) => openYaml('persistentvolumeclaim', v.name, v.namespace)} />}
      {tab === 'configmaps'    && <ConfigMapsTable    state={configmaps}    onYaml={(c) => openYaml('configmap', c.name, c.namespace)} />}
      {tab === 'secrets'       && <SecretsTable       state={secrets}       onYaml={(s) => openYaml('secret', s.name, s.namespace)} onReveal={(s) => openSecretData(s.namespace, s.name)} />}
      {tab === 'certificates'  && <CertificatesTable  state={certificates}  />}
      {tab === 'storageclasses'&& <StorageClassesTable state={storageClasses} />}
      {/* Config */}
      {tab === 'resourcequotas'&& <ResourceQuotasTable state={resourceQuotas} />}
      {tab === 'limitranges'   && <LimitRangesTable   state={limitRanges}   />}
      {tab === 'priorityclasses'&& <PriorityClassesTable state={priorityClasses} />}
      {tab === 'pdbs'          && <PDBsTable          state={pdbs}          />}
      {/* Access control */}
      {tab === 'serviceaccounts'      && <ServiceAccountsTable  state={svcAccounts}  />}
      {tab === 'roles'                && <RolesTable             state={roles}        />}
      {tab === 'clusterroles'         && <ClusterRolesTable      state={clusterRoles} />}
      {tab === 'rolebindings'         && <RoleBindingsTable      state={roleBindings} />}
      {tab === 'clusterrolebindings'  && <ClusterRoleBindingsTable state={crBindings} />}
      {/* Helm */}
      {tab === 'helmreleases'         && <HelmReleasesTable      state={helmReleases} />}
      {tab === 'longhorn'      && (
        <LonghornView
          volumes={lhVolumes} nodes={lhNodes}
          subTab={lhSubTab} onSubTab={setLhSubTab}
          onRefresh={() => { loadTab('longhorn', '', true) }}
        />
      )}

      {/* Logs modal */}
      {logsModal && (
        <Modal title={logsModal.pod} subtitle={logsModal.namespace} icon={<ScrollText className="w-4 h-4 text-muted" />}
          onClose={() => { setLogsTail(false); logsWsRef.current?.close(); setLogsModal(null) }}
          headerExtra={
            <div className="flex items-center gap-2">
              {logsModal.containers.length > 1 ? (
                <select className="input text-xs py-0.5 px-2 h-auto" value={logsModal.container} onChange={(e) => switchLogContainer(e.target.value)}>
                  {logsModal.containers.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : logsModal.container ? <span className="text-xs text-muted font-mono">{logsModal.container}</span> : null}
              <button
                onClick={() => setLogsTail((t) => !t)}
                title={logsTail ? 'Stop live tail' : 'Start live tail'}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${logsTail ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-surface-3 text-muted hover:text-gray-300'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${logsTail ? 'bg-green-400 animate-pulse' : 'bg-muted'}`} />
                {logsTail ? 'Live' : 'Tail'}
              </button>
            </div>
          }
          hint={logsTail ? 'streaming live…' : 'last 200 lines'}
        >
          {logsModal.loading ? <ModalLoading label="Loading logs…" /> :
           logsModal.error  ? <ErrorBanner msg={logsModal.error} /> :
           <pre ref={logsPreRef} className="text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-all leading-relaxed overflow-y-auto max-h-full">{logsModal.logs || '(no output)'}</pre>}
        </Modal>
      )}

      {/* Secret data modal */}
      {secretDataModal && (
        <Modal
          title={secretDataModal.name}
          subtitle={secretDataModal.namespace}
          icon={<ShieldCheck className="w-4 h-4 text-muted" />}
          onClose={() => setSecretDataModal(null)}
          wide
        >
          {secretDataModal.loading ? <ModalLoading label="Decoding secret…" /> :
           secretDataModal.error   ? <ErrorBanner msg={secretDataModal.error} /> : (
            <div className="space-y-3 p-1">
              <div className="flex items-start gap-2 p-3 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Secret values are shown decoded. Handle with care — do not share or store insecurely.</span>
              </div>
              {secretDataModal.type && (
                <div className="text-xs text-muted font-mono">Type: {secretDataModal.type}</div>
              )}
              <SecretDataView data={secretDataModal.data} />
            </div>
          )}
        </Modal>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-surface-2 border border-surface-4 rounded-lg shadow-xl w-full max-w-md mx-4 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm">{confirmModal.title}</div>
                <div className="text-xs text-muted mt-1">{confirmModal.message}</div>
                {confirmModal.items && confirmModal.items.length > 0 && (
                  <ul className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
                    {confirmModal.items.map((item) => (
                      <li key={item} className="font-mono text-[11px] text-gray-300 bg-surface-3 rounded px-2 py-0.5 truncate">{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmModal(null)} className="btn-ghost text-xs">Cancel</button>
              <button onClick={confirmModal.onConfirm} className={`text-white text-xs px-3 py-1.5 rounded transition-colors ${confirmModal.confirmClass ?? 'bg-danger hover:bg-danger/80'}`}>{confirmModal.confirmLabel ?? 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Shell modal */}
      {shellModal && (
        <ShellTerminal
          modal={shellModal}
          makeWsUrl={(container, shell) => k8s.execWsUrl(shellModal.namespace, shellModal.pod, container, shell)}
          onClose={() => setShellModal(null)}
          onContainerChange={(c) => setShellModal((m) => m ? { ...m, container: c } : null)}
        />
      )}

      {/* YAML modal */}
      {yamlModal && (
        <Modal
          title={`${yamlModal.kind}/${yamlModal.name}`}
          subtitle={yamlModal.namespace || 'cluster-scoped'}
          icon={<FileCode className="w-4 h-4 text-muted" />}
          onClose={() => setYamlModal(null)}
          wide
          footer={
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-4 flex-shrink-0">
              <div className="text-xs text-muted">Edit and apply changes directly to the cluster</div>
              <div className="flex items-center gap-2">
                {yamlModal.saved && <span className="flex items-center gap-1 text-xs text-green-400"><Check className="w-3.5 h-3.5" />Applied</span>}
                {yamlModal.error && <span className="text-xs text-danger">{yamlModal.error}</span>}
                <button onClick={() => setYamlModal(null)} className="btn-ghost text-xs">Cancel</button>
                <button onClick={applyYaml} disabled={yamlModal.loading || yamlModal.saving} className="btn-primary text-xs">
                  {yamlModal.saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Applying…</> : 'Apply'}
                </button>
              </div>
            </div>
          }
        >
          {yamlModal.loading ? <ModalLoading label="Loading YAML…" /> :
           <textarea
             className="w-full h-full font-mono text-xs text-gray-200 bg-transparent resize-none outline-none leading-relaxed p-1 min-h-[400px]"
             value={yamlModal.yaml}
             onChange={(e) => setYamlModal((m) => m ? { ...m, yaml: e.target.value, saved: false } : null)}
             spellCheck={false}
           />}
        </Modal>
      )}
    </div>
  )
}

// ── Shell terminal ─────────────────────────────────────────────────────────

const SHELL_CANDIDATES = ['/bin/bash', '/bin/sh', '/bin/ash', '/usr/bin/bash', '/usr/bin/sh']

function ShellTerminal({ modal, makeWsUrl, onClose, onContainerChange }: {
  modal: ShellModal
  makeWsUrl: (container: string, shell: string) => string
  onClose: () => void
  onContainerChange: (c: string) => void
}) {
  const termRef    = useRef<HTMLDivElement>(null)
  const xtermRef   = useRef<import('@xterm/xterm').Terminal | null>(null)
  const wsRef      = useRef<WebSocket | null>(null)
  const shellIdx   = useRef(0)
  const hasData    = useRef(false)
  const openedAt   = useRef(0)
  const [activeShell, setActiveShell] = useState(SHELL_CANDIDATES[0])

  useEffect(() => {
    let term: import('@xterm/xterm').Terminal
    let ro: ResizeObserver
    let destroyed = false

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon }  = await import('@xterm/addon-fit')
      // @ts-expect-error css import
      await import('@xterm/xterm/css/xterm.css')

      term = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'monospace', theme: { background: '#0d1117' } })
      const fit = new FitAddon()
      term.loadAddon(fit)
      if (termRef.current) { term.open(termRef.current); fit.fit() }
      xtermRef.current = term

      ro = new ResizeObserver(() => fit.fit())
      if (termRef.current) ro.observe(termRef.current)

      term.onData((data) => { if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(data) })

      function connect(idx: number) {
        if (destroyed) return
        const shell = SHELL_CANDIDATES[idx]
        shellIdx.current = idx
        hasData.current  = false
        openedAt.current = Date.now()
        setActiveShell(shell)

        term.writeln(`\r\x1b[33m⟳ Trying ${shell}…\x1b[0m`)

        const ws = new WebSocket(makeWsUrl(modal.container, shell))
        wsRef.current = ws

        // If no data arrives within 1s of the socket opening, the shell binary
        // likely doesn't exist — close and try the next candidate immediately.
        let noDataTimer: ReturnType<typeof setTimeout> | null = null

        ws.onopen = () => {
          noDataTimer = setTimeout(() => {
            if (!hasData.current && idx + 1 < SHELL_CANDIDATES.length) {
              ws.close()
            }
          }, 1000)
        }

        ws.onmessage = (e: MessageEvent) => {
          if (noDataTimer) { clearTimeout(noDataTimer); noDataTimer = null }
          if (!hasData.current) {
            hasData.current = true
            // Clear the "Trying …" line and show connected
            term.write('\r\x1b[2K')
            term.writeln(`\x1b[32m● ${shell}\x1b[0m`)
          }
          term.write(e.data as string)
        }

        ws.onclose = (ev) => {
          if (noDataTimer) { clearTimeout(noDataTimer); noDataTimer = null }
          const elapsed = Date.now() - openedAt.current
          const quickFail = elapsed < 3000 && !hasData.current

          if (quickFail && idx + 1 < SHELL_CANDIDATES.length) {
            // Shell not found — try next
            connect(idx + 1)
          } else if (!hasData.current && idx + 1 < SHELL_CANDIDATES.length) {
            connect(idx + 1)
          } else if (hasData.current) {
            // Clean session end (user typed exit, or process finished)
            term.writeln('\r\n\x1b[33m● Session ended — closing…\x1b[0m')
            setTimeout(() => { if (!destroyed) onClose() }, 1500)
          } else {
            term.writeln(`\r\x1b[31m● No working shell found (tried ${SHELL_CANDIDATES.slice(0, idx + 1).join(', ')})\x1b[0m`)
          }
        }

        ws.onerror = () => {
          // onclose fires after onerror, so retry logic is there
        }
      }

      connect(0)
    }

    init()

    return () => {
      destroyed = true
      ro?.disconnect()
      wsRef.current?.close()
      xtermRef.current?.dispose()
    }
  }, [modal.namespace, modal.pod, modal.container])  // reconnect when container changes

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#0d1117] border border-surface-4 rounded-lg shadow-xl w-full max-w-5xl mx-4 flex flex-col" style={{ height: '70vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Terminal className="w-4 h-4 text-green-400" />
            <span className="font-semibold text-sm text-white">{modal.pod}</span>
            <span className="text-muted text-xs">{modal.namespace}</span>
            {modal.containers.length > 1 ? (
              <select className="input text-xs py-0.5 px-2 h-auto bg-surface-2" value={modal.container}
                onChange={(e) => { onContainerChange(e.target.value); wsRef.current?.close() }}>
                {modal.containers.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : <span className="text-xs text-muted font-mono">{modal.container}</span>}
            <span className="text-xs text-muted font-mono">{activeShell}</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div ref={termRef} className="flex-1 overflow-hidden p-1" />
      </div>
    </div>
  )
}

// ── Shared modal wrapper ───────────────────────────────────────────────────

function Modal({ title, subtitle, icon, hint, onClose, wide, footer, headerExtra, children }: {
  title: string; subtitle?: string; icon?: React.ReactNode; hint?: string
  onClose: () => void; wide?: boolean; footer?: React.ReactNode
  headerExtra?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className={`bg-surface-2 border border-surface-4 rounded-lg shadow-xl mx-4 flex flex-col ${wide ? 'w-full max-w-5xl' : 'w-full max-w-4xl'}`}
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-4 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {icon}
            <span className="font-semibold text-sm text-white">{title}</span>
            {subtitle && <span className="text-muted text-xs">{subtitle}</span>}
            {headerExtra}
            {hint && <span className="text-muted text-xs">— {hint}</span>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-3">{children}</div>
        {footer}
      </div>
    </div>
  )
}

function ModalLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-muted text-sm py-4">
      <Loader2 className="w-4 h-4 animate-spin" />{label}
    </div>
  )
}

// ── Longhorn view (sub-tabs within Longhorn tab) ───────────────────────────

function LonghornView({ volumes, nodes, subTab, onSubTab, onRefresh }: {
  volumes: TabState<K8sLonghornVolume>; nodes: TabState<K8sLonghornNode>
  subTab: 'volumes' | 'nodes'; onSubTab: (s: 'volumes' | 'nodes') => void
  onRefresh: () => void
}) {
  const isLoading = volumes.loading || nodes.loading

  if (!volumes.loaded && !volumes.loading && !volumes.error && volumes.data.length === 0 &&
      !nodes.loaded && !nodes.loading && !nodes.error && nodes.data.length === 0) {
    return (
      <div className="text-sm text-muted text-center py-12">
        Longhorn CRDs not found — Longhorn may not be installed on this cluster.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-surface-4 w-full">
          {(['volumes', 'nodes'] as const).map((s) => (
            <button key={s} onClick={() => onSubTab(s)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors capitalize ${subTab === s ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-300'}`}>
              {s === 'volumes' ? `Volumes (${volumes.data.length})` : `Nodes (${nodes.data.length})`}
            </button>
          ))}
          <div className="flex-1 flex justify-end pb-1">
            <button onClick={onRefresh} disabled={isLoading} className="btn-ghost text-xs gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />Refresh
            </button>
          </div>
        </div>
      </div>
      {subTab === 'volumes' && <LonghornVolumesTable state={volumes} />}
      {subTab === 'nodes'   && <LonghornNodesTable   state={nodes} />}
    </div>
  )
}

function LonghornVolumesTable({ state }: { state: TabState<K8sLonghornVolume> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'state', label: 'State' },
    { key: 'robustness', label: 'Robustness' }, { key: 'size', label: 'Size' },
    { key: 'replicas', label: 'Replicas' }, { key: 'frontend', label: 'Frontend' },
    { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No Longhorn volumes found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((v) => (
        <tr key={v.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{v.name}</td>
          <td className="px-3 py-2"><LonghornStateBadge state={v.state} /></td>
          <td className="px-3 py-2"><LonghornRobustnessBadge robustness={v.robustness} /></td>
          <td className="px-3 py-2 font-mono text-muted">{fmtBytes(v.size)}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{v.replicas}</td>
          <td className="px-3 py-2 text-muted text-xs">{v.frontend || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(v.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function LonghornNodesTable({ state }: { state: TabState<K8sLonghornNode> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'ready', label: 'Ready' },
    { key: 'schedulable', label: 'Schedulable' }, { key: 'disk_count', label: 'Disks' },
    { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No Longhorn nodes found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((n) => (
        <tr key={n.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{n.name}</td>
          <td className="px-3 py-2">{n.ready ? <span className="badge-ok">Ready</span> : <span className="badge-error">NotReady</span>}</td>
          <td className="px-3 py-2">{n.schedulable ? <span className="badge-ok">Yes</span> : <span className="badge-muted">No</span>}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{n.disk_count}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(n.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── Table components ───────────────────────────────────────────────────────

function NodesTable({ state, onYaml }: { state: TabState<K8sNode>; onYaml: (n: K8sNode) => void }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'status', label: 'Status' },
    { key: 'version', label: 'Version' }, { key: 'internal_ip', label: 'IP' },
    { key: 'os_image', label: 'OS' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No nodes found." cols={cols} sort={sort} onSort={toggle} extraCols={['Roles', '']}>
      {sorted(state.data, sort).map((n) => (
        <tr key={n.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{n.name}</td>
          <td className="px-3 py-2">{n.status === 'Ready' ? <span className="badge-ok">Ready</span> : <span className="badge-error">NotReady</span>}</td>
          <td className="px-3 py-2 font-mono text-muted">{n.version}</td>
          <td className="px-3 py-2 font-mono text-muted">{n.internal_ip || '—'}</td>
          <td className="px-3 py-2 text-muted truncate max-w-[160px]" title={n.os_image}>{n.os_image || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(n.created)}</td>
          <td className="px-3 py-2">
            <div className="flex flex-wrap gap-1">{n.roles.map((r) => <span key={r} className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300">{r}</span>)}</div>
          </td>
          <td className="px-3 py-2"><YamlBtn onClick={() => onYaml(n)} /></td>
        </tr>
      ))}
    </DataTable>
  )
}

function NamespacesTable({ state, actionLoading, onDelete }: {
  state: TabState<K8sNamespace>; actionLoading: string | null
  onDelete: (name: string) => void
}) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [{ key: 'name', label: 'Name' }, { key: 'status', label: 'Status' }, { key: 'created', label: 'Age' }]
  return (
    <DataTable state={state} emptyMsg="No namespaces found." cols={cols} sort={sort} onSort={toggle} extraCols={['']}>
      {sorted(state.data, sort).map((ns) => {
        const delKey = `delete-ns:${ns.name}`
        return (
          <tr key={ns.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
            <td className="px-3 py-2 font-medium text-gray-200">{ns.name}</td>
            <td className="px-3 py-2">{ns.status === 'Active' ? <span className="badge-ok">Active</span> : <span className="badge-muted">{ns.status}</span>}</td>
            <td className="px-3 py-2 text-muted">{fmtAge(ns.created)}</td>
            <td className="px-3 py-2">
              <ActionBtn title="Delete namespace" onClick={() => onDelete(ns.name)} loading={actionLoading === delKey} icon={<Trash2 className="w-3.5 h-3.5" />} hoverColor="hover:text-danger" />
            </td>
          </tr>
        )
      })}
    </DataTable>
  )
}

function PodsTable({ state, actionLoading, onRestart, onLogs, onShell, onYaml, selected, onSelect, onBulkRestart }: {
  state: TabState<K8sPod>; actionLoading: string | null
  onRestart: (ns: string, pod: string) => void
  onLogs:    (ns: string, pod: string) => void
  onShell:   (ns: string, pod: string) => void
  onYaml:    (p: K8sPod) => void
  selected:  Set<string>
  onSelect:  (s: Set<string>) => void
  onBulkRestart: (pods: K8sPod[]) => void
}) {
  const [sort, toggle] = useSort()
  const sortedData = sorted(state.data, sort)
  const allKeys = sortedData.map((p) => `${p.namespace}/${p.name}`)
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k))
  const lastClickedIdx = useRef<number>(-1)

  function toggleAll() {
    if (allSelected) onSelect(new Set())
    else onSelect(new Set(allKeys))
    lastClickedIdx.current = -1
  }

  function toggleOne(key: string, idx: number, shiftKey: boolean) {
    const next = new Set(selected)
    if (shiftKey && lastClickedIdx.current >= 0) {
      const from = Math.min(lastClickedIdx.current, idx)
      const to = Math.max(lastClickedIdx.current, idx)
      const shouldSelect = !selected.has(key)
      for (let i = from; i <= to; i++) {
        shouldSelect ? next.add(allKeys[i]) : next.delete(allKeys[i])
      }
    } else {
      next.has(key) ? next.delete(key) : next.add(key)
    }
    lastClickedIdx.current = idx
    onSelect(next)
  }

  const selectedPodObjs = sortedData.filter((p) => selected.has(`${p.namespace}/${p.name}`))

  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'ready', label: 'Ready' }, { key: 'status', label: 'Status' },
    { key: 'restarts', label: 'Restarts' }, { key: 'node', label: 'Node' },
    { key: 'ip', label: 'IP' }, { key: 'created', label: 'Age' },
  ]
  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 px-3 py-2 rounded bg-accent/10 border border-accent/30 backdrop-blur-sm text-sm">
          <span className="text-accent font-medium">{selected.size} pod{selected.size > 1 ? 's' : ''} selected</span>
          <button onClick={() => onBulkRestart(selectedPodObjs)} disabled={actionLoading === 'bulk-restart'} className="flex items-center gap-1 text-xs bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 px-2 py-1 rounded transition-colors disabled:opacity-50">
            {actionLoading === 'bulk-restart' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}Restart Selected
          </button>
          <button onClick={() => onSelect(new Set())} className="text-xs text-muted hover:text-gray-300 ml-auto">Clear</button>
        </div>
      )}
      <DataTable state={state} emptyMsg="No pods found." cols={cols} sort={sort} onSort={toggle} extraCols={['', '']}
        selectHeader={<th className="px-3 py-2 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer" /></th>}>
        {sortedData.map((p, idx) => {
          const key = `restart:${p.namespace}/${p.name}`
          const podKey = `${p.namespace}/${p.name}`
          const isRunning = p.status === 'Running'
          return (
            <tr key={podKey} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
              <td className="px-3 py-2 w-8"><input type="checkbox" checked={selected.has(podKey)} onChange={(e) => toggleOne(podKey, idx, (e.nativeEvent as MouseEvent).shiftKey)} className="cursor-pointer" /></td>
              <td className="px-3 py-2 font-medium text-gray-200 max-w-[200px] truncate" title={p.name}>{p.name}</td>
              <td className="px-3 py-2"><NsBadge ns={p.namespace} /></td>
              <td className="px-3 py-2 font-mono text-muted">{p.ready}</td>
              <td className="px-3 py-2"><PodStatusBadge status={p.status} /></td>
              <td className="px-3 py-2 text-right font-mono"><span className={p.restarts > 0 ? 'text-warning' : 'text-muted'}>{p.restarts}</span></td>
              <td className="px-3 py-2 text-muted max-w-[140px] truncate" title={p.node}>{p.node || '—'}</td>
              <td className="px-3 py-2 font-mono text-muted">{p.ip || '—'}</td>
              <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(p.created)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <ActionBtn title="View Logs"   onClick={() => onLogs(p.namespace, p.name)}    loading={false}                icon={<ScrollText className="w-3.5 h-3.5" />} hoverColor="hover:text-accent" />
                  {isRunning && <ActionBtn title="Shell" onClick={() => onShell(p.namespace, p.name)} loading={false} icon={<Terminal className="w-3.5 h-3.5" />} hoverColor="hover:text-green-400" />}
                  <ActionBtn title="Restart Pod" onClick={() => onRestart(p.namespace, p.name)} loading={actionLoading === key} icon={<RotateCcw  className="w-3.5 h-3.5" />} hoverColor="hover:text-yellow-400" />
                  <YamlBtn onClick={() => onYaml(p)} />
                </div>
              </td>
            </tr>
          )
        })}
      </DataTable>
    </div>
  )
}

function DeploymentsTable({ state, actionLoading, onScale, onRestart, onYaml }: {
  state: TabState<K8sDeployment>; actionLoading: string | null
  onScale: (ns: string, name: string, current: number, delta: number) => void
  onRestart: (d: K8sDeployment) => void
  onYaml: (d: K8sDeployment) => void
}) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'ready', label: 'Ready' }, { key: 'up_to_date', label: 'Up-to-date' },
    { key: 'available', label: 'Available' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No deployments found." cols={cols} sort={sort} onSort={toggle} extraCols={['Scale', '']}>
      {sorted(state.data, sort).map((d) => {
        const [ready, total] = d.ready.split('/').map(Number)
        const scaleKey = `scale:${d.namespace}/${d.name}`
        const restartKey = `restart-workload:${d.namespace}/${d.name}`
        const scaleBusy = actionLoading === scaleKey
        return (
          <tr key={`${d.namespace}/${d.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
            <td className="px-3 py-2 font-medium text-gray-200">{d.name}</td>
            <td className="px-3 py-2"><NsBadge ns={d.namespace} /></td>
            <td className="px-3 py-2 font-mono"><span className={ready === total && total > 0 ? 'text-green-400' : 'text-warning'}>{d.ready}</span></td>
            <td className="px-3 py-2 font-mono text-muted text-center">{d.up_to_date}</td>
            <td className="px-3 py-2 font-mono text-muted text-center">{d.available}</td>
            <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(d.created)}</td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-1">
                <button disabled={scaleBusy || total <= 0} title="Scale down" onClick={() => onScale(d.namespace, d.name, total, -1)} className="text-muted hover:text-danger transition-colors p-0.5 disabled:opacity-40">
                  {scaleBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Minus className="w-3.5 h-3.5" />}
                </button>
                <span className="font-mono text-xs text-gray-300 w-4 text-center">{total}</span>
                <button disabled={scaleBusy} title="Scale up" onClick={() => onScale(d.namespace, d.name, total, 1)} className="text-muted hover:text-green-400 transition-colors p-0.5 disabled:opacity-40">
                  {scaleBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
                <ActionBtn title="Rollout Restart" onClick={() => onRestart(d)} loading={actionLoading === restartKey} icon={<RotateCcw className="w-3.5 h-3.5" />} hoverColor="hover:text-yellow-400" />
                <YamlBtn onClick={() => onYaml(d)} />
              </div>
            </td>
          </tr>
        )
      })}
    </DataTable>
  )
}

function StatefulSetsTable({ state, actionLoading, onRestart, onYaml }: {
  state: TabState<K8sStatefulSet>; actionLoading: string | null
  onRestart: (s: K8sStatefulSet) => void
  onYaml: (s: K8sStatefulSet) => void
}) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'ready', label: 'Ready' }, { key: 'current_revision', label: 'Revision' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No StatefulSets found." cols={cols} sort={sort} onSort={toggle} extraCols={['']}>
      {sorted(state.data, sort).map((s) => {
        const [ready, total] = s.ready.split('/').map(Number)
        const restartKey = `restart-workload:${s.namespace}/${s.name}`
        return (
          <tr key={`${s.namespace}/${s.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
            <td className="px-3 py-2 font-medium text-gray-200">{s.name}</td>
            <td className="px-3 py-2"><NsBadge ns={s.namespace} /></td>
            <td className="px-3 py-2 font-mono"><span className={ready === total && total > 0 ? 'text-green-400' : 'text-warning'}>{s.ready}</span></td>
            <td className="px-3 py-2 font-mono text-muted">{s.current_revision || '—'}</td>
            <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(s.created)}</td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-1">
                <ActionBtn title="Rollout Restart" onClick={() => onRestart(s)} loading={actionLoading === restartKey} icon={<RotateCcw className="w-3.5 h-3.5" />} hoverColor="hover:text-yellow-400" />
                <YamlBtn onClick={() => onYaml(s)} />
              </div>
            </td>
          </tr>
        )
      })}
    </DataTable>
  )
}

function DaemonSetsTable({ state, actionLoading, onRestart, onYaml }: {
  state: TabState<K8sDaemonSet>; actionLoading: string | null
  onRestart: (d: K8sDaemonSet) => void
  onYaml: (d: K8sDaemonSet) => void
}) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'desired', label: 'Desired' }, { key: 'current', label: 'Current' },
    { key: 'ready', label: 'Ready' }, { key: 'up_to_date', label: 'Up-to-date' },
    { key: 'available', label: 'Available' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No DaemonSets found." cols={cols} sort={sort} onSort={toggle} extraCols={['']}>
      {sorted(state.data, sort).map((d) => {
        const restartKey = `restart-workload:${d.namespace}/${d.name}`
        return (
          <tr key={`${d.namespace}/${d.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
            <td className="px-3 py-2 font-medium text-gray-200">{d.name}</td>
            <td className="px-3 py-2"><NsBadge ns={d.namespace} /></td>
            <td className="px-3 py-2 font-mono text-muted text-center">{d.desired}</td>
            <td className="px-3 py-2 font-mono text-muted text-center">{d.current}</td>
            <td className="px-3 py-2 font-mono text-center"><span className={d.ready === d.desired ? 'text-green-400' : 'text-warning'}>{d.ready}</span></td>
            <td className="px-3 py-2 font-mono text-muted text-center">{d.up_to_date}</td>
            <td className="px-3 py-2 font-mono text-muted text-center">{d.available}</td>
            <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(d.created)}</td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-1">
                <ActionBtn title="Rollout Restart" onClick={() => onRestart(d)} loading={actionLoading === restartKey} icon={<RotateCcw className="w-3.5 h-3.5" />} hoverColor="hover:text-yellow-400" />
                <YamlBtn onClick={() => onYaml(d)} />
              </div>
            </td>
          </tr>
        )
      })}
    </DataTable>
  )
}

function JobsTable({ state }: { state: TabState<K8sJob> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'status', label: 'Status' }, { key: 'completions', label: 'Completions' },
    { key: 'failed', label: 'Failed' }, { key: 'duration', label: 'Duration' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No jobs found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((j) => (
        <tr key={`${j.namespace}/${j.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{j.name}</td>
          <td className="px-3 py-2"><NsBadge ns={j.namespace} /></td>
          <td className="px-3 py-2"><JobStatusBadge status={j.status} /></td>
          <td className="px-3 py-2 font-mono text-muted">{j.completions}</td>
          <td className="px-3 py-2 font-mono text-center">{j.failed > 0 ? <span className="text-danger">{j.failed}</span> : <span className="text-muted">0</span>}</td>
          <td className="px-3 py-2 font-mono text-muted">{j.duration || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(j.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function CronJobsTable({ state }: { state: TabState<K8sCronJob> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'schedule', label: 'Schedule' }, { key: 'last_schedule', label: 'Last Schedule' },
    { key: 'active', label: 'Active' }, { key: 'suspended', label: 'Suspended' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No CronJobs found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((cj) => (
        <tr key={`${cj.namespace}/${cj.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{cj.name}</td>
          <td className="px-3 py-2"><NsBadge ns={cj.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{cj.schedule}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{cj.last_schedule ? fmtAge(cj.last_schedule) + ' ago' : '—'}</td>
          <td className="px-3 py-2 font-mono text-center">{cj.active > 0 ? <span className="text-green-400">{cj.active}</span> : <span className="text-muted">0</span>}</td>
          <td className="px-3 py-2 text-center">{cj.suspended ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/20 text-yellow-300">Suspended</span> : <span className="badge-ok">Active</span>}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(cj.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function ServicesTable({ state, onYaml }: { state: TabState<K8sService>; onYaml: (s: K8sService) => void }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'type', label: 'Type' }, { key: 'cluster_ip', label: 'Cluster IP' },
    { key: 'external_ips', label: 'External IP' }, { key: 'ports', label: 'Ports' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No services found." cols={cols} sort={sort} onSort={toggle} extraCols={['']}>
      {sorted(state.data, sort).map((svc) => (
        <tr key={`${svc.namespace}/${svc.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{svc.name}</td>
          <td className="px-3 py-2"><NsBadge ns={svc.namespace} /></td>
          <td className="px-3 py-2"><SvcTypeBadge type={svc.type} /></td>
          <td className="px-3 py-2 font-mono text-muted">{svc.cluster_ip || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted">{svc.external_ips.join(', ') || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{svc.ports.join(', ') || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(svc.created)}</td>
          <td className="px-3 py-2"><YamlBtn onClick={() => onYaml(svc)} /></td>
        </tr>
      ))}
    </DataTable>
  )
}

function IngressesTable({ state, onYaml }: { state: TabState<K8sIngress>; onYaml: (i: K8sIngress) => void }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'class', label: 'Class' }, { key: 'hosts', label: 'Hosts' },
    { key: 'address', label: 'Address' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No ingresses found." cols={cols} sort={sort} onSort={toggle} extraCols={['']}>
      {sorted(state.data, sort).map((ing) => (
        <tr key={`${ing.namespace}/${ing.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{ing.name}</td>
          <td className="px-3 py-2"><NsBadge ns={ing.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{ing.class || '—'}</td>
          <td className="px-3 py-2 text-xs max-w-[200px]">{ing.hosts.length ? ing.hosts.map((h) => <div key={h} className="font-mono text-muted">{h}</div>) : '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{ing.address.join(', ') || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(ing.created)}</td>
          <td className="px-3 py-2"><YamlBtn onClick={() => onYaml(ing)} /></td>
        </tr>
      ))}
    </DataTable>
  )
}

function IngressClassesTable({ state }: { state: TabState<K8sIngressClass> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'controller', label: 'Controller' },
    { key: 'is_default', label: 'Default' }, { key: 'parameters', label: 'Parameters' },
    { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No IngressClasses found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((ic) => (
        <tr key={ic.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{ic.name}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{ic.controller || '—'}</td>
          <td className="px-3 py-2 text-center">{ic.is_default ? <span className="badge-ok">Yes</span> : <span className="badge-muted">No</span>}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs max-w-[200px] truncate" title={ic.parameters}>{ic.parameters || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(ic.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function HTTPRoutesTable({ state }: { state: TabState<K8sHTTPRoute> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'hostnames', label: 'Hostnames' }, { key: 'parents', label: 'Parent Gateways' },
    { key: 'rules', label: 'Rules' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No HTTPRoutes found — Gateway API may not be installed on this cluster." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((r) => (
        <tr key={`${r.namespace}/${r.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{r.name}</td>
          <td className="px-3 py-2"><NsBadge ns={r.namespace} /></td>
          <td className="px-3 py-2 text-xs max-w-[200px]">{r.hostnames.length ? r.hostnames.map((h) => <div key={h} className="font-mono text-muted">{h}</div>) : '—'}</td>
          <td className="px-3 py-2 text-xs">{r.parents.length ? r.parents.map((p) => <div key={p} className="font-mono text-muted">{p}</div>) : '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{r.rules}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(r.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function PVsTable({ state, onYaml }: { state: TabState<K8sPV>; onYaml: (v: K8sPV) => void }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'capacity', label: 'Capacity' },
    { key: 'access_modes', label: 'Access Modes' }, { key: 'reclaim_policy', label: 'Reclaim' },
    { key: 'status', label: 'Status' }, { key: 'claim', label: 'Claim' },
    { key: 'storage_class', label: 'Storage Class' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No PersistentVolumes found." cols={cols} sort={sort} onSort={toggle} extraCols={['']}>
      {sorted(state.data, sort).map((pv) => (
        <tr key={pv.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{pv.name}</td>
          <td className="px-3 py-2 font-mono text-muted">{pv.capacity || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{pv.access_modes.join(', ') || '—'}</td>
          <td className="px-3 py-2 text-muted text-xs">{pv.reclaim_policy || '—'}</td>
          <td className="px-3 py-2"><PVStatusBadge status={pv.status} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs max-w-[180px] truncate" title={pv.claim}>{pv.claim || '—'}</td>
          <td className="px-3 py-2 text-muted text-xs">{pv.storage_class || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(pv.created)}</td>
          <td className="px-3 py-2"><YamlBtn onClick={() => onYaml(pv)} /></td>
        </tr>
      ))}
    </DataTable>
  )
}

function PVCsTable({ state, onYaml }: { state: TabState<K8sPVC>; onYaml: (v: K8sPVC) => void }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'status', label: 'Status' }, { key: 'volume', label: 'Volume' },
    { key: 'capacity', label: 'Capacity' }, { key: 'access_modes', label: 'Access Modes' },
    { key: 'storage_class', label: 'Storage Class' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No PersistentVolumeClaims found." cols={cols} sort={sort} onSort={toggle} extraCols={['']}>
      {sorted(state.data, sort).map((pvc) => (
        <tr key={`${pvc.namespace}/${pvc.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{pvc.name}</td>
          <td className="px-3 py-2"><NsBadge ns={pvc.namespace} /></td>
          <td className="px-3 py-2"><PVStatusBadge status={pvc.status} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs max-w-[140px] truncate" title={pvc.volume}>{pvc.volume || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted">{pvc.capacity || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{pvc.access_modes.join(', ') || '—'}</td>
          <td className="px-3 py-2 text-muted text-xs">{pvc.storage_class || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(pvc.created)}</td>
          <td className="px-3 py-2"><YamlBtn onClick={() => onYaml(pvc)} /></td>
        </tr>
      ))}
    </DataTable>
  )
}

function ConfigMapsTable({ state, onYaml }: { state: TabState<K8sConfigMap>; onYaml: (c: K8sConfigMap) => void }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [{ key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' }, { key: 'data_count', label: 'Data' }, { key: 'created', label: 'Age' }]
  return (
    <DataTable state={state} emptyMsg="No ConfigMaps found." cols={cols} sort={sort} onSort={toggle} extraCols={['']}>
      {sorted(state.data, sort).map((cm) => (
        <tr key={`${cm.namespace}/${cm.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{cm.name}</td>
          <td className="px-3 py-2"><NsBadge ns={cm.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-center">{cm.data_count}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(cm.created)}</td>
          <td className="px-3 py-2"><YamlBtn onClick={() => onYaml(cm)} /></td>
        </tr>
      ))}
    </DataTable>
  )
}

function SecretsTable({ state, onYaml, onReveal }: { state: TabState<K8sSecret>; onYaml: (s: K8sSecret) => void; onReveal: (s: K8sSecret) => void }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'type', label: 'Type' }, { key: 'data_count', label: 'Data' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No secrets found." cols={cols} sort={sort} onSort={toggle} extraCols={['', '']}>
      {sorted(state.data, sort).map((sec) => (
        <tr key={`${sec.namespace}/${sec.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{sec.name}</td>
          <td className="px-3 py-2"><NsBadge ns={sec.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{sec.type || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{sec.data_count}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(sec.created)}</td>
          <td className="px-3 py-2">
            {sec.data_count > 0 && (
              <button onClick={() => onReveal(sec)} title="View secret data"
                className="text-muted hover:text-yellow-400 transition-colors p-0.5">
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
          </td>
          <td className="px-3 py-2"><YamlBtn onClick={() => onYaml(sec)} /></td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── Shared sortable table wrapper ──────────────────────────────────────────

type ColDef = { key: string; label: string }

function DataTable<T>({ state, cols, emptyMsg, sort, onSort, extraCols = [], selectHeader, children }: {
  state: TabState<T>; cols: ColDef[]; emptyMsg: string
  sort: SortState; onSort: (col: string) => void
  extraCols?: string[]; selectHeader?: React.ReactNode; children: React.ReactNode
}) {
  if (state.error) return <ErrorBanner msg={state.error} />
  if (state.loading && !state.loaded) return <LoadingSpinner />
  if (!state.loading && state.loaded && state.data.length === 0) return <div className="text-sm text-muted text-center py-12">{emptyMsg}</div>
  if (!state.loaded) return null
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-4 text-muted">
            {selectHeader}
            {cols.map((c) => (
              <th key={c.key} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                <button onClick={() => onSort(c.key)} className="flex items-center gap-1 hover:text-gray-300 transition-colors">
                  {c.label}
                  {sort?.col === c.key ? (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                </button>
              </th>
            ))}
            {extraCols.map((c, i) => <th key={i} className="px-3 py-2 text-left font-medium whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

// ── Badge / button helpers ─────────────────────────────────────────────────

function NsBadge({ ns }: { ns: string }) {
  return <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-3 text-muted">{ns}</span>
}

function YamlBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="View/Edit YAML" className="text-muted hover:text-accent transition-colors p-0.5">
      <FileCode className="w-3.5 h-3.5" />
    </button>
  )
}

function ActionBtn({ title, onClick, loading, icon, hoverColor }: {
  title: string; onClick: () => void; loading: boolean; icon: React.ReactNode; hoverColor: string
}) {
  return (
    <button onClick={onClick} disabled={loading} title={title} className={`text-muted ${hoverColor} transition-colors p-0.5`}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
    </button>
  )
}

function PodStatusBadge({ status }: { status: string }) {
  const cls = status === 'Running' ? 'badge-ok' : status === 'Succeeded' ? 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : status === 'Pending' ? 'bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : status === 'Failed' ? 'badge-error' : 'badge-muted'
  return <span className={cls}>{status}</span>
}

function JobStatusBadge({ status }: { status: string }) {
  const cls = status === 'Complete' ? 'badge-ok' : status === 'Failed' ? 'badge-error' : 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium'
  return <span className={cls}>{status}</span>
}

function SvcTypeBadge({ type }: { type: string }) {
  const cls = type === 'LoadBalancer' ? 'bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : type === 'NodePort' ? 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : type === 'ExternalName' ? 'bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : 'badge-muted'
  return <span className={cls}>{type}</span>
}

function PVStatusBadge({ status }: { status: string }) {
  const cls = status === 'Bound' ? 'badge-ok' : status === 'Available' ? 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : status === 'Released' ? 'bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : status === 'Failed' ? 'badge-error' : 'badge-muted'
  return <span className={cls}>{status}</span>
}

function LonghornStateBadge({ state }: { state: string }) {
  const cls = state === 'attached' ? 'badge-ok' : state === 'detached' ? 'badge-muted' : state === 'degraded' ? 'bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : 'badge-error'
  return <span className={cls}>{state || '—'}</span>
}

function LonghornRobustnessBadge({ robustness }: { robustness: string }) {
  const cls = robustness === 'healthy' ? 'badge-ok' : robustness === 'degraded' ? 'bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : robustness ? 'badge-error' : 'badge-muted'
  return <span className={cls}>{robustness || '—'}</span>
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

function toEpochMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    // Accept both epoch seconds and epoch milliseconds.
    return value < 1e12 ? value * 1000 : value
  }
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

function fmtAge(ts: string | number | null | undefined): string {
  const epochMs = toEpochMs(ts)
  if (epochMs === null) return '—'
  const diff = Math.floor((Date.now() - epochMs) / 1000)
  if (diff < 0) return '0s'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d`
  return `${Math.floor(diff / (86400 * 30))}mo`
}

function fmtBytes(raw: string): string {
  // Longhorn sizes come as byte strings like "10737418240"
  const n = parseInt(raw, 10)
  if (isNaN(n) || !raw) return raw || '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(1)} GB`
  return `${(n / 1024 ** 4).toFixed(2)} TB`
}

// ── Cluster Overview Panel ─────────────────────────────────────────────────

function OverviewPanel({ state, onRefresh }: { state: OverviewState; onRefresh: () => void }) {
  if (state.loading) return <LoadingSpinner />
  if (state.error)   return <ErrorBanner msg={state.error} />
  if (!state.data)   return null
  const d = state.data

  const totalPods  = Object.values(d.pod_phases).reduce((a, b) => a + b, 0)
  const runningPods = d.pod_phases['Running'] ?? 0

  return (
    <div className="space-y-4">
      {/* Node cards */}
      <div>
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Nodes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {d.nodes.map((n) => (
            <div key={n.name} className={`card p-3 border-l-2 ${n.status === 'Ready' ? 'border-green-500' : 'border-red-500'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-200 truncate">{n.name}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${n.status === 'Ready' ? 'badge-ok' : 'badge-error'}`}>{n.status}</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {n.roles.map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">{r}</span>
                ))}
              </div>
              <div className="flex gap-3 text-[11px] text-muted font-mono">
                {n.cpu && <span>CPU: {n.cpu}</span>}
                {n.memory && <span>Mem: {fmtK8sMem(n.memory)}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workload + pod summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard label="Pods" value={`${runningPods}/${totalPods}`} sub="running" ok={runningPods === totalPods} />
        {Object.entries(d.workloads).map(([kind, counts]) => (
          <SummaryCard key={kind} label={kind.charAt(0).toUpperCase() + kind.slice(1)} value={`${counts.total}`} sub={`${counts.ready} ready`} ok={counts.ready === counts.total} />
        ))}
        {Object.entries(d.pod_phases).filter(([phase]) => phase !== 'Running').map(([phase, count]) => (
          <SummaryCard key={phase} label={phase} value={String(count)} sub="pods" ok={phase === 'Succeeded'} warn={phase === 'Pending'} />
        ))}
      </div>

      {/* Warning events */}
      <div>
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          Recent Warning Events {d.events.length > 0 && <span className="text-yellow-400">({d.events.length})</span>}
        </h3>
        {d.events.length === 0 ? (
          <div className="text-sm text-muted text-center py-6 card">No warning events — cluster looks healthy.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-4 text-muted">
                  <th className="px-3 py-2 text-left font-medium">Object</th>
                  <th className="px-3 py-2 text-left font-medium">Namespace</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                  <th className="px-3 py-2 text-left font-medium">Message</th>
                  <th className="px-3 py-2 text-right font-medium">Count</th>
                  <th className="px-3 py-2 text-left font-medium">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {d.events.map((ev, i) => (
                  <tr key={i} className="border-b border-surface-4/50 hover:bg-surface-3/30">
                    <td className="px-3 py-2 font-mono text-gray-300 whitespace-nowrap">{ev.object}</td>
                    <td className="px-3 py-2"><NsBadge ns={ev.namespace} /></td>
                    <td className="px-3 py-2 text-yellow-300 whitespace-nowrap">{ev.reason}</td>
                    <td className="px-3 py-2 text-muted max-w-xs truncate" title={ev.message}>{ev.message}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted">{ev.count}</td>
                    <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(ev.last_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, ok, warn }: { label: string; value: string; sub: string; ok?: boolean; warn?: boolean }) {
  const color = ok ? 'text-green-400' : warn ? 'text-yellow-400' : 'text-red-400'
  return (
    <div className="card p-3 text-center">
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs font-medium text-gray-300 mt-0.5">{label}</div>
      <div className="text-[10px] text-muted">{sub}</div>
    </div>
  )
}

function fmtK8sMem(raw: string): string {
  if (!raw) return '—'
  if (raw.endsWith('Ki')) return `${(parseInt(raw) / 1024 / 1024).toFixed(0)} GiB`
  if (raw.endsWith('Mi')) return `${(parseInt(raw) / 1024).toFixed(0)} GiB`
  if (raw.endsWith('Gi')) return `${parseInt(raw)} GiB`
  return raw
}

// ── Certificates Table ─────────────────────────────────────────────────────

function CertificatesTable({ state }: { state: TabState<K8sCertificate> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'issuer_ref', label: 'Issuer' }, { key: 'not_after', label: 'Expires' },
    { key: 'renewal_time', label: 'Renewal' }, { key: 'created', label: 'Age' },
  ]

  if (!state.loading && !state.error && state.loaded && state.data.length === 0) {
    return (
      <div className="card p-6 text-center space-y-2">
        <ShieldCheck className="w-8 h-8 text-muted mx-auto" />
        <div className="text-sm text-muted">No cert-manager Certificates found.</div>
        <div className="text-xs text-muted">cert-manager CRDs may not be installed in this cluster.</div>
      </div>
    )
  }

  return (
    <DataTable state={state} emptyMsg="No certificates found." cols={cols} sort={sort} onSort={toggle} extraCols={['DNS Names']}>
      {sorted(state.data, sort).map((cert) => {
        const expiry = cert.not_after ? new Date(cert.not_after) : null
        const daysLeft = expiry ? Math.floor((expiry.getTime() - Date.now()) / 86400000) : null
        const expiryColor = daysLeft === null ? '' : daysLeft < 7 ? 'text-red-400' : daysLeft < 30 ? 'text-yellow-400' : 'text-green-400'
        return (
          <tr key={`${cert.namespace}/${cert.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
            <td className="px-3 py-2">
              <div className="font-medium text-gray-200">{cert.name}</div>
              <div className="text-[10px] text-muted font-mono">secret: {cert.secret_name}</div>
            </td>
            <td className="px-3 py-2"><NsBadge ns={cert.namespace} /></td>
            <td className="px-3 py-2">
              <div className="text-muted text-xs">{cert.issuer_ref}</div>
              <div className="text-[10px] text-muted">{cert.issuer_kind}</div>
            </td>
            <td className="px-3 py-2">
              {expiry ? (
                <div>
                  <div className={`font-mono text-xs ${expiryColor}`}>{expiry.toLocaleDateString()}</div>
                  {daysLeft !== null && <div className="text-[10px] text-muted">{daysLeft >= 0 ? `${daysLeft}d left` : 'expired'}</div>}
                </div>
              ) : '—'}
            </td>
            <td className="px-3 py-2 text-muted text-xs">
              {cert.renewal_time ? new Date(cert.renewal_time).toLocaleDateString() : '—'}
            </td>
            <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(cert.created)}</td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-1">
                {cert.dns_names.slice(0, 3).map((d) => (
                  <span key={d} className="text-[10px] font-mono px-1 py-0.5 rounded bg-surface-3 text-muted">{d}</span>
                ))}
                {cert.dns_names.length > 3 && <span className="text-[10px] text-muted">+{cert.dns_names.length - 3}</span>}
              </div>
            </td>
          </tr>
        )
      })}
    </DataTable>
  )
}

// ── Secret data view ───────────────────────────────────────────────────────

function SecretDataView({ data }: { data: Record<string, string> }) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setRevealed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const entries = Object.entries(data)
  if (entries.length === 0) return <div className="text-xs text-muted py-4 text-center">No data keys.</div>

  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key} className="rounded border border-surface-4 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-surface-3/50">
            <span className="font-mono text-xs text-gray-300">{key}</span>
            <button
              onClick={() => toggle(key)}
              className="flex items-center gap-1 text-[10px] text-muted hover:text-gray-300 transition-colors"
            >
              {revealed.has(key) ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Reveal</>}
            </button>
          </div>
          {revealed.has(key) && (
            <pre className="px-3 py-2 text-[11px] font-mono text-gray-400 bg-surface-1/50 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{val || '(empty)'}</pre>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Access Control Tables ──────────────────────────────────────────────────

function ServiceAccountsTable({ state }: { state: TabState<K8sServiceAccount> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'secrets', label: 'Secrets' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No service accounts found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((sa) => (
        <tr key={`${sa.namespace}/${sa.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{sa.name}</td>
          <td className="px-3 py-2"><NsBadge ns={sa.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-center">{sa.secrets}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(sa.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function RolesTable({ state }: { state: TabState<K8sRole> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'rules', label: 'Rules' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No roles found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((r) => (
        <tr key={`${r.namespace}/${r.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{r.name}</td>
          <td className="px-3 py-2"><NsBadge ns={r.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-center">{r.rules}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(r.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function ClusterRolesTable({ state }: { state: TabState<K8sClusterRole> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'rules', label: 'Rules' },
    { key: 'aggregation', label: 'Aggregation' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No ClusterRoles found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((cr) => (
        <tr key={cr.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{cr.name}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{cr.rules}</td>
          <td className="px-3 py-2 text-center">{cr.aggregation ? <span className="badge-ok">Yes</span> : <span className="badge-muted">No</span>}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(cr.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function RoleBindingsTable({ state }: { state: TabState<K8sRoleBinding> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'role_ref', label: 'Role' }, { key: 'subjects', label: 'Subjects' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No RoleBindings found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((rb) => (
        <tr key={`${rb.namespace}/${rb.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{rb.name}</td>
          <td className="px-3 py-2"><NsBadge ns={rb.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{rb.role_ref}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{rb.subjects}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(rb.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function ClusterRoleBindingsTable({ state }: { state: TabState<K8sClusterRoleBinding> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'role_ref', label: 'ClusterRole' },
    { key: 'subjects', label: 'Subjects' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No ClusterRoleBindings found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((crb) => (
        <tr key={crb.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{crb.name}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{crb.role_ref}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{crb.subjects}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(crb.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── Helm Releases Table ────────────────────────────────────────────────────

function HelmReleasesTable({ state }: { state: TabState<K8sHelmRelease> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'chart', label: 'Chart' }, { key: 'chart_version', label: 'Version' },
    { key: 'app_version', label: 'App Version' }, { key: 'revision', label: 'Rev' },
    { key: 'status', label: 'Status' }, { key: 'last_deployed', label: 'Deployed' },
  ]
  return (
    <DataTable state={state} emptyMsg="No Helm releases found — Helm may not be used in this cluster." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((r) => (
        <tr key={`${r.namespace}/${r.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{r.name}</td>
          <td className="px-3 py-2"><NsBadge ns={r.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted">{r.chart}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{r.chart_version || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{r.app_version || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{r.revision}</td>
          <td className="px-3 py-2"><HelmStatusBadge status={r.status} /></td>
          <td className="px-3 py-2 text-muted whitespace-nowrap" title={r.last_deployed}>{fmtAge(r.last_deployed)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

function HelmStatusBadge({ status }: { status: string }) {
  const cls = status === 'deployed' ? 'badge-ok'
    : status === 'failed' ? 'badge-error'
    : status === 'pending-install' || status === 'pending-upgrade' || status === 'pending-rollback' ? 'bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded text-[10px] font-medium'
    : status === 'uninstalling' ? 'bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded text-[10px] font-medium'
    : 'badge-muted'
  return <span className={cls}>{status}</span>
}

// ── ReplicaSets Table ──────────────────────────────────────────────────────

function ReplicaSetsTable({ state }: { state: TabState<K8sReplicaSet> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'desired', label: 'Desired' }, { key: 'ready', label: 'Ready' },
    { key: 'owner', label: 'Owner' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No ReplicaSets found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((rs) => (
        <tr key={`${rs.namespace}/${rs.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{rs.name}</td>
          <td className="px-3 py-2"><NsBadge ns={rs.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-center">{rs.desired}</td>
          <td className="px-3 py-2 font-mono text-center">
            <span className={rs.ready === rs.desired && rs.desired > 0 ? 'text-green-400' : rs.desired === 0 ? 'text-muted' : 'text-warning'}>{rs.ready}</span>
          </td>
          <td className="px-3 py-2 text-muted">{rs.owner || '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(rs.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── HPAs Table ─────────────────────────────────────────────────────────────

function HPAsTable({ state }: { state: TabState<K8sHPA> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'target', label: 'Target' }, { key: 'min_replicas', label: 'Min' },
    { key: 'max_replicas', label: 'Max' }, { key: 'current_replicas', label: 'Current' },
    { key: 'cpu_pct', label: 'CPU%' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No HorizontalPodAutoscalers found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((hpa) => (
        <tr key={`${hpa.namespace}/${hpa.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{hpa.name}</td>
          <td className="px-3 py-2"><NsBadge ns={hpa.namespace} /></td>
          <td className="px-3 py-2 text-muted">{hpa.target || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{hpa.min_replicas}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{hpa.max_replicas}</td>
          <td className="px-3 py-2 font-mono text-center">
            <span className={hpa.current_replicas === hpa.desired_replicas ? 'text-green-400' : 'text-warning'}>{hpa.current_replicas}</span>
          </td>
          <td className="px-3 py-2 font-mono text-center text-muted">{hpa.cpu_pct != null ? `${hpa.cpu_pct}%` : '—'}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(hpa.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── Endpoints Table ────────────────────────────────────────────────────────

function EndpointsTable({ state }: { state: TabState<K8sEndpoints> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'addresses', label: 'Addresses' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No Endpoints found." cols={cols} sort={sort} onSort={toggle} extraCols={['Ports']}>
      {sorted(state.data, sort).map((ep) => (
        <tr key={`${ep.namespace}/${ep.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{ep.name}</td>
          <td className="px-3 py-2"><NsBadge ns={ep.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-center">{ep.addresses}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(ep.created)}</td>
          <td className="px-3 py-2 font-mono text-muted">{ep.ports.length > 0 ? ep.ports.join(', ') : '—'}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── NetworkPolicies Table ──────────────────────────────────────────────────

function NetworkPoliciesTable({ state }: { state: TabState<K8sNetworkPolicy> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'pod_selector', label: 'Pod Selector' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No NetworkPolicies found." cols={cols} sort={sort} onSort={toggle} extraCols={['Policy Types']}>
      {sorted(state.data, sort).map((np) => (
        <tr key={`${np.namespace}/${np.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{np.name}</td>
          <td className="px-3 py-2"><NsBadge ns={np.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{np.pod_selector}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(np.created)}</td>
          <td className="px-3 py-2">
            <div className="flex gap-1">
              {np.policy_types.map((t) => (
                <span key={t} className={t === 'Ingress' ? 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : 'bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-medium'}>{t}</span>
              ))}
              {np.policy_types.length === 0 && <span className="text-muted">—</span>}
            </div>
          </td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── StorageClasses Table ───────────────────────────────────────────────────

function StorageClassesTable({ state }: { state: TabState<K8sStorageClass> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'provisioner', label: 'Provisioner' },
    { key: 'reclaim_policy', label: 'Reclaim Policy' }, { key: 'volume_binding_mode', label: 'Binding Mode' },
    { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No StorageClasses found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((sc) => (
        <tr key={sc.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">
            {sc.name}
            {sc.is_default && <span className="ml-1.5 badge-ok text-[10px]">default</span>}
          </td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{sc.provisioner}</td>
          <td className="px-3 py-2 text-muted">{sc.reclaim_policy}</td>
          <td className="px-3 py-2 text-muted">{sc.volume_binding_mode}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(sc.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── CRDs Table ─────────────────────────────────────────────────────────────

function CRDsTable({ state }: { state: TabState<K8sCRD> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'group', label: 'Group' },
    { key: 'kind', label: 'Kind' }, { key: 'scope', label: 'Scope' },
    { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No CustomResourceDefinitions found." cols={cols} sort={sort} onSort={toggle} extraCols={['Versions']}>
      {sorted(state.data, sort).map((crd) => (
        <tr key={crd.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200 max-w-[260px] truncate" title={crd.name}>{crd.name}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{crd.group}</td>
          <td className="px-3 py-2 text-gray-300">{crd.kind}</td>
          <td className="px-3 py-2">
            <span className={crd.scope === 'Namespaced' ? 'badge-muted' : 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium'}>{crd.scope}</span>
          </td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(crd.created)}</td>
          <td className="px-3 py-2 font-mono text-muted text-xs">{crd.versions.join(', ')}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── ResourceQuotas Table ───────────────────────────────────────────────────

function ResourceQuotasTable({ state }: { state: TabState<K8sResourceQuota> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No ResourceQuotas found." cols={cols} sort={sort} onSort={toggle} extraCols={['Resource', 'Used', 'Hard']}>
      {sorted(state.data, sort).flatMap((rq) =>
        rq.limits.length === 0
          ? [(
            <tr key={`${rq.namespace}/${rq.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
              <td className="px-3 py-2 font-medium text-gray-200">{rq.name}</td>
              <td className="px-3 py-2"><NsBadge ns={rq.namespace} /></td>
              <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(rq.created)}</td>
              <td colSpan={3} className="px-3 py-2 text-muted">—</td>
            </tr>
          )]
          : rq.limits.map((lim, i) => (
            <tr key={`${rq.namespace}/${rq.name}/${lim.resource}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
              {i === 0 ? (
                <>
                  <td className="px-3 py-2 font-medium text-gray-200" rowSpan={rq.limits.length}>{rq.name}</td>
                  <td className="px-3 py-2" rowSpan={rq.limits.length}><NsBadge ns={rq.namespace} /></td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap" rowSpan={rq.limits.length}>{fmtAge(rq.created)}</td>
                </>
              ) : null}
              <td className="px-3 py-2 font-mono text-muted text-xs">{lim.resource}</td>
              <td className="px-3 py-2 font-mono text-muted text-xs">{lim.used || '—'}</td>
              <td className="px-3 py-2 font-mono text-muted text-xs">{lim.hard || '—'}</td>
            </tr>
          ))
      )}
    </DataTable>
  )
}

// ── LimitRanges Table ──────────────────────────────────────────────────────

function LimitRangesTable({ state }: { state: TabState<K8sLimitRange> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'limits_count', label: 'Limits' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No LimitRanges found." cols={cols} sort={sort} onSort={toggle} extraCols={['Types']}>
      {sorted(state.data, sort).map((lr) => (
        <tr key={`${lr.namespace}/${lr.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{lr.name}</td>
          <td className="px-3 py-2"><NsBadge ns={lr.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-center">{lr.limits_count}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(lr.created)}</td>
          <td className="px-3 py-2 text-muted text-xs">{lr.limit_types.join(', ') || '—'}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── PriorityClasses Table ──────────────────────────────────────────────────

function PriorityClassesTable({ state }: { state: TabState<K8sPriorityClass> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'value', label: 'Value' },
    { key: 'preemption_policy', label: 'Preemption Policy' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No PriorityClasses found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((pc) => (
        <tr key={pc.name} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">
            {pc.name}
            {pc.global_default && <span className="ml-1.5 badge-ok text-[10px]">default</span>}
          </td>
          <td className="px-3 py-2 font-mono text-gray-300">{pc.value.toLocaleString()}</td>
          <td className="px-3 py-2 text-muted">{pc.preemption_policy}</td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(pc.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}

// ── PodDisruptionBudgets Table ─────────────────────────────────────────────

function PDBsTable({ state }: { state: TabState<K8sPDB> }) {
  const [sort, toggle] = useSort()
  const cols: ColDef[] = [
    { key: 'name', label: 'Name' }, { key: 'namespace', label: 'Namespace' },
    { key: 'min_available', label: 'Min Available' }, { key: 'max_unavailable', label: 'Max Unavailable' },
    { key: 'current_healthy', label: 'Healthy' }, { key: 'expected_pods', label: 'Expected' },
    { key: 'disruptions_allowed', label: 'Allowed Disruptions' }, { key: 'created', label: 'Age' },
  ]
  return (
    <DataTable state={state} emptyMsg="No PodDisruptionBudgets found." cols={cols} sort={sort} onSort={toggle}>
      {sorted(state.data, sort).map((pdb) => (
        <tr key={`${pdb.namespace}/${pdb.name}`} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
          <td className="px-3 py-2 font-medium text-gray-200">{pdb.name}</td>
          <td className="px-3 py-2"><NsBadge ns={pdb.namespace} /></td>
          <td className="px-3 py-2 font-mono text-muted text-center">{pdb.min_available || '—'}</td>
          <td className="px-3 py-2 font-mono text-muted text-center">{pdb.max_unavailable || '—'}</td>
          <td className="px-3 py-2 font-mono text-center">
            <span className={pdb.current_healthy >= pdb.desired_healthy ? 'text-green-400' : 'text-warning'}>{pdb.current_healthy}</span>
          </td>
          <td className="px-3 py-2 font-mono text-muted text-center">{pdb.expected_pods}</td>
          <td className="px-3 py-2 font-mono text-center">
            <span className={pdb.disruptions_allowed > 0 ? 'text-green-400' : 'text-muted'}>{pdb.disruptions_allowed}</span>
          </td>
          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtAge(pdb.created)}</td>
        </tr>
      ))}
    </DataTable>
  )
}
