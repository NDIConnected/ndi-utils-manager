import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from '@xyflow/react';
import axios from 'axios';
import SenderNode from './SenderNode';
import ReceiverNode from './ReceiverNode';
import CustomEdge from './CustomEdge';

const API_BASE = '/api/ndi';

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#111827',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#1f2937',
    borderBottom: '1px solid #374151',
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: 'white',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#9ca3af',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  stats: {
    fontSize: '14px',
    color: '#d1d5db',
  },
  statHighlight: {
    fontWeight: '600',
  },
  senderCount: {
    color: '#10b981',
  },
  receiverCount: {
    color: '#3b82f6',
  },
  refreshButton: {
    padding: '8px 16px',
    backgroundColor: '#2563eb',
    color: 'white',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  },
  canvas: {
    width: '100%',
    height: '100%',
    paddingTop: '88px',
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#111827',
    color: 'white',
  },
  loadingContent: {
    textAlign: 'center',
  },
  spinner: {
    width: '64px',
    height: '64px',
    border: '2px solid white',
    borderBottomColor: 'transparent',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  loadingText: {
    fontSize: '20px',
  },
  errorContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#111827',
    color: 'white',
  },
  errorContent: {
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: '60px',
    color: '#ef4444',
    marginBottom: '16px',
  },
  errorText: {
    fontSize: '20px',
    color: '#f87171',
  },
  retryButton: {
    marginTop: '16px',
    padding: '8px 24px',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};

