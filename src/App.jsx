import MetaNode from './nodes/MetaNode';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Panel,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import { Heart } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { DataEdge } from '@/components/data-edge';
import { runFlow } from './custom_utils/traversal';
import {
  DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { Plus, RefreshCcw } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { nanoid } from "nanoid";
import { loadNodeRegistry } from './custom_utils/loadNodeRegistry';

const edgeTypes = {
  data: DataEdge,
};

function useNodeFactory(registry) {
  const rf = useReactFlow();

  return (type) => {
    const pos = rf.screenToFlowPosition({ x: 120, y: 120 });
    const meta = registry?.nodes?.[type];

    if (!meta) {
      console.warn(`⚠️ Cannot insert node: missing metadata for "${type}"`);
      return;
    }

    // Build complete data object with all defaults from schema
    const dataWithDefaults = {
      type,
      value: 0,
      meta, // ✅ embed schema directly so node can self-render
    };

    // Add all param defaults
    if (meta.params) {
      for (const [key, spec] of Object.entries(meta.params)) {
        dataWithDefaults[key] = spec.default ?? null;
      }
    }

    rf.setNodes((nodes) => [
      ...nodes,
      {
        id: nanoid(6),
        type,
        position: pos,
        data: dataWithDefaults,
      },
    ]);
  };
}

function AddNodeMenuItems({ registry }) {
  const add = useNodeFactory(registry);

  if (!registry?.nodes) return null;

  return (
    <>
      {Object.entries(registry.nodes).map(([type, def]) =>
      (
        <DropdownMenuItem
          key={type}
          onSelect={(e) => {
            e.preventDefault();
            add(type);
          }}
        >
          {def.displayName || type}
        </DropdownMenuItem>
      )
      )}
    </>
  );
}

export default function App() {
  const [workflowFile, setWorkflowFile] = useState('default.json');
  const [isDirty, setIsDirty] = useState(false);
  const [nodeRegistry, setNodeRegistry] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [imageData, setImageData] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const ws = useRef(null);
  const isInitialLoad = useRef(true);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const promptRef = useRef('');
  const modelRef = useRef('gpt-image-1');

  // Handle field changes from MetaNode using the proper useNodesState mechanism
  const handleFieldChangeRef = useRef();
  handleFieldChangeRef.current = (nodeId, field, value) => {
    setNodes((nodes) => {
      return nodes.map((node) => {
        if (node.id !== nodeId) return node;

        const oldVal = node.data?.[field];
        if (oldVal === value) {
          return node;
        }

        // Mark as dirty when field value changes
        if (!isInitialLoad.current) {
          setIsDirty(true);
        }

        return {
          ...node,
          data: {
            ...node.data,
            [field]: value,
          },
        };
      });
    });
  };

  // Stable callback that doesn't change reference
  const stableHandleFieldChange = useCallback((nodeId, field, value) => {
    handleFieldChangeRef.current(nodeId, field, value);
  }, []);

  // Use refs for stable callbacks
  const handleNodeActionRef = useRef();
  handleNodeActionRef.current = (action, id) => {
    setNodes((nodes) => {
      const node = nodes.find((n) => n.id === id);
      const def = nodeRegistry?.nodes?.[node?.data?.type];

      switch (action) {
        case "reset":
          if (!def) return nodes;
          const defaults = {};
          for (const [k, v] of Object.entries(def.params || {})) {
            defaults[k] = v.default ?? null;
          }
          // Mark as dirty when resetting node
          if (!isInitialLoad.current) {
            setIsDirty(true);
          }
          return nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...defaults } } : n
          );

        case "delete":
          // Mark as dirty when deleting node
          if (!isInitialLoad.current) {
            setIsDirty(true);
          }
          // Defer deletion to next tick to allow React Flow to finish processing events
          setTimeout(() => {
            setNodes((prevNodes) => prevNodes.filter((n) => n.id !== id));
            setEdges((prevEdges) =>
              prevEdges.filter((e) => e.source !== id && e.target !== id)
            );
          }, 0);
          return nodes;

        case "logId":
          console.log("Node ID:", id);
          return nodes;

        default:
          console.warn("Unhandled action:", action);
          return nodes;
      }
    });
  };

  const stableHandleNodeAction = useCallback((action, id) => {
    handleNodeActionRef.current(action, id);
  }, []);

  // Create a single stable nodeTypes object that never changes
  const nodeTypes = useMemo(() => {
    if (!nodeRegistry) return {};

    // Create a single generic component for all MetaNode types
    const GenericMetaNode = (props) => (
      <MetaNode
        {...props}
        nodeRegistry={nodeRegistry}
        onFieldChange={stableHandleFieldChange}
        onAction={stableHandleNodeAction}
      />
    );

    // Create stable nodeTypes object with all possible node types
    const types = {};
    if (nodeRegistry.nodes) {
      for (const nodeType of Object.keys(nodeRegistry.nodes)) {
        types[nodeType] = GenericMetaNode;
      }
    }

    return types;
  }, [nodeRegistry]); // Only depend on registry, not on callbacks or nodes

  const handlePromptChange = useCallback((prompt) => {
    promptRef.current = prompt;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === 'input' ? { ...n, data: { ...n.data, prompt } } : n
      )
    );
  }, []);

  const handleModelChange = useCallback((model) => {
    modelRef.current = model;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === 'gen' ? { ...n, data: { ...n.data, model } } : n
      )
    );
  }, []);

  const handleTrigger = useCallback(() => {
    const prompt = promptRef.current?.trim();
    const model = modelRef.current;

    if (!prompt) {
      console.warn('⚠️ Prompt is empty. Not sending.');
      return;
    }

    if (ws.current?.readyState === WebSocket.OPEN) {
      setLoading(true);
      setErrorMsg('');
      ws.current.send(JSON.stringify({ type: 'run-workflow', prompt, model }));
    } else {
      console.warn('❌ WebSocket not ready.');
    }
  }, []);

  const handleTraversalTrigger = useCallback(async () => {
    if (isInitialLoad.current) {
      console.warn('⚠️ handleTraversalTrigger called during initial load! Ignoring...');
      return;
    }

    /* -----------------------------------------------------------
     * 1. Find "sink" nodes (nodes that have no outgoing edges)
     * --------------------------------------------------------- */
    const nodesWithOutgoing = new Set(edges.map(e => e.source));

    const sinkNodeIds = nodes
      .map(n => n.id)
      .filter(id => !nodesWithOutgoing.has(id));

    if (sinkNodeIds.length === 0) {
      console.warn('⚠️ No sink nodes found.');
      return;
    }

    /* -----------------------------------------------------------
     * 2. Evaluate the graph
     *    –  pass ws.current so non-client nodes run on the server
     * --------------------------------------------------------- */
    const { nodes: n2, edges: e2 } = await runFlow({
      nodes,
      edges,
      targetIds: sinkNodeIds,
      setNodes,
      nodeRegistry,
      ws: ws.current,
      options: { traversal: false, evaluation: true, delay: 500 },
    });

    /* -----------------------------------------------------------
     * 3. Commit updated state to React Flow
     * --------------------------------------------------------- */
    setNodes(n2);
    setEdges(e2);
  }, [nodes, edges, nodeRegistry, setNodes, ws]);

  const saveAs = useCallback(async () => {
    const name = prompt("Save as… (without .json)");
    if (!name) return;

    const isDev = window.location.hostname === 'localhost';
    const apiBase = isDev ? 'http://localhost:5001' : '';

    const res = await fetch(`${apiBase}/save-workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: name.endsWith('.json') ? name : `${name}.json`,
        nodes,
        edges,
      }),
    });

    if (res.ok) {
      setWorkflowFile(`${name}.json`);
      setIsDirty(false);
      alert("Workflow saved!");
    } else {
      alert("Save failed");
    }
  }, [nodes, edges]);   // dependencies

  const onConnect = useCallback(
    (params) => {
      const { source, sourceHandle, target, targetHandle } = params;
      console.log('CONNECTING... params', params);

      const sourceNode = nodes.find((n) => n.id === source);
      const sourceType = sourceNode?.data?.type;
      const def = nodeRegistry?.nodes?.[sourceType];

      const showLabel = def?.showOutputOnEdge !== false;

      console.log('CONNECTING... showLabel', showLabel);

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'data',
            data: showLabel ? { key: 'value', label: '' } : 'value',
          },
          eds
        )
      );
    },
    [nodes, nodeRegistry]
  );

  useEffect(() => {
    // after registry is ready, pull default workflow
    if (!nodeRegistry) return;

    (async () => {
      const isDev = window.location.hostname === 'localhost';
      const apiBase = isDev ? 'http://localhost:5001' : '';

      try {
        const res = await fetch(`${apiBase}/workflows/default.json`);
        if (!res.ok) throw new Error("workflow fetch failed");
        const wf = await res.json();
        setWorkflowFile("default.json");
        setIsDirty(false);

        // Merge loaded nodes with schema defaults to ensure complete data structure
        const nodesWithDefaults = wf.nodes.map(node => {
          const def = nodeRegistry.nodes[node.data?.type];
          if (!def || !def.params) {
            // For nodes without params, just keep type
            return {
              ...node,
              data: { type: node.data?.type }
            };
          }

          // Build clean data object with only schema-defined fields
          const completeData = { type: node.data?.type };

          for (const [key, spec] of Object.entries(def.params)) {
            // Use the value from loaded data if it exists and is a param, otherwise use default
            if (key in node.data) {
              completeData[key] = node.data[key];
            } else {
              completeData[key] = spec.default ?? null;
            }
          }

          return {
            ...node,
            data: completeData
          };
        });

        setNodes(nodesWithDefaults);
        setEdges(wf.edges);

        // Mark initial load as complete
        setTimeout(() => {
          isInitialLoad.current = false;
        }, 1000);
      } catch (err) {
        console.warn("No default workflow, starting blank.");
        setNodes([]);
        setEdges([]);
        isInitialLoad.current = false;
      }
    })();
  }, [nodeRegistry]);

  useEffect(() => {
    // Mark as dirty when nodes or edges change, but not on initial load
    if (!isInitialLoad.current) {
      setIsDirty(true);
    }
  }, [nodes, edges]);

  useEffect(() => {
    async function initNodeTypes() {
      const reg = await loadNodeRegistry();
      console.log("🔍 Registry contents:", reg);
      setNodeRegistry(reg);
    }

    initNodeTypes();
  }, []);

  // delete edge
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setEdges((eds) => eds.filter((edge) => !edge.selected));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setEdges]);

  useEffect(() => {
    // update to use const isDev = import.meta.env.DEV; as we do in localNodeRegistry.js
    const isDev = window.location.hostname === 'localhost';

    const wsUrl = isDev
      ? 'ws://localhost:5001/ws' // your dev backend
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      ws.current = socket;
      setWsConnected(true);
    };

    socket.onerror = (err) => {
      console.error('🚨 WebSocket error:', err);
      setWsConnected(false);
    };

    socket.onclose = () => {
      console.warn('❌ WebSocket closed');
      setWsConnected(false);
    };

    socket.onmessage = async (event) => {
      try {
        let message;

        if (typeof event.data === 'string') {
          message = JSON.parse(event.data);
        } else if (event.data instanceof Blob) {
          const text = await event.data.text();
          message = JSON.parse(text);
        } else {
          console.warn('Unknown WebSocket data type:', event.data);
          return;
        }

        if (message.type === 'image' && message.encoding === 'base64') {
          const img = `data:image/png;base64,${message.data}`;
          setImageData(img);
          setLoading(false);
          setErrorMsg('');

          setNodes((nds) =>
            nds.map((n) =>
              n.id === 'display'
                ? { ...n, data: { ...n.data, imgUrl: img } }
                : n
            )
          );
        } else if (message.type === 'status') {
          if (message.status === 'generating') {
            setLoading(true);
            setErrorMsg('');
          } else if (message.status === 'error') {
            setLoading(false);
            setErrorMsg(message.message || 'Unknown error');
          }
        } else if (message.type === 'error') {
          setLoading(false);
          setErrorMsg(message.message);
          alert(message.message);
        } else if (message.type === 'node-result') {
          console.log('✅ Node result:', message);
        } else {
          console.warn('Unhandled message type:', message);
        }
      } catch (err) {
        console.error('💥 Failed to parse WebSocket message:', err);
      }
    };

    return () => {
      if (socket.readyState < 2) {
        socket.close();
      }
    };
  }, []);

  if (!nodeRegistry) {
    return <div className="p-4 text-gray-500">Loading node registry&hellip;</div>;
  }

  return (
    <>
      <div className="w-screen h-screen flex flex-col">
        {/* <div className="h-10 bg-gray-200 flex items-center px-4">Image Generator</div> */}
        <ReactFlowProvider>
          <div className="flex-1 relative">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              nodesFocusable={true}
              edgesFocusable={true}
              disableKeyboardA11y={false}
              aria-label="Node editor canvas"
            >
              <Controls />
              <MiniMap />
              <Background variant="dots" gap={12} size={1} />
              <Panel position="bottom-center">
                <button
                  onClick={handleTraversalTrigger}
                  className="!bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition"
                >
                  Run All
                </button>
                <button
                  onClick={() => {
                    // Create a clean workflow without pre-calculated values
                    setNodes([
                      {
                        id: 'num-1',
                        type: 'number',
                        position: { x: 0, y: 0 },
                        data: { type: 'number', value: 3 }
                      },
                      {
                        id: 'num-2',
                        type: 'number',
                        position: { x: 0, y: 200 },
                        data: { type: 'number', value: 5 }
                      },
                      {
                        id: 'num-3',
                        type: 'number',
                        position: { x: 0, y: 400 },
                        data: { type: 'number', value: 2 }
                      },
                      {
                        id: 'sum-1',
                        type: 'sum',
                        position: { x: 300, y: 100 },
                        data: { type: 'sum' }  // No result/value
                      },
                      {
                        id: 'sum-2',
                        type: 'sum',
                        position: { x: 300, y: 300 },
                        data: { type: 'sum' }  // No result/value
                      },
                      {
                        id: 'res-1',
                        type: 'display_text',
                        position: { x: 600, y: 100 },
                        data: { type: 'display_text' }
                      },
                      {
                        id: 'res-2',
                        type: 'display_text',
                        position: { x: 600, y: 300 },
                        data: { type: 'display_text' }
                      }
                    ]);
                    setEdges([
                      { id: 'e1', source: 'num-1', target: 'sum-1', targetHandle: 'x', type: 'data', data: { key: 'value', label: '3' } },
                      { id: 'e2', source: 'num-2', target: 'sum-1', targetHandle: 'y', type: 'data', data: { key: 'value', label: '5' } },
                      { id: 'e3', source: 'num-2', target: 'sum-2', targetHandle: 'x', type: 'data', data: { key: 'value', label: '' } },
                      { id: 'e4', source: 'num-3', target: 'sum-2', targetHandle: 'y' },
                      { id: 'e5', source: 'sum-1', target: 'res-1', targetHandle: 'value', type: 'data', data: { key: 'value', label: 'result' } },
                      { id: 'e6', source: 'sum-2', target: 'res-2', targetHandle: 'value' }
                    ]);
                  }}
                  className="!bg-green-500 text-white px-4 py-2 rounded shadow hover:bg-green-700 transition ml-2"
                >
                  Reset Clean
                </button>
                <button
                  onClick={() => {
                    if (!isDirty || window.confirm('Are you sure you want to clear all nodes and edges? This cannot be undone.')) {
                      setNodes([]);
                      setEdges([]);
                    }
                  }}
                  className="!bg-red-500 text-white px-4 py-2 rounded shadow hover:bg-red-700 transition ml-2"
                >
                  Clear Canvas
                </button>
              </Panel>
              <Panel position="top-right" className="flex items-center gap-2 p-2">
                <button
                  className="flex items-center gap-1 rounded bg-gray-800 px-3 py-1 text-sm hover:bg-gray-700 transition"
                  onClick={saveAs}
                  title="Save workflow as new file"
                >
                  💾 Save&nbsp;As
                </button>

                <button
                  className="flex items-center gap-1 rounded bg-gray-800 px-3 py-1 text-sm hover:bg-gray-700 transition"
                  onClick={async () => {
                    const fresh = await loadNodeRegistry({ forceRefresh: true });

                    // Only update registry if contents changed
                    if (fresh.version !== nodeRegistry?.version) {
                      setNodeRegistry(fresh); // triggers useMemo, node types reinit
                    } else {
                      console.log("Registry unchanged — skipping update");
                    }
                  }}
                >
                  <RefreshCcw className="text-black h-4 w-4" /> Refresh Nodes
                </button>

                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    backgroundColor: wsConnected ? 'green' : 'red',
                  }}
                  title={wsConnected ? 'Connected to server' : 'Disconnected'}
                />
              </Panel>
              <Panel position="top-left" className="flex items-center gap-2 p-2">
                <div className="">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex items-center gap-1 rounded bg-gray-800 px-3 py-1 text-sm hover:bg-gray-700 transition"
                      >
                        <Plus className="text-black h-4 w-4" /> Add node
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent className="w-32">
                      {nodeRegistry && <AddNodeMenuItems registry={nodeRegistry} />}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="text-xs text-gray-500 ml-2 select-none">
                  {workflowFile}{isDirty ? "*" : ""}
                </div>
              </Panel>
            </ReactFlow>
            {/* <div className="absolute top-4 left-4 z-50 bg-teal-500 text-white p-4 rounded-lg shadow-lg">
              Image Generation Workflow
            </div> */}
            {/* <div className="absolute bottom-4 left-4 w-[256px]">
              {loading ? (
                <div className="w-full h-[256px] flex items-center justify-center border border-gray-300 rounded bg-white">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                </div>
              ) : imageData ? (
                <img
                  src={imageData}
                  alt="Generated"
                  className="w-full h-[256px] object-cover border border-gray-300 rounded"
                />
              ) : (
                <div className="w-full h-[256px] flex items-center justify-center text-gray-400 border border-dashed rounded">
                  No image yet
                </div>
              )}

              {errorMsg && (
                <div className="mt-2 text-red-600 text-sm">{errorMsg}</div>
              )}
            </div> */}
          </div>
        </ReactFlowProvider>
        <div className="h-10 bg-gray-200 flex items-center justify-between py-6 px-4 text-sm">
          <div>&copy; 2025</div>
          <div className="flex items-center gap-1">
            Created with <Heart className="w-4 h-4 text-red-500" fill="currentColor" /> by <a href="https://x.com/dgwyer" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">David Gwyer</a>
          </div>
        </div>
      </div>
    </>
  );
}

