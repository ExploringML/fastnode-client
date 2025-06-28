import React from 'react';
import { useReactFlow, Position } from '@xyflow/react';

import { BaseNode } from '@/components/base-node';
import { LabeledHandle } from '@/components/labeled-handle';
import NumberField from '@/widgets/NumberField';

/* map UI keywords → widget components */
const widgetMap = {
	number: NumberField,
	// add more widgets here later (text, select, slider…)
};

export default function MetaNode({ id, data, selected }) {
	const { updateNodeData } = useReactFlow();

	/* registry is injected globally after loadNodeRegistry() completes */
	const registry = window.nodeRegistry || {};
	const type = data.type;              // e.g. "number"
	const def = registry.nodes?.[type];

	/* first render: registry not loaded yet */
	if (!def) {
		return (
			<BaseNode selected={selected}>
				<div className="p-2 text-xs text-gray-500">loading…</div>
			</BaseNode>
		);
	}

	const params = def.params || {};

	const handleChange = (field, val) => {
		updateNodeData(id, { [field]: val });
	};

	return (
		<BaseNode selected={selected}>
			<div className="p-2">
				<div className="font-semibold text-sm mb-1">
					{def.displayName || type}
				</div>

				{Object.entries(params).map(([key, spec]) => {
					const Widget = widgetMap[spec.ui];
					return Widget ? (
						<Widget
							key={key}
							id={id}
							value={data[key] ?? spec.default}
							spec={spec}
							onChange={(v) => handleChange(key, v)}
						/>
					) : (
						<div key={key} className="text-xs text-red-500">
							Unknown UI: {spec.ui}
						</div>
					);
				})}
			</div>

			{(def.outputs || []).map((output) => (
				<LabeledHandle
					key={output}
					title={output}
					type="source"
					position={Position.Right}
				/>
			))}
		</BaseNode>
	);
}
