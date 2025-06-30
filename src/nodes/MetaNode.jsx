import React, { useCallback, useRef } from 'react';
import { Position } from '@xyflow/react';
import { BaseNode } from '@/components/base-node';
import { LabeledHandle } from '@/components/labeled-handle';
import {
	NodeHeader,
	NodeHeaderTitle,
	NodeHeaderActions,
	NodeHeaderMenuAction,
} from '@/components/node-header';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

import NumberField from '@/widgets/NumberField';
import TextReadonlyField from '@/widgets/TextReadonlyField';
import { cn } from "@/lib/utils";

/* Map UI keywords to field widgets */
const widgetMap = {
	number: NumberField,
	text_readonly: TextReadonlyField,
	// Add future widget types here (text, select, slider, etc.)
};

export default function MetaNode({ id, data, selected, nodeRegistry, onFieldChange, onAction }) {
	// Track re-renders for debugging
	const renderCountRef = useRef(0);
	renderCountRef.current++;
	
	const type = data.type;
	const def = nodeRegistry?.nodes?.[type];
	const actions = def.actions || [];

	if (!def) {
		return (
			<BaseNode selected={selected}>
				<div className="p-2 text-xs text-gray-500">loading…</div>
			</BaseNode>
		);
	}

	const handleMenuAction = (action) => {
		if (onAction) onAction(action, id);
		else console.warn(`[MetaNode ${id}] No handler for action: ${action}`);
	};

	const params = def.params || {};
	const outputs = def.outputs || [];

	const handleChange = useCallback((field, val) => {
		const oldVal = data?.[field];
		if (oldVal !== val && onFieldChange) {
			onFieldChange(id, field, val);
		}
	}, [id, data, onFieldChange]);

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
						{def.displayName || type}
						<span className="text-xs text-gray-500">
							[{id.length > 3 ? id.slice(0, 3) + '…' : id}]
						</span>
					</div>
				</NodeHeaderTitle>
				<NodeHeaderActions>
					<NodeHeaderMenuAction label="Open node menu">
						{actions.map(({ label, action }) => (
							<DropdownMenuItem key={action} onSelect={() => handleMenuAction(action)}>
								{label}
							</DropdownMenuItem>
						))}
					</NodeHeaderMenuAction>
				</NodeHeaderActions>
			</NodeHeader>

			{Object.entries(params).length > 0 && (
				<div className="flex flex-col gap-1 p-2">
					{Object.entries(params).map(([key, spec]) => {
						const Widget = widgetMap[spec.ui];
						const value = data[key] ?? spec.default;

						return Widget ? (
							<Widget
								key={key}
								id={id}
								field={key}
								value={value}
								spec={spec}
								onChange={(v) => handleChange(key, v)}
							/>
						) : (
							<div key={key} className="col-span-2 text-red-500 text-sm">
								Unknown widget: {spec.ui}
							</div>
						);
					})}
				</div>
			)}

			<footer className="bg-gray-100 -mx-3 -mb-2 rounded-b-sm py-1">
				{def.inputs?.map((input) => (
					<LabeledHandle
						key={input}
						title={input}
						type="target" // 🔁 for input handles
						position={Position.Left}
						id={input} // important so React Flow can target this handle
					/>
				))}

				{outputs.length > 0 && outputs.map((output) => (
					<LabeledHandle
						key={output}
						title={output}
						type="source"
						position={Position.Right}
						id={output}
					/>
				))}
			</footer>
		</BaseNode>
	);
}
