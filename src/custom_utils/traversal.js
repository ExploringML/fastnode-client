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

	console.warn(`⚠️ No evaluator for client-only node type: ${type}`);
	return null;
}

/* ------------------------------------------------------------------ */
/* 2. NEW helper: call backend via WebSocket                           */
/* ------------------------------------------------------------------ */
function evaluateServerNode(ws, node, inputVals, timeoutMs = 5000) {
	return new Promise((resolve, reject) => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			return reject(new Error('WebSocket not open'));
		}

		const reqId = nanoid(8);

		const onMessage = (ev) => {
			try {
				const msg = JSON.parse(ev.data);
				if (msg.type === 'node-result' && msg.requestId === reqId) {
					ws.removeEventListener('message', onMessage);
					if ('error' in msg) reject(new Error(msg.error));
					else resolve(msg.result);
				}
			} catch {
				/* ignore non-JSON frames */
			}
		};

		ws.addEventListener('message', onMessage);

		// fire request
		ws.send(JSON.stringify({
			type: 'evaluate-node',
			requestId: reqId,
			nodeType: node.data.type,
			nodeId: node.id,
			inputs: inputVals,
			params: node.data          // send full data payload
		}));

		// safety timeout
		setTimeout(() => {
			ws.removeEventListener('message', onMessage);
			reject(new Error('Node evaluation timeout'));
		}, timeoutMs);
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
			newVal = await evaluateServerNode(opts.ws, node, inputVals);
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
	ws,                              // NEW  ← pass ws.current
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

	const updatedEdges = edges.map(e => ({
		...e,
		data: {
			...e.data,
			label: (nodeMap[e.source]?.data?.value ?? '').toString(),
		},
	}));

	return { nodes: Object.values(nodeMap), edges: updatedEdges };
}
