import { Handle, Position } from '@xyflow/react';

export default function TextInputNode({ data }) {
	return (
		<div className="p-4 bg-white rounded shadow-md border border-gray-300 text-center relative w-64">
			{/* Output handle (right side) */}
			<Handle type="source" position={Position.Right} className="w-2 h-2 bg-green-500" />

			<p className="text-sm font-medium mb-2">Prompt:</p>
			<textarea
				rows={4}
				defaultValue={data.prompt}
				onChange={(e) => data.onChange?.(e.target.value)}
				className="w-full p-2 border border-gray-300 rounded text-sm resize-none"
			/>

			{/* Optional input handle (left side) if you want chaining */}
			<Handle type="target" position={Position.Left} className="w-2 h-2 bg-blue-500" />
		</div>
	);
}
