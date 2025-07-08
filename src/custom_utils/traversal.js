// traversal.js

import { nanoid } from 'nanoid';

/* ------------------------------------------------------------------ */
/* 0. Small helpers                                                   */
/* ------------------------------------------------------------------ */
export function buildInputGraph(edges) {
	const g = new Map();
	for (const e of edges) {
		if (!g.has(e.target)) g.set(e.target, []);
		g.get(e.target).push({
			source: e.source,
			sourceHandle: e.sourceHandle,
			targetHandle: e.targetHandle,
		});
	}
	return g;
}

const delay = (ms = 0) => new Promise(r => setTimeout(r, ms));
const flush = () => new Promise(r => requestAnimationFrame(r));

/* ------------------------------------------------------------------ */
/* 1. Client-side evaluators                                          */
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
	if (type === 'textarea_input') return node.data.prompt ?? node.data.text;
	if (type === 'image_model_selector') return node.data.model;
	if (type === 'load_sd_model') return node.data.model;
	if (type === 'display_image') return inputVals.image;

	console.warn(`⚠️ No evaluator for client-only node type: ${type}`);
	return null;
}

/* ------------------------------------------------------------------ */
/* 2. Helper: evaluate server node via WebSocket                      */
/* ------------------------------------------------------------------ */
function makeOnMessage({ reqId, node, resolve, reject, cleanup }) {
	return function onMessage(ev) {
		try {
			const msg = JSON.parse(ev.data);

			if (msg.requestId === reqId || (!msg.requestId && msg.nodeId === node.id)) {
				if (msg.type === 'node-result') {
					cleanup();
					if ('error' in msg) return reject(new Error(msg.error));
					resolve(msg.result);
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

function evaluateServerNode(ws, node, inputVals) {
	return new Promise((resolve, reject) => {
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			return reject(new Error('WebSocket connection is not open'));
		}

		const reqId = nanoid(8);
		let onMessage;

		const cleanup = () => {
			ws.removeEventListener('message', onMessage);
		};

		onMessage = makeOnMessage({
			reqId,
			node,
			resolve,
			reject,
			cleanup,
		});

		ws.addEventListener('message', onMessage);

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
/* 3. Recursive evaluation                                            */
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
	if (visited.has(id)) return;
	visited.add(id);

	const node = nodeMap[id];
	if (!node) {
		console.warn(`⚠️ Node with ID "${id}" is missing — skipping.`);
		return;
	}

	const def = nodeRegistry?.nodes?.[node.data?.type];
	if (!def) {
		console.warn(`⚠️ Missing node definition for type: ${node.data?.type}`);
		return;
	}

	/* ------------------------------------------------------------------
	 * 1. Traversal Highlight (Blue Border)
	 * ------------------------------------------------------------------ */
	if (opts.traversal) {
		setNodes(ns =>
			ns.map(n =>
				n.id === id ? { ...n, data: { ...n.data, traversing: true } } : n
			)
		);
		await flush();
		await delay(opts.delay);
		setNodes(ns =>
			ns.map(n =>
				n.id === id ? { ...n, data: { ...n.data, traversing: false } } : n
			)
		);
		await flush();
	}

	/* ------------------------------------------------------------------
	 * 2. Recurse Upstream & Get Inputs
	 * ------------------------------------------------------------------ */
	const inputs = graph.get(id) ?? [];
	for (const { source } of inputs) {
		if (!memo.has(source)) {
			await evaluateNode({
				id: source,
				graph,
				nodeMap,
				edges,
				setNodes,
				nodeRegistry,
				opts,
				visited,
				memo,
			});
		}
	}

	console.log(`EVALUATING node ${id} (${node.data.type})`);
	const inputVals = {};
	for (const { source, sourceHandle, targetHandle } of inputs) {
		const sourceResult = memo.get(source);
		console.log(`  -> Input from ${source} (${sourceHandle}) to ${id} (${targetHandle})`);
		console.log(`  -> Raw sourceResult from memo:`, sourceResult);

		if (sourceResult === undefined || sourceResult === null) {
			continue;
		}

		let valueToPass;

		// If the source node's output is an object, select the correct property.
		if (typeof sourceResult === 'object' && !Array.isArray(sourceResult)) {
			// The edge's sourceHandle tells us which output property to use.
			if (sourceHandle && sourceHandle in sourceResult) {
				valueToPass = sourceResult[sourceHandle];
			} else {
				// Fallback for older nodes or single-output nodes that return an object
				// but don't have a specific handle matched.
				valueToPass = sourceResult.value ?? sourceResult.response ?? sourceResult;
			}
		} else {
			// If the output is a primitive value, pass it directly.
			valueToPass = sourceResult;
		}
		inputVals[targetHandle] = valueToPass;
		console.log(`  -> Value passed:`, valueToPass);
	}
	console.log(`  => Final inputVals for ${id}:`, inputVals);

	/* ------------------------------------------------------------------
	 * 3. Evaluation Highlight (Green Border) & Execution
	 * ------------------------------------------------------------------ */
	if (opts.evaluation) {
		setNodes(ns =>
			ns.map(n =>
				n.id === id ? { ...n, data: { ...n.data, evaluating: true } } : n
			)
		);
		await flush();
		await delay(opts.delay);
	}

	let newVal;
	if (def.clientOnly) {
		newVal = evaluateClientNode(node, def, inputVals);
		if (nodeMap[id]) {
			const paramKeys = Object.keys(def.params || {});
			const outputKey = paramKeys[0] || 'value';
			//console.log("1: paramKeys", paramKeys);
			//console.log("2: outputKey", outputKey);
			//console.log("3: node", node);
			//console.log("4: def", def);
			//console.log("5: inputVals", inputVals);
			//console.log("6: newVal", newVal);
			nodeMap[id].data[outputKey] = newVal;
		}
	} else {
		try {
			// The `await` here naturally pauses the function, keeping the
			// green border on the streaming node until it's done.
			newVal = await evaluateServerNode(opts.ws, node, inputVals);

			const fields = newVal && typeof newVal === 'object' && !Array.isArray(newVal)
				? newVal
				: { value: newVal };

			const nodeData = nodeMap[id].data;
			for (const [k, v] of Object.entries(fields)) {
				nodeData[k] = v;
			}
			if (typeof fields === 'object' && 'response' in fields) {
				nodeData.value = fields.response;
			}
		} catch (err) {
			console.error(`🧨 Remote eval failed for ${node.id}:`, err);
			newVal = null;
		}
	}

	memo.set(id, newVal);
	console.log(`  <= Memoized result for ${id}:`, newVal);

	/* ------------------------------------------------------------------
	 * 4. Final UI Update (Removes Highlight)
	 * ------------------------------------------------------------------ */
	setNodes(ns =>
		ns.map(n =>
			n.id === id
				? {
					...n,
					data: {
						...n.data, // Keep transient fields from App.jsx
						...nodeMap[id].data, // Overwrite with authoritative data
						evaluating: false, // Turn off the highlight
						progress: undefined, // Clear progress bar
						status: undefined, // Clear status message
					},
				}
				: n
		)
	);
	await flush();

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
	const nodeMap = Object.fromEntries(nodes.map(n => [n.id, JSON.parse(JSON.stringify(n))]));
	const memo = new Map();
	//console.log("3: graph", graph);

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

	const finalNodes = Object.values(nodeMap);
	const updatedEdges = edges.map((e) => {
		const sourceNode = nodeMap[e.source];
		if (!sourceNode) return e;
		const def = nodeRegistry?.nodes?.[sourceNode.data?.type];
		const showLabel = def?.showOutputOnEdge !== false;
		const label = sourceNode.data.value ?? sourceNode.data.response ?? '';
		return {
			...e,
			data: {
				...e.data,
				label: showLabel ? String(label) : '',
			},
		};
	});

	setNodes(finalNodes);
	return { nodes: finalNodes, edges: updatedEdges };
}