import ModListPage from '../components/shared/mod-list-page'
import { cacheBikeSelection } from '../lib/practice-cache'
import { getBikesEmptyMessage, useMods, BIKES_FIXED_MESSAGE } from '../hooks/useMods'
import type { Bike } from '../../../types/mods'

export default function Bikes(): React.JSX.Element {
  const { items: bikes, isLoading, valid, ready, loaded } = useMods<Bike>('bikes')

  // The invalid warning fires only on confirmed main validation (valid:false)
  // with a ready snapshot: never on an empty list, a pending first scan
  // (ready:false) or a scan miss.
  const showInvalid = !isLoading && loaded && ready && !valid
  const invalidMessage = getBikesEmptyMessage(showInvalid)

  return (
    <ModListPage
      label="bikes"
      fixedMessage={BIKES_FIXED_MESSAGE}
      invalidMessage={invalidMessage}
      items={valid ? bikes : []}
      ready={ready}
      loaded={loaded}
      searchPlaceholder="Search bikes"
      onSelect={(bike) => {
        cacheBikeSelection(bike)
        return window.practice.selectBike(bike.id, bike.paints ?? [])
      }}
    />
  )
}
