import React, { useCallback } from 'react';
import { type Node, type NodeProps, Position, useReactFlow } from '@xyflow/react';

import { BaseNode } from '@/components/base-node';
import { LabeledHandle } from '@/components/labeled-handle';
import {
	NodeHeader,
	NodeHeaderTitle,
	NodeHeaderActions,
	NodeHeaderMenuAction,
} from '@/components/node-header';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from "@/lib/utils";

export type NumNode = Node<{
	value: number;
}>;

export default function NumNode({ id, data, selected }: NodeProps<NumNode>) {
	const { updateNodeData, setNodes } = useReactFlow();

	const handleReset = useCallback(() => {
		updateNodeData(id, { value: 0 });
	}, [id, updateNodeData]);

	const handleDelete = useCallback(() => {
		setNodes((nodes) => nodes.filter((node) => node.id !== id));
	}, [id, setNodes]);

	const handleIncr = useCallback(() => {
		updateNodeData(id, { value: data.value + 1 });
	}, [id, data.value, updateNodeData]);

	const handleDecr = useCallback(() => {
		updateNodeData(id, { value: data.value - 1 });
	}, [id, data.value, updateNodeData]);

	return (
		<BaseNode
			selected={selected}
			className={cn(
				"px-3 py-2",
				data.traversing && "ring-2 ring-blue-400",
				data.evaluating && "ring-2 ring-green-400"
			)}
		>
			<NodeHeader className="-mx-3 -mt-2 border-b">
				<NodeHeaderTitle>
					<div className="flex items-center gap-1">
						Num
						<span className="text-xs text-gray-500">
							[{id.length > 3 ? id.slice(0, 3) + '…' : id}]
						</span>
					</div>
				</NodeHeaderTitle>
				<NodeHeaderActions>
					<NodeHeaderMenuAction label="Open node menu">
						<DropdownMenuItem onSelect={handleReset}>Reset</DropdownMenuItem>
						<DropdownMenuItem onSelect={handleDelete}>Delete</DropdownMenuItem>
					</NodeHeaderMenuAction>
				</NodeHeaderActions>
			</NodeHeader>

			<div className="flex gap-2 items-center my-4 mx-3">
				<Button className="!bg-gray-900 text-gray-100 !p-3 !rounded-xs w-3 h-3" onClick={handleDecr}>-</Button>

				<div className="w-6 h-6 flex items-center justify-center text-gray-900 font-mono">
					{String(data.value).padStart(3, ' ')}
				</div>

				<Button className="!bg-gray-900 text-gray-100 !p-3 !rounded-xs w-3 h-3" onClick={handleIncr}>+</Button>
			</div>

			<footer className="bg-gray-100 -mx-3 -mb-2 rounded-b-sm">
				<LabeledHandle title="out" type="source" position={Position.Right} />
			</footer>
		</BaseNode>
	);
}