// Semantic state schema (T05, T-REQ-004): explicit parallel regions, one store.
// Desktop and mobile are projections of this same shape, not separate models.
export function createInitialState() {
  return {
    "lifecycle": {
      "phase": "threshold",
      "bootstrap": "pending",
      "documentVisibility": "visible",
      "connectivity": "unknown"
    },
    "responsive": {
      "profile": "derived",
      "surface": "field",
      "orientation": "derived",
      "visualViewport": null
    },
    "reading": {
      "anchorId": null,
      "fieldAttention": {
        "kind": "whole-field",
        "id": null
      },
      "readerSubject": {
        "kind": "orientation",
        "id": null
      },
      "inspection": null
    },
    "history": {
      "route": [],
      "nextSequence": 1
    },
    "trace": {
      "wear": {},
      "afterglows": []
    },
    "view": {
      "typeVisibility": {
        "RNO": true,
        "MNO": true,
        "FO": true,
        "NameO": true,
        "RefO": true,
        "RelO": true
      },
      "objectVisibility": {},
      "projectedEdges": true,
      "labels": true,
      "sourceNames": false
    },
    "solo": {
      "active": false,
      "rootId": null,
      "members": [],
      "snapshot": null
    },
    "overlay": {
      "kind": null,
      "invoker": null
    },
    "tooltip": {
      "kind": null,
      "targetId": null,
      "describedById": null
    },
    "focus": {
      "graphRovingId": "FO.BLACK_BIRD_FIELD",
      "restoreTarget": null
    },
    "presentation": {
      "txId": 0,
      "cameraIntent": null,
      "statusMessage": null
    }
  };
}
