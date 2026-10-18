import ModListPage from '../components/shared/mod-list-page'
import { cacheTrackSelection } from '../lib/practice-cache'
import { getTracksEmptyMessage, useMods, TRACKS_FIXED_MESSAGE } from '../hooks/useMods'
import type { Track } from '../../../types/mods'

export default function Tracks(): React.JSX.Element {
  const { items: tracks, isLoading, valid, ready, loaded } = useMods<Track>('tracks')

  // The invalid warning fires only on confirmed main validation (valid:false)
  // with a ready snapshot: never on an empty list, a pending first scan
  // (ready:false) or a scan miss.
  const showInvalid = !isLoading && loaded && ready && !valid
  const invalidMessage = getTracksEmptyMessage(showInvalid)

  return (
    <ModListPage
      label="tracks"
      fixedMessage={TRACKS_FIXED_MESSAGE}
      invalidMessage={invalidMessage}
      items={valid ? tracks : []}
      ready={ready}
      loaded={loaded}
      searchPlaceholder="Search tracks"
      cover
      onSelect={(track) => {
        cacheTrackSelection(track)
        return window.practice.selectTrack(track.id, track.layouts ?? [])
      }}
    />
  )
}
