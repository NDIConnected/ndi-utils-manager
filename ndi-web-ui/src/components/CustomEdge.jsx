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
  const { deleteElements, setEdges } = useReactFlow();
  const laneIndex = Number(data?.edgeLaneIndex ?? 0);
  const laneCount = Math.max(1, Number(data?.edgeLaneCount ?? 1));
  const laneOffset = 0;
  const mostlyHorizontal = Math.abs(targetX - sourceX) >= Math.abs(targetY - sourceY);
  const confirmed = data?.confirmed !== false;

  const edgeColor = confirmed ? '#4ade80' : '#facc15';
  const edgeStyle = {
    ...style,
    stroke: edgeColor,
    strokeWidth: selected ? 2.5 : 1.5,
    strokeDasharray: confirmed ? undefined : '8 4',
  };

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
    deleteElements({ edges: [{ id }] });
  };

  const onPathClick = (evt) => {
    evt.stopPropagation();
    setEdges((eds) => eds.map((edge) => ({
      ...edge,
      selected: edge.id === id,
    })));
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={edgeStyle}
        interactionWidth={20}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onClick={onPathClick}
        style={{ cursor: 'pointer' }}
      />
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
            title={confirmed ? 'Disconnect' : 'Cancel pending connection'}
          >
            ×
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
