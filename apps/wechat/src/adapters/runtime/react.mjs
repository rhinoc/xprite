import React from "xprite-real-react";

/** Native layout delivery completes before the shared controls' layout effects paint. */
export function useLayoutEffect(effect, dependencies) {
  React.useEffect(() => {
    let disposed = false;
    let cleanup;
    const ready = window.__xpriteNativeLayout?.() ?? Promise.resolve();
    void ready
      .then(() => {
        if (!disposed) cleanup = effect();
      })
      .catch((error) => {
        console.error(error);
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, dependencies);
}
export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createFactory,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
} = React;
export default { ...React, useLayoutEffect };
