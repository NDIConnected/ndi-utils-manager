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
    transition: 'all 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  deleteButtonHover: {
    background: '#dc2626',
    transform: 'translate(-50%, -50%) scale(1.1)',
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

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
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
              e.target.style.transform = 'translate(-50%, -50%)';
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
