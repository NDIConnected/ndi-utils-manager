import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from '@xyflow/react';

const styles = {
  deleteButton: {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'all',
    width: '24px',
    height: '24px',
    background: '#ef4444',
    border: '2px solid white',
    borderRadius: '50%',
    color: 'white',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s, box-shadow 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  deleteButtonHover: {
    background: '#dc2626',
  },
};

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  style,
  data,
}) {
  const { deleteElements } = useReactFlow();
  const laneIndex = Number(data?.edgeLaneIndex ?? 0);
  const laneCount = Math.max(1, Number(data?.edgeLaneCount ?? 1));
  const laneCenter = (laneCount - 1) / 2;
  const laneOffset = 0;
  const mostlyHorizontal = Math.abs(targetX - sourceX) >= Math.abs(targetY - sourceY);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: mostlyHorizontal ? sourceX : sourceX + laneOffset,
    sourceY: mostlyHorizontal ? sourceY + laneOffset : sourceY,
    sourcePosition,
    targetX: mostlyHorizontal ? targetX : targetX + laneOffset,
    targetY: mostlyHorizontal ? targetY + laneOffset : targetY,
    targetPosition,
  });

  const onEdgeClick = (evt) => {
    evt.stopPropagation();
    // Delete the edge directly using React Flow's deleteElements
    deleteElements({ edges: [{ id }] });
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              ...styles.deleteButton,
              left: `${labelX}px`,
              top: `${labelY}px`,
            }}
            onClick={onEdgeClick}
            onMouseEnter={(e) => {
              Object.assign(e.target.style, styles.deleteButtonHover);
            }}
            onMouseLeave={(e) => {
              e.target.style.background = '#ef4444';
            }}
            title="Disconnect"
          >
            ×
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
