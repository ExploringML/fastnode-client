import React from 'react';

export default function NumberField({ id, value, spec, onChange }) {
	return (
		<div className="flex flex-col gap-1 text-sm">
			<label htmlFor={`${id}-${spec.label || 'value'}`} className="text-gray-500">
				{spec.label || 'Value'}
			</label>
			<input
				id={`${id}-${spec.label || 'value'}`}
				type="number"
				value={value}
				onChange={e => onChange(Number(e.target.value))}
				min={spec.min}
				max={spec.max}
				step={spec.step || 1}
				className="w-full px-2 py-1 border border-gray-300 rounded"
			/>
		</div>
	);
}
