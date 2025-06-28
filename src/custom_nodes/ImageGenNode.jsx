import { Handle, Position } from '@xyflow/react';

export default function ImageGenNode({ data }) {
	return (
		<div className="p-4 bg-white rounded shadow-md border border-gray-300 text-center relative">
			{/* Input handle (left side) */}
			<Handle type="target" position={Position.Left} className="w-2 h-2 bg-blue-500" />

			<p className="text-sm font-medium mb-2">Select Model:</p>
			<select
				value={data.model}
				onChange={(e) => data.onModelChange?.(e.target.value)}
				className="w-full p-1 border border-gray-300 rounded text-sm"
			>
				<option value="gpt-image-1">GPT Image 1</option>
				<option value="dall-e-3">DALL·E 3</option>
			</select>

			{/* Output handle (right side) */}
			<Handle type="source" position={Position.Right} className="w-2 h-2 bg-green-500" />
		</div>
	);
}
