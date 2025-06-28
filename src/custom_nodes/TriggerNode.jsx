import { Handle, Position } from '@xyflow/react';

export default function TriggerNode({ data }) {
	return (
		<div className="p-4 bg-white border-2 border-green-500 rounded shadow-md text-center relative w-48">
			<Handle type="source" position={Position.Right} />

			<p className="font-semibold text-green-700 mb-2">Manual Trigger</p>
			<button
				onClick={data.onTrigger}
				className="px-3 py-1 text-sm bg-green-500 rounded hover:bg-green-600 transition"
			>
				▶️ Run
			</button>
		</div>
	);
}
