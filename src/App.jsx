import MetaNode from './nodes/MetaNode'; // your new dynamic renderer
import NumberField from './widgets/NumberField'; // your first widget
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import TextInputNode from './custom_nodes/TextInputNode';
import ImageGenNode from './custom_nodes/ImageGenNode';
import ImageDisplayNode from './custom_nodes/ImageDisplayNode';
import TriggerNode from './custom_nodes/TriggerNode';
import NodeHeaderDemo from './custom_nodes/NodeHeaderDemo';
import NumNode from './custom_nodes/NumNode';
import SumNode from './custom_nodes/SumNode';
import TextOutput from './custom_nodes/TextOutput';
import { DataEdge } from '@/components/data-edge';
import { runFlow } from './custom_utils/traversal';
import {
  DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { Plus } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { nanoid } from "nanoid";
import { loadNodeRegistry } from './custom_utils/loadNodeRegistry';

// const nodeTypes = {
//   textInput: TextInputNode,
//   imageGen: ImageGenNode,
//   imageDisplay: ImageDisplayNode,
//   triggerNode: TriggerNode,
//   nodeHeaderDemo: NodeHeaderDemo,
//   textOutput: TextOutput,
//   numNode: NumNode,
//   sumNode: SumNode,
// };

const edgeTypes = {
  data: DataEdge,
};

function useNodeFactory() {
  const rf = useReactFlow();

  return (type) => {
    const pos = rf.screenToFlowPosition({ x: 120, y: 120 });

    rf.setNodes(nodes => [
      ...nodes,
      {
        id: `${nanoid(6)}`,
        type,  // tells ReactFlow to use `MetaNode`
        position: pos,
        data: {
          type,     // ✅ tells MetaNode what schema to look up
          value: 0, // optional default value
        },
      },
    ]);
  };
}

// function AddNodeMenuItems() {
//   const add = useNodeFactory();
//   return (
//     <>
//       <DropdownMenuItem onSelect={e => { e.preventDefault(); add('numNode'); }}>
//         Num Node
//       </DropdownMenuItem>
//       <DropdownMenuItem onSelect={e => { e.preventDefault(); add('sumNode'); }}>
//         Sum Node
//       </DropdownMenuItem>
//       <DropdownMenuItem onSelect={e => { e.preventDefault(); add('textOutput'); }}>
//         Result
//       </DropdownMenuItem>
//     </>
//   );
// }

function AddNodeMenuItems({ registry }) {
  const add = useNodeFactory();

  if (!registry?.nodes) return null;

  return (
    <>
      {Object.entries(registry.nodes).map(([type, def]) =>
        def.clientOnly ? (
          <DropdownMenuItem
            key={type}
            onSelect={(e) => {
              e.preventDefault();
              add(type);
            }}
          >
            {def.displayName || type}
          </DropdownMenuItem>
        ) : null
      )}
    </>
  );
}

export default function App() {
  const [nodeRegistry, setNodeRegistry] = useState(null);
  const [nodeTypes, setNodeTypes] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [imageData, setImageData] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const ws = useRef(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const promptRef = useRef('');
  const modelRef = useRef('gpt-image-1');

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
    // Find all node IDs that have outgoing edges
    const nodesWithOutgoingEdges = new Set(edges.map(edge => edge.source));

    // Sink nodes = nodes that are not sources in any edge
    const sinkNodeIds = nodes
      .map(node => node.id)
      .filter(id => !nodesWithOutgoingEdges.has(id));

    if (sinkNodeIds.length === 0) {
      console.warn('⚠️ No sink nodes found.');
      return;
    }

    const { nodes: n2, edges: e2 } = await runFlow({
      nodes,
      edges,
      targetIds: sinkNodeIds, // 🔁 multiple sink support
      setNodes,
      options: { traversal: false, evaluation: true, delay: 500 },
    });

    setNodes(n2);
    setEdges(e2);
  }, [nodes, edges]);

  useEffect(() => {
    const widgetMap = {
      number: NumberField,
      // Add more as needed
    };

    async function initNodeTypes() {
      const reg = await loadNodeRegistry();
      setNodeRegistry(reg);

      window.nodeRegistry = reg; // for MetaNode
      const nt = {};

      for (const [type, def] of Object.entries(reg.nodes)) {
        nt[type] = def.clientOnly ? MetaNode : () => <div>Backend node</div>; // fallback for now
      }

      setNodeTypes(nt);
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
    setNodes([
      // {
      //   id: 'trigger',
      //   type: 'triggerNode',
      //   position: { x: 0, y: 0 },
      //   data: { onTrigger: handleTrigger },
      // },
      // {
      //   id: 'input',
      //   type: 'textInput',
      //   position: { x: 200, y: 0 },
      //   data: { prompt: '', onChange: handlePromptChange },
      // },
      // {
      //   id: 'gen',
      //   type: 'imageGen',
      //   position: { x: 400, y: 0 },
      //   data: { model: 'gpt-img-1', onModelChange: handleModelChange },
      // },
      // {
      //   id: 'display',
      //   type: 'imageDisplay',
      //   position: { x: 600, y: 0 },
      //   data: { imgUrl: '' },
      //   width: 300,
      //   height: 300,
      // },
      // {
      //   id: 'nodeHeaderDemo',
      //   type: 'nodeHeaderDemo',
      //   position: { x: 800, y: 0 },
      // },
      // {
      //   id: 'numNode',
      //   type: 'numNode',
      //   position: { x: 1000, y: 0 },
      //   data: { value: 0 },
      // },
      // {
      //   id: 'sumNode',
      //   type: 'sumNode',
      //   position: { x: 1200, y: 0 },
      //   data: { value: 0 },
      // },
      { id: 'a', type: 'number', data: { value: 0 }, position: { x: 0, y: 0 } },
      { id: 'b', type: 'number', data: { value: 0 }, position: { x: 0, y: 200 } },
      { id: 'd', type: 'number', data: { value: 0 }, position: { x: 0, y: 400 } },
      // { id: 'a', type: 'numNode', data: { value: 0 }, position: { x: 0, y: 0 } },
      // { id: 'b', type: 'numNode', data: { value: 0 }, position: { x: 0, y: 200 } },
      // { id: 'c', type: 'sumNode', data: { value: 0 }, position: { x: 300, y: 100 } },
      // { id: 'd', type: 'numNode', data: { value: 0 }, position: { x: 0, y: 400 } },
      // { id: 'e', type: 'sumNode', data: { value: 0 }, position: { x: 600, y: 400 } },
      // { id: 'f', type: 'textOutput', data: { value: 0 }, position: { x: 900, y: 400 } },
    ]);

    setEdges([
      {
        id: 'a->c',
        type: 'data',
        data: { key: 'value' },
        source: 'a',
        target: 'c',
        targetHandle: 'x',
      },
      {
        id: 'b->c',
        type: 'data',
        data: { key: 'value' },
        source: 'b',
        target: 'c',
        targetHandle: 'y',
      },
      {
        id: 'c->e',
        type: 'data',
        data: { key: 'value' },
        source: 'c',
        target: 'e',
        targetHandle: 'x',
      },
      {
        id: 'd->e',
        type: 'data',
        data: { key: 'value' },
        source: 'd',
        target: 'e',
        targetHandle: 'y',
      },
      {
        id: 'e->f',
        type: 'data',
        data: { key: 'value' },
        source: 'e',
        target: 'f',
        targetHandle: 'value',
      },
    ]);
  }, []);

  useEffect(() => {
    const isDev = window.location.hostname === 'localhost';

    const wsUrl = isDev
      ? 'ws://localhost:5001/ws' // your dev backend
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('✅ WebSocket connected');
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

  const onConnect = useCallback((params) => {
    setEdges((eds) =>
      addEdge(
        {
          ...params,
          type: 'data',
          data: { key: 'value' }, // 🧠 Trick DataEdge into rendering
        },
        eds
      )
    );
  }, []);

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
            >
              <Controls />
              <MiniMap />
              <Background variant="dots" gap={12} size={1} />
              <Panel position="top-right">
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
              <Panel position="bottom-center">
                <button
                  onClick={handleTraversalTrigger}
                  className="!bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition"
                >
                  Run All
                </button>
              </Panel>
              <Panel position="top-left" className="p-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center gap-1 rounded bg-gray-800 px-3 py-1 text-sm hover:bg-gray-700 transition"
                    >
                      <Plus className="text-black h-4 w-4" /> Add node
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent className="w-32">
                    <AddNodeMenuItems registry={window.nodeRegistry || {}} />
                  </DropdownMenuContent>
                </DropdownMenu>
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