export default function NDIFlowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [senders, setSenders] = useState([]);
  const [receivers, setReceivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  // Load node positions from localStorage on mount
  const [nodePositions, setNodePositions] = useState(() => {
    try {
      const saved = localStorage.getItem('ndi-node-positions');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error('Error loading node positions:', e);
      return {};
    }
  });

  const [selectedEdges, setSelectedEdges] = useState(new Set());

  const nodeTypes = useMemo(
    () => ({
      senderNode: SenderNode,
      receiverNode: ReceiverNode,
    }),
    []
  );

  const edgeTypes = useMemo(
    () => ({
      custom: CustomEdge,
    }),
    []
  );

  const fetchDevices = useCallback(async () => {
    try {
      const [sendersRes, receiversRes] = await Promise.all([
        axios.get(`${API_BASE}/senders`),
        axios.get(`${API_BASE}/receivers`),
      ]);

      // Ensure we always set arrays, even if the response is unexpected
      setSenders(Array.isArray(sendersRes.data) ? sendersRes.data : []);
      setReceivers(Array.isArray(receiversRes.data) ? receiversRes.data : []);
      setError(null);
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError('Failed to fetch NDI devices. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Custom onNodesChange handler to save positions
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);

    // Save position changes
    changes.forEach(change => {
      if (change.type === 'position' && change.position && !change.dragging) {
        // Find the node to get its name
        const node = nodes.find(n => n.id === change.id);
        if (node && node.data && node.data.name) {
          const positionKey = change.id.startsWith('sender-')
            ? `sender-${node.data.name}`
            : `receiver-${node.data.name}`;

          setNodePositions(prev => {
            const updated = {
              ...prev,
              [positionKey]: change.position
            };
            // Save to localStorage
            try {
              localStorage.setItem('ndi-node-positions', JSON.stringify(updated));
            } catch (e) {
              console.error('Error saving node positions:', e);
            }
            return updated;
          });
        }
      }
    });
  }, [onNodesChange, nodes]);

  // Track edge selection changes
  const handleSelectionChange = useCallback((params) => {
    const selectedEdgeIds = new Set(params.edges.map(edge => edge.id));
    setSelectedEdges(selectedEdgeIds);
  }, []);

  useEffect(() => {
    if (!senders.length && !receivers.length) return;

    const newNodes = [];
    const newEdges = [];

    // Track connection types for each sender: full (video+audio), audio-only, or mixed
    const senderConnectionTypes = {}; // { senderId: { hasFullReceivers: bool, hasAudioReceivers: bool } }

    receivers.forEach(receiver => {
      if (receiver.isConnected && receiver.currentSource) {
        const connectedSender = senders.find(s => s.name === receiver.currentSource);
        if (connectedSender) {
          // Initialize tracking object if not exists
          if (!senderConnectionTypes[connectedSender.id]) {
            senderConnectionTypes[connectedSender.id] = {
              hasFullReceivers: false,
              hasAudioReceivers: false
            };
          }

          // Check if this receiver is audio-only
          const receiverIsAudioOnly = !receiver.videoCodec || receiver.videoCodec === '' ||
                                      (receiver.width === 0 && receiver.height === 0);

          if (receiverIsAudioOnly) {
            senderConnectionTypes[connectedSender.id].hasAudioReceivers = true;
          } else {
            senderConnectionTypes[connectedSender.id].hasFullReceivers = true;
          }
        }
      }
    });

    senders.forEach((sender, index) => {
      const nodeId = `sender-${sender.id}`;
      // Use saved position based on name (not ID), otherwise use default
      const positionKey = `sender-${sender.name}`;
      const position = nodePositions[positionKey] || { x: 50, y: 100 + index * 200 };

      // Determine connection state: 'none', 'full', 'audio', or 'mixed'
      let connectionState = 'none';
      const connectionType = senderConnectionTypes[sender.id];

      if (connectionType) {
        if (connectionType.hasFullReceivers && connectionType.hasAudioReceivers) {
          connectionState = 'mixed';  // Connected to BOTH full and audio-only receivers (PURPLE)
        } else if (connectionType.hasAudioReceivers) {
          connectionState = 'audio';  // Connected ONLY to audio-only receivers (ORANGE)
        } else if (connectionType.hasFullReceivers) {
          connectionState = 'full';   // Connected ONLY to full receivers (GREEN)
        }
      }

      newNodes.push({
        id: nodeId,
        type: 'senderNode',
        position: position,
        data: {
          ...sender,
          connectionState
        },
      });
    });

    receivers.forEach((receiver, index) => {
      const nodeId = `receiver-${receiver.id}`;
      // Use saved position based on name (not ID), otherwise use default
      const positionKey = `receiver-${receiver.name}`;
      const position = nodePositions[positionKey] || { x: 600, y: 100 + index * 200 };

      newNodes.push({
        id: nodeId,
        type: 'receiverNode',
        position: position,
        data: receiver,
      });

      if (receiver.isConnected && receiver.currentSource) {
        const connectedSender = senders.find(s => s.name === receiver.currentSource);
        if (connectedSender) {
          const edgeId = `edge-${connectedSender.id}-${receiver.id}`;
          const isSelected = selectedEdges.has(edgeId);

          // Check if sender is audio-only OR receiver is audio-only
          const senderIsAudioOnly = !connectedSender.videoCodec || connectedSender.videoCodec === '' ||
                                    (connectedSender.width === 0 && connectedSender.height === 0);
          const receiverIsAudioOnly = !receiver.videoCodec || receiver.videoCodec === '' ||
                                      (receiver.width === 0 && receiver.height === 0);

          const useAudioOnlyColor = senderIsAudioOnly || receiverIsAudioOnly;
          const edgeColor = useAudioOnlyColor ? '#A35304' : '#4ade80';

          newEdges.push({
            id: edgeId,
            type: 'custom',
            source: `sender-${connectedSender.id}`,
            target: `receiver-${receiver.id}`,
            animated: true,
            deletable: true,
            selectable: true,
            selected: isSelected,
            style: { stroke: edgeColor, strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: edgeColor,
            },
            data: {
              senderName: connectedSender.name,
              receiverName: receiver.name,
            },
          });
        }
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);

    // Mark first load as complete
    if (isFirstLoad && newNodes.length > 0) {
      setIsFirstLoad(false);
    }
  }, [senders, receivers, setNodes, setEdges, nodePositions, selectedEdges, isFirstLoad]);

  const onConnect = useCallback(
    async (params) => {
      const senderNodeId = params.source;
      const receiverNodeId = params.target;

      const senderId = senderNodeId.replace('sender-', '');
      const receiverId = receiverNodeId.replace('receiver-', '');

      const sender = senders.find(s => s.id === senderId);
      const receiver = receivers.find(r => r.id === receiverId);

      if (!sender || !receiver) {
        alert('Invalid connection');
        return;
      }

      try {
        const response = await axios.post(`${API_BASE}/connect`, {
          receiverUuid: receiver.id,
          sourceName: sender.name,
        });

        if (response.data.success) {
          setEdges((eds) => addEdge({
            ...params,
            type: 'custom',
            animated: true,
            deletable: true,
            selectable: true,
            style: { stroke: '#4ade80', strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#4ade80',
            },
          }, eds));

          setTimeout(fetchDevices, 1000);
        } else {
          alert(`Connection failed: ${response.data.message}`);
        }
      } catch (err) {
        console.error('Error connecting devices:', err);
        alert('Failed to connect devices');
      }
    },
    [senders, receivers, setEdges, fetchDevices]
  );

  const onEdgesDelete = useCallback(
    async (edgesToDelete) => {
      // Remove deleted edges from selection
      setSelectedEdges(prev => {
        const newSet = new Set(prev);
        edgesToDelete.forEach(edge => newSet.delete(edge.id));
        return newSet;
      });

      for (const edge of edgesToDelete) {
        const receiverNodeId = edge.target;
        const receiverId = receiverNodeId.replace('receiver-', '');

        try {
          const response = await axios.post(`${API_BASE}/disconnect`, {
            receiverUuid: receiverId,
          });

          if (response.data.success) {
            console.log('Disconnected successfully');
            setTimeout(fetchDevices, 1000);
          } else {
            alert(`Disconnect failed: ${response.data.message}`);
          }
        } catch (err) {
          console.error('Error disconnecting:', err);
          alert('Failed to disconnect');
        }
      }
    },
    [fetchDevices]
  );

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 1000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div style={styles.loadingContent}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading NDI devices...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorContent}>
          <div style={styles.errorIcon}>⚠️</div>
          <p style={styles.errorText}>{error}</p>
          <button onClick={fetchDevices} style={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>NDI Manager</h1>
          <p style={styles.subtitle}>Drag from sender to receiver to connect</p>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.stats}>
            <span style={{...styles.statHighlight, ...styles.senderCount}}>{senders.length}</span> Senders
            <span style={{margin: '0 8px'}}>•</span>
            <span style={{...styles.statHighlight, ...styles.receiverCount}}>{receivers.length}</span> Receivers
          </div>
          <button
            onClick={fetchDevices}
            style={styles.refreshButton}
            onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#2563eb'}
          >
            <span>🔄</span>
            Refresh
          </button>
        </div>
      </div>

      <div style={styles.canvas}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onSelectionChange={handleSelectionChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView={isFirstLoad}
          attributionPosition="bottom-right"
        >
          <Background color="#374151" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'senderNode') {
                // Use the same colors as in SenderNode based on connectionState
                const connectionState = node.data?.connectionState;
                const isActive = node.data?.status === 'Active';

                if (!isActive) return '#4b5563'; // gray

                switch (connectionState) {
                  case 'mixed':
                    return '#7c3aed'; // purple
                  case 'audio':
                    return '#A35304'; // orange
                  case 'full':
                    return '#10b981'; // green
                  default:
                    return '#4b5563'; // gray
                }
              }
              if (node.type === 'receiverNode') return '#3b82f6';
              return '#6b7280';
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
