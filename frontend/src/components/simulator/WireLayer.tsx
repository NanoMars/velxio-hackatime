/**
 * WireLayer Component
 *
 * SVG layer that renders all wires below components.
 * Positioned absolutely with full canvas coverage.
 *
 * Features:
 * - Automatic offset calculation for overlapping wires
 * - Visual separation of parallel wires
 */

import React, { useMemo } from 'react';
import { useSimulatorStore } from '../../store/useSimulatorStore';
import { WireRenderer } from './WireRenderer';
import { WireInProgressRenderer } from './WireInProgressRenderer';
import { calculateWireOffsets, applyOffsetToWire } from '../../utils/wireOffsetCalculator';

export const WireLayer: React.FC = () => {
  const { wires, wireInProgress, selectedWireId } = useSimulatorStore();

  // Calculate automatic offsets for overlapping wires
  const wireOffsets = useMemo(() => {
    return calculateWireOffsets(wires);
  }, [wires]);

  // Apply offsets to wires for rendering
  // Priority: manual offset > automatic offset > 0
  const offsetWires = useMemo(() => {
    return wires.map(wire => {
      const automaticOffset = wireOffsets.get(wire.id) || 0;
      const finalOffset = wire.manualOffset !== undefined ? wire.manualOffset : automaticOffset;
      return applyOffsetToWire(wire, finalOffset);
    });
  }, [wires, wireOffsets]);

  return (
    <svg
      className="wire-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',  // Allow wires to render outside the SVG viewport (e.g. negative coords)
        pointerEvents: 'auto',  // Enable pointer events for control points
        zIndex: 1,  // Below components (which have zIndex: 2)
      }}
    >
      {/* Transparent background - allows click-through when not clicking on wires */}
      <rect
        width="100%"
        height="100%"
        fill="transparent"
        style={{ pointerEvents: 'none' }}
      />

      {/* Render all wires with automatic offsets */}
      {offsetWires.map((wire, index) => (
        <WireRenderer
          key={wire.id}
          wire={wire}
          isSelected={wire.id === selectedWireId}
        />
      ))}

      {/* Render wire being created (Phase 2) */}
      {wireInProgress && (
        <WireInProgressRenderer wireInProgress={wireInProgress} />
      )}
    </svg>
  );
};
