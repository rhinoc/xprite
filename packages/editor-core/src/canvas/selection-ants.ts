/** Pure Aseprite marching-ants timer state. The Aseprite editor paints the
 * current offset, then advances it after each delivered 100ms timer event. */
export interface AsepriteSelectionAntsState {
  offset: number;
  active: boolean;
  pendingTicks: number;
}

export function createAsepriteSelectionAntsState(offset = 0): AsepriteSelectionAntsState {
  return { offset: ((offset % 8) + 8) % 8, active: false, pendingTicks: 0 };
}

export function syncAsepriteSelectionAnts(
  state: AsepriteSelectionAntsState,
  active: boolean,
): AsepriteSelectionAntsState {
  if (!active) return { ...state, active: false, pendingTicks: 0 };
  if (state.active) return state;
  return { ...state, active: true, pendingTicks: 0 };
}

export function requestAsepriteSelectionAntsTick(
  state: AsepriteSelectionAntsState,
): AsepriteSelectionAntsState {
  return state.active ? { ...state, pendingTicks: state.pendingTicks + 1 } : state;
}

export function paintAsepriteSelectionAnts(state: AsepriteSelectionAntsState): {
  phase: number;
  state: AsepriteSelectionAntsState;
} {
  const phase = state.offset;
  return {
    phase,
    state: {
      ...state,
      offset: (state.offset + state.pendingTicks) & 7,
      pendingTicks: 0,
    },
  };
}
