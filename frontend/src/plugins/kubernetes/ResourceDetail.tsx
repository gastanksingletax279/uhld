/**
 * ResourceDetail.tsx
 *
 * Generic resource detail panel for Kubernetes resources.
 * Shows metadata (name, namespace, labels, annotations, age),
 * resource-specific status highlights, and a YAML view.
 *
 * Used by KubernetesView for all resource types that don't already
 * have a dedicated detail modal (pods/deployments/nodes have their own).
 */

import { useState } from 'react'
import {
  X, FileCode, Info, Loader2, AlertCircle, Eye, EyeOff,
} from 'lucide-react'
import {
  K8sStatefulSet, K8sDaemonSet, K8sJob, K8sCronJob, K8sReplicaSet,
  K8sService, K8sIngress, K8sIngressClass, K8sHTTPRoute, K8sEndpoints,
  K8sNetworkPolicy, K8sPV, K8sPVC, K8sConfigMap, K8sSecret,
  K8sCertificate, K8sLonghornVolume, K8sLonghornNode, K8sStorageClass,
  K8sServiceAccount, K8sRole, K8sClusterRole, K8sRoleBinding, K8sClusterRoleBinding,
} from '../../api/client'

// ── Resource union type ────────────────────────────────────────────────────

export type DetailableResource =
  | { kind: 'StatefulSet';         resource: K8sStatefulSet }
  | { kind: 'DaemonSet';           resource: K8sDaemonSet }
  | { kind: 'Job';                 resource: K8sJob }
  | { kind: 'CronJob';             resource: K8sCronJob }
  | { kind: 'ReplicaSet';          resource: K8sReplicaSet }
  | { kind: 'Service';             resource: K8sService }
  | { kind: 'Ingress';             resource: K8sIngress }
  | { kind: 'IngressClass';        resource: K8sIngressClass }
  | { kind: 'HTTPRoute';           resource: K8sHTTPRoute }
  | { kind: 'Endpoints';           resource: K8sEndpoints }
  | { kind: 'NetworkPolicy';       resource: K8sNetworkPolicy }
  | { kind: 'PersistentVolume';    resource: K8sPV }
  | { kind: 'PersistentVolumeClaim'; resource: K8sPVC }
  | { kind: 'ConfigMap';           resource: K8sConfigMap }
  | { kind: 'Secret';              resource: K8sSecret }
  | { kind: 'Certificate';         resource: K8sCertificate }
  | { kind: 'LonghornVolume';      resource: K8sLonghornVolume }
  | { kind: 'LonghornNode';        resource: K8sLonghornNode }
  | { kind: 'StorageClass';        resource: K8sStorageClass }
  | { kind: 'ServiceAccount';      resource: K8sServiceAccount }
  | { kind: 'Role';                resource: K8sRole }
  | { kind: 'ClusterRole';         resource: K8sClusterRole }
  | { kind: 'RoleBinding';         resource: K8sRoleBinding }
  | { kind: 'ClusterRoleBinding';  resource: K8sClusterRoleBinding }

type DetailTab = 'overview' | 'yaml'

// ── Props ─────────────────────────────────────────────────────────────────

