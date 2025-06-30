export async function loadNodeRegistry({ forceRefresh = false } = {}) {
	const isDev = import.meta.env.DEV;
	const storage = isDev ? localStorage : sessionStorage;
	const STORAGE_KEY = "node-registry";
	const VERSION_KEY = "node-registry-version";
	const EXPECTED_VERSION = "1.0.0"; // ⬅️ Update this when registry format changes

	if (!forceRefresh) {
		const cached = storage.getItem(STORAGE_KEY);
		const cachedVersion = storage.getItem(VERSION_KEY);

		if (cached && cachedVersion === EXPECTED_VERSION) {
			try {
				return JSON.parse(cached);
			} catch (e) {
				console.warn("Corrupt registry cache. Refetching...");
			}
		}
	}

	// fetch from backend
	const api = isDev ? "http://localhost:5001" : "";
	const res = await fetch(`${api}/node-registry`);
	if (!res.ok) throw new Error("Failed to load node registry");

	const data = await res.json();

	// update cache
	storage.setItem(STORAGE_KEY, JSON.stringify(data));
	storage.setItem(VERSION_KEY, EXPECTED_VERSION);

	return data;
}
