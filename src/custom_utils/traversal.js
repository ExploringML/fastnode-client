// traversal.js  ────────────────────────────────────────────────────────────
// A drop-in upgrade that can evaluate non-client nodes through the backend
// over an open WebSocket.
// ──────────────────────────────────────────────────────────────────────────

import { nanoid } from 'nanoid';   // tiny unique ids for WS request tracking

/* ------------------------------------------------------------------ */
/* 0. Small helpers                                                   */
/* ------------------------------------------------------------------ */
export function buildInputGraph(edges) {
	const g = new Map();            // targetId → [ {source, handle} ]
	for (const e of edges) {
		if (!g.has(e.target)) g.set(e.target, []);
		g.get(e.target).push({ source: e.source, handle: e.targetHandle });
	}
	return g;
}

const delay = (ms = 0) => new Promise(r => setTimeout(r, ms));
const flush = () => new Promise(r => requestAnimationFrame(r));

/* ------------------------------------------------------------------ */
/* 1. Client-side evaluators (unchanged)                              */
/* ------------------------------------------------------------------ */
function evaluateClientNode(node, def, inputVals) {
	const type = node.data?.type;

	if (type === 'number') {
		return node.data.value ?? 0;
	}

	if (type === 'sum') {
		const x = Number(inputVals['x']) || 0;
		const y = Number(inputVals['y']) || 0;
		const result = x + y;
		node.data.result = result;
		return result;
	}

	if (type === 'display_text') {
		const val = inputVals['value'];
		const str = typeof val === 'number' ? val.toString() : val ?? '';
		node.data.text = str;
		return str;
	}

	if (type === 'textarea_input') {
		return node.data.text;
	}

	// if (type === 'select') {
	// 	return node.data.value;
	// }

	// NEW: image model selector just outputs currently selected model key
	if (type === 'image_model_selector') {
		return node.data.model;
	}

	console.warn(`⚠️ No evaluator for client-only node type: ${type}`);
	return null;
}

/* ------------------------------------------------------------------ */
/* 2. NEW helper: call backend via WebSocket with progress support     */
/* ------------------------------------------------------------------ */
function evaluateServerNode(ws, node, inputVals, setNodes, maxTimeoutMs = 300000) { // 5 min max
	return new Promise((resolve, reject) => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			return reject(new Error('WebSocket connection is not open'));
		}

		const reqId = nanoid(8);
		let progressTimeoutHandle;
		let maxTimeoutHandle;

		// FALLBACK: Absolute maximum timeout (5 minutes)
		maxTimeoutHandle = setTimeout(() => {
			cleanup();
			reject(new Error(`Absolute timeout reached (${maxTimeoutMs / 1000}s) - cancelling operation`));
		}, maxTimeoutMs);

		const cleanup = () => {
			clearTimeout(progressTimeoutHandle);
			clearTimeout(maxTimeoutHandle);
			ws.removeEventListener('message', onMessage);

			// Clear progress indicators from node
			setNodes && setNodes(ns => ns.map(n =>
				n.id === node.id
					? { ...n, data: { ...n.data, progress: undefined, status: undefined } }
					: n
			));
		};

		// Progress timeout (resets every time we get progress)
		const resetProgressTimeout = () => {
			clearTimeout(progressTimeoutHandle);
			progressTimeoutHandle = setTimeout(() => {
				cleanup();
				reject(new Error('No progress updates received - connection may be lost'));
			}, 30000); // 30s between progress updates
		};

		const onMessage = (ev) => {
			try {
				const msg = JSON.parse(ev.data);

				if (msg.requestId === reqId || (!msg.requestId && msg.nodeId === node.id)) {
					if (msg.type === 'node-progress') {
						// ✅ Server is alive and working - reset progress timeout
						resetProgressTimeout();

						// Update UI with progress
						setNodes && setNodes(ns => ns.map(n =>
							n.id === node.id
								? { ...n, data: { ...n.data, progress: msg.progress, status: msg.message || 'Processing...' } }
								: n
						));

					} else if (msg.type === 'node-result') {
						cleanup();
						if ('error' in msg) reject(new Error(msg.error));
						else resolve(msg.result);

					} else if (msg.type === 'node-error') {
						cleanup();
						reject(new Error(msg.error || 'Server returned error'));
					}
				}
			} catch (e) {
				// Ignore malformed messages, don't crash
				console.warn('Failed to parse WebSocket message:', e);
			}
		};

		ws.addEventListener('message', onMessage);
		resetProgressTimeout(); // Start progress monitoring

		// Send initial request
		ws.send(JSON.stringify({
			type: 'evaluate-node',
			requestId: reqId,
			nodeType: node.data.type,
			nodeId: node.id,
			inputs: inputVals,
			params: node.data
		}));
	});
}

