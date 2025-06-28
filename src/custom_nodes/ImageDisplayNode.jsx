import { memo } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';

export default function ImageDisplayNode({ data, selected }) {
	return (
		<div className="relative min-w-[150px] min-h-[100px] w-full h-full p-4 bg-white rounded shadow-md border border-gray-300 text-center flex flex-col">
			<NodeResizer
				color="#68a3e4"
				isVisible={selected}
				minWidth={150}
				minHeight={100}
			/>
			<Handle type="target" position={Position.Left} className="w-2 h-2 bg-blue-500" />
			<p className="text-sm mb-1">Generated Image</p>
			<div className="relative flex-1 w-full overflow-hidden flex items-center justify-center">
				{data.imgUrl ? (
					<img
						src={data.imgUrl}
						alt="Generated"
						className="max-w-full max-h-full object-contain"
					/>
				) : (
					<p className="text-xs text-gray-500">No image yet</p>
				)}
			</div>
		</div>
	);
}
