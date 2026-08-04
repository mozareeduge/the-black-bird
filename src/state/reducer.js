import { CommandType } from './command-types.js';

function commitObject(state, id, source) {
  const isNewId = state.reading.anchorId !== id;
  const history = isNewId
    ? {
        route: [...state.history.route, { id, seq: state.history.nextSequence, source }],
        nextSequence: state.history.nextSequence + 1,
      }
    : state.history;
  const trace = isNewId
    ? { ...state.trace, wear: { ...state.trace.wear, [id]: (state.trace.wear[id] || 0) + 1 } }
    : state.trace;
  return {
    ...state,
    reading: {
      ...state.reading,
      anchorId: id,
      fieldAttention: { kind: 'focus', id },
      readerSubject: { kind: 'object', id },
      inspection: null,
    },
    history,
    trace,
  };
}

// Pure, DOM-free command reducer (T06, T-REQ-005/008/009). No branch here reads
// or touches the document/window; every state change is expressed as a new
// state object. Route/trace policy per command matches command-types.js exactly.
export function reduceCommand(state, command) {
  switch (command.type) {
    case CommandType.BOOTSTRAP_READY:
      return { ...state, lifecycle: { ...state.lifecycle, bootstrap: 'ready' } };

    case CommandType.BOOTSTRAP_FAILED:
      return { ...state, lifecycle: { ...state.lifecycle, bootstrap: 'failed' } };

    case CommandType.ENTER_WORK:
      return { ...state, lifecycle: { ...state.lifecycle, phase: 'field' } };

    case CommandType.INTERRUPT_ONBOARDING_WITH_OBJECT:
      return {
        ...commitObject(state, command.id, command.source),
        lifecycle: { ...state.lifecycle, phase: 'focused' },
      };

    // P-RULE-011: returning to the whole field neutralizes field attention while
    // retaining the reading anchor and current Reader subject — anchorId and
    // readerSubject are deliberately left untouched here.
    case CommandType.RETURN_TO_WHOLE_FIELD:
      return {
        ...state,
        lifecycle: { ...state.lifecycle, phase: 'field' },
        reading: { ...state.reading, fieldAttention: { kind: 'whole-field', id: null }, inspection: null },
      };

    // P-RULE-003: preview never appends Route or trace. Modeled as a transient
    // tooltip, not a reading-region change.
    case CommandType.PREVIEW_OBJECT:
      return { ...state, tooltip: { ...state.tooltip, kind: 'preview', targetId: command.id } };

    case CommandType.CLEAR_PREVIEW:
      return { ...state, tooltip: { kind: null, targetId: null, describedById: null } };

    // T-REQ-008 / P-RULE-002/004: the one command that atomically updates anchor,
    // field focus and Reader subject, appending Route/trace exactly once per new id.
    case CommandType.COMMIT_OBJECT:
      return {
        ...commitObject(state, command.id, command.source),
        lifecycle: { ...state.lifecycle, phase: 'focused' },
      };

    // P-RULE-014: projected edges are derived inspectable surfaces; inspecting one
    // may change Reader subject but never the reading anchor, Route, trace, solo, or view.
    case CommandType.INSPECT_PROJECTED_EDGE:
      return {
        ...state,
        reading: {
          ...state.reading,
          inspection: { sourceId: command.sourceId, targetId: command.targetId, relOIds: command.relOIds },
          readerSubject: { kind: 'projected-edge', id: `${command.sourceId}~${command.targetId}` },
        },
      };

    case CommandType.CLEAR_INSPECTION:
      return {
        ...state,
        reading: {
          ...state.reading,
          inspection: null,
          readerSubject:
            state.reading.anchorId != null
              ? { kind: 'object', id: state.reading.anchorId }
              : { kind: 'orientation', id: null },
        },
      };

    case CommandType.SET_SURFACE:
      return { ...state, responsive: { ...state.responsive, surface: command.surface } };

    case CommandType.SET_TYPE_VISIBILITY:
      return {
        ...state,
        view: {
          ...state.view,
          typeVisibility: { ...state.view.typeVisibility, [command.objectType]: command.visible },
        },
      };

    case CommandType.SET_OBJECT_VISIBILITY:
      return {
        ...state,
        view: {
          ...state.view,
          objectVisibility: { ...state.view.objectVisibility, [command.id]: command.visible },
        },
      };

    case CommandType.SET_VIEW_OPTION:
      return { ...state, view: { ...state.view, [command.option]: command.value } };

    // P-RULE-012: Solo is a lens. Entering/exiting never appends Route or trace; the
    // snapshot is captured once on entry and restored exactly on exit.
    case CommandType.ENTER_SOLO:
      return {
        ...state,
        solo: {
          active: true,
          rootId: command.id,
          members: state.solo.members,
          snapshot: state.solo.active ? state.solo.snapshot : { view: state.view },
        },
      };

    case CommandType.EXIT_SOLO: {
      const restoredView = state.solo.snapshot ? state.solo.snapshot.view : state.view;
      return {
        ...state,
        view: restoredView,
        solo: { active: false, rootId: null, members: [], snapshot: null },
      };
    }

    case CommandType.RESTORE_FIELD:
      return {
        ...state,
        view: {
          ...state.view,
          typeVisibility: Object.fromEntries(Object.keys(state.view.typeVisibility).map((k) => [k, true])),
          objectVisibility: {},
        },
      };

    // P-RULE-007: replay changes presentation (which object is anchored/read) without
    // adding Route or trace and without changing View/Hide/Solo state. history.route
    // itself is untouched — replay reads it, it never mutates it.
    case CommandType.REPLAY_ROUTE_EVENT: {
      const entry = state.history.route.find((e) => e.seq === command.sequence);
      if (!entry) return state;
      return {
        ...state,
        lifecycle: { ...state.lifecycle, phase: 'focused' },
        reading: {
          ...state.reading,
          anchorId: entry.id,
          fieldAttention: { kind: 'focus', id: entry.id },
          readerSubject: { kind: 'object', id: entry.id },
          inspection: null,
        },
      };
    }

    case CommandType.CLEAR_ROUTE:
      return { ...state, history: { route: [], nextSequence: 1 } };

    case CommandType.CLEAR_TRACE:
      return { ...state, trace: { wear: {}, afterglows: [] } };

    case CommandType.OPEN_OVERLAY:
      return { ...state, overlay: { kind: command.kind, invoker: command.invoker } };

    case CommandType.CLOSE_OVERLAY:
      return { ...state, overlay: { kind: null, invoker: null } };

    case CommandType.REPLACE_OVERLAY:
      return { ...state, overlay: { kind: command.kind, invoker: command.invoker } };

    case CommandType.SET_ROVING_FOCUS:
      return { ...state, focus: { ...state.focus, graphRovingId: command.id } };

    case CommandType.RECONCILE_ENVIRONMENT:
      return {
        ...state,
        responsive: {
          ...state.responsive,
          ...('profile' in command ? { profile: command.profile } : null),
          ...('orientation' in command ? { orientation: command.orientation } : null),
          ...('visualViewport' in command ? { visualViewport: command.visualViewport } : null),
        },
      };

    case CommandType.RECONCILE_DOCUMENT_VISIBILITY:
      return {
        ...state,
        lifecycle: {
          ...state.lifecycle,
          ...('visibility' in command ? { documentVisibility: command.visibility } : null),
        },
      };

    case CommandType.EXTERNAL_NAVIGATION_FAILED:
      return { ...state, presentation: { ...state.presentation, statusMessage: 'external-navigation-failed' } };

    default:
      throw new Error(`reduceCommand: unknown command type "${command.type}"`);
  }
}
