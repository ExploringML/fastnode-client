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

async function evaluateNode({
	id,
	graph,
	nodeMap,
	setNodes,
	opts,
	visited = new Set(),
	memo = new Map(),
}) {
	//console.log('evaluating node', id);

	if (visited.has(id)) return 0;            // break cycles
	visited.add(id);

	/* ---------- 1. traversal highlight (on entry) ---------- */
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

	if (memo.has(id)) {
		// Still walk upstream for traversal highlighting & correctness
		const inputs = graph.get(id) ?? [];
		for (const { source } of inputs) {
			await evaluateNode({ id: source, graph, nodeMap, setNodes, opts, visited, memo });
		}
		return memo.get(id);
	}

	/* ---------- 2. visit upstream nodes ---------- */
	const inputs = graph.get(id) ?? [];
	for (const { source } of inputs) {
		await evaluateNode({ id: source, graph, nodeMap, setNodes, opts, visited, memo });
	}

	/* ---------- 3. generic value calculation ---------- */
	const upstreamVals = inputs
		.map(({ source }) => nodeMap[source]?.data?.value)
		.filter(v => typeof v === 'number');

	let newVal;
	if (upstreamVals.length === 0) newVal = nodeMap[id].data.value ?? 0;
	else if (upstreamVals.length === 1) newVal = upstreamVals[0];
	else newVal = upstreamVals.reduce((a, b) => a + b, 0);

	nodeMap[id].data.value = newVal;   // keep internal copy

	/* ---------- 4. evaluation highlight (on exit) ---------- */
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
		// still push the computed value to the canvas
		setNodes(ns => ns.map(n => n.id === id
			? { ...n, data: { ...n.data, value: newVal } }
			: n));
	}

	memo.set(id, newVal);
	visited.delete(id);
	return newVal;
}

export async function runFlow({ nodes, edges, targetIds, setNodes,
	options = { traversal: true, evaluation: true, delay: 300 } }) {
	const graph = buildInputGraph(edges);
	const nodeMap = Object.fromEntries(nodes.map(n => [n.id, { ...n }]));
	const memo = new Map();

	for (const tid of targetIds) {
		await evaluateNode({ id: tid, graph, nodeMap, setNodes, opts: options, memo });
	}

	/* edge-label refresh (optional) */
	const updatedEdges = edges.map(e => ({
		...e,
		data: {
			...e.data,
			label: (nodeMap[e.source]?.data?.value ?? '').toString()
		}
	}));

	return { nodes: Object.values(nodeMap), edges: updatedEdges };
}
