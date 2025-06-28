import React, { useCallback } from 'react';
import {
	type Node,
	type NodeProps,
	Position,
	useReactFlow,
	useStore,
} from '@xyflow/react';
import { BaseNode } from '@/components/base-node';
import { LabeledHandle } from '@/components/labeled-handle';
import { NodeHeader, NodeHeaderTitle, NodeHeaderActions, NodeHeaderMenuAction } from '@/components/node-header';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from "@/lib/utils";

export type DisplayNode = Node<{
	value: number;
}>;

export default function TextOutput({ id, data, selected }: NodeProps<DisplayNode>) {
	const { getHandleConnections, setNodes } = useReactFlow();

	const value = useStore((state) => {
		const connections = getHandleConnections({ nodeId: id, id: 'value', type: 'target' });
		return getHandleValue(connections, state.nodeLookup);
	});

	const handleDelete = useCallback(() => {
		setNodes((nodes) => nodes.filter((node) => node.id !== id));
	}, [id, setNodes]);

	return (
		<BaseNode
			selected={selected}
			className={cn(
				"px-3 py-2 w-40",
				data.traversing && "ring-2 ring-blue-400",
				data.evaluating && "ring-2 ring-green-400"
			)}
		>
			<NodeHeader className="-mx-3 -mt-2 border-b">
				<NodeHeaderTitle>
					<div className="flex items-center gap-1">
						Result
						<span className="text-xs text-gray-500">
							[{id.length > 3 ? id.slice(0, 3) + '…' : id}]
						</span>
					</div>
				</NodeHeaderTitle>
				<NodeHeaderActions>
					<NodeHeaderMenuAction label="Open node menu">
						<DropdownMenuItem onSelect={handleDelete}>Delete</DropdownMenuItem>
					</NodeHeaderMenuAction>
				</NodeHeaderActions>
			</NodeHeader>

			<div className="py-2 text-sm text-center">
				{typeof value === 'number' ? value : '—'}
			</div>

			<footer className="bg-gray-100 -mx-3 -mb-2 rounded-b-sm">
				<LabeledHandle title="value" id="value" type="target" position={Position.Left} />
			</footer>
		</BaseNode>
	);
}

function getHandleValue(
	connections: Array<{ source: string }>,
	lookup: Map<string, Node<any>>
) {
	return connections.reduce((acc, { source }) => {
		const node = lookup.get(source)!;
		const value = node.data.value;
		return typeof value === 'number' ? acc + value : acc;
	}, 0);
}
