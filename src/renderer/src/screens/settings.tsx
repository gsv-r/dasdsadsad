import { useState } from 'react'
import Layout from '../components/frame/layout'
import SettingsSidebar, { type SettingsTabId } from '../components/settings/settings-sidebar'
import PathsTab from '../components/settings/paths-tab'
import ResetTab from '../components/settings/reset-tab'

export default function Settings(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('paths')

  return (
    <Layout>
      <div className="flex h-full min-h-0 gap-4">
        <SettingsSidebar active={activeTab} onSelect={setActiveTab} />
        <div className="scroll flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          {activeTab === 'paths' ? <PathsTab /> : <ResetTab />}
        </div>
      </div>
    </Layout>
  )
}
