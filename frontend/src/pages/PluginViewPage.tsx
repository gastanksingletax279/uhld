import { useParams, Navigate } from 'react-router-dom'
import { PLUGIN_VIEWS } from '../plugins/registry'

export function PluginViewPage() {
  const { pluginId } = useParams<{ pluginId: string }>()
  const View = pluginId ? PLUGIN_VIEWS[pluginId] : undefined

  if (!View) {
    return (
      <div className="text-sm text-muted py-12 text-center">
        No view registered for plugin <span className="font-mono text-gray-300">{pluginId}</span>.
      </div>
    )
  }

  return <View />
}
