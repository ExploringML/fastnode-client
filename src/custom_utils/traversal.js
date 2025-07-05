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

	if (type === 'number') return node.data.value ?? 0;
	if (type === 'sum') {
		const x = Number(inputVals.x) || 0;
		const y = Number(inputVals.y) || 0;
		const result = x + y;
		node.data.result = result;
		return result;
	}
	if (type === 'display_text') {
		const val = inputVals.value;
		return typeof val === 'number' ? val.toString() : val ?? '';
	}
	if (type === 'textarea_input') return node.data.text;
	if (type === 'image_model_selector') return node.data.model;

	console.warn(`⚠️ No evaluator for client-only node type: ${type}`);
	return null;
}

/* ------------------------------------------------------------------ */
/* 2. Helper: evaluate server node via WebSocket with progress support*/
/* ------------------------------------------------------------------ */
function getDirectTargets(sourceId, edges) {
	if (!edges) return []; // Add a guard for safety
	return edges
		.filter(e => e.source === sourceId)
		.map(e => e.target);
}

function makeOnMessage({ reqId, node, edges, setNodes, nodeMap, resolve, reject, cleanup, resetProgressTimeout }) {
	return function onMessage(ev) {
		try {
			const msg = JSON.parse(ev.data);

			if (msg.requestId === reqId || (!msg.requestId && msg.nodeId === node.id)) {
				if (msg.type === 'node-stream') {
					console.log("333. node-stream", msg);
					const increment = msg.data ?? '';
					const downstreamTargets = getDirectTargets(msg.nodeId, edges);

					// This is the key: we update React's state for the UI, and ALSO update
					// the 'nodeMap' that the rest of the runFlow evaluation relies on.
					setNodes(ns =>
						ns.map(n => {
							// 1. For the source LLM node, accumulate the result in its 'response' field.
							if (n.id === msg.nodeId) {
								const newText = (n.data.response || '') + increment;

								// Update the internal map for the evaluation process
								if (nodeMap[n.id]) {
									nodeMap[n.id].data.response = newText;
								}

								// Update the React state for the UI
								return { ...n, data: { ...n.data, response: newText } };
							}

							// 2. For any connected target nodes, update their 'value' field.
							if (downstreamTargets.includes(n.id)) {
								const newText = (n.data.value || '') + increment;

								// Update the internal map for the evaluation process
								if (nodeMap[n.id]) {
									nodeMap[n.id].data.value = newText;
								}

								// Update the React state for the UI
								return { ...n, data: { ...n.data, value: newText } };
							}

							return n;
						})
					);
					return; // End processing for this message
				}

				if (msg.type === 'node-progress') {
					resetProgressTimeout();
					setNodes(ns =>
						ns.map(n =>
							n.id === node.id
								? {
									...n,
									data: {
										...n.data,
										progress: msg.progress,
										status: msg.message || 'Processing…',
									},
								}
								: n
						)
					);
					return;
				}

				if (msg.type === 'node-result') {
					cleanup();

					if ('error' in msg) return reject(new Error(msg.error));
					const result = msg.result;

					const fields =
						result && typeof result === 'object' && !Array.isArray(result)
							? result
							: { value: result };

					setNodes(ns =>
						ns.map(n =>
							n.id === node.id ? { ...n, data: { ...n.data, ...fields } } : n
						)
					);

					const nodeData = nodeMap[node.id].data;
					for (const [k, v] of Object.entries(fields)) nodeData[k] = v;

					console.log("222. FFF evaluateServerNode", fields);
					if (typeof fields === 'object') {
						if ('value' in fields) nodeData.value = fields.value;
						else if ('response' in fields) nodeData.value = fields.response;
						else if ('result' in fields) nodeData.value = fields.result;
						else if ('image' in fields) nodeData.image = fields.image;
					} else {
						nodeData.value = fields;
					}

					resolve(fields);
					return;
				}

				if (msg.type === 'node-error') {
					cleanup();
					reject(new Error(msg.error || 'Server returned error'));
					return;
				}
			}
		} catch (e) {
			console.warn('Failed to parse WebSocket message:', e);
		}
	};
}

