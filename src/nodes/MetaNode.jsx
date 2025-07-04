import React, { useCallback, useRef } from 'react';
import { Position, NodeResizer, NodeResizeControl, NodeToolbar } from '@xyflow/react';
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
import TextAreaField from '@/widgets/TextAreaField';
import SelectField from '@/widgets/SelectField';
import ImageDisplayField from '@/widgets/ImageDisplayField';
import { cn } from "@/lib/utils";

/* Map UI keywords to field widgets */
const widgetMap = {
	number: NumberField,
	text_readonly: TextReadonlyField,
	text_textarea: TextAreaField,
	select: SelectField,
	image: ImageDisplayField,
	image_display: ImageDisplayField,
	// Add future widget types here (text, select, slider, etc.)
};

export default function MetaNode({ id, data, selected, nodeRegistry, onFieldChange, onAction }) {
	// Track re-renders for debugging
	const renderCountRef = useRef(0);
	renderCountRef.current++;

	// registered node type (e.g. "display_text")
	const type = data?.type;

	// Early error handling
	if (!data) {
		console.error(`[MetaNode ${id}] No data provided`);
		return (
			<BaseNode selected={selected}>
				<div className="p-2 text-xs text-red-500">Error: No data</div>
			</BaseNode>
		);
	}

	if (!type) {
		console.error(`[MetaNode ${id}] No type specified in data:`, data);
		return (
			<BaseNode selected={selected}>
				<div className="p-2 text-xs text-red-500">Error: No type</div>
			</BaseNode>
		);
	}

	if (!nodeRegistry) {
		console.warn(`[MetaNode ${id}] No nodeRegistry provided`);
		return (
			<BaseNode selected={selected}>
				<div className="p-2 text-xs text-gray-500">Loading registry…</div>
			</BaseNode>
		);
	}

	const def = nodeRegistry.nodes?.[type];

	if (!def) {
		console.error(`[MetaNode ${id}] No definition found for type "${type}" in registry. Available types:`, Object.keys(nodeRegistry.nodes || {}));
		return (
			<BaseNode selected={selected}>
				<div className="p-2 text-xs text-red-500">
					<div>Unknown type: {type}</div>
					<div className="text-[10px] mt-1">Available: {Object.keys(nodeRegistry.nodes || {}).join(', ')}</div>
				</div>
			</BaseNode>
		);
	}

	const actions = def.actions || [];

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
			style={data?.style}
			className={cn(
				"min-w-[175px] min-h-[250px] w-full h-full flex flex-col px-3 py-2",
				data.traversing && "ring-2 ring-blue-400",
				(data.progress || data.evaluating) && "ring-2 ring-green-400"
			)}
		>
			<NodeResizer
				color="#3b82f6"
				minWidth={150}
				minHeight={100}
				isVisible={selected}
			/>
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
				<div className="flex-1 flex flex-col gap-1 overflow-auto">
					{Object.entries(params).map(([key, spec]) => {
						const Widget = widgetMap[spec.ui];

						//if (data.type === 'display_text') {
							//console.log("DEBUG: data", data);
							//console.log("DEBUG: key", key);
							//console.log("DEBUG: spec", spec);
						//}

						// ▸ pull whatever is stored for this field
						let value = data[key] ?? spec.default;

						// ▸ if the widget expects plain text but the value is an object
						//   shaped like { value: "…" }, unwrap it
						// if (
						// 	spec.ui === 'text_readonly' &&
						// 	value &&
						// 	typeof value === 'object' &&
						// 	'value' in value
						// ) {
						// 	value = value.value;
						// }

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
						type="target"
						position={Position.Left}
						id={input}
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
