import { CommandType } from './command-types.js';
import { isNodeVisible, reconcileHiddenAnchor, restoreVisibility } from '../domain/visibility.js';
import { computeSoloMembership } from '../domain/solo.js';
import { appendRouteEvent, clearRoute, findRouteEventBySequence } from '../domain/route.js';
import { recordWear, recordAfterglow, reconcileTraceDeadlines, clearTrace } from '../domain/trace.js';

function buildAdjacency(baseLinks) {
  const adj = new Map();
  for (const [a, b] of baseLinks) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  return adj;
}

// Pure, DOM-free command reducer (T06, T-REQ-005/008/009), factory-produced
// with injected immutable graph context (head correction v4, section 5):
// `nodesById` (id -> {id,type,label,...}), `baseLinks` (canonical base-link
// [a,b] pairs -- relation participation + citation/appearance/name edges,
// never projected edges), and `relations` (RelO id -> participant ids) are
// derived once from canonical DATA and never change at runtime, so closing
// over them here keeps reduceCommand itself a pure function of (state,
// command). Route/trace/visibility/Solo policy is delegated to their domain
// owners (src/domain/*.js) rather than reimplemented inline.
export function createReducer({ nodesById, baseLinks, relations }) {
  const adjacency = buildAdjacency(baseLinks);

  function isMobileProfile(state) {
    return state.responsive.profile === 'mobile';
  }

  function visibleIdSet(state) {
    if (state.solo.active) return new Set(state.solo.members);
    return new Set(
      Object.keys(nodesById).filter((id) => isNodeVisible(nodesById[id], state.view)),
    );
  }

  // Canonical-index-ordered neighbor lookup restricted to currently visible
  // nodes -- domain/trace.js's recordWear has no opinion on what "canonical"
  // or "visible" means, only on tracing wear along whatever graph it's given
  // (P-RULE-008: projected edges are never in `baseLinks`, so they never wear).
  function makeNeighbors(state) {
    const visible = visibleIdSet(state);
    return (id) => (adjacency.get(id) || []).filter((n) => visible.has(n)).sort();
  }

  function reconcileAnchorVisibility(reading, view) {
    if (!reading.anchorId) return reading;
    const node = nodesById[reading.anchorId];
    if (!node) return reading;
    return reconcileHiddenAnchor(reading, node, view);
  }

  // T-REQ-008 / P-RULE-002/004: the one internal path that atomically updates
  // anchor, field focus and Reader subject, appending Route/trace exactly
  // once per new id via the domain owners.
  function commitObject(state, id, source, now) {
    const isNewId = state.reading.anchorId !== id;
    const nextReading = {
      ...state.reading,
      anchorId: id,
      fieldAttention: { kind: 'focus', id },
      readerSubject: { kind: 'object', id },
      inspection: null,
    };
    if (!isNewId) return { ...state, reading: nextReading };

    const fromId = state.reading.anchorId;
    const node = nodesById[id];
    const history = appendRouteEvent(
      state.history,
      { id, objectType: node?.type ?? null, label: node?.label ?? null, source, committedAt: now },
      fromId,
    );
    let trace = state.trace;
    if (fromId) {
      const { wear } = recordWear(trace, { fromId, toId: id, neighbors: makeNeighbors(state) });
      trace = recordAfterglow(
        { ...trace, wear },
        {
          id: fromId,
          nowMs: now,
          durationMs: isMobileProfile(state) ? 4000 : 10000,
          cap: isMobileProfile(state) ? 3 : 8,
        },
      );
    }
    return { ...state, reading: nextReading, history, trace };
  }

  function reduceCommand(state, command) {
    const now = command.committedAt ?? command.now ?? Date.now();
    switch (command.type) {
      case CommandType.BOOTSTRAP_READY:
        return { ...state, lifecycle: { ...state.lifecycle, bootstrap: 'ready' } };

      case CommandType.BOOTSTRAP_FAILED:
        return { ...state, lifecycle: { ...state.lifecycle, bootstrap: 'failed' } };

      case CommandType.ENTER_WORK:
        return { ...state, lifecycle: { ...state.lifecycle, phase: 'field' } };

      case CommandType.INTERRUPT_ONBOARDING_WITH_OBJECT:
        return {
          ...commitObject(state, command.id, command.source, now),
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

      case CommandType.COMMIT_OBJECT:
        return {
          ...commitObject(state, command.id, command.source, now),
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

      // P-RULE-015: a type toggle can newly hide the field-focused object;
      // reconcileHiddenAnchor neutralizes field attention only, never Route/trace/anchor.
      case CommandType.SET_TYPE_VISIBILITY: {
        const view = {
          ...state.view,
          typeVisibility: { ...state.view.typeVisibility, [command.objectType]: command.visible },
        };
        return { ...state, view, reading: reconcileAnchorVisibility(state.reading, view) };
      }

      case CommandType.SET_OBJECT_VISIBILITY: {
        const view = {
          ...state.view,
          objectVisibility: { ...state.view.objectVisibility, [command.id]: command.visible },
        };
        return { ...state, view, reading: reconcileAnchorVisibility(state.reading, view) };
      }

      case CommandType.SET_VIEW_OPTION:
        return { ...state, view: { ...state.view, [command.option]: command.value } };

      // P-RULE-013: RelO Solo = the RelO plus every canonical participant; object
      // Solo = the object, every RelO that contains it, and all of those RelOs'
      // participants -- delegated to domain/solo.js exactly.
      case CommandType.ENTER_SOLO: {
        const members = [...computeSoloMembership(command.id, { nodesById, relations })];
        return {
          ...state,
          solo: {
            active: true,
            rootId: command.id,
            members,
            // Snapshot is captured once on entry; re-entering Solo (switching root
            // while already active) does not overwrite the original pre-lens snapshot.
            snapshot: state.solo.active ? state.solo.snapshot : { view: state.view },
          },
        };
      }

      case CommandType.EXIT_SOLO: {
        const view = state.solo.snapshot ? state.solo.snapshot.view : state.view;
        return {
          ...state,
          view,
          solo: { active: false, rootId: null, members: [], snapshot: null },
          reading: reconcileAnchorVisibility(state.reading, view),
        };
      }

      // contracts/semantic-normalization.json's visibility.restore_rule: exits Solo,
      // restores all type visibility, clears individual hides, returns Field
      // attention to whole-field, and preserves anchor/Reader subject/Route/trace.
      case CommandType.RESTORE_FIELD: {
        const view = restoreVisibility(state.view);
        return {
          ...state,
          view,
          solo: { active: false, rootId: null, members: [], snapshot: null },
          reading: { ...state.reading, fieldAttention: { kind: 'whole-field', id: null } },
        };
      }

      // P-RULE-007: replay changes presentation (which object is anchored/read) without
      // adding Route or trace and without changing View/Hide/Solo state. history.route
      // itself is untouched — replay reads it, it never mutates it.
      case CommandType.REPLAY_ROUTE_EVENT: {
        const entry = findRouteEventBySequence(state.history, command.sequence);
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
        return { ...state, history: clearRoute() };

      case CommandType.CLEAR_TRACE:
        return { ...state, trace: clearTrace() };

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
          lifecycle: {
            ...state.lifecycle,
            ...('connectivity' in command ? { connectivity: command.connectivity } : null),
          },
        };

      // Resume (document becomes visible again): expired afterglow deadlines are
      // dropped against wall-clock time, never replayed.
      case CommandType.RECONCILE_DOCUMENT_VISIBILITY: {
        const documentVisibility = 'visibility' in command ? command.visibility : state.lifecycle.documentVisibility;
        const trace = documentVisibility === 'visible' ? reconcileTraceDeadlines(state.trace, now) : state.trace;
        return {
          ...state,
          lifecycle: {
            ...state.lifecycle,
            ...('visibility' in command ? { documentVisibility: command.visibility } : null),
          },
          trace,
        };
      }

      case CommandType.EXTERNAL_NAVIGATION_FAILED:
        return { ...state, presentation: { ...state.presentation, statusMessage: 'external-navigation-failed' } };

      default:
        throw new Error(`reduceCommand: unknown command type "${command.type}"`);
    }
  }

  return { reduceCommand };
}
