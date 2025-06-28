export async function loadNodeRegistry() {
	const cached = localStorage.getItem("node-registry");
	if (cached) return JSON.parse(cached);

	const api = import.meta.env.DEV
		? "http://localhost:5001"          // <- backend dev port
		: "";                              // same-origin in production

	const res = await fetch(`${api}/node-registry`);
	const data = await res.json();
	localStorage.setItem("node-registry", JSON.stringify(data));
	return data;
}