/* ------------------------------------------------------------------ */
/* 3. Recursive evaluation                                            */
/* ------------------------------------------------------------------ */
async function evaluateNode({
	id,
	graph,
	nodeMap,
	setNodes,
	nodeRegistry,
	opts,
	visited = new Set(),
	memo = new Map(),
}) {
	if (visited.has(id)) return 0;
	visited.add(id);

	const node = nodeMap[id];
	if (!node) {
		console.warn(`⚠️ Node with ID "${id}" is missing — skipping.`);
		return 0;
	}

	const def = nodeRegistry?.nodes?.[node.data?.type];
	if (!def) {
		console.warn(`⚠️ Missing node definition for type: ${node.data?.type}`);
		return 0;
	}

	/* 1. traversal highlight (unchanged) */
	if (opts.traversal) {
		setNodes(ns => ns.map(n =>
			n.id === id ? { ...n, data: { ...n.data, traversing: true } } : n
		));
		await flush(); await delay(opts.delay);
		setNodes(ns => ns.map(n =>
			n.id === id ? { ...n, data: { ...n.data, traversing: false } } : n
		));
		await flush();
	}

	/* 2. recurse upstream */
	const inputs = graph.get(id) ?? [];

	if (memo.has(id)) {
		for (const { source } of inputs) {
			await evaluateNode({ id: source, graph, nodeMap, setNodes, nodeRegistry, opts, visited, memo });
		}
		return memo.get(id);
	}

	for (const { source } of inputs) {
		await evaluateNode({ id: source, graph, nodeMap, setNodes, nodeRegistry, opts, visited, memo });
	}

	/* 3. build inputVals */
	const inputVals = {};
	for (const { source, handle } of inputs) {
		inputVals[handle] = nodeMap[source]?.data?.value;
	}

	/* 4. evaluate */
	let newVal;
	if (def.clientOnly) {
		newVal = evaluateClientNode(node, def, inputVals);
	} else {
		try {
			newVal = await evaluateServerNode(opts.ws, node, inputVals, setNodes);
		} catch (err) {
			console.error(`🧨 Remote eval failed for ${node.id}:`, err);
			newVal = null;
		}
	}
	nodeMap[id].data.value = newVal;

	/* 5. evaluation highlight (unchanged) */
	if (opts.evaluation) {
		setNodes(ns => ns.map(n =>
			n.id === id ? { ...n, data: { ...n.data, evaluating: true } } : n
		));
		await flush(); await delay(opts.delay);
		setNodes(ns => ns.map(n =>
			n.id === id ? { ...n, data: { ...n.data, evaluating: false, value: newVal } } : n
		));
		await flush();
	} else {
		setNodes(ns => ns.map(n =>
			n.id === id ? { ...n, data: { ...n.data, value: newVal } } : n
		));
	}

	memo.set(id, newVal);
	visited.delete(id);
	return newVal;
}

/* ------------------------------------------------------------------ */
/* 4. Public entry: runFlow                                           */
/* ------------------------------------------------------------------ */
export async function runFlow({
	nodes,
	edges,
	targetIds,
	setNodes,
	nodeRegistry,
	ws,
	options = { traversal: true, evaluation: true, delay: 300 },
}) {
	const graph = buildInputGraph(edges);
	const nodeMap = Object.fromEntries(nodes.map(n => [n.id, { ...n }]));
	const memo = new Map();

	for (const tid of targetIds) {
		await evaluateNode({
			id: tid,
			graph,
			nodeMap,
			setNodes,
			nodeRegistry,
			opts: { ...options, ws },   // thread WS down
			memo,
		});
	}

	const updatedEdges = edges.map(e => {
		const sourceNode = nodeMap[e.source];
		const sourceType = sourceNode?.data?.type;
		const def = nodeRegistry?.nodes?.[sourceType];
		const showLabel = def?.showOutputOnEdge !== false;

		return {
			...e,
			data: {
				...e.data,
				label: showLabel ? (sourceNode?.data?.value ?? '').toString() : '',
			},
		};
	});

	return { nodes: Object.values(nodeMap), edges: updatedEdges };
}
