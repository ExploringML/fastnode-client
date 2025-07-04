import React, { useState, useEffect } from "react";

export default function TextAreaField({
	id,
	field = "text",
	value,
	spec,
	onChange,
}) {
	const [draft, setDraft] = useState(value ?? spec.default ?? "");

	// useEffect(() => {
	// 	setDraft(value ?? spec.default ?? "");
	// }, [value, spec.default]);

	const commit = (val) => {
		if (val !== value) onChange(val);
	};

	const handleInput = (e) => setDraft(e.target.value);
	const handleBlur = () => commit(draft);
	const handleKey = (e) => {
		if (e.key === "Enter" && e.metaKey) {
			commit(draft);
			e.target.blur();
		}
	};

	const suppressDragMove = (e) => e.stopPropagation();
	const handleMouseDown = (e) => e.stopPropagation();
	const handleClick = (e) => e.stopPropagation();

	return (
		<div className="pt-2 pb-1 w-[250px]">
			<textarea
				id={`${id}-${field}`}
				value={draft}
				onInput={handleInput}
				onBlur={handleBlur}
				onKeyDown={handleKey}
				onMouseDown={handleMouseDown}
				onClick={handleClick}
				data-no-drag="true"
				onPointerMoveCapture={suppressDragMove}
				onPointerUpCapture={suppressDragMove}
				rows={spec.rows ?? 5}
				className="font-mono !text-sm p-2 resize-none border rounded-sm w-full"
				placeholder={spec.placeholder ?? "Enter text..."}
			/>
		</div>
	);
}
