import { useEffect, useRef } from 'react';
import { useNodesInitialized, useReactFlow } from '@xyflow/react';
import { computeLayoutFromMeasuredNodes } from '../utils/layoutUtils';

export default function AutoMeasureLayout({
  enabled,
  senders,
  receivers,
  expandedDeviceKeys,
  expandedLayoutEpoch,
  onLayout,
}) {
  const nodesInitialized = useNodesInitialized();
  const { getNodes } = useReactFlow();
  const lastSignatureRef = useRef('');

  useEffect(() => {
    lastSignatureRef.current = '';
  }, [expandedLayoutEpoch]);

  useEffect(() => {
    if (!enabled || !nodesInitialized) return undefined;

    const nodes = getNodes();
    if (nodes.length === 0) return undefined;

    const allMeasured = nodes.every((node) => (node.measured?.height ?? 0) > 0);
    if (!allMeasured) return undefined;

    const signature = nodes
      .map((node) => `${node.id}:${node.measured?.height ?? 0}`)
      .join('|');
    if (signature === lastSignatureRef.current) return undefined;

    lastSignatureRef.current = signature;
    onLayout(computeLayoutFromMeasuredNodes(nodes, senders, receivers, expandedDeviceKeys));

    return undefined;
  }, [
    enabled,
    nodesInitialized,
    getNodes,
    senders,
    receivers,
    expandedDeviceKeys,
    expandedLayoutEpoch,
    onLayout,
  ]);

  return null;
}
