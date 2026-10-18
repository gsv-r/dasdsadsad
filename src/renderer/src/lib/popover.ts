// Fixed-position popover placement for dropdowns rendered in a portal
// (outside clipped scroll containers). Pure and unit-testable.
interface PanelAnchor {
  top: number
  bottom: number
  left: number
  width: number
}

export interface PanelPosition {
  top?: number
  bottom?: number
  left: number
  width: number
}

// Anchors the panel below the trigger; when it would overflow the viewport
// it opens above instead, bottom-anchored so it always touches the trigger
// regardless of the panel's actual height.
export function placePanel(
  anchor: PanelAnchor,
  viewportHeight: number,
  panelHeight: number,
  gap = 4
): PanelPosition {
  if (anchor.bottom + gap + panelHeight <= viewportHeight) {
    return { top: anchor.bottom + gap, left: anchor.left, width: anchor.width }
  }
  return { bottom: viewportHeight - anchor.top + gap, left: anchor.left, width: anchor.width }
}
