/* Build adjacency map:  targetId → [{ source, handle }] */
export function buildInputGraph(edges) {
	const g = new Map();
	for (const e of edges) {
		if (!g.has(e.target)) g.set(e.target, []);
		g.get(e.target).push({ source: e.source, handle: e.targetHandle });
	}
	return g;
}

const delay = (ms = 0) => new Promise(r => setTimeout(r, ms));
const flush = () => new Promise(r => requestAnimationFrame(r));

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

	// ---------- 1. traversal highlight ----------
	if (opts.traversal) {
		setNodes(ns => ns.map(n => n.id === id
			? { ...n, data: { ...n.data, traversing: true } }
			: n));
		await flush(); await delay(opts.delay);
		setNodes(ns => ns.map(n => n.id === id
			? { ...n, data: { ...n.data, traversing: false } }
			: n));
		await flush();
	}

	// ---------- 2. recursive upstream walk ----------
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

	// ---------- 3. build inputVals from edges ----------
	const node = nodeMap[id];
	const def = nodeRegistry?.nodes?.[node.data?.type];

	if (!def) {
		console.warn(`⚠️ Missing node definition for type: ${node.data?.type}`);
		return 0;
	}

	const inputVals = {};
	for (const { source, handle } of inputs) {
		inputVals[handle] = nodeMap[source]?.data?.value;
	}

	let newVal;

	if (def.clientOnly) {
		newVal = evaluateClientNode(node, def, inputVals);
	} else {
		// 🔧 Stub for backend evaluation
		console.warn(`🔄 Backend execution not implemented for: ${node.data?.type}`);
		newVal = null;
	}

	nodeMap[id].data.value = newVal; // store into nodeMap

	// ---------- 4. evaluation highlight ----------
	if (opts.evaluation) {
		setNodes(ns => ns.map(n => n.id === id
			? { ...n, data: { ...n.data, evaluating: true } }
			: n));
		await flush(); await delay(opts.delay);
		setNodes(ns => ns.map(n => n.id === id
			? { ...n, data: { ...n.data, evaluating: false, value: newVal } }
			: n));
		await flush();
	} else {
		setNodes(ns => ns.map(n => n.id === id
			? { ...n, data: { ...n.data, value: newVal } }
			: n));
	}

	memo.set(id, newVal);
	visited.delete(id);
	return newVal;
}

export async function runFlow({
	nodes,
	edges,
	targetIds,
	setNodes,
	nodeRegistry,
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
			opts: options,
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
