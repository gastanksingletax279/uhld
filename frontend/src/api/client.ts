const BASE = ''

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      const detail = err.detail
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join('; ')
          : detail != null ? JSON.stringify(detail) : `Request failed: ${res.status}`
      throw new Error(msg)
    }
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }

  if (res.status === 204) return undefined as T

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON but got ${contentType || 'unknown content type'}`)
  }
  return res.json()
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ message: string; user: User } | { requires_totp: true; partial_token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ message: string }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<User>('/api/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  // TOTP 2FA
  totpSetup: () => request<{ secret: string; uri: string }>('/api/auth/totp/setup'),
  totpVerify: (secret: string, code: string) =>
    request<{ message: string }>('/api/auth/totp/verify', {
      method: 'POST',
      body: JSON.stringify({ secret, code }),
    }),
  totpDisable: (code: string) =>
    request<{ message: string }>('/api/auth/totp', {
      method: 'DELETE',
      body: JSON.stringify({ code }),
    }),
  totpLogin: (partialToken: string, code: string) =>
    request<{ message: string; user: User }>('/api/auth/totp/login', {
      method: 'POST',
      body: JSON.stringify({ partial_token: partialToken, code }),
    }),

  // Passkeys (WebAuthn)
  listPasskeys: () => request<{ passkeys: Passkey[] }>('/api/auth/passkeys'),
  deletePasskey: (id: number) =>
    request<{ message: string }>(`/api/auth/passkey/${id}`, { method: 'DELETE' }),
  renamePasskey: (id: number, name: string) =>
    request<{ message: string }>(`/api/auth/passkey/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  passkeyRegisterBegin: () =>
    request<{ challenge_token: string; options: PublicKeyCredentialCreationOptionsJSON }>('/api/auth/passkey/register/begin', { method: 'POST' }),
  passkeyRegisterComplete: (challengeToken: string, credential: RegistrationResponseJSON, name: string) =>
    request<{ message: string; id: number }>('/api/auth/passkey/register/complete', {
      method: 'POST',
      body: JSON.stringify({ challenge_token: challengeToken, credential, name }),
    }),
  passkeyLoginBegin: () =>
    request<{ challenge_token: string; options: PublicKeyCredentialRequestOptionsJSON }>('/api/auth/passkey/login/begin', { method: 'POST' }),
  passkeyLoginComplete: (challengeToken: string, credential: AuthenticationResponseJSON) =>
    request<{ message: string; user: User }>('/api/auth/passkey/login/complete', {
      method: 'POST',
      body: JSON.stringify({ challenge_token: challengeToken, ...credential }),
    }),

  // OAuth providers
  oauthProviders: () => request<{ providers: OAuthProvider[] }>('/api/auth/oauth/providers'),

  // User management (admin only)
  listUsers: () => request<{ users: ManagedUser[] }>('/api/users/'),
  createUser: (username: string, password: string, role: 'admin' | 'viewer') =>
    request<{ message: string; user: ManagedUser }>('/api/users/', {
      method: 'POST',
      body: JSON.stringify({ username, password, role }),
    }),
  updateUser: (id: number, updates: { role?: 'admin' | 'viewer'; is_active?: boolean }) =>
    request<{ message: string }>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  deleteUser: (id: number) =>
    request<void>(`/api/users/${id}`, { method: 'DELETE' }),
  adminResetPassword: (id: number, password: string) =>
    request<{ message: string }>(`/api/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // Plugins
  listPlugins: () => request<PluginListItem[]>('/api/plugins/'),

  getPlugin: (id: string, instanceId = 'default') =>
    request<PluginDetail>(`/api/plugins/${id}?instance_id=${instanceId}`),

  enablePlugin: (id: string, config: Record<string, unknown>, instanceId = 'default', instanceLabel?: string) =>
    request<{ message: string }>(`/api/plugins/${id}/enable`, {
      method: 'POST',
      body: JSON.stringify({ config, instance_id: instanceId, instance_label: instanceLabel }),
    }),

  disablePlugin: (id: string, instanceId = 'default') =>
    request<{ message: string }>(`/api/plugins/${id}/disable?instance_id=${instanceId}`, { method: 'POST' }),

  updatePluginConfig: (id: string, config: Record<string, unknown>, instanceId = 'default', instanceLabel?: string) =>
    request<{ message: string }>(`/api/plugins/${id}/config?instance_id=${instanceId}`, {
      method: 'PUT',
      body: JSON.stringify({ config, instance_label: instanceLabel }),
    }),

  checkPluginHealth: (id: string, instanceId = 'default') =>
    request<{ status: string; message: string }>(`/api/plugins/${id}/health?instance_id=${instanceId}`),

  clearPlugin: (id: string, instanceId = 'default') =>
    request<{ message: string }>(`/api/plugins/${id}/clear?instance_id=${instanceId}`, { method: 'POST' }),

  // Multi-instance management
  listInstances: (id: string) =>
    request<PluginListItem[]>(`/api/plugins/${id}/instances`),

  createInstance: (id: string, instanceId: string, instanceLabel: string | null, config: Record<string, unknown>) =>
    request<{ message: string }>(`/api/plugins/${id}/instances`, {
      method: 'POST',
      body: JSON.stringify({ instance_id: instanceId, instance_label: instanceLabel, config }),
    }),

  deleteInstance: (id: string, instanceId: string) =>
    request<{ message: string }>(`/api/plugins/${id}/instances/${instanceId}`, { method: 'DELETE' }),

  updateInstanceConfig: (id: string, instanceId: string, config: Record<string, unknown>) =>
    request<{ message: string }>(`/api/plugins/${id}/instances/${instanceId}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),

  // Dashboard
  dashboardSummary: () => request<{ plugins: PluginSummary[] }>('/api/dashboard/summary'),

  // Proxmox — instance-aware factory
  proxmox: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/proxmox' : `/api/plugins/proxmox/${instanceId}`
    return {
      nodes: () => request<{ nodes: ProxmoxNode[] }>(`${p}/nodes`),
      allVms: () => request<{ vms: ProxmoxVM[] }>(`${p}/vms`),
      nodeVms: (node: string) => request<{ vms: ProxmoxVM[] }>(`${p}/nodes/${node}/vms`),
      storage: () => request<{ storage: ProxmoxStorage[] }>(`${p}/storage`),
      startVm: (node: string, vmid: number, type = 'qemu') =>
        request<{ task: string }>(`${p}/nodes/${node}/vms/${vmid}/start?vm_type=${type}`, { method: 'POST' }),
      stopVm: (node: string, vmid: number, type = 'qemu') =>
        request<{ task: string }>(`${p}/nodes/${node}/vms/${vmid}/stop?vm_type=${type}`, { method: 'POST' }),
      shutdownVm: (node: string, vmid: number, type = 'qemu') =>
        request<{ task: string }>(`${p}/nodes/${node}/vms/${vmid}/shutdown?vm_type=${type}`, { method: 'POST' }),
      rebootVm: (node: string, vmid: number, type = 'qemu') =>
        request<{ task: string }>(`${p}/nodes/${node}/vms/${vmid}/reboot?vm_type=${type}`, { method: 'POST' }),
      consoleTicket: (node: string, vmid: number, type = 'qemu') =>
        request<{ port: number; host: string; vm_type: string }>(
          `${p}/nodes/${node}/vms/${vmid}/console?vm_type=${type}`, { method: 'POST' }
        ),
      consoleWsUrl: (host: string, port: number) => {
        // Connect directly to Proxmox VNC socket: ws://host:5900+vmid
        const wsProto = host.startsWith('http') || host.startsWith('wss') ? 'ws' : 'ws'
        return `${wsProto}://${host}:${port}`
      },
      nodeRrd: (node: string, timeframe = 'hour') =>
        request<{ rrddata: ProxmoxRrdPoint[] }>(`${p}/nodes/${node}/rrddata?timeframe=${timeframe}`),
      vmRrd: (node: string, vmid: number, type: string, timeframe = 'hour') =>
        request<{ rrddata: ProxmoxRrdPoint[] }>(`${p}/nodes/${node}/${type}/${vmid}/rrddata?timeframe=${timeframe}`),
      vmConfig: (node: string, vmid: number, type: string) =>
        request<Record<string, unknown>>(`${p}/nodes/${node}/${type}/${vmid}/config`),
      clusterResources: () =>
        request<{ resources: ProxmoxResource[] }>(`${p}/cluster/resources`),
      clusterStatus: () =>
        request<{ status: ProxmoxClusterStatusItem[] }>(`${p}/cluster/status`),
    }
  },

  // AdGuard Home — instance-aware factory
  adguard: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/adguard' : `/api/plugins/adguard/${instanceId}`
    return {
      stats: () => request<AdGuardStats>(`${p}/stats`),
      status: () => request<AdGuardStatus>(`${p}/status`),
      querylog: (limit = 100) => request<AdGuardQueryLog>(`${p}/querylog?limit=${limit}`),
      setProtection: (enabled: boolean) =>
        request<{ message: string }>(`${p}/protection`, {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        }),
    }
  },

  // Pi-hole — instance-aware factory
  pihole: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/pihole' : `/api/plugins/pihole/${instanceId}`
    return {
      stats: () => request<PiHoleStats>(`${p}/stats`),
      querylog: (limit = 100) => request<PiHoleQueryLog>(`${p}/querylog?limit=${limit}`),
      setBlocking: (enabled: boolean) =>
        request<{ message: string }>(`${p}/blocking`, {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        }),
    }
  },

  // Tailscale — instance-aware factory
  tailscale: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/tailscale' : `/api/plugins/tailscale/${instanceId}`
    return {
      devices: () => request<{ devices: TailscaleDevice[] }>(`${p}/devices`),
      users:   () => request<{ users: TailscaleUser[] }>(`${p}/users`),
      dns:     () => request<TailscaleDNS>(`${p}/dns`),
      acl:     () => fetch(`${p}/acl`, { credentials: 'include' }).then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.detail ?? 'Failed to load ACL')))
        return r.text()
      }),
      saveAcl: (acl: string) => request<{ message: string }>(`${p}/acl`, {
        method: 'POST',
        body: JSON.stringify({ acl }),
      }),
      validateAcl: (acl: string) => request<{ valid: boolean; message: string; data?: unknown[] }>(`${p}/acl/validate`, {
        method: 'POST',
        body: JSON.stringify({ acl }),
      }),
      keys:     () => request<{ keys: TailscaleKey[] }>(`${p}/keys`),
      tailnetSettings: () => request<TailscaleTailnetSettings>(`${p}/settings`),
      deleteDevice:    (deviceId: string) => request<{ message: string }>(`${p}/devices/${deviceId}`, { method: 'DELETE' }),
      expireDeviceKey: (deviceId: string) => request<{ message: string }>(`${p}/devices/${deviceId}/expire-key`, { method: 'POST' }),
      authorizeDevice: (deviceId: string) => request<{ message: string }>(`${p}/devices/${deviceId}/authorize`, { method: 'POST' }),
      renameDevice:    (deviceId: string, name: string) => request<{ message: string }>(`${p}/devices/${deviceId}/rename`, { method: 'POST', body: JSON.stringify({ name }) }),
      setDeviceIp:     (deviceId: string, ipv4: string) => request<{ message: string }>(`${p}/devices/${deviceId}/set-ip`, { method: 'POST', body: JSON.stringify({ ipv4 }) }),
      setKeyExpiry:    (deviceId: string, disabled: boolean) => request<{ message: string }>(`${p}/devices/${deviceId}/key-expiry`, { method: 'POST', body: JSON.stringify({ disabled }) }),
      getDeviceRoutes: (deviceId: string) => request<TailscaleDeviceRoutes>(`${p}/devices/${deviceId}/routes`),
      setDeviceRoutes: (deviceId: string, routes: string[]) => request<TailscaleDeviceRoutes>(`${p}/devices/${deviceId}/routes`, { method: 'POST', body: JSON.stringify({ routes }) }),
      setDeviceTags:   (deviceId: string, tags: string[]) => request<{ message: string }>(`${p}/devices/${deviceId}/tags`, { method: 'POST', body: JSON.stringify({ tags }) }),
      localStatus: () => request<TailscaleLocalStatus>(`${p}/status`),
    }
  },

  // Docker — instance-aware factory
  docker: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/docker' : `/api/plugins/docker/${instanceId}`
    return {
      info:       () => request<DockerInfo>(`${p}/info`),
      events:     (since?: number) => request<{ events: DockerEvent[] }>(`${p}/events${since ? `?since=${since}` : ''}`),
      containers: () => request<{ containers: DockerContainer[] }>(`${p}/containers`),
      images:     () => request<{ images: DockerImage[] }>(`${p}/images`),
      deleteImage: (id: string, force = false) => request<{ message: string }>(`${p}/images/${encodeURIComponent(id)}${force ? '?force=true' : ''}`, { method: 'DELETE' }),
      networks:   () => request<{ networks: DockerNetwork[] }>(`${p}/networks`),
      volumes:    () => request<{ volumes: DockerVolume[] }>(`${p}/volumes`),
      compose:       () => request<{ projects: DockerComposeProject[] }>(`${p}/compose`),
      composeStart:  (proj: string) => request<{ message: string }>(`${p}/compose/${encodeURIComponent(proj)}/start`,   { method: 'POST' }),
      composeStop:   (proj: string) => request<{ message: string }>(`${p}/compose/${encodeURIComponent(proj)}/stop`,    { method: 'POST' }),
      composeRestart:(proj: string) => request<{ message: string }>(`${p}/compose/${encodeURIComponent(proj)}/restart`, { method: 'POST' }),
      stats:      (id: string) => request<DockerStats>(`${p}/containers/${id}/stats`),
      start:      (id: string) => request<{ message: string }>(`${p}/containers/${id}/start`,   { method: 'POST' }),
      stop:       (id: string) => request<{ message: string }>(`${p}/containers/${id}/stop`,    { method: 'POST' }),
      restart:    (id: string) => request<{ message: string }>(`${p}/containers/${id}/restart`, { method: 'POST' }),
      logs:       (id: string, tail = 100) =>
        fetch(`${p}/containers/${id}/logs?tail=${tail}`, { credentials: 'include' })
          .then((r) => r.ok ? r.text() : r.json().then((e) => Promise.reject(new Error(e.detail ?? 'Failed to load logs')))),
      execWsUrl:  (containerId: string, cmd = '/bin/sh') => {
        const base = p.replace(/^\/api/, '')
        const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        return `${wsProto}://${window.location.host}/api${base}/containers/${encodeURIComponent(containerId)}/exec?cmd=${encodeURIComponent(cmd)}`
      },
      logsWsUrl:  (containerId: string) => {
        const base = p.replace(/^\/api/, '')
        const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        return `${wsProto}://${window.location.host}/api${base}/containers/${encodeURIComponent(containerId)}/logs/stream`
      },
    }
  },

  // Kubernetes — instance-aware factory
  kubernetes: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/kubernetes' : `/api/plugins/kubernetes/${instanceId}`
    const ns = (namespace: string) => namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''
    return {
      // Cluster
      nodes:             ()            => request<{ nodes: K8sNode[] }>(`${p}/nodes`),
      namespaces:        ()            => request<{ namespaces: K8sNamespace[] }>(`${p}/namespaces`),
      // Workloads
      pods:              (namespace = '') => request<{ pods: K8sPod[] }>(`${p}/pods${ns(namespace)}`),
      deployments:       (namespace = '') => request<{ deployments: K8sDeployment[] }>(`${p}/deployments${ns(namespace)}`),
      statefulsets:      (namespace = '') => request<{ statefulsets: K8sStatefulSet[] }>(`${p}/statefulsets${ns(namespace)}`),
      daemonsets:        (namespace = '') => request<{ daemonsets: K8sDaemonSet[] }>(`${p}/daemonsets${ns(namespace)}`),
      jobs:              (namespace = '') => request<{ jobs: K8sJob[] }>(`${p}/jobs${ns(namespace)}`),
      cronjobs:          (namespace = '') => request<{ cronjobs: K8sCronJob[] }>(`${p}/cronjobs${ns(namespace)}`),
      replicaSets:       (namespace = '') => request<{ replicasets: K8sReplicaSet[] }>(`${p}/replicasets${ns(namespace)}`),
      hpas:              (namespace = '') => request<{ hpas: K8sHPA[] }>(`${p}/hpas${ns(namespace)}`),
      // Networking
      services:          (namespace = '') => request<{ services: K8sService[] }>(`${p}/services${ns(namespace)}`),
      ingresses:         (namespace = '') => request<{ ingresses: K8sIngress[] }>(`${p}/ingresses${ns(namespace)}`),
      endpoints:         (namespace = '') => request<{ endpoints: K8sEndpoints[] }>(`${p}/endpoints${ns(namespace)}`),
      networkpolicies:   (namespace = '') => request<{ networkpolicies: K8sNetworkPolicy[] }>(`${p}/networkpolicies${ns(namespace)}`),
      // Storage
      persistentvolumes: ()            => request<{ pvs: K8sPV[] }>(`${p}/persistentvolumes`),
      pvcs:              (namespace = '') => request<{ pvcs: K8sPVC[] }>(`${p}/persistentvolumeclaims${ns(namespace)}`),
      configmaps:        (namespace = '') => request<{ configmaps: K8sConfigMap[] }>(`${p}/configmaps${ns(namespace)}`),
      secrets:           (namespace = '') => request<{ secrets: K8sSecret[] }>(`${p}/secrets${ns(namespace)}`),
      storageclasses:    ()               => request<{ storageclasses: K8sStorageClass[] }>(`${p}/storageclasses`),
      // Cluster extras
      crds:              ()               => request<{ crds: K8sCRD[] }>(`${p}/crds`),
      // Config resources
      resourcequotas:    (namespace = '') => request<{ resourcequotas: K8sResourceQuota[] }>(`${p}/resourcequotas${ns(namespace)}`),
      limitranges:       (namespace = '') => request<{ limitranges: K8sLimitRange[] }>(`${p}/limitranges${ns(namespace)}`),
      priorityclasses:   ()               => request<{ priorityclasses: K8sPriorityClass[] }>(`${p}/priorityclasses`),
      pdbs:              (namespace = '') => request<{ pdbs: K8sPDB[] }>(`${p}/pdbs${ns(namespace)}`),
      // Actions
      podContainers:     (namespace: string, pod: string) =>
        request<{ containers: string[] }>(`${p}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}/containers`),
      podLogs:           (namespace: string, pod: string, container = '', tail = 200) =>
        request<{ logs: string }>(`${p}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}/logs?container=${encodeURIComponent(container)}&tail=${tail}`),
      restartPod:        (namespace: string, pod: string) =>
        request<{ ok: boolean }>(`${p}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}`, { method: 'DELETE' }),
      scaleDeployment:   (namespace: string, name: string, replicas: number) =>
        request<{ replicas: number }>(`${p}/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replicas }),
        }),
      execWsUrl:         (namespace: string, pod: string, container = '', command = '/bin/sh') => {
        const base = p.replace(/^\/api/, '')
        const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const params = new URLSearchParams({ container, command })
        return `${wsProto}://${window.location.host}/api${base}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}/exec?${params}`
      },
      // Networking extras
      httproutes:        (namespace = '') => request<{ httproutes: K8sHTTPRoute[] }>(`${p}/httproutes${ns(namespace)}`),
      ingressclasses:    () => request<{ ingressclasses: K8sIngressClass[] }>(`${p}/ingressclasses`),
      // Longhorn
      longhornVolumes:   () => request<{ volumes: K8sLonghornVolume[] }>(`${p}/longhorn/volumes`),
      longhornNodes:     () => request<{ nodes: K8sLonghornNode[] }>(`${p}/longhorn/nodes`),
      // YAML
      getYaml:           (kind: string, name: string, namespace = '') =>
        request<{ yaml: string }>(`${p}/yaml/${encodeURIComponent(kind)}/${encodeURIComponent(name)}${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`),
      applyYaml:         (yaml: string) =>
        request<{ ok: boolean; kind: string; name: string }>(`${p}/yaml/apply`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yaml }),
        }),
      validateYaml:      (yaml: string) =>
        request<{ ok: boolean; kind: string; name: string; namespace?: string }>(`${p}/yaml/validate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yaml }),
        }),
      // Overview & events
      overview:          () => request<K8sOverview>(`${p}/overview`),
      events:            (namespace = '', warningOnly = false) =>
        request<{ events: K8sEvent[] }>(`${p}/events${namespace || warningOnly ? `?${new URLSearchParams({ ...(namespace ? { namespace } : {}), ...(warningOnly ? { warning_only: 'true' } : {}) })}` : ''}`),
      // Secrets data & certificates
      secretData:        (namespace: string, name: string) =>
        request<{ type: string; data: Record<string, string> }>(`${p}/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/data`),
      certificates:      (namespace = '') => request<{ certificates: K8sCertificate[] }>(`${p}/certificates${ns(namespace)}`),
      // Workload restart
      restartWorkload:   (kind: string, namespace: string, name: string) =>
        request<{ ok: boolean }>(`${p}/${encodeURIComponent(kind)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/restart`, { method: 'POST' }),
      // Namespace delete
      deleteNamespace:   (name: string) =>
        request<{ ok: boolean }>(`${p}/namespaces/${encodeURIComponent(name)}`, { method: 'DELETE' }),
      // Pod detail
      podDetail:         (namespace: string, pod: string) =>
        request<K8sPodDetail>(`${p}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}/detail`),
      // Node maintenance
      cordonNode:        (name: string) =>
        request<{ ok: boolean }>(`${p}/nodes/${encodeURIComponent(name)}/cordon`, { method: 'POST' }),
      uncordonNode:      (name: string) =>
        request<{ ok: boolean }>(`${p}/nodes/${encodeURIComponent(name)}/uncordon`, { method: 'POST' }),
      drainNode:         (name: string) =>
        request<{ ok: boolean; evicted: string[]; skipped: string[]; errors: string[] }>(`${p}/nodes/${encodeURIComponent(name)}/drain`, { method: 'POST' }),
      deleteNode:        (name: string) =>
        request<{ ok: boolean }>(`${p}/nodes/${encodeURIComponent(name)}`, { method: 'DELETE' }),
      // Realtime log stream WS URL
      podLogsStreamWsUrl: (namespace: string, pod: string, container = '') => {
        const base = p.replace(/^\/api/, '')
        const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const params = container ? `?container=${encodeURIComponent(container)}` : ''
        return `${wsProto}://${window.location.host}/api${base}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}/logs/stream${params}`
      },
      // Realtime pod watch WS URL
      podsWatchUrl: (ns = '') => {
        const base = p.replace(/^\/api/, '')
        const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const params = ns ? `?namespace=${encodeURIComponent(ns)}` : ''
        return `${wsProto}://${window.location.host}/api${base}/pods/watch${params}`
      },

      // Access control
      serviceaccounts:       (namespace = '') => request<{ serviceaccounts: K8sServiceAccount[] }>(`${p}/serviceaccounts${ns(namespace)}`),
      roles:                 (namespace = '') => request<{ roles: K8sRole[] }>(`${p}/roles${ns(namespace)}`),
      clusterroles:          ()               => request<{ clusterroles: K8sClusterRole[] }>(`${p}/clusterroles`),
      rolebindings:          (namespace = '') => request<{ rolebindings: K8sRoleBinding[] }>(`${p}/rolebindings${ns(namespace)}`),
      clusterrolebindings:   ()               => request<{ clusterrolebindings: K8sClusterRoleBinding[] }>(`${p}/clusterrolebindings`),
      // Helm
      helmReleases:          (namespace = '') => request<{ releases: K8sHelmRelease[] }>(`${p}/helm/releases${ns(namespace)}`),
      // MetalLB
      metallbOverview:       () => request<K8sMetalLBOverview>(`${p}/metallb/overview`),
      metallbIPAddressPools: () => request<{ ipaddresspools: K8sMetalLBIPAddressPool[] }>(`${p}/metallb/ipaddresspools`),
      metallbL2Advertisements: () => request<{ l2advertisements: K8sMetalLBL2Advertisement[] }>(`${p}/metallb/l2advertisements`),
      metallbBGPAdvertisements: () => request<{ bgpadvertisements: K8sMetalLBBGPAdvertisement[] }>(`${p}/metallb/bgpadvertisements`),
      metallbBGPPeers:       () => request<{ bgppeers: K8sMetalLBBGPPeer[] }>(`${p}/metallb/bgppeers`),
      metallbBFDProfiles:    () => request<{ bfdprofiles: K8sMetalLBBFDProfile[] }>(`${p}/metallb/bfdprofiles`),
      metallbCommunities:    () => request<{ communities: K8sMetalLBCommunity[] }>(`${p}/metallb/communities`),
      // etcd
      etcdStatus:            () => request<K8sEtcdStatus>(`${p}/etcd/status`),
    }
  },

  // UniFi — instance-aware factory
  unifi: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/unifi' : `/api/plugins/unifi/${instanceId}`
    return {
      clients: () => request<{ clients: UniFiClient[] }>(`${p}/clients`),
      kickClient: (clientId: string) =>
        request<{ message: string }>(`${p}/clients/${encodeURIComponent(clientId)}/kick`, { method: 'POST' }),
      devices: () => request<{ devices: UniFiDevice[] }>(`${p}/devices`),
      ports: () => request<{ ports: UniFiPort[] }>(`${p}/ports`),
      networks: () => request<{ networks: UniFiNetwork[] }>(`${p}/networks`),
      wlans: () => request<{ wlans: UniFiWlan[] }>(`${p}/wlans`),
      firewall: () => request<{ rules: UniFiFirewallRule[]; groups: UniFiFirewallGroup[]; zones: UniFiZone[] }>(`${p}/firewall`),
    }
  },

  // Asset Inventory — instance-aware factory
  assets: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/assets' : `/api/plugins/assets/${instanceId}`
    return {
      list:    () => request<{ assets: AssetItem[] }>(`${p}/assets`),
      create:  (body: Omit<AssetItem, 'id' | 'created_at' | 'updated_at'>) =>
        request<AssetItem>(`${p}/assets`, { method: 'POST', body: JSON.stringify(body) }),
      update:  (id: number, body: Omit<AssetItem, 'id' | 'created_at' | 'updated_at'>) =>
        request<AssetItem>(`${p}/assets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
      remove:  (id: number) =>
        request<void>(`${p}/assets/${id}`, { method: 'DELETE' }),
      summary: () => request<{ total: number; by_type: Record<string, number> }>(`${p}/assets/summary`),
    }
  },

  // Network Tools — instance-aware factory
  networkTools: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/network_tools' : `/api/plugins/network_tools/${instanceId}`
    return {
      tools: () => request<{ tools: Array<{ id: string; available: boolean }> }>(`${p}/tools`),
      ping: (host: string, count = 4) =>
        request<CommandResult>(`${p}/ping`, { method: 'POST', body: JSON.stringify({ host, count }) }),
      traceroute: (host: string, max_hops = 20) =>
        request<CommandResult>(`${p}/traceroute`, { method: 'POST', body: JSON.stringify({ host, max_hops }) }),
      dns: (query: string, record_type = 'A') =>
        request<CommandResult>(`${p}/dns`, { method: 'POST', body: JSON.stringify({ query, record_type }) }),
      whois: (query: string) =>
        request<CommandResult>(`${p}/whois`, { method: 'POST', body: JSON.stringify({ query }) }),
      speedtest: () =>
        request<{ command: string; result: Record<string, unknown>; stdout: string; stderr: string; exit_code: number }>(`${p}/speedtest`, { method: 'POST', body: JSON.stringify({}) }),
      speedtestHistory: () => request<{ items: Record<string, unknown>[] }>(`${p}/speedtest/history`),
    }
  },

  // Remote tcpdump — instance-aware factory
  remoteTcpdump: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/remote_tcpdump' : `/api/plugins/remote_tcpdump/${instanceId}`
    return {
      info: () => request<{ ssh_host: string | null; ssh_user: string | null; ssh_port: number }>(`${p}/info`),
      run: (body: TcpdumpCaptureOptions) =>
        request<CommandResult>(`${p}/capture/run`, { method: 'POST', body: JSON.stringify(body) }),
      streamUrl: p + '/capture/stream',
      pcapUrl: p + '/capture/pcap',
      interfaces: (remote = true) => request<{ interfaces: string[] }>(`${p}/interfaces?remote=${remote}`),
      list: () => request<{ items: TcpdumpCaptureItem[] }>(`${p}/captures`),
      get: (id: string) => request<TcpdumpCaptureItem>(`${p}/captures/${id}`),
      deleteCapture: (id: string) => request<{ ok: boolean }>(`${p}/captures/${id}`, { method: 'DELETE' }),
    }
  },

  // LLM Assistant — instance-aware factory
  llmAssistant: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/llm_assistant' : `/api/plugins/llm_assistant/${instanceId}`
    return {
      listModels: () => request<{ models: LlmModel[] }>(`${p}/models`),
      chat: (messages: Array<{ role: string; content: string }>, model?: string, temperature?: number) =>
        request<{ reply: string; raw: Record<string, unknown> }>(`${p}/chat`, { 
          method: 'POST', 
          body: JSON.stringify({ messages, model, temperature }) 
        }),
    }
  },

  // Nginx Proxy Manager — instance-aware factory
  nginxProxyManager: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/nginx_proxy_manager' : `/api/plugins/nginx_proxy_manager/${instanceId}`
    return {
      listHosts: () => request<{ items: NpmProxyHost[] }>(`${p}/proxy-hosts`),
      getHost: (id: number) => request<{ item: NpmProxyHost }>(`${p}/proxy-hosts/${id}`),
      createHost: (body: Record<string, unknown>) => request<{ item: NpmProxyHost }>(`${p}/proxy-hosts`, { method: 'POST', body: JSON.stringify(body) }),
      updateHost: (id: number, body: Record<string, unknown>) => request<{ item: NpmProxyHost }>(`${p}/proxy-hosts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
      enableHost: (id: number) => request<{ item: NpmProxyHost }>(`${p}/proxy-hosts/${id}/enable`, { method: 'POST' }),
      disableHost: (id: number) => request<{ item: NpmProxyHost }>(`${p}/proxy-hosts/${id}/disable`, { method: 'POST' }),
      deleteHost: (id: number) => request<{ message: string }>(`${p}/proxy-hosts/${id}`, { method: 'DELETE' }),
      listCertificates: () => request<{ items: NpmCertificate[] }>(`${p}/certificates`),
      getCertificate: (id: number) => request<{ item: NpmCertificate }>(`${p}/certificates/${id}`),
      createCertificate: (body: Record<string, unknown>) => request<{ item: NpmCertificate }>(`${p}/certificates`, { method: 'POST', body: JSON.stringify(body) }),
      updateCertificate: (id: number, body: Record<string, unknown>) => request<{ item: NpmCertificate }>(`${p}/certificates/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
      deleteCertificate: (id: number) => request<{ message: string }>(`${p}/certificates/${id}`, { method: 'DELETE' }),
      listAccessLists: () => request<{ items: NpmAccessList[] }>(`${p}/access-lists`),
    }
  },

  // Cloudflare — instance-aware factory
  cloudflare: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/cloudflare' : `/api/plugins/cloudflare/${instanceId}`
    return {
      zones: () => request<{ zones: CloudflareZone[]; cache_updated_at?: string }>(`${p}/zones`),
      zone: (zoneId: string) => request<{ zone: CloudflareZoneDetail }>(`${p}/zones/${encodeURIComponent(zoneId)}`),
      pauseZone: (zoneId: string) => request<{ status: string }>(`${p}/zones/${encodeURIComponent(zoneId)}/pause`, { method: 'POST' }),
      unpauseZone: (zoneId: string) => request<{ status: string }>(`${p}/zones/${encodeURIComponent(zoneId)}/unpause`, { method: 'POST' }),
      purgeCache: (zoneId: string) => request<{ status: string }>(`${p}/zones/${encodeURIComponent(zoneId)}/purge-cache`, { method: 'POST' }),

      dnsRecords: (zoneId: string, type?: string, name?: string) => {
        const q = new URLSearchParams()
        if (type) q.set('type', type)
        if (name) q.set('name', name)
        return request<{ records: CloudflareDnsRecord[] }>(`${p}/zones/${encodeURIComponent(zoneId)}/dns-records${q.toString() ? `?${q.toString()}` : ''}`)
      },
      dnsRecord: (zoneId: string, recordId: string) =>
        request<{ record: CloudflareDnsRecord }>(`${p}/zones/${encodeURIComponent(zoneId)}/dns-records/${encodeURIComponent(recordId)}`),
      createDnsRecord: (zoneId: string, body: CloudflareDnsRecordInput) =>
        request<{ record: CloudflareDnsRecord }>(`${p}/zones/${encodeURIComponent(zoneId)}/dns-records`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      updateDnsRecord: (zoneId: string, recordId: string, body: CloudflareDnsRecordInput) =>
        request<{ record: CloudflareDnsRecord }>(`${p}/zones/${encodeURIComponent(zoneId)}/dns-records/${encodeURIComponent(recordId)}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        }),
      deleteDnsRecord: (zoneId: string, recordId: string) =>
        request<{ status: string }>(`${p}/zones/${encodeURIComponent(zoneId)}/dns-records/${encodeURIComponent(recordId)}`, {
          method: 'DELETE',
        }),

      analytics: (zoneId: string, range: '24h' | '7d' | '30d') =>
        request<{ analytics: CloudflareAnalytics }>(`${p}/zones/${encodeURIComponent(zoneId)}/analytics?range=${encodeURIComponent(range)}`),
      settings: (zoneId: string) => request<{ settings: CloudflareZoneSettings }>(`${p}/zones/${encodeURIComponent(zoneId)}/settings`),
      patchSetting: (zoneId: string, setting: string, body: { value?: unknown; enabled?: boolean }) =>
        request<{ setting: unknown }>(`${p}/zones/${encodeURIComponent(zoneId)}/settings/${encodeURIComponent(setting)}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }),
      ssl: (zoneId: string) => request<CloudflareSslPayload>(`${p}/zones/${encodeURIComponent(zoneId)}/ssl`),
      firewallRules: (zoneId: string) =>
        request<{ rules: CloudflareFirewallRule[]; upgrade_required?: boolean; message?: string }>(`${p}/zones/${encodeURIComponent(zoneId)}/firewall/rules`),
    }
  },

  // Tasks/Incidents — instance-aware factory (upgraded to full incident management)
  tasksIncidents: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/tasks_incidents' : `/api/plugins/tasks_incidents/${instanceId}`
    return {
      list: (kind?: string, status?: string) => {
        const qs = new URLSearchParams()
        if (kind) qs.append('kind', kind)
        if (status) qs.append('status', status)
        return request<{ items: TaskIncidentItem[] }>(`${p}/items${qs.toString() ? `?${qs.toString()}` : ''}`)
      },
      get: (id: number) =>
        request<{ item: TaskIncidentItem }>(`${p}/items/${id}`),
      create: (body: {
        title: string
        kind?: string
        severity?: string
        status?: string
        priority?: string
        description?: string
        affected_systems?: string[]
        impact?: string
        assignees?: string[]
        due_date?: string
      }) =>
        request<{ item: TaskIncidentItem }>(`${p}/items`, { method: 'POST', body: JSON.stringify(body) }),
      update: (id: number, body: Partial<TaskIncidentItem>) =>
        request<{ item: TaskIncidentItem }>(`${p}/items/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
      addComment: (id: number, text: string, kind?: string) =>
        request<{ comment: IncidentComment }>(`${p}/items/${id}/comments`, {
          method: 'POST',
          body: JSON.stringify({ text, kind: kind || 'comment' }),
        }),
      remove: (id: number) => request<{ message: string }>(`${p}/items/${id}`, { method: 'DELETE' }),
      summary: () =>
        request<{
          total: number
          by_kind: Record<string, number>
          by_status: Record<string, number>
          critical_open: number
          open_count: number
        }>(`${p}/summary`),
    }
  },

  // Patch Panel — instance-aware factory
  patchPanel: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/patch_panel' : `/api/plugins/patch_panel/${instanceId}`
    return {
      list: () => request<{ items: PatchPanelLink[] }>(`${p}/links`),
      create: (body: Omit<PatchPanelLink, 'id' | 'created_at' | 'updated_at'>) =>
        request<{ item: PatchPanelLink }>(`${p}/links`, { method: 'POST', body: JSON.stringify(body) }),
      update: (id: number, body: Partial<PatchPanelLink>) =>
        request<{ item: PatchPanelLink }>(`${p}/links/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
      remove: (id: number) => request<{ message: string }>(`${p}/links/${id}`, { method: 'DELETE' }),
      summary: () => request<{ total_links: number; panels: number; devices: number }>(`${p}/summary`),
    }
  },

  // Plex Media Server — instance-aware factory
  plex: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/plex' : `/api/plugins/plex/${instanceId}`
    return {
      // Server & Health
      getStatus: () => request<Record<string, unknown>>(`${p}/status`),
      getHealth: () => request<Record<string, unknown>>(`${p}/health`),
      // Sessions (Active Streams)
      getSessions: () => request<{ sessions: any[] }>(`${p}/sessions`),
      terminateSession: (sessionId: string, reason = 'Terminated by UHLD') =>
        request<{ status: string; message: string }>(`${p}/sessions/${encodeURIComponent(sessionId)}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' }),
      pauseSession: (sessionId: string) =>
        request<{ status: string; message: string }>(`${p}/sessions/${encodeURIComponent(sessionId)}/pause`, { method: 'POST' }),
      resumeSession: (sessionId: string) =>
        request<{ status: string; message: string }>(`${p}/sessions/${encodeURIComponent(sessionId)}/resume`, { method: 'POST' }),
      stopSession: (sessionId: string) =>
        request<{ status: string; message: string }>(`${p}/sessions/${encodeURIComponent(sessionId)}/stop`, { method: 'POST' }),
      seekSession: (sessionId: string, offset: number) =>
        request<{ status: string; message: string }>(`${p}/sessions/${encodeURIComponent(sessionId)}/seek?offset=${offset}`, { method: 'POST' }),
      // Libraries
      getLibraries: () => request<{ libraries: any[] }>(`${p}/libraries`),
      scanLibrary: (libraryId: string) =>
        request<{ status: string; message: string }>(`${p}/libraries/${encodeURIComponent(libraryId)}/scan`, { method: 'POST' }),
      refreshLibrary: (libraryId: string) =>
        request<{ status: string; message: string }>(`${p}/libraries/${encodeURIComponent(libraryId)}/refresh`, { method: 'POST' }),
      // Media Items
      getLibraryItems: (libraryId: string, start = 0, size = 50, sort = 'addedAt:desc') =>
        request<{ items: any[]; total: number; offset: number; size: number }>(`${p}/libraries/${encodeURIComponent(libraryId)}/items?start=${start}&size=${size}&sort=${encodeURIComponent(sort)}`),
      getItemDetail: (ratingKey: string) =>
        request<Record<string, unknown>>(`${p}/items/${encodeURIComponent(ratingKey)}`),
      refreshItem: (ratingKey: string) =>
        request<{ status: string; message: string }>(`${p}/items/${encodeURIComponent(ratingKey)}/refresh`, { method: 'POST' }),
      deleteItem: (ratingKey: string) =>
        request<{ status: string; message: string }>(`${p}/items/${encodeURIComponent(ratingKey)}`, { method: 'DELETE' }),
      playItem: (ratingKey: string) =>
        request<{ status: string; play_url: string; duration: number; title: string; type: string }>(`${p}/items/${encodeURIComponent(ratingKey)}/play`, { method: 'POST' }),
      // TV Shows (Seasons & Episodes)
      getShowSeasons: (ratingKey: string) =>
        request<{ seasons: any[] }>(`${p}/shows/${encodeURIComponent(ratingKey)}/seasons`),
      getSeasonEpisodes: (ratingKey: string) =>
        request<{ episodes: any[] }>(`${p}/seasons/${encodeURIComponent(ratingKey)}/episodes`),
      // Dashboard
      getRecentlyAdded: (limit = 20) =>
        request<{ items: any[] }>(`${p}/recently-added?limit=${limit}`),
      getOnDeck: (limit = 20) =>
        request<{ items: any[] }>(`${p}/on-deck?limit=${limit}`),
      // Users
      getUsers: () => request<{ users: any[] }>(`${p}/users`),
      // Updates
      checkUpdates: () => request<Record<string, unknown>>(`${p}/updates`),
    }
  },

  // Settings
  getSettings: () => request<SettingItem[]>('/api/settings/'),

  updateSettings: (items: SettingItem[]) =>
    request<{ message: string }>('/api/settings/', {
      method: 'PUT',
      body: JSON.stringify(items),
    }),

  // Notifications plugin — instance-aware factory
  notifications: (instanceId = 'default') => {
    const p = instanceId === 'default' ? '/api/plugins/notifications' : `/api/plugins/notifications/${instanceId}`
    return {
      getHistory: (limit = 50, offset = 0, level?: string, unreadOnly = false) =>
        request<{ total: number; items: NotificationItem[] }>(
          `${p}/history?limit=${limit}&offset=${offset}${level ? `&level=${level}` : ''}${unreadOnly ? '&unread_only=true' : ''}`
        ),
      markRead: (ids: number[] | null) =>
        request<{ message: string }>(`${p}/mark-read`, {
          method: 'POST',
          body: JSON.stringify({ ids }),
        }),
      clearHistory: () => request<{ message: string }>(`${p}/history`, { method: 'DELETE' }),
      testChannel: (channel: string) =>
        request<{ message: string }>(`${p}/test/${channel}`, { method: 'POST' }),
    }
  },

  // Version
  version: () => request<{ version: string; github_repo: string }>('/api/version'),

  // User menu structure
  getMenuStructure: () => request<{ menu_structure: string | null }>('/api/users/me/menu-structure'),
  updateMenuStructure: (menuStructure: string) =>
    request<{ message: string }>('/api/users/me/menu-structure', {
      method: 'PUT',
      body: JSON.stringify({ menu_structure: menuStructure }),
    }),

  // Backup
  backup: {
    list: () => request<BackupInfo[]>('/api/backup/'),
    create: () => request<BackupInfo>('/api/backup/', { method: 'POST' }),
    delete: (filename: string) => request<{ message: string }>(`/api/backup/${filename}`, { method: 'DELETE' }),
    restore: async (file: File): Promise<{ message: string }> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail))
      }
      return res.json()
    },
    getSchedule: () => request<BackupSchedule>('/api/backup/schedule'),
    updateSchedule: (body: BackupSchedule) =>
      request<{ message: string }>('/api/backup/schedule', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
  },
}

