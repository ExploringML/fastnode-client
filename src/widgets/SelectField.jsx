import React, { useState, useEffect } from 'react';

export default function SelectField({ id, field = 'model', value, spec, onChange }) {
	const [draft, setDraft] = useState(value ?? spec.default);

	useEffect(() => setDraft(value ?? spec.default), [value, spec.default]);

	const commit = (v) => v !== value && onChange(v);

	return (
		<div className="grid grid-cols-[70px_1fr] items-center gap-x-2 text-sm">
			<label htmlFor={`${id}-${field}`} className="text-right text-gray-700 select-none">
				{spec.label || field}
			</label>

			<select
				id={`${id}-${field}`}
				value={draft}
				onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
				onMouseDown={(e) => e.stopPropagation()}     /* prevent canvas drag */
				className="border h-7 px-1 rounded nodrag focus:outline-none"
			>
				{spec.options?.map(([key, label]) => (
					<option key={key} value={key}>{label}</option>
				))}
			</select>
		</div>
	);
}
