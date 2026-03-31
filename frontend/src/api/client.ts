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

export interface SettingItem {
  key: string
  value: string | null
}

// --- Proxmox types ---

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