// --- Types ---

// WebAuthn JSON types (browser credential types are opaque objects; we pass them as-is)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PublicKeyCredentialCreationOptionsJSON = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RegistrationResponseJSON = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PublicKeyCredentialRequestOptionsJSON = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthenticationResponseJSON = Record<string, any>

export interface User {
  id: number
  username: string
  is_admin: boolean
  role: 'admin' | 'viewer'
  totp_enabled: boolean
  needs_setup: boolean
}

export interface ManagedUser {
  id: number
  username: string
  is_admin: boolean
  role: 'admin' | 'viewer'
  is_active: boolean
  totp_enabled: boolean
}

export interface OAuthProvider {
  id: string
  name: string
}

export interface Passkey {
  id: number
  name: string
  aaguid: string | null
  created_at: string | null
  last_used: string | null
}

export interface PluginListItem {
  plugin_id: string
  instance_id: string
  instance_label: string | null
  display_name: string
  description: string
  version: string
  icon: string
  category: string
  enabled: boolean
  health_status: string | null
  health_message: string | null
  poll_interval: number
}

export interface PluginDetail extends PluginListItem {
  config_schema: Record<string, unknown>
  config: Record<string, unknown> | null
}

export interface PluginSummary {
  plugin_id: string
  instance_id: string
  status: string
  [key: string]: unknown
}

