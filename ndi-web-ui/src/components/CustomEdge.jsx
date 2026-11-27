import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from '@xyflow/react';
import { EDGE_KIND_COLORS, EDGE_PARTICLES } from '../utils/liveActivity';

/**
 * Light particles travelling along the route: more and faster for higher throughput,
 * cyan for video, green for audio. A video route that also carries audio adds one green particle.
 */
function SignalParticles({ path, activity }) {
  const { count, duration } = EDGE_PARTICLES[activity?.level ?? 0] || EDGE_PARTICLES[0];
  if (!count) return null;
  const particles = Array.from({ length: count }, (_, i) => ({
    key: `p${i}`,
    color: activity.color,
    radius: 3,
    begin: -(duration * i) / count,
  }));
  if (activity.withAudio) {
    particles.push({ key: 'a', color: EDGE_KIND_COLORS.audio, radius: 2.2, begin: -duration / (2 * count) });
  }
  return (
    <g className="ndi-edge-particles" aria-hidden="true">
      {particles.map((p) => (
        <circle key={p.key} r={p.radius} fill={p.color} className="ndi-edge-particle" style={{ color: p.color }}>
          <animateMotion dur={`${duration}s`} begin={`${p.begin}s`} repeatCount="indefinite" path={path} />
        </circle>
      ))}
    </g>
  );
}


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
  // Parallel edges share the same path for now (data.edgeLaneIndex/edgeLaneCount are available for offsets).
  const laneOffset = 0;
  const mostlyHorizontal = Math.abs(targetX - sourceX) >= Math.abs(targetY - sourceY);
  const confirmed = data?.confirmed !== false;
  const activity = data?.activity;
  const flowing = confirmed && (activity?.level ?? 0) > 0;

  const edgeColor = activity?.color || (confirmed ? EDGE_KIND_COLORS.audio : EDGE_KIND_COLORS.pending);
  const edgeStyle = {
    ...style,
    stroke: edgeColor,
    strokeWidth: selected ? 2.5 : 1.75,
    strokeDasharray: confirmed ? undefined : '8 4',
    strokeOpacity: confirmed && !flowing ? 0.45 : 0.9,
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
      {confirmed ? (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeColor}
          strokeWidth={flowing ? 7 : 4}
          strokeOpacity={flowing ? 0.16 : 0.06}
          strokeLinecap="round"
          className="ndi-edge-glow"
        />
      ) : null}
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
      {flowing ? <SignalParticles path={edgePath} activity={activity} /> : null}
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
