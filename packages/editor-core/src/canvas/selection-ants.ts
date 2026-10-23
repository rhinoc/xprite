/** Marching-ants timer state. The editor paints the current offset, then
 * advances it after each delivered 100ms timer event. */
export interface SelectionAntsState {
  offset: number;
  active: boolean;
  pendingTicks: number;
}

export function createSelectionAntsState(offset = 0): SelectionAntsState {
  return { offset: ((offset % 8) + 8) % 8, active: false, pendingTicks: 0 };
}

export function syncSelectionAnts(
  state: SelectionAntsState,
  active: boolean,
): SelectionAntsState {
  if (!active) return { ...state, active: false, pendingTicks: 0 };
  if (state.active) return state;
  return { ...state, active: true, pendingTicks: 0 };
}

export function requestSelectionAntsTick(
  state: SelectionAntsState,
): SelectionAntsState {
  return state.active ? { ...state, pendingTicks: state.pendingTicks + 1 } : state;
}

export function paintSelectionAnts(state: SelectionAntsState): {
  phase: number;
  state: SelectionAntsState;
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