export interface CommandResult {
  command?: string
  exit_code: number
  stdout: string
  stderr: string
}

export interface TcpdumpCaptureOptions {
  interface: string
  packet_count?: number | null
  duration_seconds?: number | null
  filter?: string
  remote?: boolean
  snaplen?: number
  ascii_output?: boolean
  hex_ascii_output?: boolean
  verbosity?: number
  print_ethernet?: boolean
  timestamp_format?: string
}

export interface TcpdumpCaptureItem {
  id: string
  created_at: string
  mode?: string
  interface?: string
  packet_count?: number
  duration_seconds?: number
  filter?: string
  command?: string
  exit_code?: number
  stdout?: string
  stderr?: string
  stdout_preview?: string
  stderr_preview?: string
}

export interface LlmModel {
  id: string
  [key: string]: unknown
}

export interface NpmProxyHost {
  id: number
  domain_names?: string[]
  forward_host?: string
  forward_port?: number
  enabled?: number | boolean
  certificate_id?: number
  ssl_forced?: number | boolean
  http2_support?: number | boolean
  block_exploits?: number | boolean
  access_list_id?: number | string
  advanced_config?: string
  allow_websocket_upgrade?: number | boolean
  meta?: {
    letsencrypt_agree?: boolean
    dns_challenge?: boolean
  }
  certificate?: NpmCertificate
  access_list?: { name?: string }
  [key: string]: unknown
}

