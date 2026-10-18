import { useState } from 'react'
import Layout from '../frame/layout'
import ModPreview from './mod-preview'
import ModGrid from './mod-grid'
import ModListHeader from './mod-list-header'
import { filterMods } from '../../lib/mod-search'
import { usePaths } from '../../hooks/usePaths'

type ModListPageProps<T extends { id: string; name?: string; preview: string | null }> = {
  label: string
  fixedMessage: string
  invalidMessage: string
  items: T[]
  ready: boolean
  loaded: boolean
  searchPlaceholder: string
  cover?: boolean
  onSelect: (item: T) => void | Promise<unknown>
}

export default function ModListPage<
  T extends { id: string; name?: string; preview: string | null }
>({
  label,
  fixedMessage,
  invalidMessage,
  items,
  ready,
  loaded,
  searchPlaceholder,
  cover = false,
  onSelect
}: ModListPageProps<T>): React.JSX.Element {
  const { values: pathValues, loaded: modsPathLoaded } = usePaths()
  const [query, setQuery] = useState('')
  const visible = filterMods(items, query)
  return (
    <Layout>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0">
          <ModListHeader
            label={label}
            count={visible.length}
            loaded={loaded}
            modsPathLoaded={modsPathLoaded}
            modsPath={pathValues.mods}
            searchValue={query}
            searchPlaceholder={searchPlaceholder}
            searchDisabled={!ready}
            onSearchChange={setQuery}
          />
        </div>
        <div className="scroll min-h-0 flex-1 overflow-y-auto">
          <ModGrid
            isEmpty={items.length === 0}
            fixedMessage={fixedMessage}
            invalidMessage={invalidMessage}
          >
            {visible.map((item) => (
              <ModPreview
                key={item.id}
                src={item.preview}
                name={item.name || item.id}
                to="/"
                cover={cover}
                onSelect={() => onSelect(item)}
              />
            ))}
          </ModGrid>
        </div>
      </div>
    </Layout>
  )
}