function evaluateServerNode(
	ws,
	node,
	inputVals,
	setNodes,
	nodeMap,
	edges,
	maxTimeoutMs = 300000
) {
	return new Promise((resolve, reject) => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			return reject(new Error('WebSocket connection is not open'));
		}

		const reqId = nanoid(8);
		let progressTimeoutHandle;
		let maxTimeoutHandle;
		let onMessage; // declared here so we can refer to the exact instance for removal

		const cleanup = () => {
			clearTimeout(progressTimeoutHandle);
			clearTimeout(maxTimeoutHandle);
			ws.removeEventListener('message', onMessage);

			setNodes &&
				setNodes(ns =>
					ns.map(n =>
						n.id === node.id
							? { ...n, data: { ...n.data, progress: undefined, status: undefined } }
							: n
					)
				);
		};

		const resetProgressTimeout = () => {
			clearTimeout(progressTimeoutHandle);
			progressTimeoutHandle = setTimeout(() => {
				cleanup();
				reject(new Error('No progress updates received – connection may be lost'));
			}, 30000);
		};

		onMessage = makeOnMessage({
			reqId,
			node,
			edges,
			setNodes,
			nodeMap,
			resolve,
			reject,
			cleanup,
			resetProgressTimeout,
		});

		ws.addEventListener('message', onMessage);
		resetProgressTimeout();

		ws.send(
			JSON.stringify({
				type: 'evaluate-node',
				requestId: reqId,
				nodeType: node.data.type,
				nodeId: node.id,
				inputs: { ...inputVals, id: node.id },
				params: node.data,
			})
		);
	});
}

/* ------------------------------------------------------------------ */
/* 3. Recursive evaluation                                           */
/* ------------------------------------------------------------------ */
async function evaluateNode({
	id,
	graph,
	nodeMap,
	edges,
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

	/* 1. traversal highlight (visual only) ------------------------- */
	if (opts.traversal) {
		setNodes((ns) =>
			ns.map((n) =>
				n.id === id ? { ...n, data: { ...n.data, traversing: true } } : n
			)
		);
		await flush();
		await delay(opts.delay);
		setNodes((ns) =>
			ns.map((n) =>
				n.id === id ? { ...n, data: { ...n.data, traversing: false } } : n
			)
		);
		await flush();
	}

	/* 2. recurse upstream ------------------------------------------ */
	const inputs = graph.get(id) ?? [];

	if (memo.has(id)) {
		for (const { source } of inputs) {
			await evaluateNode({
				id: source,
				graph,
				nodeMap,
				setNodes,
				nodeRegistry,
				opts,
				visited,
				memo,
			});
		}
		return memo.get(id);
	}

	for (const { source } of inputs) {
		await evaluateNode({
			id: source,
			graph,
			nodeMap,
			setNodes,
			nodeRegistry,
			opts,
			visited,
			memo,
		});
	}

	/* 3. build inputVals ------------------------------------------- */
	const inputVals = {};
	for (const { source, handle } of inputs) {
		const rawVal = memo.get(source) ?? nodeMap[source]?.data?.value;
		inputVals[handle] = (
			rawVal && typeof rawVal === 'object' && !Array.isArray(rawVal)
				? rawVal.value ?? rawVal.response ?? rawVal
				: rawVal
		);
	}

	// const inputVals = {};
	// for (const { source, handle } of inputs) {
	// 	inputVals[handle] = nodeMap[source]?.data?.value;
	// }

	/* 4. evaluate --------------------------------------------------- */
	let newVal;
	if (def.clientOnly) {
		newVal = evaluateClientNode(node, def, inputVals);

		// This saves the result for client nodes, preventing it from being lost.
		nodeMap[id].data.value = newVal;
	} else {
		try {
			newVal = await evaluateServerNode(
				opts.ws,
				node,
				inputVals,
				setNodes,
				nodeMap,
				edges
			);
		} catch (err) {
			console.error(`🧨 Remote eval failed for ${node.id}:`, err);
			newVal = null;
		}
	}

	// nodeMap[id].data.value = newVal;
	// if (def.params?.image) nodeMap[id].data.image = newVal;

	/* 5. evaluation highlight -------------------------------------- */
	
	if (opts.evaluation) {
		// start of highlight (unchanged)
		setNodes(ns =>
			ns.map(n =>
				n.id === id ? { ...n, data: { ...n.data, evaluating: true } } : n
			)
		);
		await flush();
		await delay(opts.delay);

		// ✅ end-of-evaluation  ─ merge nodeMap[id].data so image & other
		//    fields survive, plus turn evaluating flag off
		setNodes(ns =>
			ns.map(n =>
				n.id === id
					? {
						...n,
						data: {
							...n.data,            // existing transient fields
							...nodeMap[id].data,  // ← authoritative fields (image, tokens, …)
							evaluating: false,
						},
					}
					: n
			)
		);
		await flush();
	} else {
		// no highlight mode  ─ just merge authoritative data
		setNodes(ns =>
			ns.map(n =>
				n.id === id
					? { ...n, data: { ...n.data, ...nodeMap[id].data } }
					: n
			)
		);
	}

	memo.set(id, newVal);
	visited.delete(id);
	return newVal;
}

/* ------------------------------------------------------------------ */
/* 4. Public entry: runFlow                                          */
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
	const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, { ...n }]));
	const memo = new Map();

	for (const tid of targetIds) {
		await evaluateNode({
			id: tid,
			graph,
			nodeMap,
			edges,
			setNodes,
			nodeRegistry,
			opts: { ...options, ws },
			memo,
		});
	}

	const updatedEdges = edges.map((e) => {
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