export interface NpmCertificate {
  id: number
  provider?: string
  nice_name?: string
  domain_names?: string[]
  expires_on?: string
  [key: string]: unknown
}

export interface NpmAccessList {
  id: number
  name?: string
  satisfy_any?: number | boolean
  [key: string]: unknown
}

export interface CloudflareZone {
  id: string
  name: string
  status: string
  plan: string
  nameservers: string[]
  paused: boolean
  modified_on?: string
}

export interface CloudflareZoneDetail extends CloudflareZone {
  raw?: Record<string, unknown>
}

export interface CloudflareDnsRecord {
  id: string
  type: string
  name: string
  content?: string
  ttl?: number
  proxied?: boolean
  created_on?: string
  modified_on?: string
  priority?: number
  comment?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface CloudflareDnsRecordInput {
  type: string
  name: string
  content?: string
  ttl?: number
  proxied?: boolean
  comment?: string
  priority?: number
  data?: Record<string, unknown>
}

export interface CloudflareAnalytics {
  range: '24h' | '7d' | '30d'
  requests: number
  bandwidth: number
  threats: number
  page_views: number
  cached_requests: number
  uncached_requests: number
  series?: Array<{ label: string; requests: number; cached: number; uncached: number }>
  raw?: Record<string, unknown>
  analytics_unavailable?: boolean
}

export interface CloudflareZoneSettingValue {
  id?: string
  value?: unknown
  editable?: boolean
  modified_on?: string
  [key: string]: unknown
}

export interface CloudflareZoneSettings {
  ssl?: CloudflareZoneSettingValue
  always_use_https?: CloudflareZoneSettingValue
  strict_transport_security?: CloudflareZoneSettingValue
  security_level?: CloudflareZoneSettingValue
  cache_level?: CloudflareZoneSettingValue
  development_mode?: CloudflareZoneSettingValue
  minify?: CloudflareZoneSettingValue
  brotli?: CloudflareZoneSettingValue
  http2?: CloudflareZoneSettingValue
  http3?: CloudflareZoneSettingValue
  [key: string]: CloudflareZoneSettingValue | undefined
}

export interface CloudflareFirewallRule {
  id: string
  description?: string
  action?: string
  paused?: boolean
  filter?: Record<string, unknown>
  [key: string]: unknown
}

export interface CloudflareSslPayload {
  ssl_mode?: Record<string, unknown>
  universal_ssl?: Record<string, unknown>
  edge_certificates?: Array<Record<string, unknown>>
}

export interface IncidentComment {
  id: number
  author: string
  kind: 'comment' | 'status_change' | 'assignment' | 'creation' | 'note'
  text: string
  timestamp: string
}

export interface TaskIncidentItem {
  id: number
  number?: string
  title: string
  kind: 'task' | 'incident' | 'request'
  severity?: 'critical' | 'high' | 'medium' | 'low'
  status: 'new' | 'assigned' | 'investigating' | 'resolved' | 'closed' | 'open'
  priority: 'low' | 'medium' | 'high'
  description?: string
  affected_systems?: string[]
  impact?: string
  assignees?: string[]
  assignee?: string | null
  due_date?: string | null
  notes?: string | null
  comments?: IncidentComment[]
  created_at?: string
  updated_at?: string
}

export interface PatchPanelLink {
  id: number
  panel: string
  panel_port: string
  device: string
  device_port: string
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface SettingItem {
  key: string
  value: string | null
}

// --- Proxmox types ---

export interface ProxmoxRrdPoint {
  time: number
  cpu?: number
  mem?: number
  maxmem?: number
  netin?: number
  netout?: number
  diskread?: number
  diskwrite?: number
  maxcpu?: number
  [key: string]: number | undefined
}

export interface ProxmoxClusterStatusItem {
  type: 'cluster' | 'node'
  id: string
  name?: string
  quorate?: number   // 1 = quorate
  nodes?: number
  version?: number
  ip?: string
  online?: number    // 1 = online
  local?: number     // 1 = this is the local node
  nodeid?: number
}

export interface ProxmoxResource {
  id: string
  type: 'node' | 'vm' | 'qemu' | 'lxc' | 'storage' | 'pool' | 'sdn' | 'cluster' | string
  node?: string
  vmid?: number
  name?: string
  status?: string
  cpu?: number
  maxcpu?: number
  mem?: number
  maxmem?: number
  disk?: number
  maxdisk?: number
  uptime?: number
  pool?: string
}

export interface ProxmoxNode {
  node: string
  status: string
  cpu: number       // fraction 0–1
  maxcpu: number
  mem: number       // bytes
  maxmem: number    // bytes
  disk: number      // bytes
  maxdisk: number   // bytes
  uptime: number    // seconds
}

export interface ProxmoxVM {
  vmid: number
  name: string
  status: string    // "running" | "stopped" | "paused"
  type: string      // "qemu" | "lxc"
  node: string
  cpu: number       // fraction 0–1
  cpus: number
  mem: number       // bytes
  maxmem: number    // bytes
  uptime: number    // seconds
  tags?: string     // semicolon-separated e.g. "host;linux;vm"
}

export interface ProxmoxStorage {
  storage: string
  node: string
  type: string
  content: string
  used: number
  avail: number
  total: number
  active: number
  enabled: number
}

// --- AdGuard Home types ---
export interface AdGuardStats {
  dns_queries: number[]
  blocked_filtering: number[]
  avg_processing_time: number
  [key: string]: unknown
}
export interface AdGuardStatus {
  protection_enabled: boolean
  running: boolean
  version: string
  [key: string]: unknown
}
export interface AdGuardQueryLogEntry {
  time: string
  question: { name: string; type: string }
  client: string
  status: string
  reason: string
  answer?: string
}
export interface AdGuardQueryLog {
  data: AdGuardQueryLogEntry[]
}

// --- Pi-hole types ---
export interface PiHoleStats {
  blocking: boolean
  dns_queries_today: number
  ads_blocked_today: number
  ads_percentage_today: number
  domains_on_blocklist: number
  [key: string]: unknown
}
export interface PiHoleQueryLogEntry {
  time: string
  client: string
  domain: string
  query_type: string
  status: string
}
export interface PiHoleQueryLog {
  data: PiHoleQueryLogEntry[]
}

// --- Tailscale types ---
export interface TailscaleDevice {
  id: string
  hostname: string
  name: string
  addresses: string[]
  os: string
  clientVersion: string
  lastSeen: string
  online: boolean              // normalized from connectedToControl by the backend
  connectedToControl: boolean  // raw Tailscale field (requires ?fields=all)
  user: string
  authorized: boolean
  updateAvailable: boolean     // requires ?fields=all
  tags?: string[]
  keyExpiryDisabled: boolean
  expires?: string
  advertisedRoutes?: string[]
  enabledRoutes?: string[]
}

export interface TailscaleUser {
  id: string
  loginName: string
  displayName: string
  profilePicUrl?: string
  created?: string
  role: string
  status: string
  type?: string
}

export interface TailscaleDNS {
  nameservers: string[]
  searchPaths: string[]
  magicDNS: boolean
  overrideLocalDNS: boolean
  splitDns: Record<string, string[]>
  tailnetDomain?: string | null
}

export interface TailscaleKey {
  id: string
  description?: string
  keyType: 'auth' | 'api' | 'client' | 'federated'
  created?: string
  expires?: string
  revoked?: string
  invalid?: boolean
  capabilities?: {
    devices?: {
      create?: {
        reusable?: boolean
        ephemeral?: boolean
        preauthorized?: boolean
        tags?: string[]
      }
    }
  }
  scopes?: string[]
}

export interface TailscaleTailnetSettings {
  devicesApprovalOn?: boolean | null
  usersApprovalOn?: boolean | null
  devicesAutoUpdatesOn?: boolean | null
  devicesKeyDurationDays?: number | null
  httpsEnabled?: boolean | null
  networkFlowLoggingOn?: boolean | null
  aclsExternallyManagedOn?: boolean | null
  aclsExternalLink?: string
  regionalRoutingOn?: boolean | null
  postureIdentityCollectionOn?: boolean | null
}

export interface TailscaleDeviceRoutes {
  advertisedRoutes: string[]
  enabledRoutes: string[]
}

export interface TailscaleLocalStatus {
  available: boolean
  backend_state?: string
  ipv4?: string | null
  ipv6?: string | null
  hostname?: string
  dns_name?: string
  online: boolean
  tailscale_ips: string[]
}

// --- Docker types ---

export interface DockerInfo {
  server_version: string
  os: string
  kernel: string
  arch: string
  cpus: number
  mem_total: number
  containers: number
  containers_running: number
  containers_paused: number
  containers_stopped: number
  images: number
  storage_driver: string
  logging_driver: string
  name: string
}

export interface DockerEvent {
  Type: string
  Action: string
  Actor: { ID: string; Attributes: Record<string, string> }
  time: number
}

export interface DockerStats {
  cpu_pct: number
  mem_usage: number
  mem_limit: number
  mem_pct: number
  net_rx: number
  net_tx: number
}

export interface DockerPort {
  ip: string
  private_port: number
  public_port?: number | null
  type: string
}

export interface DockerContainer {
  id: string
  full_id: string
  names: string[]
  image: string
  image_id: string
  command: string
  created: number
  status: string
  state: string   // "running" | "exited" | "paused" | "restarting" | "dead" | "created"
  ports: DockerPort[]
  labels: Record<string, string>
}

export interface DockerImage {
  id: string
  full_id: string
  repo_tags: string[]
  size: number
  created: number
  labels: Record<string, string>
  used: boolean
}

export interface DockerNetworkContainer {
  id: string
  name: string
  ipv4: string
}

export interface DockerNetwork {
  id: string
  full_id: string
  name: string
  driver: string
  scope: string
  created: string
  internal: boolean
  attachable: boolean
  ipam_config: { subnet: string; gateway: string }[]
  containers: DockerNetworkContainer[]
}

export interface DockerVolume {
  name: string
  driver: string
  mountpoint: string
  scope: string
  created: string
  labels: Record<string, string>
  containers: string[]
}

export interface DockerComposeService {
  id: string
  full_id: string
  service: string
  name: string
  image: string
  state: string
  status: string
}

export interface DockerComposeProject {
  name: string
  config_files: string
  working_dir: string
  state: string   // "running" | "stopped" | "partial"
  services: DockerComposeService[]
}

// --- Kubernetes types ---

export interface K8sCondition {
  type: string
  status: string
  reason: string
}

export interface K8sNode {
  name: string
  status: string   // "Ready" | "NotReady"
  roles: string[]
  version: string
  created: string
  internal_ip: string
  os_image: string
  container_runtime: string
  conditions: K8sCondition[]
  unschedulable: boolean
}

export interface K8sPod {
  name: string
  namespace: string
  ready: string    // "X/Y"
  status: string   // "Running" | "Pending" | "Succeeded" | "Failed" | "Unknown"
  restarts: number
  node: string
  ip: string
  created: string
}

export interface K8sContainerDetail {
  name: string
  image: string
  state: string
  ready: boolean
  restarts: number
  resources: { requests: Record<string, string>; limits: Record<string, string> }
  ports: { name: string; container_port: number; protocol: string }[]
  env_count: number
}

export interface K8sPodDetail {
  name: string
  namespace: string
  node: string
  ip: string
  host_ip: string
  phase: string
  qos_class: string
  service_account: string
  priority: number
  created: string
  labels: Record<string, string>
  annotations: Record<string, string>
  init_containers: K8sContainerDetail[]
  containers: K8sContainerDetail[]
  volumes: { name: string; type: string; source: string }[]
  events: { type: string; reason: string; message: string; count: number; last_time: string }[]
}

export interface K8sNamespace {
  name: string
  status: string
  created: string
}

export interface K8sDeployment {
  name: string
  namespace: string
  ready: string
  up_to_date: number
  available: number
  created: string
}

export interface K8sStatefulSet {
  name: string
  namespace: string
  ready: string
  current_revision: string
  created: string
}

export interface K8sDaemonSet {
  name: string
  namespace: string
  desired: number
  current: number
  ready: number
  up_to_date: number
  available: number
  created: string
}

export interface K8sJob {
  name: string
  namespace: string
  status: string
  completions: string
  failed: number
  duration: string
  created: string
}

export interface K8sCronJob {
  name: string
  namespace: string
  schedule: string
  last_schedule: string
  active: number
  suspended: boolean
  created: string
}

export interface K8sService {
  name: string
  namespace: string
  type: string
  cluster_ip: string
  external_ips: string[]
  ports: string[]
  created: string
}

export interface K8sIngress {
  name: string
  namespace: string
  class: string
  hosts: string[]
  address: string[]
  created: string
}

export interface K8sPV {
  name: string
  capacity: string
  access_modes: string[]
  reclaim_policy: string
  status: string
  claim: string
  storage_class: string
  created: string
}

export interface K8sPVC {
  name: string
  namespace: string
  status: string
  volume: string
  capacity: string
  access_modes: string[]
  storage_class: string
  created: string
}

export interface K8sConfigMap {
  name: string
  namespace: string
  data_count: number
  created: string
}

export interface K8sSecret {
  name: string
  namespace: string
  type: string
  data_count: number
  created: string
}

export interface K8sHTTPRoute {
  name: string
  namespace: string
  hostnames: string[]
  parents: string[]
  rules: number
  created: string
}

export interface K8sIngressClass {
  name: string
  controller: string
  parameters: string
  is_default: boolean
  created: string
}

export interface K8sLonghornVolume {
  name: string
  namespace: string
  state: string
  robustness: string
  size: string
  replicas: number
  frontend: string
  created: string
}

export interface K8sLonghornNode {
  name: string
  ready: boolean
  schedulable: boolean
  disk_count: number
  created: string
}

export interface K8sCertificate {
  name: string
  namespace: string
  secret_name: string
  dns_names: string[]
  issuer_ref: string
  issuer_kind: string
  ready: boolean
  not_before: string
  not_after: string
  renewal_time: string
  created: string
}

export interface K8sEvent {
  name: string
  namespace: string
  type: string
  reason: string
  message: string
  object: string
  count: number
  first_time: string | number
  last_time: string | number
}

export interface K8sOverview {
  nodes: { name: string; status: string; roles: string[]; cpu: string; memory: string }[]
  pod_phases: Record<string, number>
  workloads: Record<string, { total: number; ready: number }>
  events: K8sEvent[]
}

export interface K8sServiceAccount {
  name: string
  namespace: string
  secrets: number
  created: string
}

export interface K8sRole {
  name: string
  namespace: string
  rules: number
  created: string
}

export interface K8sClusterRole {
  name: string
  rules: number
  aggregation: boolean
  created: string
}

export interface K8sRoleBinding {
  name: string
  namespace: string
  role_ref: string
  subjects: number
  created: string
}

export interface K8sClusterRoleBinding {
  name: string
  role_ref: string
  subjects: number
  created: string
}

export interface K8sHelmRelease {
  name: string
  namespace: string
  chart: string
  chart_version: string
  app_version: string
  revision: number
  status: string
  description: string
  first_deployed: string
  last_deployed: string
}

export interface K8sReplicaSet {
  name: string
  namespace: string
  desired: number
  ready: number
  owner: string
  created: string
}

export interface K8sHPA {
  name: string
  namespace: string
  target: string
  min_replicas: number
  max_replicas: number
  current_replicas: number
  desired_replicas: number
  cpu_pct: number | null
  created: string
}

export interface K8sEndpoints {
  name: string
  namespace: string
  addresses: number
  ports: string[]
  created: string
}

export interface K8sNetworkPolicy {
  name: string
  namespace: string
  pod_selector: string
  policy_types: string[]
  created: string
}

export interface K8sStorageClass {
  name: string
  provisioner: string
  reclaim_policy: string
  volume_binding_mode: string
  allow_volume_expansion: boolean
  is_default: boolean
  created: string
}

export interface K8sCRD {
  name: string
  group: string
  scope: string
  kind: string
  versions: string[]
  created: string
}

export interface K8sResourceQuotaLimit {
  resource: string
  hard: string
  used: string
}

export interface K8sResourceQuota {
  name: string
  namespace: string
  limits: K8sResourceQuotaLimit[]
  created: string
}

export interface K8sLimitRange {
  name: string
  namespace: string
  limits_count: number
  limit_types: string[]
  created: string
}

export interface K8sPriorityClass {
  name: string
  value: number
  global_default: boolean
  preemption_policy: string
  description: string
  created: string
}

export interface K8sPDB {
  name: string
  namespace: string
  min_available: string
  max_unavailable: string
  current_healthy: number
  desired_healthy: number
  disruptions_allowed: number
  expected_pods: number
  created: string
}

export interface K8sMetalLBOverview {
  present: boolean
  namespace?: string
  ipaddresspools?: number
  l2advertisements?: number
  bgpadvertisements?: number
  bgppeers?: number
  invalid_configurations?: number
  config_errors?: string[]
}

export interface K8sMetalLBIPAddressPool {
  name: string
  namespace: string
  version: string
  addresses: string[]
  auto_assign: boolean
  avoid_buggy_ips: boolean
  assigned_ipv4: number
  available_ipv4: number
  assigned_ipv6: number
  available_ipv6: number
  created: string
}

export interface K8sMetalLBL2Advertisement {
  name: string
  namespace: string
  version: string
  ipaddresspools: string[]
  interfaces: string[]
  node_selectors: number
  created: string
}

export interface K8sMetalLBBGPAdvertisement {
  name: string
  namespace: string
  version: string
  ipaddresspools: string[]
  peers: string[]
  communities: string[]
  local_pref: number | null
  node_selectors: number
  created: string
}

export interface K8sMetalLBBGPPeer {
  name: string
  namespace: string
  version: string
  peer_address: string
  peer_asn: number
  my_asn: number
  vrf: string
  bfd_profile: string
  node_selectors: number
  created: string
}

export interface K8sMetalLBBFDProfile {
  name: string
  namespace: string
  version: string
  receive_interval: number | null
  transmit_interval: number | null
  detect_multiplier: number | null
  echo_mode: boolean
  created: string
}

export interface K8sMetalLBCommunityAlias {
  name: string
  value: string
}

export interface K8sMetalLBCommunity {
  name: string
  namespace: string
  version: string
  aliases: K8sMetalLBCommunityAlias[]
  alias_count: number
  created: string
}

export interface K8sEtcdMember {
  name: string
  namespace: string
  node: string
  phase: string
  ready: boolean
  restarts: number
  pod_ip: string
  host_ip: string
  advertise_client_urls: string
  created: string
}

export interface K8sEtcdStatus {
  present: boolean
  reason?: string
  mode?: string
  healthy_members?: number
  total_members?: number
  total_restarts?: number
  members?: K8sEtcdMember[]
}

// --- UniFi types ---
export interface UniFiClient {
  id: string            // UUID (integration API) or MAC (session API)
  mac: string
  hostname: string
  ip: string
  type: string          // "WIRED" | "WIRELESS" | "VPN"
  is_wired: boolean
  connected_at: string
  access_type: string
  // Session API extras (may be absent with integration API)
  essid?: string
  rssi?: number
  rx_bytes: number
  tx_bytes: number
  uptime?: number
}

export interface UniFiDevice {
  id: string
  mac: string
  name: string
  model: string
  ip: string
  state: string         // "ONLINE" | "OFFLINE"
  firmware_version: string
  firmware_updatable: boolean
  features: string[]
  has_ports: boolean
  // Session API extras
  type?: string
  uptime?: number
}

export interface UniFiPort {
  device_id: string
  device_name: string
  idx: number
  name: string
  description: string
  state: string         // "UP" | "DOWN"
  connector: string
  speed_mbps: number
  max_speed_mbps: number
  poe_enabled: boolean
  poe_standard: string
  poe_state: string
  vlan: number
  tagged_vlans: number[]
  tagged_network_names: string[]
  rx_bytes: number
  tx_bytes: number
  full_duplex: boolean
}

export interface UniFiNetwork {
  id: string
  name: string
  enabled: boolean
  vlan_id: number
  management: string
  is_default: boolean
  // Session API extras
  purpose?: string
  ip_subnet?: string
  dhcpd_enabled?: boolean
  dhcpd_start?: string
  dhcpd_stop?: string
}

export interface UniFiWlan {
  id: string
  name: string
  enabled: boolean
  security_type: string  // "OPEN" | "WPA" | "WPA2" | "WPA3"
  network_type: string
  hide_name: boolean
  client_isolation: boolean
  is_guest: boolean
  scheduled: boolean
  // Session API extras
  wpa_mode?: string
  vlan?: number
  vlan_enabled?: boolean
}

export interface UniFiFirewallRule {
  _id: string
  name: string
  ruleset: string
  rule_index: number
  action: string
  protocol: string
  enabled: boolean
  src_address: string
  dst_address: string
  src_firewallgroup_ids: string[]
  dst_firewallgroup_ids: string[]
  dst_port: string
  logging: boolean
}

export interface UniFiFirewallGroup {
  _id: string
  name: string
  group_type: string
  group_members: string[]
}

export interface UniFiZone {
  _id: string
  name: string
  zone_key: string
  network_ids: string[]
  auto: boolean
}

// --- Asset Inventory types ---
export interface AssetItem {
  id: number
  name: string
  asset_type: string
  role: string | null
  manufacturer: string | null
  model: string | null
  cpu: string | null
  cpu_cores: number | null
  ram_gb: number | null
  storage: string | null
  gpu: string | null
  os: string | null
  ip_address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// --- Notification types ---
export interface NotificationItem {
  id: number
  event_type: string
  plugin_id: string | null
  instance_id: string | null
  title: string
  message: string
  level: string  // info | warning | error
  channels_sent: string | null  // JSON array string
  read: boolean
  created_at: string
}

// --- Backup types ---
export interface BackupInfo {
  filename: string
  created_at: string
  size_bytes: number
}

export interface BackupSchedule {
  enabled: boolean
  interval: string  // daily | weekly
  keep_count: number
}
