import React, { useState, useEffect } from "react";

export default function NumberField({
	id,
	field = "value",
	value,
	spec,
	onChange,
}) {
	// local draft → no full-node re-render on every tick
	const [draft, setDraft] = useState(value ?? spec.default ?? 0);

	useEffect(() => {
		setDraft(value ?? spec.default ?? 0);
	}, [value, spec.default]);

	const commit = (n) => {
		if (!Number.isNaN(n) && n !== value) onChange(n);
	};

	const handleInput = (e) => setDraft(e.target.valueAsNumber);
	const handleBlur = () => commit(draft);
	const handleKey = (e) => {
		if (e.key === "Enter") { commit(draft); e.target.blur(); }
	};

	// ⬇ only pointermove/up are stopped – pointerdown passes through
	const suppressDragMove = (e) => e.stopPropagation();

	// Prevent React Flow from interfering with input focus
	const handleMouseDown = (e) => {
		e.stopPropagation();
	};

	const handleClick = (e) => {
		e.stopPropagation();
	};

	return (
		<div className="grid grid-cols-[70px_1fr] items-center gap-x-2 text-sm">
			<label
				htmlFor={`${id}-${field}`}
				className="text-right text-gray-700 select-none"
			>
				{spec.label || field}
			</label>

			<input
				id={`${id}-${field}`}
				type="number"
				inputMode="numeric"
				value={draft}
				onInput={handleInput}
				onBlur={handleBlur}
				onKeyDown={handleKey}
				onMouseDown={handleMouseDown}
				onClick={handleClick}
				data-no-drag="true"
				onPointerMoveCapture={suppressDragMove}
				onPointerUpCapture={suppressDragMove}
				min={spec.min}
				max={spec.max}
				step={spec.step ?? 1}
				className="border px-1 py-0.5 h-7 w-full max-w-[80px]
                   rounded text-right nodrag
                   focus:outline-none focus:ring-1 focus:ring-blue-400"
			/>
		</div>
	);
}