interface ResourceDetailModalProps {
  item: DetailableResource
  yaml: string
  yamlLoading: boolean
  yamlError: string | null
  onClose: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtAge(ts: string | number | null | undefined): string {
  if (ts === null || ts === undefined || ts === '') return '—'
  const epochMs = typeof ts === 'number'
    ? (ts < 1e12 ? ts * 1000 : ts)
    : Date.parse(ts as string)
  if (isNaN(epochMs)) return '—'
  const diff = Math.floor((Date.now() - epochMs) / 1000)
  if (diff < 0) return '0s'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d`
  return `${Math.floor(diff / (86400 * 30))}mo`
}

function getNamespace(item: DetailableResource): string {
  const r = item.resource as unknown as Record<string, unknown>
  return typeof r['namespace'] === 'string' ? r['namespace'] : ''
}

function getCreated(item: DetailableResource): string {
  const r = item.resource as unknown as Record<string, unknown>
  return typeof r['created'] === 'string' ? r['created'] : ''
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PropRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className="text-sm font-mono text-gray-200 mt-0.5 break-all">{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{title}</div>
      {children}
    </div>
  )
}

function LabelChips({ labels }: { labels: Record<string, string> }) {
  const entries = Object.entries(labels)
  if (entries.length === 0) return <span className="text-xs text-muted italic">none</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="text-[10px] font-mono bg-surface-3 rounded px-2 py-0.5">
          <span className="text-accent">{k}</span>=<span className="text-gray-300">{v}</span>
        </span>
      ))}
    </div>
  )
}

// ── Resource-specific detail panels ────────────────────────────────────────

function StatefulSetDetail({ r }: { r: K8sStatefulSet }) {
  const [ready, total] = r.ready.split('/').map(Number)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ready',    value: String(ready)  },
          { label: 'Total',    value: String(total)   },
          { label: 'Revision', value: r.current_revision || '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface-3 rounded p-3 text-center">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">{label}</div>
            <div className={`font-mono text-lg font-semibold ${label === 'Ready' && ready < total ? 'text-warning' : 'text-gray-100'}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace" value={r.namespace} />
        <PropRow label="Age"       value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function DaemonSetDetail({ r }: { r: K8sDaemonSet }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Desired',    value: String(r.desired)   },
          { label: 'Ready',      value: String(r.ready)     },
          { label: 'Available',  value: String(r.available) },
          { label: 'Up-to-date', value: String(r.up_to_date) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface-3 rounded p-3 text-center">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">{label}</div>
            <div className={`font-mono text-lg font-semibold ${label === 'Ready' && r.ready < r.desired ? 'text-warning' : 'text-gray-100'}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace" value={r.namespace} />
        <PropRow label="Current"   value={String(r.current)} />
        <PropRow label="Age"       value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function JobDetail({ r }: { r: K8sJob }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"   value={r.namespace} />
        <PropRow label="Status"      value={r.status} />
        <PropRow label="Completions" value={r.completions} />
        <PropRow label="Failed"      value={String(r.failed)} />
        <PropRow label="Duration"    value={r.duration || '—'} />
        <PropRow label="Age"         value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function CronJobDetail({ r }: { r: K8sCronJob }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"      value={r.namespace} />
        <PropRow label="Schedule"       value={<span className="font-mono">{r.schedule}</span>} />
        <PropRow label="Last Scheduled" value={r.last_schedule ? `${fmtAge(r.last_schedule)} ago` : '—'} />
        <PropRow label="Active Jobs"    value={String(r.active)} />
        <PropRow label="Suspended"      value={r.suspended ? 'Yes' : 'No'} />
        <PropRow label="Age"            value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function ReplicaSetDetail({ r }: { r: K8sReplicaSet }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Desired', value: String(r.desired) },
          { label: 'Ready',   value: String(r.ready)   },
        ].map(({ label, value }) => (
          <div key={label} className="bg-surface-3 rounded p-3 text-center">
            <div className="text-[10px] text-muted uppercase tracking-wide mb-1">{label}</div>
            <div className={`font-mono text-lg font-semibold ${label === 'Ready' && r.ready < r.desired ? 'text-warning' : 'text-gray-100'}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace" value={r.namespace} />
        <PropRow label="Owner"     value={r.owner || '—'} />
        <PropRow label="Age"       value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function ServiceDetail({ r }: { r: K8sService }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"    value={r.namespace} />
        <PropRow label="Type"         value={r.type} />
        <PropRow label="Cluster IP"   value={r.cluster_ip || '—'} />
        <PropRow label="External IPs" value={r.external_ips.join(', ') || '—'} />
        <PropRow label="Age"          value={fmtAge(r.created)} />
      </div>
      {r.ports.length > 0 && (
        <Section title="Ports">
          <div className="flex flex-wrap gap-1.5">
            {r.ports.map((p) => (
              <span key={p} className="text-[10px] font-mono bg-surface-3 rounded px-2 py-0.5 text-muted">{p}</span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function IngressDetail({ r }: { r: K8sIngress }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"   value={r.namespace} />
        <PropRow label="Class"       value={r.class || '—'} />
        <PropRow label="Address"     value={r.address.join(', ') || '—'} />
        <PropRow label="Age"         value={fmtAge(r.created)} />
      </div>
      {r.hosts.length > 0 && (
        <Section title="Hosts">
          <div className="flex flex-wrap gap-1.5">
            {r.hosts.map((h) => (
              <span key={h} className="text-[10px] font-mono bg-surface-3 rounded px-2 py-0.5 text-muted">{h}</span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function IngressClassDetail({ r }: { r: K8sIngressClass }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Controller"     value={r.controller || '—'} />
        <PropRow label="Default Class"  value={r.is_default ? 'Yes' : 'No'} />
        <PropRow label="Parameters"     value={r.parameters || '—'} />
        <PropRow label="Age"            value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function HTTPRouteDetail({ r }: { r: K8sHTTPRoute }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace" value={r.namespace} />
        <PropRow label="Rules"     value={String(r.rules)} />
        <PropRow label="Age"       value={fmtAge(r.created)} />
      </div>
      {r.hostnames.length > 0 && (
        <Section title="Hostnames">
          <div className="flex flex-wrap gap-1.5">
            {r.hostnames.map((h) => (
              <span key={h} className="text-[10px] font-mono bg-surface-3 rounded px-2 py-0.5 text-muted">{h}</span>
            ))}
          </div>
        </Section>
      )}
      {r.parents.length > 0 && (
        <Section title="Parent Gateways">
          <div className="flex flex-wrap gap-1.5">
            {r.parents.map((p) => (
              <span key={p} className="text-[10px] font-mono bg-surface-3 rounded px-2 py-0.5 text-muted">{p}</span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function EndpointsDetail({ r }: { r: K8sEndpoints }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"        value={r.namespace} />
        <PropRow label="Address Count"    value={String(r.addresses)} />
        <PropRow label="Age"              value={fmtAge(r.created)} />
      </div>
      {r.ports.length > 0 && (
        <Section title="Ports">
          <div className="flex flex-wrap gap-1.5">
            {r.ports.map((p) => (
              <span key={p} className="text-[10px] font-mono bg-surface-3 rounded px-2 py-0.5 text-muted">{p}</span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function NetworkPolicyDetail({ r }: { r: K8sNetworkPolicy }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"    value={r.namespace} />
        <PropRow label="Pod Selector" value={r.pod_selector || '(all pods)'} />
        <PropRow label="Age"          value={fmtAge(r.created)} />
      </div>
      {r.policy_types.length > 0 && (
        <Section title="Policy Types">
          <div className="flex gap-1.5">
            {r.policy_types.map((t) => (
              <span key={t} className={t === 'Ingress' ? 'bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-medium' : 'bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-medium'}>{t}</span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function PVDetail({ r }: { r: K8sPV }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Capacity"      value={r.capacity || '—'} />
        <PropRow label="Access Modes"  value={r.access_modes.join(', ') || '—'} />
        <PropRow label="Reclaim Policy" value={r.reclaim_policy || '—'} />
        <PropRow label="Status"        value={r.status} />
        <PropRow label="Storage Class" value={r.storage_class || '—'} />
        <PropRow label="Bound Claim"   value={r.claim || '—'} />
        <PropRow label="Age"           value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function PVCDetail({ r }: { r: K8sPVC }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"     value={r.namespace} />
        <PropRow label="Status"        value={r.status} />
        <PropRow label="Capacity"      value={r.capacity || '—'} />
        <PropRow label="Access Modes"  value={r.access_modes.join(', ') || '—'} />
        <PropRow label="Bound Volume"  value={r.volume || '—'} />
        <PropRow label="Storage Class" value={r.storage_class || '—'} />
        <PropRow label="Age"           value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function ConfigMapDetail({ r }: { r: K8sConfigMap }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"  value={r.namespace} />
        <PropRow label="Data Keys"  value={String(r.data_count)} />
        <PropRow label="Age"        value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function SecretDetail({ r }: { r: K8sSecret }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"  value={r.namespace} />
        <PropRow label="Type"       value={r.type || '—'} />
        <PropRow label="Data Keys"  value={String(r.data_count)} />
        <PropRow label="Age"        value={fmtAge(r.created)} />
      </div>
      <div className="flex items-start gap-2 p-3 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>Secret values are masked. Use the Eye icon in the secrets table to reveal decoded values.</span>
      </div>
    </div>
  )
}

function CertificateDetail({ r }: { r: K8sCertificate }) {
  const expiry = r.not_after ? new Date(r.not_after) : null
  const daysLeft = expiry ? Math.floor((expiry.getTime() - Date.now()) / 86400000) : null
  const expiryColor = daysLeft === null ? '' : daysLeft < 7 ? 'text-red-400' : daysLeft < 30 ? 'text-yellow-400' : 'text-green-400'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"    value={r.namespace} />
        <PropRow label="Secret Name"  value={r.secret_name} />
        <PropRow label="Issuer"       value={`${r.issuer_ref} (${r.issuer_kind})`} />
        <PropRow label="Ready"        value={r.ready ? 'Yes' : 'No'} />
        <PropRow label="Expires"      value={expiry
          ? <span className={expiryColor}>{expiry.toLocaleDateString()}{daysLeft !== null ? ` (${daysLeft >= 0 ? `${daysLeft}d left` : 'expired'})` : ''}</span>
          : '—'} />
        <PropRow label="Renewal"      value={r.renewal_time ? new Date(r.renewal_time).toLocaleDateString() : '—'} />
        <PropRow label="Age"          value={fmtAge(r.created)} />
      </div>
      {r.dns_names.length > 0 && (
        <Section title="DNS Names">
          <div className="flex flex-wrap gap-1.5">
            {r.dns_names.map((d) => (
              <span key={d} className="text-[10px] font-mono bg-surface-3 rounded px-2 py-0.5 text-muted">{d}</span>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function fmtBytes(raw: string): string {
  const n = parseInt(raw, 10)
  if (isNaN(n) || !raw) return raw || '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(1)} GB`
  return `${(n / 1024 ** 4).toFixed(2)} TB`
}

function LonghornVolumeDetail({ r }: { r: K8sLonghornVolume }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace"   value={r.namespace} />
        <PropRow label="State"       value={r.state} />
        <PropRow label="Robustness"  value={r.robustness} />
        <PropRow label="Size"        value={fmtBytes(r.size)} />
        <PropRow label="Replicas"    value={String(r.replicas)} />
        <PropRow label="Frontend"    value={r.frontend || '—'} />
        <PropRow label="Age"         value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function LonghornNodeDetail({ r }: { r: K8sLonghornNode }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Ready"       value={r.ready ? 'Yes' : 'No'} />
        <PropRow label="Schedulable" value={r.schedulable ? 'Yes' : 'No'} />
        <PropRow label="Disk Count"  value={String(r.disk_count)} />
        <PropRow label="Age"         value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function StorageClassDetail({ r }: { r: K8sStorageClass }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Provisioner"          value={r.provisioner} />
        <PropRow label="Reclaim Policy"       value={r.reclaim_policy} />
        <PropRow label="Binding Mode"         value={r.volume_binding_mode} />
        <PropRow label="Volume Expansion"     value={r.allow_volume_expansion ? 'Allowed' : 'Not Allowed'} />
        <PropRow label="Default Class"        value={r.is_default ? 'Yes' : 'No'} />
        <PropRow label="Age"                  value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function ServiceAccountDetail({ r }: { r: K8sServiceAccount }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace" value={r.namespace} />
        <PropRow label="Secrets"   value={String(r.secrets)} />
        <PropRow label="Age"       value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function RoleDetail({ r }: { r: K8sRole }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace" value={r.namespace} />
        <PropRow label="Rules"     value={String(r.rules)} />
        <PropRow label="Age"       value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function ClusterRoleDetail({ r }: { r: K8sClusterRole }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Rules"       value={String(r.rules)} />
        <PropRow label="Aggregation" value={r.aggregation ? 'Yes' : 'No'} />
        <PropRow label="Age"         value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function RoleBindingDetail({ r }: { r: K8sRoleBinding }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="Namespace" value={r.namespace} />
        <PropRow label="Role Ref"  value={r.role_ref} />
        <PropRow label="Subjects"  value={String(r.subjects)} />
        <PropRow label="Age"       value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

function ClusterRoleBindingDetail({ r }: { r: K8sClusterRoleBinding }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <PropRow label="ClusterRole" value={r.role_ref} />
        <PropRow label="Subjects"    value={String(r.subjects)} />
        <PropRow label="Age"         value={fmtAge(r.created)} />
      </div>
    </div>
  )
}

// ── Overview panel dispatcher ───────────────────────────────────────────────

function OverviewContent({ item }: { item: DetailableResource }) {
  switch (item.kind) {
    case 'StatefulSet':          return <StatefulSetDetail        r={item.resource} />
    case 'DaemonSet':            return <DaemonSetDetail          r={item.resource} />
    case 'Job':                  return <JobDetail                r={item.resource} />
    case 'CronJob':              return <CronJobDetail            r={item.resource} />
    case 'ReplicaSet':           return <ReplicaSetDetail         r={item.resource} />
    case 'Service':              return <ServiceDetail            r={item.resource} />
    case 'Ingress':              return <IngressDetail            r={item.resource} />
    case 'IngressClass':         return <IngressClassDetail       r={item.resource} />
    case 'HTTPRoute':            return <HTTPRouteDetail          r={item.resource} />
    case 'Endpoints':            return <EndpointsDetail          r={item.resource} />
    case 'NetworkPolicy':        return <NetworkPolicyDetail      r={item.resource} />
    case 'PersistentVolume':     return <PVDetail                 r={item.resource} />
    case 'PersistentVolumeClaim': return <PVCDetail               r={item.resource} />
    case 'ConfigMap':            return <ConfigMapDetail          r={item.resource} />
    case 'Secret':               return <SecretDetail             r={item.resource} />
    case 'Certificate':          return <CertificateDetail        r={item.resource} />
    case 'LonghornVolume':       return <LonghornVolumeDetail     r={item.resource} />
    case 'LonghornNode':         return <LonghornNodeDetail       r={item.resource} />
    case 'StorageClass':         return <StorageClassDetail       r={item.resource} />
    case 'ServiceAccount':       return <ServiceAccountDetail     r={item.resource} />
    case 'Role':                 return <RoleDetail               r={item.resource} />
    case 'ClusterRole':          return <ClusterRoleDetail        r={item.resource} />
    case 'RoleBinding':          return <RoleBindingDetail        r={item.resource} />
    case 'ClusterRoleBinding':   return <ClusterRoleBindingDetail r={item.resource} />
  }
}

// ── Main Modal ─────────────────────────────────────────────────────────────

export function ResourceDetailModal({
  item, yaml, yamlLoading, yamlError, onClose,
}: ResourceDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>('overview')
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())

  const r = item.resource as unknown as Record<string, unknown>
  const name      = typeof r['name'] === 'string' ? r['name'] : item.kind
  const namespace = getNamespace(item)
  const created   = getCreated(item)

  // Extract labels/annotations if they exist on the resource type
  const labels      = (r['labels'] as Record<string, string> | undefined) ?? {}
  const annotations = (r['annotations'] as Record<string, string> | undefined) ?? {}

  function toggleRevealed(key: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-surface-2 border border-surface-4 rounded-lg shadow-xl mx-4 w-full max-w-4xl flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-4 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Info className="w-4 h-4 text-muted" />
            <span className="font-semibold text-sm text-white">{name}</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/20 text-accent">{item.kind}</span>
            {namespace && <span className="text-muted text-xs">{namespace}</span>}
            {created && <span className="text-muted text-xs">{fmtAge(created)} old</span>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-surface-4 px-1 pt-1 flex-shrink-0">
          {(['overview', 'yaml'] as DetailTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors ${tab === t ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-gray-300'}`}>
              {t === 'yaml' ? 'YAML' : 'Overview'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4">
          {tab === 'overview' && (
            <div className="space-y-6">
              <OverviewContent item={item} />

              {/* Labels */}
              {Object.keys(labels).length > 0 && (
                <Section title="Labels">
                  <LabelChips labels={labels} />
                </Section>
              )}

              {/* Annotations */}
              {Object.keys(annotations).length > 0 && (
                <Section title="Annotations">
                  <div className="space-y-1">
                    {Object.entries(annotations).map(([k, v]) => {
                      const isRevealed = revealedKeys.has(k)
                      const isLong = v.length > 80
                      return (
                        <div key={k} className="text-[10px] font-mono bg-surface-3 rounded px-2 py-1 break-all">
                          <span className="text-muted">{k}</span>:{' '}
                          {isLong && !isRevealed
                            ? (
                              <>
                                <span className="text-gray-500">{v.slice(0, 60)}…</span>
                                <button
                                  onClick={() => toggleRevealed(k)}
                                  className="ml-1 inline-flex items-center gap-0.5 text-muted hover:text-gray-300 transition-colors"
                                >
                                  <Eye className="w-2.5 h-2.5" /> Show
                                </button>
                              </>
                            )
                            : (
                              <>
                                <span className="text-gray-300">{v}</span>
                                {isLong && (
                                  <button
                                    onClick={() => toggleRevealed(k)}
                                    className="ml-1 inline-flex items-center gap-0.5 text-muted hover:text-gray-300 transition-colors"
                                  >
                                    <EyeOff className="w-2.5 h-2.5" /> Hide
                                  </button>
                                )}
                              </>
                            )}
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}
            </div>
          )}

          {tab === 'yaml' && (
            yamlLoading
              ? (
                <div className="flex items-center gap-2 text-muted text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />Loading YAML…
                </div>
              )
              : yamlError
                ? (
                  <div className="flex items-center gap-2 p-3 rounded bg-danger/10 border border-danger/30 text-danger text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{yamlError}
                  </div>
                )
                : (
                  <div className="relative">
                    <div className="flex items-center gap-1 text-[10px] text-muted mb-2">
                      <FileCode className="w-3 h-3" />
                      <span className="font-mono">{item.kind}/{name}</span>
                      <span className="italic ml-1">read-only view — use YAML editor for edits</span>
                    </div>
                    <pre className="text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-all leading-relaxed bg-surface-1/50 rounded p-3 overflow-auto max-h-[55vh]">{yaml || '(no YAML)'}</pre>
                  </div>
                )
          )}
        </div>
      </div>
    </div>
  )
}
