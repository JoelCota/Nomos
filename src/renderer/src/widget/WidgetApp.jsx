import useConfig from '../hooks/useConfig'
import { RENDERERS } from '../../../modules/registry.renderer'
import WidgetFrame from './WidgetFrame'
import { glassActive } from '../../../shared/config'

export default function WidgetApp({ moduleId }) {
  const config = useConfig()
  const entry = RENDERERS[moduleId]
  if (!config || !entry) return null
  const mod = config.modules[moduleId]
  const { Widget } = entry
  return (
    <WidgetFrame glass={glassActive(config)}>
      <Widget size={mod.widget.size} settings={mod.settings} config={config} />
    </WidgetFrame>
  )
}
